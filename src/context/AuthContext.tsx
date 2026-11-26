import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {
  isClubOfficerRole,
  type CoreMemberPermission,
} from '../../shared/constants/permissions.ts';
import type {AuthSessionResponse, ClubMembership, UserAccount} from '../../shared/types/domain.ts';
import {apiClient} from '../adapters/ApiDataAdapter.ts';
import {getSupabaseClient} from '../lib/supabase.ts';

export type WorkspaceContextType = 'student' | 'club_admin' | 'core_member' | 'super_admin';

export interface PublicAuthConfig {
  mode: 'demo' | 'supabase';
  persistenceMode: 'in_memory_demo' | 'postgres';
  demoModeEnabled: boolean;
  supabaseUrl: string | null;
  supabasePublishableKey: string | null;
  institutionalEmailDomains: string[];
}

interface AuthContextValue {
  user: UserAccount | null;
  memberships: ClubMembership[];
  followedClubIds: string[];
  activeContext: WorkspaceContextType;
  activeClubId: string | null;
  activeMembership: ClubMembership | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  isDemoMode: boolean;
  authConfig: PublicAuthConfig | null;
  loginWithPersona: (personaId: string) => Promise<WorkspaceContextType>;
  loginWithCredentials: (email: string, password: string) => Promise<WorkspaceContextType>;
  registerAccount: (input: {
    name: string;
    email: string;
    department: string;
    yearOfStudy: string;
    password: string;
  }) => Promise<{requiresEmailVerification: boolean}>;
  resendVerificationEmail: (email: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  completePasswordReset: (newPassword: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  switchContext: (context: WorkspaceContextType, clubId?: string) => void;
  hasPermission: (permission: CoreMemberPermission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function deriveDefaultContext(session: AuthSessionResponse): {
  context: WorkspaceContextType;
  clubId: string | null;
} {
  if (session.user.isSuperAdmin) {
    return {context: 'super_admin', clubId: null};
  }
  const adminMembership = session.memberships.find((m) => isClubOfficerRole(m.role));
  if (adminMembership) {
    return {context: 'club_admin', clubId: adminMembership.clubId};
  }
  const coreMembership = session.memberships.find((m) => m.role === 'core_member');
  if (coreMembership) {
    return {context: 'core_member', clubId: coreMembership.clubId};
  }
  return {context: 'student', clubId: null};
}

export function AuthProvider({children}: {children: React.ReactNode}) {
  const queryClient = useQueryClient();
  const [authConfig, setAuthConfig] = useState<PublicAuthConfig | null>(null);
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const sessionRef = useRef<AuthSessionResponse | null>(null);
  const [activeContext, setActiveContext] = useState<WorkspaceContextType>('student');
  const [activeClubId, setActiveClubId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const isDemoMode = authConfig ? authConfig.demoModeEnabled : false;

  const supabase = useMemo(
    () => getSupabaseClient(authConfig?.supabaseUrl, authConfig?.supabasePublishableKey),
    [authConfig?.supabaseUrl, authConfig?.supabasePublishableKey],
  );

  const applyNewSession = useCallback((token: string, nextSession: AuthSessionResponse) => {
    apiClient.setAuthToken(token);
    sessionRef.current = nextSession;
    setSession(nextSession);
    const defaults = deriveDefaultContext(nextSession);
    setActiveContext(defaults.context);
    setActiveClubId(defaults.clubId);
    return defaults.context;
  }, []);

  const hydrateFromSupabaseToken = useCallback(
    async (accessToken: string): Promise<WorkspaceContextType> => {
      apiClient.setAuthToken(accessToken);
      const me = await apiClient.getMe();
      const hadSession = Boolean(sessionRef.current);
      sessionRef.current = me;
      setSession(me);
      const defaults = deriveDefaultContext(me);
      if (!hadSession) {
        setActiveContext(defaults.context);
        setActiveClubId(defaults.clubId);
      }
      return defaults.context;
    },
    [],
  );

  useEffect(() => {
    let active = true;
    async function init() {
      let cfg: PublicAuthConfig;
      try {
        cfg = await apiClient.getAuthConfig();
      } catch {
        cfg = {
          mode: 'supabase',
          persistenceMode: 'postgres',
          demoModeEnabled: false,
          supabaseUrl: import.meta.env.VITE_SUPABASE_URL || null,
          supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || null,
          institutionalEmailDomains: [],
        };
      }
      if (!active) return;
      setAuthConfig(cfg);

      const client = getSupabaseClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
      if (cfg.demoModeEnabled || !client) {
        setIsInitializing(false);
        return;
      }

      try {
        const {data} = await client.auth.getSession();
        if (!active) return;
        if (data.session?.access_token) {
          await hydrateFromSupabaseToken(data.session.access_token).catch(() => {
            apiClient.setAuthToken(null);
            sessionRef.current = null;
            setSession(null);
          });
        }
      } finally {
        if (active) setIsInitializing(false);
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, [hydrateFromSupabaseToken]);

  useEffect(() => {
    if (!supabase || isDemoMode) return;
    let mounted = true;

    const {data: subscription} = supabase.auth.onAuthStateChange((_event, nextSbSession) => {
      if (!mounted) return;
      if (!nextSbSession?.access_token) {
        apiClient.setAuthToken(null);
        sessionRef.current = null;
        setSession(null);
        queryClient.clear();
        return;
      }
      void hydrateFromSupabaseToken(nextSbSession.access_token).catch(() => {
        apiClient.setAuthToken(null);
        sessionRef.current = null;
        setSession(null);
      });
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase, isDemoMode, hydrateFromSupabaseToken, queryClient]);

  const loginWithPersona = useCallback(
    async (personaId: string) => {
      const result = await apiClient.loginDemo({personaId});
      return applyNewSession(result.token, result.session);
    },
    [applyNewSession],
  );

  const loginWithCredentials = useCallback(
    async (email: string, password: string) => {
      if (isDemoMode) {
        const result = await apiClient.loginDemo({email, password});
        return applyNewSession(result.token, result.session);
      }
      if (!supabase) {
        throw new Error('Supabase Auth is not configured for this environment');
      }
      const {data, error} = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw new Error(error.message);
      if (!data.session?.access_token) {
        throw new Error('Please verify your institutional email before signing in.');
      }
      return hydrateFromSupabaseToken(data.session.access_token);
    },
    [isDemoMode, supabase, applyNewSession, hydrateFromSupabaseToken],
  );

  const registerAccount = useCallback(
    async (input: {
      name: string;
      email: string;
      department: string;
      yearOfStudy: string;
      password: string;
    }): Promise<{requiresEmailVerification: boolean}> => {
      if (isDemoMode) {
        const result = await apiClient.registerDemo(input);
        applyNewSession(result.token, result.session);
        return {requiresEmailVerification: false};
      }
      if (!supabase) {
        throw new Error('Supabase Auth is not configured for this environment');
      }
      const normalizedEmail = input.email.trim().toLowerCase();
      if (authConfig?.institutionalEmailDomains && authConfig.institutionalEmailDomains.length > 0) {
        const domain = normalizedEmail.split('@')[1] || '';
        if (!authConfig.institutionalEmailDomains.includes(domain)) {
          throw new Error(
            `Please register using an institutional email (${authConfig.institutionalEmailDomains.map((d) => `@${d}`).join(', ')})`,
          );
        }
      }

      const {data, error} = await supabase.auth.signUp({
        email: normalizedEmail,
        password: input.password,
        options: {
          emailRedirectTo: `${window.location.origin}/verify-email`,
          data: {
            full_name: input.name.trim(),
            department: input.department.trim(),
            year_of_study: input.yearOfStudy.trim(),
          },
        },
      });
      if (error) throw new Error(error.message);

      if (data.session?.access_token) {
        await hydrateFromSupabaseToken(data.session.access_token);
        return {requiresEmailVerification: false};
      }
      return {requiresEmailVerification: true};
    },
    [isDemoMode, supabase, authConfig, applyNewSession, hydrateFromSupabaseToken],
  );

  const resendVerificationEmail = useCallback(
    async (email: string) => {
      if (isDemoMode) return;
      if (!supabase) throw new Error('Supabase Auth is not configured');
      const {error} = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
        options: {emailRedirectTo: `${window.location.origin}/verify-email`},
      });
      if (error) throw new Error(error.message);
    },
    [isDemoMode, supabase],
  );

  const requestPasswordReset = useCallback(
    async (email: string) => {
      if (isDemoMode) return;
      if (!supabase) throw new Error('Supabase Auth is not configured');
      const {error} = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw new Error(error.message);
    },
    [isDemoMode, supabase],
  );

  const completePasswordReset = useCallback(
    async (newPassword: string) => {
      if (isDemoMode) return;
      if (!supabase) throw new Error('Supabase Auth is not configured');
      const {error} = await supabase.auth.updateUser({password: newPassword});
      if (error) throw new Error(error.message);
    },
    [isDemoMode, supabase],
  );

  const refreshSession = useCallback(async () => {
    const next = await apiClient.getMe();
    sessionRef.current = next;
    setSession(next);
    if (activeClubId && !next.memberships.some((m) => m.clubId === activeClubId)) {
      const defaults = deriveDefaultContext(next);
      setActiveContext(defaults.context);
      setActiveClubId(defaults.clubId);
    }
  }, [activeClubId]);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch {
      // Ignore network error during logout cleanup
    }
    if (supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
    apiClient.setAuthToken(null);
    setSession(null);
    setActiveContext('student');
    setActiveClubId(null);
    queryClient.clear();
  }, [supabase, queryClient]);

  const switchContext = useCallback(
    (context: WorkspaceContextType, clubId?: string) => {
      if (!session) return;
      if (context === 'super_admin' && !session.user.isSuperAdmin) return;
      if (context === 'club_admin') {
        const target =
          session.memberships.find(
            (m) => isClubOfficerRole(m.role) && (!clubId || m.clubId === clubId),
          ) || null;
        if (!target) return;
        setActiveClubId(target.clubId);
        setActiveContext('club_admin');
        return;
      }
      if (context === 'core_member') {
        const target =
          session.memberships.find(
            (m) => m.role === 'core_member' && (!clubId || m.clubId === clubId),
          ) || null;
        if (!target) return;
        setActiveClubId(target.clubId);
        setActiveContext('core_member');
        return;
      }
      setActiveContext(context);
      if (context === 'student') setActiveClubId(null);
    },
    [session],
  );

  const activeMembership = useMemo(() => {
    if (!session || !activeClubId) return null;
    return session.memberships.find((m) => m.clubId === activeClubId) || null;
  }, [session, activeClubId]);

  const hasPermission = useCallback(
    (permission: CoreMemberPermission) => {
      if (!session) return false;
      if (session.user.isSuperAdmin && activeContext === 'super_admin') return true;
      if (!activeMembership) return false;
      if (isClubOfficerRole(activeMembership.role)) return true;
      return activeMembership.permissions.includes(permission);
    },
    [session, activeContext, activeMembership],
  );

  const value: AuthContextValue = {
    user: session?.user || null,
    memberships: session?.memberships || [],
    followedClubIds: session?.followedClubIds || [],
    activeContext,
    activeClubId,
    activeMembership,
    isAuthenticated: Boolean(session?.user),
    isInitializing,
    isDemoMode,
    authConfig,
    loginWithPersona,
    loginWithCredentials,
    registerAccount,
    resendVerificationEmail,
    requestPasswordReset,
    completePasswordReset,
    refreshSession,
    logout,
    switchContext,
    hasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
