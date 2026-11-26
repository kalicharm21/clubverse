import React, {useState} from 'react';
import {zodResolver} from '@hookform/resolvers/zod';
import {useQuery} from '@tanstack/react-query';
import {AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, ShieldAlert, ShieldCheck} from 'lucide-react';
import {useForm} from 'react-hook-form';
import {Link, useNavigate} from 'react-router-dom';
import {z} from 'zod';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card, Input} from '../../components/ui/FormControls.tsx';
import {useAuth, type WorkspaceContextType} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

const loginFormSchema = z.object({
  email: z.string().trim().email('Enter a valid institutional email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

const CONTEXT_HOME: Record<WorkspaceContextType, string> = {
  student: '/app/student/dashboard',
  club_admin: '/app/club-admin/dashboard',
  core_member: '/app/core/dashboard',
  super_admin: '/app/admin/dashboard',
};

const PERSONA_BADGE_TEXT: Record<string, string> = {
  'usr-student-1': 'Student · Follows 1/2 clubs',
  'usr-club-admin-1': 'Club Admin (Robotics) · Core Member (Quantum)',
  'usr-core-1': 'Core Member (Robotics · Scoped Permissions)',
  'usr-multi-1': 'Club Admin (Design) · Core Member (Music)',
  'usr-student-2': 'Student · Follows 2/2 clubs (At Limit)',
  'usr-super-admin': 'Super Admin · Institution Oversight',
};

export const LoginPage: React.FC = () => {
  const {loginWithPersona, loginWithCredentials, isDemoMode, authConfig, isInitializing} = useAuth();
  const {toast} = useToast();
  const navigate = useNavigate();
  const [loadingPersonaId, setLoadingPersonaId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {data: personas = [], isLoading: personasLoading} = useQuery({
    queryKey: ['demo-personas'],
    queryFn: () => apiClient.listDemoPersonas(),
    enabled: isDemoMode,
  });

  const allowedDomains = authConfig?.institutionalEmailDomains || [];
  const emailPlaceholder =
    allowedDomains.length > 0 ? `name@${allowedDomains[0]}` : 'name@vitbhopal.ac.in';

  const {
    register,
    handleSubmit,
    formState: {errors, isSubmitting},
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: isDemoMode
      ? {email: 'aarav.mehta@campusverse.edu', password: 'demo-password'}
      : {email: '', password: ''},
  });

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    try {
      const ctx = await loginWithCredentials(values.email, values.password);
      toast.success(isDemoMode ? 'Signed in to CampusVerse sandbox' : 'Signed in to CampusVerse');
      navigate(CONTEXT_HOME[ctx]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to sign in');
    }
  };

  const handlePersonaLogin = async (personaId: string) => {
    setFormError(null);
    setLoadingPersonaId(personaId);
    try {
      const ctx = await loginWithPersona(personaId);
      toast.success('Development session initialized');
      navigate(CONTEXT_HOME[ctx]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to start persona session');
    } finally {
      setLoadingPersonaId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/70 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to CampusVerse
          </Link>
          <span className="font-display text-base font-bold text-slate-900">CampusVerse</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <Card className="p-6 sm:p-8 lg:col-span-6">
            <h1 className="font-display text-2xl font-bold text-slate-900">Sign in</h1>
            <p className="mt-1.5 text-sm text-slate-600">
              {isDemoMode
                ? 'Use your institutional credentials or select a Phase 1 development persona.'
                : allowedDomains.length > 0
                  ? `Sign in with your verified ${allowedDomains.map((d) => `@${d}`).join(', ')} institutional account.`
                  : 'Sign in with your verified institutional email and password.'}
            </p>

            {formError && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
              <Input
                label="Institutional Email"
                type="email"
                placeholder={emailPlaceholder}
                error={errors.email?.message}
                {...register('email')}
              />
              <Input
                label="Password"
                type="password"
                placeholder="Enter password"
                error={errors.password?.message}
                {...register('password')}
              />
              <div className="flex items-center justify-between text-xs">
                <Link to="/forgot-password" className="font-medium text-blue-600 hover:text-blue-700">
                  Forgot password?
                </Link>
                <Link to="/verify-email" className="font-medium text-slate-600 hover:text-slate-900">
                  Verify email
                </Link>
              </div>
              <Button type="submit" loading={isSubmitting || isInitializing} className="w-full">
                Sign In to Portal
              </Button>
            </form>

            <p className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-600">
              New student on campus?{' '}
              <Link to="/register" className="font-semibold text-violet-700 hover:text-violet-800">
                Create an account
              </Link>
            </p>
          </Card>

          {isDemoMode ? (
            <Card className="p-6 sm:p-8 lg:col-span-6">
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div>
                  <p className="font-semibold">Phase 1 Development Auth Adapter</p>
                  <p className="mt-0.5 text-amber-800 leading-relaxed">
                    These quick-switch personas run against the isolated in-memory server adapter
                    and are disabled whenever PostgreSQL &amp; Supabase Auth are active.
                  </p>
                </div>
              </div>

              <h2 className="mt-5 font-display text-base font-semibold text-slate-900">
                Select a Seeded Campus Persona
              </h2>
              <div className="mt-3 space-y-2.5">
                {personasLoading ? (
                  <p className="text-sm text-slate-500">Loading seeded personas...</p>
                ) : (
                  personas.map((persona) => (
                    <button
                      key={persona.id}
                      type="button"
                      disabled={loadingPersonaId !== null}
                      onClick={() => void handlePersonaLogin(persona.id)}
                      className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-violet-300 hover:bg-violet-50/40 transition-colors disabled:opacity-60"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{persona.name}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {persona.email} · {PERSONA_BADGE_TEXT[persona.id] || persona.department}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 whitespace-nowrap shrink-0">
                        {loadingPersonaId === persona.id ? 'Signing in...' : 'Enter'}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  ))
                )}
              </div>
            </Card>
          ) : (
            <Card className="p-6 sm:p-8 lg:col-span-6 flex flex-col justify-between bg-white">
              <div>
                <div className="flex items-center gap-2.5 text-violet-700">
                  <ShieldCheck className="h-5 w-5" />
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Institutional Single Workspace
                  </h2>
                </div>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Your CampusVerse account automatically unlocks every role you hold across campus
                  organizations—switching seamlessly between Student discovery, Club Officer tasks,
                  and Super Admin governance.
                </p>
                <ul className="mt-5 space-y-3 text-xs text-slate-600">
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      Follow up to 2 campus clubs, track Hall of Fame rankings, and register for
                      events with single-use QR entry passes.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      Club memberships and scoped Core Member permissions apply automatically once
                      assigned by a Club Admin.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      Protected by verified institutional email authentication and PostgreSQL
                      row-level isolation.
                    </span>
                  </li>
                </ul>
              </div>

              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                Need to verify your signup link?{' '}
                <Link to="/verify-email" className="font-medium text-violet-700 hover:text-violet-800">
                  Resend verification email
                </Link>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
