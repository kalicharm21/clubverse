import type {
  AttendanceRecord,
  AttendanceSummary,
  PaginationMeta,
} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {env} from '../../config/env.ts';
import {BusinessRuleError, NotFoundError, ValidationError} from '../../shared/errors/AppError.ts';
import {escapeCsvCell} from '../../shared/utils/crypto.ts';

export class AttendanceService {
  constructor(private readonly adapter: DataAdapter) {}

  async scanAttendance(
    eventId: string,
    actor: {id: string; name: string},
    input: {
      qrToken?: string;
      registrationId?: string;
      method: 'qr_scan' | 'manual_override';
      reason?: string;
    },
  ): Promise<AttendanceRecord> {
    const event = await this.adapter.getEventById(eventId);
    if (!event) throw new NotFoundError('Event not found');

    if (input.method === 'manual_override' && (!input.reason || input.reason.trim().length < 5)) {
      throw new ValidationError(
        'Manual attendance override requires a reason of at least 5 characters',
      );
    }

    if (input.method === 'qr_scan' && !input.qrToken) {
      throw new ValidationError('QR token is required for QR scan check-in');
    }

    const registration = input.qrToken
      ? await this.adapter.getRegistrationByQrToken(eventId, input.qrToken.trim())
      : input.registrationId
        ? await this.adapter.getRegistrationById(input.registrationId)
        : null;

    if (!registration) {
      throw new NotFoundError(
        'Invalid or wrong-event ticket: no registration matches this QR token for this event',
      );
    }

    if (registration.eventId !== eventId) {
      throw new BusinessRuleError(
        'WRONG_EVENT_TICKET',
        'This registration ticket belongs to a different event and cannot be checked in here',
      );
    }

    if (registration.status === 'cancelled') {
      throw new BusinessRuleError(
        'REGISTRATION_CANCELLED',
        'Cancelled registrations cannot be checked in',
      );
    }

    if (registration.status === 'waitlisted') {
      throw new BusinessRuleError(
        'REGISTRATION_WAITLISTED',
        'Waitlisted registrations cannot be checked in until promoted to confirmed',
      );
    }

    if (input.method === 'qr_scan') {
      if (registration.ticketStatus === 'revoked') {
        throw new BusinessRuleError(
          'TICKET_REVOKED',
          'This ticket has been revoked and cannot be used for check-in',
        );
      }
      if (registration.ticketStatus && registration.ticketStatus !== 'released') {
        throw new BusinessRuleError(
          'TICKET_NOT_RELEASED',
          'Tickets have not been released for this participant yet',
        );
      }
    }

    const student = await this.adapter.getUserById(registration.studentId);
    const record = await this.adapter.recordAttendance({
      eventId,
      registrationId: registration.id,
      studentId: registration.studentId,
      studentName: registration.studentName,
      studentCode: student?.studentId || registration.studentId,
      qrToken: registration.qrToken,
      method: input.method,
      manualReason: input.method === 'manual_override' ? input.reason?.trim() : undefined,
      checkedInBy: actor.name,
      scannedByUserId: actor.id,
    });

    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Attendance Gate · ${event.clubName}`,
      action: input.method === 'qr_scan' ? 'QR_CHECK_IN' : 'MANUAL_OVERRIDE_CHECK_IN',
      targetType: 'event',
      targetId: event.id,
      targetLabel: `${event.title} · ${registration.studentName}`,
      details:
        input.method === 'manual_override'
          ? `Recorded manual override check-in. Reason: ${input.reason?.trim()}`
          : 'Recorded single-use QR check-in.',
    });

    return record;
  }

  async listAttendance(
    eventId: string,
    opts?: {page?: number; pageSize?: number; search?: string},
  ): Promise<{
    records: AttendanceRecord[];
    registeredCount: number;
    attendedCount: number;
    summary: AttendanceSummary;
    pagination?: PaginationMeta;
  }> {
    const event = await this.adapter.getEventById(eventId);
    if (!event) throw new NotFoundError('Event not found');

    const summary = await this.adapter.getAttendanceSummary(eventId);

    if (
      (opts?.page !== undefined || opts?.pageSize !== undefined || opts?.search !== undefined) &&
      this.adapter.listAttendanceForEventPaginated
    ) {
      const result = await this.adapter.listAttendanceForEventPaginated(eventId, opts);
      return {
        records: result.items,
        registeredCount: summary.confirmedCount,
        attendedCount: summary.attendedCount,
        summary,
        pagination: result.pagination,
      };
    }

    const records = await this.adapter.listAttendanceForEvent(eventId);
    return {
      records,
      registeredCount: summary.confirmedCount,
      attendedCount: summary.attendedCount,
      summary,
    };
  }

  async exportCsv(eventId: string): Promise<{filename: string; csv: string}> {
    const event = await this.adapter.getEventById(eventId);
    if (!event) throw new NotFoundError('Event not found');

    const records = this.adapter.listAttendanceForEventPaginated
      ? (
          await this.adapter.listAttendanceForEventPaginated(eventId, {
            page: 1,
            pageSize: env.maxCsvExportRows,
          })
        ).items
      : (await this.adapter.listAttendanceForEvent(eventId)).slice(0, env.maxCsvExportRows);

    const headers = [
      'Attendance ID',
      'Registration ID',
      'Student Name',
      'Student Code',
      'Check-In Method',
      'Manual Override Reason',
      'Checked In By',
      'Scanned At',
    ];

    const lines = [headers.map((h) => escapeCsvCell(h)).join(',')];
    for (const r of records) {
      lines.push(
        [
          r.id,
          r.registrationId,
          r.studentName,
          r.studentCode,
          r.method,
          r.manualReason || '',
          r.checkedInBy,
          r.checkedInAt,
        ]
          .map((c) => escapeCsvCell(c))
          .join(','),
      );
    }

    const safeSlug = event.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);

    return {
      filename: `attendance-${safeSlug || eventId}.csv`,
      csv: lines.join('\r\n'),
    };
  }
}
