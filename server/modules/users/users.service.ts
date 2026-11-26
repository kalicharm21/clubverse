import type {Club, UserAccount} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {MAX_FOLLOWED_CLUBS} from '../../config/constants.ts';
import {NotFoundError} from '../../shared/errors/AppError.ts';

export class UsersService {
  constructor(private readonly adapter: DataAdapter) {}

  async getMyProfile(userId: string): Promise<UserAccount> {
    const user = await this.adapter.getUserById(userId);
    if (!user) throw new NotFoundError('User profile not found');
    return user;
  }

  async updateMyProfile(
    userId: string,
    updates: Partial<{name: string; department: string; yearOfStudy: string}>,
  ): Promise<UserAccount> {
    const updated = await this.adapter.updateUserProfile(userId, updates);
    if (!updated) throw new NotFoundError('User profile not found');

    const changedFields = Object.keys(updates).filter(
      (k) => updates[k as keyof typeof updates] !== undefined,
    );
    await this.adapter.appendAuditLog({
      actorId: updated.id,
      actorName: updated.name,
      actorContext: updated.isSuperAdmin ? 'Super Admin' : 'Student Profile',
      action: 'UPDATED_USER_PROFILE',
      targetType: 'user',
      targetId: updated.id,
      targetLabel: `${updated.name} (${updated.email})`,
      details: `Updated profile fields: ${changedFields.join(', ')}.`,
    });

    return updated;
  }

  async getMyFollowedClubs(
    userId: string,
  ): Promise<{clubs: Club[]; count: number; limit: number}> {
    const [follows, activeClubs] = await Promise.all([
      this.adapter.getFollowsForUser(userId),
      this.adapter.listClubs({includeAllStatuses: false}),
    ]);
    const clubById = new Map(activeClubs.map((c) => [c.id, c]));
    const followedClubs = follows
      .map((f) => clubById.get(f.clubId))
      .filter((c): c is Club => Boolean(c));

    return {
      clubs: followedClubs,
      count: followedClubs.length,
      limit: MAX_FOLLOWED_CLUBS,
    };
  }
}
