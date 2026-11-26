import type {AuthSessionResponse, UserAccount} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {env} from '../../config/env.ts';
import {ForbiddenError, NotFoundError, UnauthorizedError} from '../../shared/errors/AppError.ts';
import {signSessionToken} from '../../shared/utils/crypto.ts';

export class AuthService {
  constructor(private readonly adapter: DataAdapter) {}

  private isDemoAuthAllowed(): boolean {
    const isDemoAdapter = this.adapter.getPersistenceMode() === 'in_memory_demo';
    const isTestRunner = env.nodeEnv === 'test' || Boolean(process.env.VITEST);
    return !env.isProduction && isDemoAdapter && (env.enableDemoMode || isTestRunner);
  }

  getPublicAuthConfig() {
    const demoEnabled = this.isDemoAuthAllowed();
    return {
      mode: demoEnabled ? ('demo' as const) : ('supabase' as const),
      persistenceMode: this.adapter.getPersistenceMode(),
      demoModeEnabled: demoEnabled,
      supabaseUrl: env.supabaseUrl || null,
      supabasePublishableKey: env.supabasePublishableKey || null,
      institutionalEmailDomains: env.institutionalEmailDomains,
    };
  }

  async listDemoPersonas(): Promise<UserAccount[]> {
    if (!this.isDemoAuthAllowed()) {
      throw new ForbiddenError('Demo personas are disabled outside development sandbox mode');
    }
    return this.adapter.listUsers();
  }

  async loginDemo(input: {
    personaId?: string;
    email?: string;
  }): Promise<{token: string; session: AuthSessionResponse}> {
    if (!this.isDemoAuthAllowed()) {
      throw new ForbiddenError('Development demo login is disabled when PostgreSQL is active');
    }

    const user = input.personaId
      ? await this.adapter.getUserById(input.personaId)
      : input.email
        ? await this.adapter.getUserByEmail(input.email)
        : null;

    if (!user) {
      throw new NotFoundError('Demo account not found. Pick an institutional persona or register.');
    }
    if (user.status === 'suspended') {
      throw new ForbiddenError('This account is currently suspended');
    }

    const memberships = await this.adapter.getMembershipsForUser(user.id);
    const follows = await this.adapter.getFollowsForUser(user.id);

    const token = signSessionToken(user.id);
    return {
      token,
      session: {
        user,
        memberships,
        followedClubIds: follows.map((f) => f.clubId),
        mode: 'demo',
      },
    };
  }

  async registerDemo(input: {
    name: string;
    email: string;
    department: string;
    yearOfStudy: string;
  }): Promise<{token: string; session: AuthSessionResponse}> {
    if (!this.isDemoAuthAllowed()) {
      throw new ForbiddenError('Development demo registration is disabled when PostgreSQL is active');
    }
    const user = await this.adapter.createDemoUser(input);
    const token = signSessionToken(user.id);
    return {
      token,
      session: {
        user,
        memberships: [],
        followedClubIds: [],
        mode: 'demo',
      },
    };
  }

  async getSessionMe(
    userId: string,
    authMode: 'demo' | 'supabase',
    _meta?: {userAgent?: string},
  ): Promise<AuthSessionResponse> {
    const user = await this.adapter.getUserById(userId);
    if (!user) throw new UnauthorizedError('Authenticated user not found');

    const [memberships, follows] = await Promise.all([
      this.adapter.getMembershipsForUser(user.id),
      this.adapter.getFollowsForUser(user.id),
    ]);

    return {
      user,
      memberships,
      followedClubIds: follows.map((f) => f.clubId),
      mode: authMode,
    };
  }
}
