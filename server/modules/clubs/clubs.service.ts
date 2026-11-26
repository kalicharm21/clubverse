import type {Club, ClubDetail, ClubStatus, PaginatedResult} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {NotFoundError} from '../../shared/errors/AppError.ts';

export class ClubsService {
  constructor(private readonly adapter: DataAdapter) {}

  async listClubs(filters?: {
    search?: string;
    category?: string;
    sortBy?: 'followers' | 'name' | 'events';
  }): Promise<Club[]> {
    return this.adapter.listClubs({
      search: filters?.search,
      category: filters?.category,
      sortBy: filters?.sortBy,
      includeAllStatuses: false,
    });
  }

  async listClubsPaginated(filters?: {
    search?: string;
    category?: string;
    sortBy?: 'followers' | 'name' | 'events';
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<Club>> {
    if (this.adapter.listClubsPaginated) {
      return this.adapter.listClubsPaginated({
        ...filters,
        includeAllStatuses: false,
      });
    }
    const items = await this.listClubs(filters);
    const page = Math.max(1, filters?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 24));
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    return {
      items: items.slice((safePage - 1) * pageSize, safePage * pageSize),
      pagination: {
        total,
        page: safePage,
        pageSize,
        totalPages,
      },
    };
  }

  async getClubDetail(clubId: string, viewerUserId?: string): Promise<ClubDetail> {
    const detail = await this.adapter.getClubDetail(clubId, viewerUserId);
    if (!detail) throw new NotFoundError('Club not found');
    return detail;
  }

  async createClub(
    actor: {id: string; name: string},
    input: {
      name: string;
      slug?: string;
      category: Club['category'];
      tagline: string;
      description: string;
      meetingSchedule: string;
      contactEmail: string;
      instagramUrl?: string;
      foundedYear?: number;
      status?: ClubStatus;
    },
  ): Promise<Club> {
    const club = await this.adapter.createClub({
      ...input,
      createdByUserId: actor.id,
    });
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: 'Super Admin',
      action: 'CREATED_CLUB',
      targetType: 'club',
      targetId: club.id,
      targetLabel: club.name,
      details: `Registered ${club.name} (${club.slug}) in ${club.category} (status: ${club.status}).`,
    });
    return club;
  }

  async updateClub(
    clubId: string,
    actor: {id: string; name: string; isSuperAdmin?: boolean},
    updates: Partial<Club>,
  ): Promise<Club> {
    const updated = await this.adapter.updateClub(clubId, updates);
    if (!updated) throw new NotFoundError('Club not found');
    const changedKeys = Object.keys(updates).join(', ');
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: actor.isSuperAdmin ? 'Super Admin' : `Club Leadership · ${updated.name}`,
      action: 'UPDATED_CLUB_PROFILE',
      targetType: 'club',
      targetId: updated.id,
      targetLabel: updated.name,
      details: changedKeys
        ? `Updated club profile fields (${changedKeys}).`
        : 'Updated club profile metadata and schedule.',
    });
    return updated;
  }

  async updateClubStatus(
    clubId: string,
    status: ClubStatus,
    actor: {id: string; name: string},
    reason?: string,
  ): Promise<Club> {
    const club = await this.adapter.updateClubStatus(clubId, status);
    if (!club) throw new NotFoundError('Club not found');
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: 'Super Admin',
      action: `CLUB_STATUS_${status.toUpperCase()}`,
      targetType: 'club',
      targetId: club.id,
      targetLabel: club.name,
      details: reason || `Changed club status to ${status}.`,
    });
    return club;
  }
}
