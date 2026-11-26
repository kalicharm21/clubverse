import type {
  FormAnswerValue,
  FormField,
  PaginatedResult,
  Registration,
  UserAccount,
} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {env} from '../../config/env.ts';
import {BusinessRuleError, NotFoundError} from '../../shared/errors/AppError.ts';
import {escapeCsvCell} from '../../shared/utils/crypto.ts';
import {
  validateFormSubmissionAnswers,
  validateStudentEligibility,
} from '../../shared/validation/formAnswers.ts';

export class RegistrationsService {
  constructor(private readonly adapter: DataAdapter) {}

  async registerStudent(
    eventId: string,
    student: UserAccount,
    answers: Record<string, FormAnswerValue>,
  ): Promise<Registration> {
    const event = await this.adapter.getEventById(eventId);
    if (!event) throw new NotFoundError('Event not found');

    if (event.status !== 'published' && event.status !== 'registration_open') {
      throw new BusinessRuleError(
        'EVENT_NOT_OPEN',
        `Registrations are not currently open for this event (${event.status.replace('_', ' ')})`,
      );
    }

    const now = Date.now();
    if (event.registrationOpensAt && now < new Date(event.registrationOpensAt).getTime()) {
      throw new BusinessRuleError(
        'REGISTRATION_NOT_OPEN_YET',
        `Registration opens on ${new Date(event.registrationOpensAt).toLocaleString()}`,
      );
    }
    if (event.registrationDeadline && now > new Date(event.registrationDeadline).getTime()) {
      throw new BusinessRuleError(
        'REGISTRATION_DEADLINE_PASSED',
        'Registration deadline for this event has passed',
      );
    }

    validateStudentEligibility(student, event.eligibilityRules);

    const publishedVersion = this.adapter.getPublishedFormVersion
      ? await this.adapter.getPublishedFormVersion(eventId)
      : null;
    if (!publishedVersion) {
      throw new BusinessRuleError(
        'FORM_NOT_PUBLISHED',
        'Registration form has not been published yet',
      );
    }

    const sanitizedAnswers = validateFormSubmissionAnswers(publishedVersion.fields, answers);

    const registration = await this.adapter.createRegistration({
      eventId,
      studentId: student.id,
      studentName: student.name,
      studentEmail: student.email,
      answers: sanitizedAnswers,
      qrToken: '',
      formVersion: publishedVersion.version,
      formVersionId: publishedVersion.id,
    });

    const isWaitlisted = registration.status === 'waitlisted';
    await this.adapter.createNotification({
      userId: student.id,
      title: isWaitlisted
        ? `Waitlist Joined (#${registration.waitlistPosition ?? 1}): ${registration.eventTitle}`
        : `Registration Confirmed: ${registration.eventTitle}`,
      message: isWaitlisted
        ? `Event capacity is currently full. You are #${registration.waitlistPosition ?? 1} on the automatic FIFO waitlist.`
        : 'Your registration is confirmed. Your ticket will be available once the club releases tickets.',
      category: 'registration',
      link: '/app/student/registrations',
    });

    return registration;
  }

  async cancelStudentRegistration(
    eventId: string,
    student: UserAccount,
  ): Promise<{
    cancelled: Registration;
    promotedUserId?: string | null;
    promotedRegistrationId?: string | null;
  }> {
    if (!this.adapter.cancelRegistration) {
      throw new BusinessRuleError(
        'CANCEL_NOT_SUPPORTED',
        'Registration cancellation is not supported by active adapter',
      );
    }
    const result = await this.adapter.cancelRegistration(eventId, student.id);

    await this.adapter.createNotification({
      userId: student.id,
      title: `Registration Cancelled: ${result.cancelled.eventTitle}`,
      message: `Your registration for ${result.cancelled.eventTitle} has been cancelled.`,
      category: 'registration',
      link: '/app/student/registrations',
    });

    if (result.promotedUserId) {
      await this.adapter.createNotification({
        userId: result.promotedUserId,
        title: `Waitlist Promoted: ${result.cancelled.eventTitle}`,
        message: `A confirmed seat opened up and you have been promoted from the waitlist for ${result.cancelled.eventTitle}. Your ticket will be available once the club releases tickets.`,
        category: 'registration',
        link: '/app/student/registrations',
      });
    }

    await this.adapter.appendAuditLog({
      actorId: student.id,
      actorName: student.name,
      actorContext: 'Student Portal',
      action: 'CANCELLED_EVENT_REGISTRATION',
      targetType: 'event',
      targetId: eventId,
      targetLabel: result.cancelled.eventTitle || eventId,
      details: result.promotedUserId
        ? `Cancelled registration and promoted waitlisted registration ${result.promotedRegistrationId}.`
        : 'Cancelled event registration.',
    });

    return result;
  }

  async listForEvent(eventId: string): Promise<Registration[]> {
    const ev = await this.adapter.getEventById(eventId);
    if (!ev) throw new NotFoundError('Event not found');
    return this.adapter.listRegistrationsForEvent(eventId);
  }

  async listForEventPaginated(
    eventId: string,
    opts?: {page?: number; pageSize?: number; search?: string; status?: string},
  ): Promise<PaginatedResult<Registration>> {
    const ev = await this.adapter.getEventById(eventId);
    if (!ev) throw new NotFoundError('Event not found');
    if (this.adapter.listRegistrationsForEventPaginated) {
      return this.adapter.listRegistrationsForEventPaginated(eventId, opts);
    }
    const items = await this.adapter.listRegistrationsForEvent(eventId);
    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, opts?.pageSize ?? 25));
    const filtered = items.filter((item) => {
      if (opts?.status && opts.status !== 'all' && item.status !== opts.status) return false;
      if (opts?.search) {
        const q = opts.search.toLowerCase();
        return (
          item.studentName.toLowerCase().includes(q) ||
          item.studentEmail.toLowerCase().includes(q) ||
          item.qrToken.toLowerCase().includes(q)
        );
      }
      return true;
    });
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      pagination: {page, pageSize, total, totalPages},
    };
  }

  async listForStudent(studentId: string): Promise<Registration[]> {
    return this.adapter.listRegistrationsForStudent(studentId);
  }

  async getRegistrationById(registrationId: string): Promise<Registration> {
    const reg = await this.adapter.getRegistrationById(registrationId);
    if (!reg) throw new NotFoundError('Registration not found');
    return reg;
  }

  async exportCsv(eventId: string): Promise<{filename: string; csv: string}> {
    const ev = await this.adapter.getEventById(eventId);
    if (!ev) throw new NotFoundError('Event not found');

    const rows = this.adapter.listRegistrationsForEventPaginated
      ? (
          await this.adapter.listRegistrationsForEventPaginated(eventId, {
            page: 1,
            pageSize: env.maxCsvExportRows,
          })
        ).items
      : (await this.adapter.listRegistrationsForEvent(eventId)).slice(0, env.maxCsvExportRows);

    // Collect fields preserving labels across historical form versions
    const versionFieldsMap = new Map<number, FormField[]>();
    const currentForm = await this.adapter.getRegistrationForm(eventId);
    const fieldOrder: Array<{id: string; label: string}> = [];
    const seenFieldIds = new Set<string>();

    const registerFields = (fields: FormField[]) => {
      for (const f of fields) {
        if (!seenFieldIds.has(f.id)) {
          seenFieldIds.add(f.id);
          fieldOrder.push({id: f.id, label: f.label});
        }
      }
    };

    const distinctVersions = [...new Set(rows.map((r) => r.formVersion ?? 1))];
    if (this.adapter.getPublishedFormVersion) {
      await Promise.all(
        distinctVersions.map(async (version) => {
          const snap = await this.adapter.getPublishedFormVersion!(eventId, version);
          if (snap) {
            versionFieldsMap.set(version, snap.fields);
            registerFields(snap.fields);
          }
        }),
      );
    }
    registerFields(currentForm.fields);

    const headers = [
      'Registration ID',
      'Student Name',
      'Student Email',
      'Status',
      'Waitlist Position',
      'Attendance',
      'Form Version',
      'Submitted At',
      ...fieldOrder.map((f) => f.label),
    ];

    const lines = [headers.map((h) => escapeCsvCell(h)).join(',')];
    for (const r of rows) {
      const baseCells = [
        r.id,
        r.studentName,
        r.studentEmail,
        r.status,
        r.waitlistPosition ?? '',
        r.qrUsedAt ? `Checked In (${r.qrUsedAt})` : 'Not Checked In',
        `v${r.formVersion ?? 1}`,
        r.createdAt,
      ];
      const answerCells = fieldOrder.map((f) => {
        const val = r.answers[f.id];
        if (Array.isArray(val)) return val.join('; ');
        if (typeof val === 'boolean') return val ? 'Yes' : 'No';
        return val ?? '';
      });
      lines.push([...baseCells, ...answerCells].map((c) => escapeCsvCell(c)).join(','));
    }

    const safeSlug = ev.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);

    return {
      filename: `registrations-${safeSlug || eventId}.csv`,
      csv: lines.join('\r\n'),
    };
  }
}
