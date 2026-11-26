import type {TicketRecord, TicketReleaseSummary} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {BusinessRuleError, NotFoundError} from '../../shared/errors/AppError.ts';

export class TicketsService {
  constructor(private readonly adapter: DataAdapter) {}

  async releaseForEvent(
    eventId: string,
    actor: {id: string; name: string},
    confirmParticipantCount?: number,
    note?: string,
  ): Promise<TicketReleaseSummary> {
    const event = await this.adapter.getEventById(eventId);
    if (!event) throw new NotFoundError('Event not found');

    if (
      typeof confirmParticipantCount === 'number' &&
      confirmParticipantCount >= 0 &&
      event.registeredCount !== confirmParticipantCount
    ) {
      // Non-blocking audit note if participant count changed between UI open and confirmation
    }

    const summary = await this.adapter.releaseEventTickets(eventId, actor);

    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Ticket Release · ${event.clubName}`,
      action: 'RELEASED_EVENT_TICKETS',
      targetType: 'event',
      targetId: event.id,
      targetLabel: event.title,
      details: `Released ${summary.releasedCount} new tickets (${summary.totalReleased}/${summary.eligibleCount} total released).${note ? ` Note: ${note}` : ''}`,
    });

    return summary;
  }

  async listForEvent(eventId: string): Promise<TicketRecord[]> {
    const event = await this.adapter.getEventById(eventId);
    if (!event) throw new NotFoundError('Event not found');
    return this.adapter.listEventTickets(eventId);
  }

  async listMine(userId: string): Promise<TicketRecord[]> {
    return this.adapter.listStudentTickets(userId);
  }

  async getByIdWithEvent(ticketId: string) {
    const ticket = await this.adapter.getTicketById(ticketId);
    if (!ticket) throw new NotFoundError('Ticket not found');
    const event = await this.adapter.getEventById(ticket.eventId);
    if (!event) throw new NotFoundError('Event not found');
    return {ticket, event};
  }

  async revoke(
    ticketId: string,
    actor: {id: string; name: string},
    reason?: string,
  ): Promise<TicketRecord> {
    const {ticket, event} = await this.getByIdWithEvent(ticketId);
    if (ticket.status === 'revoked') {
      throw new BusinessRuleError('TICKET_ALREADY_REVOKED', 'Ticket has already been revoked');
    }

    const updated = await this.adapter.revokeTicket(ticketId, actor, reason);
    if (!updated) throw new NotFoundError('Ticket not found');

    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Ticket Management · ${event.clubName}`,
      action: 'REVOKED_TICKET',
      targetType: 'event',
      targetId: event.id,
      targetLabel: `${event.title} · ${updated.ticketCode}`,
      details: reason
        ? `Revoked ticket ${updated.ticketCode}. Reason: ${reason}`
        : `Revoked ticket ${updated.ticketCode}.`,
    });

    return updated;
  }
}
