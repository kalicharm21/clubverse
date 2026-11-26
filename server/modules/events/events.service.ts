import type {EventItem, EventStatus, PaginatedResult} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {BusinessRuleError, NotFoundError, ValidationError} from '../../shared/errors/AppError.ts';

export class EventsService {
  constructor(private readonly adapter: DataAdapter) {}

  async listEvents(filters?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<EventItem[]> {
    return this.adapter.listEvents(filters);
  }

  async listEventsPaginated(filters?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<EventItem>> {
    if (this.adapter.listEventsPaginated) {
      return this.adapter.listEventsPaginated(filters);
    }
    const items = await this.adapter.listEvents(filters);
    const page = Math.max(1, filters?.page ?? 1);
    const pageSize = Math.max(1, Math.min(50, filters?.pageSize ?? 12));
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      pagination: {page, pageSize, total, totalPages},
    };
  }

  async getEventById(eventId: string): Promise<EventItem> {
    const event = await this.adapter.getEventById(eventId);
    if (!event) throw new NotFoundError('Event not found');
    return event;
  }

  async createEvent(
    clubId: string,
    actor: {id: string; name: string},
    input: {
      title: string;
      category: EventItem['category'];
      description: string;
      venue: string;
      startTime: string;
      endTime: string;
      registrationOpensAt?: string | null;
      registrationDeadline: string;
      capacity: number;
      isPaid: boolean;
      feeAmount: number;
      eligibilityRules?: EventItem['eligibilityRules'];
    },
  ): Promise<EventItem> {
    if (new Date(input.endTime).getTime() <= new Date(input.startTime).getTime()) {
      throw new ValidationError('Event end time must be after start time');
    }
    if (
      input.registrationOpensAt &&
      new Date(input.registrationDeadline).getTime() <= new Date(input.registrationOpensAt).getTime()
    ) {
      throw new ValidationError('Registration deadline must be after registration open time');
    }
    const clubDetail = await this.adapter.getClubDetail(clubId);
    if (!clubDetail) {
      throw new NotFoundError('Club not found');
    }
    if (clubDetail.status === 'suspended') {
      throw new BusinessRuleError(
        'CLUB_NOT_ACTIVE',
        'Suspended clubs cannot create or publish events',
      );
    }

    const created = await this.adapter.createEvent(clubId, input);
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Club Team · ${created.clubName}`,
      action: 'CREATED_EVENT_DRAFT',
      targetType: 'event',
      targetId: created.id,
      targetLabel: created.title,
      details: `Created draft event at ${created.venue}.`,
    });
    return created;
  }

  async updateEvent(
    eventId: string,
    actor: {id: string; name: string},
    updates: Partial<EventItem>,
  ): Promise<EventItem> {
    const existing = await this.adapter.getEventById(eventId);
    if (!existing) throw new NotFoundError('Event not found');

    const startMs = new Date(updates.startTime || existing.startTime).getTime();
    const endMs = new Date(updates.endTime || existing.endTime).getTime();
    if (endMs <= startMs) {
      throw new ValidationError('Event end time must be after start time');
    }

    const updated = await this.adapter.updateEvent(eventId, updates);
    if (!updated) throw new NotFoundError('Event not found');
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Club Team · ${updated.clubName}`,
      action: 'UPDATED_EVENT',
      targetType: 'event',
      targetId: updated.id,
      targetLabel: updated.title,
      details: 'Updated event schedule, eligibility rules, or details.',
    });
    return updated;
  }

  async publishEvent(eventId: string, actor: {id: string; name: string}): Promise<EventItem> {
    const existing = await this.adapter.getEventById(eventId);
    if (!existing) throw new NotFoundError('Event not found');
    const clubDetail = await this.adapter.getClubDetail(existing.clubId);
    if (clubDetail && clubDetail.status !== 'active') {
      throw new BusinessRuleError(
        'CLUB_NOT_ACTIVE',
        `Cannot publish event while club status is "${clubDetail.status}"`,
      );
    }

    const published = await this.adapter.publishEvent(eventId);
    if (!published) throw new NotFoundError('Event not found');
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Club Team · ${published.clubName}`,
      action: 'PUBLISHED_EVENT',
      targetType: 'event',
      targetId: published.id,
      targetLabel: published.title,
      details: `Published event with capacity ${published.capacity}.`,
    });
    return published;
  }

  async transitionLifecycle(
    eventId: string,
    targetStatus: EventStatus,
    actor: {id: string; name: string},
  ): Promise<EventItem> {
    const existing = await this.adapter.getEventById(eventId);
    if (!existing) throw new NotFoundError('Event not found');

    if (targetStatus === 'published' || targetStatus === 'registration_open') {
      const clubDetail = await this.adapter.getClubDetail(existing.clubId);
      if (clubDetail && clubDetail.status !== 'active') {
        throw new BusinessRuleError(
          'CLUB_NOT_ACTIVE',
          `Cannot open or publish event while club status is "${clubDetail.status}"`,
        );
      }
    }

    const updated = this.adapter.updateEventLifecycle
      ? await this.adapter.updateEventLifecycle(eventId, targetStatus)
      : await this.adapter.updateEvent(eventId, {status: targetStatus});

    if (!updated) throw new NotFoundError('Event not found');

    const actionMap: Record<EventStatus, string> = {
      draft: 'UNPUBLISHED_EVENT_TO_DRAFT',
      published: 'PUBLISHED_EVENT',
      registration_open: 'OPENED_EVENT_REGISTRATION',
      registration_closed: 'CLOSED_EVENT_REGISTRATION',
      completed: 'COMPLETED_EVENT',
      cancelled: 'CANCELLED_EVENT',
    };

    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Club Team · ${updated.clubName}`,
      action: actionMap[targetStatus] || 'UPDATED_EVENT_STATUS',
      targetType: 'event',
      targetId: updated.id,
      targetLabel: updated.title,
      details: `Transitioned event status from ${existing.status} to ${targetStatus}.`,
    });

    if (targetStatus === 'cancelled') {
      const regs = await this.adapter.listRegistrationsForEvent(eventId);
      const activeRegs = regs.filter((r) => r.status !== 'cancelled');
      await Promise.all(
        activeRegs.map((reg) =>
          this.adapter.createNotification({
            userId: reg.studentId,
            title: `Event Cancelled: ${updated.title}`,
            message: `${updated.title} hosted by ${updated.clubName} has been cancelled.`,
            category: 'event',
            link: '/app/student/registrations',
          }),
        ),
      );
    }

    return updated;
  }
}
