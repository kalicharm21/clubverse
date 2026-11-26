import type {EventReport} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {NotFoundError} from '../../shared/errors/AppError.ts';

export class ReportsService {
  constructor(private readonly adapter: DataAdapter) {}

  async submitEventReport(
    eventId: string,
    actor: {id: string; name: string; role?: string},
    input: {
      outcomeSummary: string;
      objectives?: string;
      actualEventDate?: string;
      participationSummary?: string;
      outcomes?: string;
      highlights: string;
      challenges: string;
      feedbackObservations?: string;
      evidenceUrl?: string;
      actualAttendance: number;
      completionStatus: 'completed' | 'partial';
      status?: 'draft' | 'submitted';
    },
  ): Promise<EventReport> {
    const event = await this.adapter.getEventById(eventId);
    if (!event) throw new NotFoundError('Event not found');

    const reportStatus = input.status === 'draft' ? 'draft' : 'submitted';
    const report = await this.adapter.upsertEventReport({
      eventId: event.id,
      eventTitle: event.title,
      clubId: event.clubId,
      clubName: event.clubName,
      submittedBy: actor.id,
      submittedByName: actor.name,
      outcomeSummary: input.outcomeSummary,
      objectives: input.objectives || '',
      actualEventDate: input.actualEventDate || event.startTime.slice(0, 10),
      participationSummary: input.participationSummary || '',
      outcomes: input.outcomes || '',
      highlights: input.highlights,
      challenges: input.challenges,
      feedbackObservations: input.feedbackObservations || '',
      evidenceUrl: input.evidenceUrl || '',
      actualAttendance: input.actualAttendance,
      registeredTotal: event.registeredCount,
      completionStatus: input.completionStatus,
      status: reportStatus,
      actorRole: actor.role || 'Club Officer',
    });

    if (input.completionStatus === 'completed' && reportStatus === 'submitted') {
      await this.adapter.updateEvent(event.id, {status: 'completed'});
    }

    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Club Team · ${event.clubName}`,
      action: reportStatus === 'draft' ? 'SAVED_EVENT_REPORT_DRAFT' : 'SUBMITTED_EVENT_REPORT',
      targetType: 'report',
      targetId: report.id,
      targetLabel: event.title,
      details: `${reportStatus === 'draft' ? 'Saved draft' : 'Submitted report'} (${input.actualAttendance} attendees, ${input.completionStatus}).`,
    });

    return report;
  }

  async getEventReport(eventId: string): Promise<EventReport | null> {
    return this.adapter.getEventReport(eventId);
  }
}
