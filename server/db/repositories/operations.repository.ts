import {and, asc, desc, eq, ilike, inArray, or, sql, type SQL} from 'drizzle-orm';
import type {
  AdminAnalyticsResponse,
  AdminDashboardStats,
  AttendanceRecord,
  AttendanceSummary,
  AuditLogEntry,
  ClubOverviewItem,
  EventAnalyticsItem,
  EventReport,
  EventReportHistoryEntry,
  EventReportStatus,
  FinanceClubSummary,
  FinanceEntry,
  FinanceEventSummary,
  FinanceSummaryResponse,
  FinancialReport,
  FormAnswerValue,
  NotificationItem,
  PaginatedResult,
  Registration,
  SystemSettings,
  TicketRecord,
  TicketReleaseSummary,
  TicketStatus,
} from '../../../shared/types/domain.ts';
import {MAX_FOLLOWED_CLUBS} from '../../config/constants.ts';
import {publicReadCache} from '../../shared/cache/publicReadCache.ts';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../shared/errors/AppError.ts';
import {
  generateOpaqueQrToken,
  generateTicketCode,
  sealTicketToken,
  unsealTicketToken,
} from '../../shared/utils/crypto.ts';
import {withRlsTransaction} from '../index.ts';
import {
  attendanceRecords,
  auditLogs,
  clubMemberships,
  clubs,
  eventForms,
  eventFormVersions,
  eventReports,
  events,
  financeEntries,
  financeLineItems,
  financeReports,
  notifications,
  registrations,
  systemSettings,
  tickets,
  users,
} from '../schema.ts';
import {
  fromCentsToFixed,
  fromCentsToNumber,
  hashSha256,
  isPgUniqueViolation,
  isUuid,
  mapAuditLogRow,
  mapEventReportRow,
  mapFinanceEntryRow,
  mapFinancialReportRow,
  mapNotificationRow,
  mapRegistrationRow,
  mapTicketRow,
  toCents,
} from './mappers.ts';

export class OperationsRepository {
  async createRegistration(input: {
    eventId: string;
    studentId: string;
    studentName: string;
    studentEmail: string;
    answers: Record<string, FormAnswerValue>;
    qrToken: string;
    formVersion?: number;
    formVersionId?: string | null;
  }): Promise<Registration> {
    if (!isUuid(input.eventId) || !isUuid(input.studentId)) {
      throw new NotFoundError('Event or student record not found');
    }

    const registration = await withRlsTransaction('registrations.create', async (tx) => {
      // Exclusive transaction-scoped advisory lock guarantees atomic capacity & waitlist ordering
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`campusverse_event_reg:${input.eventId}`}))`,
      );

      const lockedEvents = await tx.execute<{
        id: string;
        club_id: string;
        title: string;
        venue: string;
        starts_at: Date;
        registration_opens_at: Date | null;
        registration_deadline: Date;
        capacity: number;
        registered_count: number;
        status: string;
      }>(
        sql`SELECT id, club_id, title, venue, starts_at, registration_opens_at, registration_deadline, capacity, registered_count, status FROM public.events WHERE id = ${input.eventId}`,
      );

      const ev = lockedEvents[0];
      if (!ev) throw new NotFoundError('Event not found');

      if (ev.status !== 'published' && ev.status !== 'registration_open') {
        throw new BusinessRuleError(
          'EVENT_NOT_OPEN',
          `Registrations are not currently open (event status: ${ev.status.replace('_', ' ')})`,
        );
      }

      const now = new Date();
      if (ev.registration_opens_at && now < new Date(ev.registration_opens_at)) {
        throw new BusinessRuleError(
          'REGISTRATION_NOT_OPEN_YET',
          `Registration opens at ${new Date(ev.registration_opens_at).toISOString()}`,
        );
      }
      if (ev.registration_deadline && now > new Date(ev.registration_deadline)) {
        throw new BusinessRuleError(
          'REGISTRATION_DEADLINE_PASSED',
          'Registration deadline for this event has passed',
        );
      }

      const [existing] = await tx
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.eventId, input.eventId),
            eq(registrations.userId, input.studentId),
          ),
        )
        .limit(1);

      if (existing && existing.status !== 'cancelled') {
        throw new ConflictError('You are already registered for this event');
      }

      const status = ev.registered_count >= ev.capacity ? 'waitlisted' : 'confirmed';

      let resolvedVersion = input.formVersion ?? 1;
      let resolvedVersionId = input.formVersionId ?? null;

      if (!resolvedVersionId) {
        const [latestSnapshot] = await tx
          .select({id: eventFormVersions.id, version: eventFormVersions.version})
          .from(eventFormVersions)
          .where(eq(eventFormVersions.eventId, input.eventId))
          .orderBy(desc(eventFormVersions.version))
          .limit(1);

        if (latestSnapshot) {
          resolvedVersion = latestSnapshot.version;
          resolvedVersionId = latestSnapshot.id;
        } else {
          const [formRow] = await tx
            .select({version: eventForms.version})
            .from(eventForms)
            .where(eq(eventForms.eventId, input.eventId))
            .limit(1);
          resolvedVersion = formRow?.version ?? 1;
        }
      }

      const [clubRow] = await tx
        .select({name: clubs.name})
        .from(clubs)
        .where(eq(clubs.id, ev.club_id))
        .limit(1);

      const regRef = `REG-${generateOpaqueQrToken().slice(7, 19)}`;
      const regRefHash = hashSha256(regRef);

      try {
        let savedRow: typeof registrations.$inferSelect;
        if (existing && existing.status === 'cancelled') {
          const [reactivated] = await tx
            .update(registrations)
            .set({
              formVersion: resolvedVersion,
              formVersionId: resolvedVersionId,
              status,
              answers: input.answers,
              qrToken: regRef,
              qrTokenHash: regRefHash,
              cancelledAt: null,
              submittedAt: now,
            })
            .where(eq(registrations.id, existing.id))
            .returning();
          savedRow = reactivated;
        } else {
          const [inserted] = await tx
            .insert(registrations)
            .values({
              eventId: input.eventId,
              userId: input.studentId,
              formVersion: resolvedVersion,
              formVersionId: resolvedVersionId,
              status,
              answers: input.answers,
              qrToken: regRef,
              qrTokenHash: regRefHash,
            })
            .returning();
          savedRow = inserted;
        }

        const ticketCode = generateTicketCode();
        const [ticketRow] = await tx
          .insert(tickets)
          .values({
            registrationId: savedRow.id,
            eventId: input.eventId,
            userId: input.studentId,
            ticketCode,
            tokenHash: null,
            sealedToken: null,
            status: 'not_released',
          })
          .onConflictDoUpdate({
            target: tickets.registrationId,
            set: {
              status: 'not_released',
              tokenHash: null,
              sealedToken: null,
              releasedBy: null,
              releasedAt: null,
              revokedBy: null,
              revokedAt: null,
              updatedAt: now,
            },
          })
          .returning();

        let waitlistPosition: number | null = null;
        if (status === 'waitlisted') {
          const [posRow] = await tx
            .select({count: sql<number>`count(*)::int`})
            .from(registrations)
            .where(
              and(
                eq(registrations.eventId, input.eventId),
                eq(registrations.status, 'waitlisted'),
                sql`${registrations.submittedAt} <= (SELECT r_self.submitted_at FROM public.registrations r_self WHERE r_self.id = ${savedRow.id})`,
              ),
            );
          waitlistPosition = Math.max(1, posRow?.count ?? 1);
        }

        return mapRegistrationRow(savedRow, {
          eventTitle: ev.title,
          eventStartTime: new Date(ev.starts_at).toISOString(),
          eventVenue: ev.venue,
          clubId: ev.club_id,
          clubName: clubRow?.name || '',
          studentName: input.studentName,
          studentEmail: input.studentEmail,
          qrUsedAt: null,
          waitlistPosition,
          ticketStatus: ticketRow.status as TicketStatus,
          ticketCode: ticketRow.ticketCode,
          ticketReleasedAt: null,
          qrToken: '',
        });
      } catch (err: unknown) {
        if (isPgUniqueViolation(err)) {
          throw new ConflictError('You are already registered for this event');
        }
        throw err;
      }
    });

    publicReadCache.invalidateEvents();
    return registration;
  }

  async cancelRegistration(
    eventId: string,
    studentId: string,
    registrationId?: string,
  ): Promise<{
    cancelled: Registration;
    promotedUserId?: string | null;
    promotedRegistrationId?: string | null;
  }> {
    if (!isUuid(eventId) || !isUuid(studentId)) {
      throw new NotFoundError('Registration not found');
    }

    const result = await withRlsTransaction('registrations.cancel', async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`campusverse_event_reg:${eventId}`}))`,
      );

      const conditions = [
        eq(registrations.eventId, eventId),
        eq(registrations.userId, studentId),
      ];
      if (registrationId && isUuid(registrationId)) {
        conditions.push(eq(registrations.id, registrationId));
      }

      const [existing] = await tx
        .select()
        .from(registrations)
        .where(and(...conditions))
        .limit(1);

      if (!existing) throw new NotFoundError('Registration not found');
      if (existing.status === 'cancelled') {
        throw new ConflictError('This registration has already been cancelled');
      }
      if (existing.status === 'attended') {
        throw new BusinessRuleError(
          'CANNOT_CANCEL_ATTENDED',
          'Checked-in registrations cannot be cancelled',
        );
      }

      const wasConfirmed = existing.status === 'confirmed';
      const revokedToken = `REVOKED-${generateOpaqueQrToken().slice(7, 19)}`;
      const now = new Date();

      const [cancelledRow] = await tx
        .update(registrations)
        .set({
          status: 'cancelled',
          cancelledAt: now,
          qrToken: revokedToken,
          qrTokenHash: hashSha256(revokedToken),
        })
        .where(eq(registrations.id, existing.id))
        .returning();

      await tx
        .update(tickets)
        .set({
          status: 'revoked',
          tokenHash: null,
          sealedToken: null,
          revokedBy: studentId,
          revokedAt: now,
          updatedAt: now,
        })
        .where(eq(tickets.registrationId, existing.id));

      let promotedRegistrationId: string | null = null;
      let promotedUserId: string | null = null;

      if (wasConfirmed) {
        const promoRows = await tx.execute<{
          promoted_registration_id: string;
          promoted_user_id: string;
        }>(sql`SELECT promoted_registration_id, promoted_user_id FROM public.promote_next_waitlisted_registration(${eventId})`);

        if (promoRows[0]) {
          promotedRegistrationId = promoRows[0].promoted_registration_id;
          promotedUserId = promoRows[0].promoted_user_id;
        }
      }

      const [metaRow] = await tx
        .select({
          studentName: users.displayName,
          studentEmail: users.email,
          eventTitle: events.title,
          eventStartTime: events.startsAt,
          eventVenue: events.venue,
          clubId: events.clubId,
          clubName: clubs.name,
        })
        .from(events)
        .innerJoin(clubs, eq(events.clubId, clubs.id))
        .innerJoin(users, eq(users.id, studentId))
        .where(eq(events.id, eventId))
        .limit(1);

      return {
        cancelled: mapRegistrationRow(cancelledRow, {
          studentName: metaRow?.studentName,
          studentEmail: metaRow?.studentEmail,
          eventTitle: metaRow?.eventTitle,
          eventStartTime: metaRow?.eventStartTime.toISOString(),
          eventVenue: metaRow?.eventVenue,
          clubId: metaRow?.clubId,
          clubName: metaRow?.clubName,
          ticketStatus: 'revoked',
          qrUsedAt: null,
        }),
        promotedRegistrationId,
        promotedUserId,
      };
    });

    publicReadCache.invalidateEvents();
    return result;
  }

  async listRegistrationsForEventPaginated(
    eventId: string,
    opts?: {page?: number; pageSize?: number; search?: string; status?: string},
  ): Promise<PaginatedResult<Registration>> {
    if (!isUuid(eventId)) {
      return {items: [], pagination: {total: 0, page: 1, pageSize: 25, totalPages: 1}};
    }
    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, opts?.pageSize ?? 25));

    return withRlsTransaction('registrations.forEventPaginated', async (tx) => {
      const conditions: SQL[] = [eq(registrations.eventId, eventId)];
      if (opts?.status && opts.status !== 'All') {
        conditions.push(eq(registrations.status, opts.status));
      }
      if (opts?.search?.trim()) {
        const pattern = `%${opts.search.trim()}%`;
        const searchCond = or(
          ilike(users.displayName, pattern),
          ilike(users.email, pattern),
          ilike(registrations.qrToken, pattern),
        );
        if (searchCond) conditions.push(searchCond);
      }

      const whereClause = and(...conditions);

      const [countRows, rows] = await Promise.all([
        tx
          .select({count: sql<number>`count(*)::int`})
          .from(registrations)
          .innerJoin(users, eq(registrations.userId, users.id))
          .where(whereClause),
        tx
          .select({
            reg: registrations,
            ticket: tickets,
            studentName: users.displayName,
            studentEmail: users.email,
            evTitle: events.title,
            evStartsAt: events.startsAt,
            evVenue: events.venue,
            clubId: events.clubId,
            clubName: clubs.name,
            scannedAt: attendanceRecords.scannedAt,
          })
          .from(registrations)
          .innerJoin(users, eq(registrations.userId, users.id))
          .innerJoin(events, eq(registrations.eventId, events.id))
          .innerJoin(clubs, eq(events.clubId, clubs.id))
          .leftJoin(tickets, eq(tickets.registrationId, registrations.id))
          .leftJoin(attendanceRecords, eq(attendanceRecords.registrationId, registrations.id))
          .where(whereClause)
          .orderBy(desc(registrations.submittedAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
      ]);

      const total = countRows[0]?.count ?? 0;
      const items = rows.map((r) =>
        mapRegistrationRow(r.reg, {
          studentName: r.studentName,
          studentEmail: r.studentEmail,
          eventTitle: r.evTitle,
          eventStartTime: r.evStartsAt.toISOString(),
          eventVenue: r.evVenue,
          clubId: r.clubId,
          clubName: r.clubName,
          ticketStatus: (r.ticket?.status as TicketStatus) ?? 'not_released',
          ticketCode: r.ticket?.ticketCode,
          ticketReleasedAt: r.ticket?.releasedAt ? r.ticket.releasedAt.toISOString() : null,
          qrToken: '',
          qrUsedAt: r.scannedAt ? r.scannedAt.toISOString() : null,
        }),
      );

      return {
        items,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      };
    });
  }

  async listRegistrationsForEvent(eventId: string): Promise<Registration[]> {
    const res = await this.listRegistrationsForEventPaginated(eventId, {page: 1, pageSize: 500});
    return res.items;
  }

  async listRegistrationsForStudent(studentId: string): Promise<Registration[]> {
    if (!isUuid(studentId)) return [];
    return withRlsTransaction('registrations.forStudent', async (tx) => {
      const rows = await tx
        .select({
          reg: registrations,
          ticket: tickets,
          studentName: users.displayName,
          studentEmail: users.email,
          evTitle: events.title,
          evStartsAt: events.startsAt,
          evVenue: events.venue,
          clubId: events.clubId,
          clubName: clubs.name,
          scannedAt: attendanceRecords.scannedAt,
        })
        .from(registrations)
        .innerJoin(users, eq(registrations.userId, users.id))
        .innerJoin(events, eq(registrations.eventId, events.id))
        .innerJoin(clubs, eq(events.clubId, clubs.id))
        .leftJoin(tickets, eq(tickets.registrationId, registrations.id))
        .leftJoin(attendanceRecords, eq(attendanceRecords.registrationId, registrations.id))
        .where(eq(registrations.userId, studentId))
        .orderBy(desc(registrations.submittedAt));

      const waitlistEventIds = Array.from(
        new Set(rows.filter((r) => r.reg.status === 'waitlisted').map((r) => r.reg.eventId)),
      );
      const waitlistOrderByRegId = new Map<string, number>();
      for (const evId of waitlistEventIds) {
        const wlRows = await tx
          .select({id: registrations.id})
          .from(registrations)
          .where(and(eq(registrations.eventId, evId), eq(registrations.status, 'waitlisted')))
          .orderBy(asc(registrations.submittedAt));
        wlRows.forEach((w, idx) => waitlistOrderByRegId.set(w.id, idx + 1));
      }

      return rows.map((r) => {
        const ticketStatus = (r.ticket?.status as TicketStatus) ?? 'not_released';
        const unsealedQr =
          ticketStatus === 'released' ? unsealTicketToken(r.ticket?.sealedToken) : '';
        return mapRegistrationRow(r.reg, {
          studentName: r.studentName,
          studentEmail: r.studentEmail,
          eventTitle: r.evTitle,
          eventStartTime: r.evStartsAt.toISOString(),
          eventVenue: r.evVenue,
          clubId: r.clubId,
          clubName: r.clubName,
          ticketStatus,
          ticketCode: r.ticket?.ticketCode,
          ticketReleasedAt: r.ticket?.releasedAt ? r.ticket.releasedAt.toISOString() : null,
          qrToken: unsealedQr,
          qrUsedAt: r.scannedAt ? r.scannedAt.toISOString() : null,
          waitlistPosition: waitlistOrderByRegId.get(r.reg.id) ?? null,
        });
      });
    });
  }

  async getRegistrationById(registrationId: string): Promise<Registration | null> {
    if (!isUuid(registrationId)) return null;
    return withRlsTransaction('registrations.getById', async (tx) => {
      const rows = await tx
        .select({
          reg: registrations,
          ticket: tickets,
          studentName: users.displayName,
          studentEmail: users.email,
          evTitle: events.title,
          evStartsAt: events.startsAt,
          evVenue: events.venue,
          clubId: events.clubId,
          clubName: clubs.name,
          scannedAt: attendanceRecords.scannedAt,
        })
        .from(registrations)
        .innerJoin(users, eq(registrations.userId, users.id))
        .innerJoin(events, eq(registrations.eventId, events.id))
        .innerJoin(clubs, eq(events.clubId, clubs.id))
        .leftJoin(tickets, eq(tickets.registrationId, registrations.id))
        .leftJoin(attendanceRecords, eq(attendanceRecords.registrationId, registrations.id))
        .where(eq(registrations.id, registrationId))
        .limit(1);

      const r = rows[0];
      if (!r) return null;
      const ticketStatus = (r.ticket?.status as TicketStatus) ?? 'not_released';
      const unsealedQr =
        ticketStatus === 'released' ? unsealTicketToken(r.ticket?.sealedToken) : '';
      return mapRegistrationRow(r.reg, {
        studentName: r.studentName,
        studentEmail: r.studentEmail,
        eventTitle: r.evTitle,
        eventStartTime: r.evStartsAt.toISOString(),
        eventVenue: r.evVenue,
        clubId: r.clubId,
        clubName: r.clubName,
        ticketStatus,
        ticketCode: r.ticket?.ticketCode,
        ticketReleasedAt: r.ticket?.releasedAt ? r.ticket.releasedAt.toISOString() : null,
        qrToken: unsealedQr,
        qrUsedAt: r.scannedAt ? r.scannedAt.toISOString() : null,
      });
    });
  }

  async getRegistrationByQrToken(eventId: string, qrToken: string): Promise<Registration | null> {
    const raw = qrToken.trim();
    if (!isUuid(eventId) || !raw) return null;
    const tokenHash = hashSha256(raw);

    return withRlsTransaction('registrations.getByQrToken', async (tx) => {
      const rows = await tx
        .select({
          reg: registrations,
          ticket: tickets,
          studentName: users.displayName,
          studentEmail: users.email,
          evTitle: events.title,
          evStartsAt: events.startsAt,
          evVenue: events.venue,
          clubId: events.clubId,
          clubName: clubs.name,
          scannedAt: attendanceRecords.scannedAt,
        })
        .from(tickets)
        .innerJoin(registrations, eq(tickets.registrationId, registrations.id))
        .innerJoin(users, eq(registrations.userId, users.id))
        .innerJoin(events, eq(registrations.eventId, events.id))
        .innerJoin(clubs, eq(events.clubId, clubs.id))
        .leftJoin(attendanceRecords, eq(attendanceRecords.registrationId, registrations.id))
        .where(eq(tickets.tokenHash, tokenHash))
        .limit(1);

      const matched = rows[0];
      if (matched) {
        if (matched.reg.eventId !== eventId) {
          throw new BusinessRuleError(
            'WRONG_EVENT_TICKET',
            'This ticket belongs to a different event and cannot be checked in here',
          );
        }
        if (matched.ticket.status === 'revoked') {
          throw new BusinessRuleError(
            'TICKET_REVOKED',
            'This ticket has been revoked and cannot be used for check-in',
          );
        }
        if (matched.ticket.status !== 'released') {
          throw new BusinessRuleError(
            'TICKET_NOT_RELEASED',
            'Tickets have not been released for this registration yet',
          );
        }
        return mapRegistrationRow(matched.reg, {
          studentName: matched.studentName,
          studentEmail: matched.studentEmail,
          eventTitle: matched.evTitle,
          eventStartTime: matched.evStartsAt.toISOString(),
          eventVenue: matched.evVenue,
          clubId: matched.clubId,
          clubName: matched.clubName,
          ticketStatus: matched.ticket.status as TicketStatus,
          ticketCode: matched.ticket.ticketCode,
          ticketReleasedAt: matched.ticket.releasedAt
            ? matched.ticket.releasedAt.toISOString()
            : null,
          qrToken: matched.ticket.ticketCode,
          qrUsedAt: matched.scannedAt ? matched.scannedAt.toISOString() : null,
        });
      }

      // Diagnostic lookup if caller submitted a ticketCode or registration reference for an unreleased/revoked ticket
      const codeRows = await tx
        .select({status: tickets.status, eventId: tickets.eventId})
        .from(tickets)
        .where(and(eq(tickets.eventId, eventId), eq(tickets.ticketCode, raw.toUpperCase())))
        .limit(1);
      if (codeRows[0]) {
        if (codeRows[0].status === 'not_released') {
          throw new BusinessRuleError(
            'TICKET_NOT_RELEASED',
            'Ticket has not been released for this participant yet',
          );
        }
        if (codeRows[0].status === 'revoked') {
          throw new BusinessRuleError(
            'TICKET_REVOKED',
            'This ticket has been revoked and is no longer valid',
          );
        }
      }

      return null;
    });
  }

  async releaseEventTickets(
    eventId: string,
    actor: {id: string; name: string},
  ): Promise<TicketReleaseSummary> {
    if (!isUuid(eventId)) throw new NotFoundError('Event not found');

    const summary = await withRlsTransaction('tickets.releaseBatch', async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`campusverse_ticket_release:${eventId}`}))`,
      );

      const [ev] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
      if (!ev) throw new NotFoundError('Event not found');
      if (ev.status === 'draft' || ev.status === 'cancelled') {
        throw new BusinessRuleError(
          'EVENT_NOT_TICKET_ELIGIBLE',
          `Cannot release tickets while event status is ${ev.status}`,
        );
      }

      const eligibleRegs = await tx
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.eventId, eventId),
            inArray(registrations.status, ['confirmed', 'attended']),
          ),
        );

      const existingTickets =
        eligibleRegs.length > 0
          ? await tx
              .select()
              .from(tickets)
              .where(eq(tickets.eventId, eventId))
          : [];
      const ticketByRegId = new Map(existingTickets.map((t) => [t.registrationId, t]));

      const now = new Date();
      let releasedCount = 0;
      let alreadyReleasedCount = 0;
      const notifyUserIds: Array<{userId: string; ticketCode: string}> = [];

      for (const reg of eligibleRegs) {
        const existing = ticketByRegId.get(reg.id);
        if (existing && existing.status === 'released') {
          alreadyReleasedCount += 1;
          continue;
        }
        if (existing && existing.status === 'revoked') {
          continue;
        }

        const rawToken = generateOpaqueQrToken();
        const tokenHash = hashSha256(rawToken);
        const sealedToken = sealTicketToken(rawToken);
        const ticketCode = existing?.ticketCode || generateTicketCode();

        await tx
          .insert(tickets)
          .values({
            registrationId: reg.id,
            eventId,
            userId: reg.userId,
            ticketCode,
            tokenHash,
            sealedToken,
            status: 'released',
            releasedBy: isUuid(actor.id) ? actor.id : null,
            releasedAt: now,
            revokedBy: null,
            revokedAt: null,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: tickets.registrationId,
            set: {
              tokenHash,
              sealedToken,
              status: 'released',
              releasedBy: isUuid(actor.id) ? actor.id : null,
              releasedAt: now,
              revokedBy: null,
              revokedAt: null,
              updatedAt: now,
            },
          });

        releasedCount += 1;
        notifyUserIds.push({userId: reg.userId, ticketCode});
      }

      const releaseTimestamp = ev.ticketsReleasedAt && releasedCount === 0 ? ev.ticketsReleasedAt : now;
      await tx
        .update(events)
        .set({
          ticketsReleasedAt: releaseTimestamp,
          ticketsReleasedBy: isUuid(actor.id) ? actor.id : ev.ticketsReleasedBy,
          updatedAt: now,
        })
        .where(eq(events.id, eventId));

      if (notifyUserIds.length > 0) {
        await tx.insert(notifications).values(
          notifyUserIds.map((item) => ({
            userId: item.userId,
            type: 'registration',
            title: `Ticket Released: ${ev.title}`,
            message: `Your QR pass (${item.ticketCode}) for ${ev.title} is now available in My Registrations.`,
            link: '/app/student/registrations',
            isRead: false,
          })),
        );
      }

      return {
        eventId,
        releasedCount,
        alreadyReleasedCount,
        totalReleased: releasedCount + alreadyReleasedCount,
        eligibleCount: eligibleRegs.length,
        ticketsReleasedAt: releaseTimestamp.toISOString(),
        emailDelivery: 'not_configured' as const,
      };
    });

    publicReadCache.invalidateEvents();
    return summary;
  }

  async listEventTickets(eventId: string): Promise<TicketRecord[]> {
    if (!isUuid(eventId)) return [];
    return withRlsTransaction('tickets.listForEvent', async (tx) => {
      const rows = await tx
        .select({
          ticket: tickets,
          studentName: users.displayName,
          studentEmail: users.email,
          regStatus: registrations.status,
        })
        .from(tickets)
        .innerJoin(registrations, eq(tickets.registrationId, registrations.id))
        .innerJoin(users, eq(tickets.userId, users.id))
        .where(eq(tickets.eventId, eventId))
        .orderBy(desc(tickets.updatedAt));

      return rows.map((r) =>
        mapTicketRow(r.ticket, {
          studentName: r.studentName,
          studentEmail: r.studentEmail,
          registrationStatus: r.regStatus as Registration['status'],
        }),
      );
    });
  }

  async listStudentTickets(userId: string): Promise<TicketRecord[]> {
    if (!isUuid(userId)) return [];
    return withRlsTransaction('tickets.listForStudent', async (tx) => {
      const rows = await tx
        .select({
          ticket: tickets,
          regStatus: registrations.status,
        })
        .from(tickets)
        .innerJoin(registrations, eq(tickets.registrationId, registrations.id))
        .where(eq(tickets.userId, userId))
        .orderBy(desc(tickets.updatedAt));

      return rows.map((r) =>
        mapTicketRow(r.ticket, {
          registrationStatus: r.regStatus as Registration['status'],
          unsealedQrToken:
            r.ticket.status === 'released' ? unsealTicketToken(r.ticket.sealedToken) : undefined,
        }),
      );
    });
  }

  async getTicketById(ticketId: string): Promise<TicketRecord | null> {
    if (!isUuid(ticketId)) return null;
    return withRlsTransaction('tickets.getById', async (tx) => {
      const rows = await tx
        .select({
          ticket: tickets,
          studentName: users.displayName,
          studentEmail: users.email,
          regStatus: registrations.status,
        })
        .from(tickets)
        .innerJoin(registrations, eq(tickets.registrationId, registrations.id))
        .innerJoin(users, eq(tickets.userId, users.id))
        .where(eq(tickets.id, ticketId))
        .limit(1);
      if (!rows[0]) return null;
      return mapTicketRow(rows[0].ticket, {
        studentName: rows[0].studentName,
        studentEmail: rows[0].studentEmail,
        registrationStatus: rows[0].regStatus as Registration['status'],
      });
    });
  }

  async revokeTicket(
    ticketId: string,
    actor: {id: string; name: string},
    reason?: string,
  ): Promise<TicketRecord | null> {
    if (!isUuid(ticketId)) return null;
    const revoked = await withRlsTransaction('tickets.revoke', async (tx) => {
      const now = new Date();
      const [updated] = await tx
        .update(tickets)
        .set({
          status: 'revoked',
          sealedToken: null,
          revokedBy: isUuid(actor.id) ? actor.id : null,
          revokedAt: now,
          updatedAt: now,
        })
        .where(eq(tickets.id, ticketId))
        .returning();
      if (!updated) return null;

      const [ev] = await tx
        .select({title: events.title})
        .from(events)
        .where(eq(events.id, updated.eventId))
        .limit(1);

      await tx.insert(notifications).values({
        userId: updated.userId,
        type: 'registration',
        title: `Ticket Revoked: ${ev?.title || 'Event'}`,
        message: reason
          ? `Your ticket (${updated.ticketCode}) was revoked: ${reason}`
          : `Your ticket (${updated.ticketCode}) has been revoked by the organizing club.`,
        link: '/app/student/registrations',
        isRead: false,
      });

      const [student] = await tx
        .select({name: users.displayName, email: users.email})
        .from(users)
        .where(eq(users.id, updated.userId))
        .limit(1);

      return mapTicketRow(updated, {
        studentName: student?.name,
        studentEmail: student?.email,
      });
    });

    if (revoked) publicReadCache.invalidateEvents();
    return revoked;
  }

  async recordAttendance(input: {
    eventId: string;
    registrationId: string;
    studentId: string;
    studentName: string;
    studentCode: string;
    qrToken: string;
    method: 'qr_scan' | 'manual_override';
    manualReason?: string;
    checkedInBy: string;
    scannedByUserId?: string;
  }): Promise<AttendanceRecord> {
    if (!isUuid(input.eventId) || !isUuid(input.registrationId)) {
      throw new NotFoundError('Registration or event not found');
    }

    const record = await withRlsTransaction('attendance.record', async (tx) => {
      const [ev] = await tx
        .select({id: events.id, status: events.status})
        .from(events)
        .where(eq(events.id, input.eventId))
        .limit(1);
      if (!ev) throw new NotFoundError('Event not found');
      if (ev.status === 'cancelled' || ev.status === 'draft') {
        throw new BusinessRuleError(
          'EVENT_NOT_CHECKIN_ELIGIBLE',
          `Check-in is not allowed while event status is ${ev.status}`,
        );
      }

      // Pessimistic row lock on registration prevents concurrent double check-in races
      const lockedRegs = await tx.execute<{id: string; status: string; event_id: string}>(
        sql`SELECT id, status, event_id FROM public.registrations WHERE id = ${input.registrationId} FOR UPDATE`,
      );
      if (!lockedRegs[0]) {
        throw new NotFoundError('Registration not found');
      }
      if (lockedRegs[0].event_id !== input.eventId) {
        throw new BusinessRuleError(
          'WRONG_EVENT_TICKET',
          'This registration does not belong to the selected event',
        );
      }
      if (lockedRegs[0].status === 'cancelled') {
        throw new BusinessRuleError(
          'REGISTRATION_CANCELLED',
          'Cancelled registrations cannot be checked in',
        );
      }
      if (lockedRegs[0].status === 'waitlisted') {
        throw new BusinessRuleError(
          'REGISTRATION_WAITLISTED',
          'Waitlisted registrations cannot be checked in until a confirmed seat opens',
        );
      }

      if (input.method === 'qr_scan') {
        const lockedTickets = await tx.execute<{status: string; ticket_code: string}>(
          sql`SELECT status, ticket_code FROM public.tickets WHERE registration_id = ${input.registrationId} FOR UPDATE`,
        );
        const ticketRow = lockedTickets[0];
        if (!ticketRow || ticketRow.status === 'not_released') {
          throw new BusinessRuleError(
            'TICKET_NOT_RELEASED',
            'Ticket has not been released for this registration yet',
          );
        }
        if (ticketRow.status === 'revoked') {
          throw new BusinessRuleError(
            'TICKET_REVOKED',
            'This ticket has been revoked and cannot be used for check-in',
          );
        }
      }

      const [existing] = await tx
        .select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.registrationId, input.registrationId))
        .limit(1);

      if (existing) {
        throw new ConflictError(
          `Duplicate scan prevented: ${input.studentName} was already checked in at ${existing.scannedAt.toISOString()}`,
        );
      }

      try {
        const [inserted] = await tx
          .insert(attendanceRecords)
          .values({
            eventId: input.eventId,
            registrationId: input.registrationId,
            scannedBy: isUuid(input.scannedByUserId) ? input.scannedByUserId : null,
            scannedByName: input.checkedInBy,
            scanMethod: input.method,
            manualReason:
              input.method === 'manual_override' ? input.manualReason?.trim() || null : null,
          })
          .returning();

        await tx
          .update(registrations)
          .set({status: 'attended'})
          .where(eq(registrations.id, input.registrationId));

        return {
          id: inserted.id,
          eventId: inserted.eventId,
          registrationId: inserted.registrationId,
          studentId: input.studentId,
          studentName: input.studentName,
          studentCode: input.studentCode,
          qrToken: input.qrToken,
          method: input.method,
          manualReason: inserted.manualReason,
          checkedInBy: inserted.scannedByName,
          checkedInAt: inserted.scannedAt.toISOString(),
        };
      } catch (err: unknown) {
        if (isPgUniqueViolation(err)) {
          throw new ConflictError(
            `Duplicate scan prevented: ${input.studentName} is already checked in`,
          );
        }
        throw err;
      }
    });

    publicReadCache.invalidateEvents();
    return record;
  }

  async listAttendanceForEventPaginated(
    eventId: string,
    opts?: {page?: number; pageSize?: number; search?: string},
  ): Promise<PaginatedResult<AttendanceRecord>> {
    if (!isUuid(eventId)) {
      return {items: [], pagination: {total: 0, page: 1, pageSize: 25, totalPages: 1}};
    }
    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, opts?.pageSize ?? 25));

    return withRlsTransaction('attendance.forEventPaginated', async (tx) => {
      const conditions: SQL[] = [eq(attendanceRecords.eventId, eventId)];
      if (opts?.search?.trim()) {
        const pattern = `%${opts.search.trim()}%`;
        const searchCond = or(
          ilike(users.displayName, pattern),
          ilike(users.studentId, pattern),
          ilike(attendanceRecords.scannedByName, pattern),
        );
        if (searchCond) conditions.push(searchCond);
      }

      const whereClause = and(...conditions);

      const [countRows, rows] = await Promise.all([
        tx
          .select({count: sql<number>`count(*)::int`})
          .from(attendanceRecords)
          .innerJoin(registrations, eq(attendanceRecords.registrationId, registrations.id))
          .innerJoin(users, eq(registrations.userId, users.id))
          .where(whereClause),
        tx
          .select({
            att: attendanceRecords,
            reg: registrations,
            studentName: users.displayName,
            studentCode: users.studentId,
          })
          .from(attendanceRecords)
          .innerJoin(registrations, eq(attendanceRecords.registrationId, registrations.id))
          .innerJoin(users, eq(registrations.userId, users.id))
          .where(whereClause)
          .orderBy(desc(attendanceRecords.scannedAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
      ]);

      const total = countRows[0]?.count ?? 0;
      return {
        items: rows.map((r) => ({
          id: r.att.id,
          eventId: r.att.eventId,
          registrationId: r.att.registrationId,
          studentId: r.reg.userId,
          studentName: r.studentName,
          studentCode: r.studentCode || r.reg.userId,
          qrToken: r.reg.qrToken,
          method: r.att.scanMethod === 'manual_override' ? 'manual_override' : 'qr_scan',
          manualReason: r.att.manualReason,
          checkedInBy: r.att.scannedByName,
          checkedInAt: r.att.scannedAt.toISOString(),
        })),
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      };
    });
  }

  async listAttendanceForEvent(eventId: string): Promise<AttendanceRecord[]> {
    const res = await this.listAttendanceForEventPaginated(eventId, {page: 1, pageSize: 500});
    return res.items;
  }

  async getAttendanceSummary(eventId: string): Promise<AttendanceSummary> {
    if (!isUuid(eventId)) {
      return {
        eventId,
        confirmedCount: 0,
        ticketsReleasedCount: 0,
        ticketsNotReleasedCount: 0,
        attendedCount: 0,
        remainingCount: 0,
        attendancePercentage: 0,
      };
    }

    return withRlsTransaction('attendance.summary', async (tx) => {
      const [regStats] = await tx
        .select({
          confirmedCount: sql<number>`count(*) FILTER (WHERE ${registrations.status} IN ('confirmed', 'attended'))::int`,
          attendedCount: sql<number>`count(*) FILTER (WHERE ${registrations.status} = 'attended')::int`,
        })
        .from(registrations)
        .where(eq(registrations.eventId, eventId));

      const [ticketStats] = await tx
        .select({
          releasedCount: sql<number>`count(*) FILTER (WHERE ${tickets.status} = 'released')::int`,
          notReleasedCount: sql<number>`count(*) FILTER (WHERE ${tickets.status} = 'not_released')::int`,
        })
        .from(tickets)
        .innerJoin(registrations, eq(tickets.registrationId, registrations.id))
        .where(
          and(
            eq(tickets.eventId, eventId),
            inArray(registrations.status, ['confirmed', 'attended']),
          ),
        );

      const confirmedCount = regStats?.confirmedCount ?? 0;
      const attendedCount = regStats?.attendedCount ?? 0;
      const ticketsReleasedCount = ticketStats?.releasedCount ?? 0;
      const ticketsNotReleasedCount = Math.max(
        0,
        ticketStats?.notReleasedCount ?? confirmedCount - ticketsReleasedCount,
      );
      const remainingCount = Math.max(0, confirmedCount - attendedCount);
      const attendancePercentage =
        confirmedCount > 0 ? Math.round((attendedCount / confirmedCount) * 100) : 0;

      return {
        eventId,
        confirmedCount,
        ticketsReleasedCount,
        ticketsNotReleasedCount,
        attendedCount,
        remainingCount,
        attendancePercentage,
      };
    });
  }

  async upsertEventReport(
    report: Omit<EventReport, 'id' | 'submittedAt'> & {actorRole?: string},
  ): Promise<EventReport> {
    if (!isUuid(report.eventId) || !isUuid(report.clubId)) {
      throw new NotFoundError('Event or club not found');
    }

    return withRlsTransaction('reports.upsertEventReport', async (tx) => {
      const [existing] = await tx
        .select()
        .from(eventReports)
        .where(eq(eventReports.eventId, report.eventId))
        .limit(1);

      const now = new Date();
      const nextStatus: EventReportStatus = report.status === 'draft' ? 'draft' : 'submitted';
      const historyEntry: EventReportHistoryEntry = {
        action:
          existing && existing.status === 'changes_requested' && nextStatus === 'submitted'
            ? 'RESUBMITTED'
            : nextStatus === 'draft'
              ? 'SAVED_DRAFT'
              : 'SUBMITTED',
        status: nextStatus,
        actorId: report.submittedBy || 'system',
        actorName: report.submittedByName,
        actorRole: report.actorRole || 'Club Officer',
        notes:
          existing && existing.status === 'changes_requested' && nextStatus === 'submitted'
            ? 'Resubmitted report after addressing review feedback.'
            : undefined,
        timestamp: now.toISOString(),
      };
      const nextHistory = [...(existing?.history || []), historyEntry];

      const actualDate = report.actualEventDate ? new Date(report.actualEventDate) : null;
      const validActualDate = actualDate && !Number.isNaN(actualDate.getTime()) ? actualDate : null;

      const [upserted] = await tx
        .insert(eventReports)
        .values({
          eventId: report.eventId,
          clubId: report.clubId,
          summary: report.outcomeSummary,
          objectives: report.objectives || '',
          actualEventDate: validActualDate,
          participationSummary: report.participationSummary || '',
          outcomes: report.outcomes || '',
          highlights: report.highlights,
          challenges: report.challenges,
          feedbackObservations: report.feedbackObservations || '',
          evidenceUrl: report.evidenceUrl || '',
          actualAttendance: report.actualAttendance,
          registeredTotal: report.registeredTotal,
          completionStatus: report.completionStatus,
          status: nextStatus,
          history: nextHistory,
          submittedBy: isUuid(report.submittedBy) ? report.submittedBy : null,
          submittedByName: report.submittedByName,
          updatedBy: isUuid(report.submittedBy) ? report.submittedBy : null,
        })
        .onConflictDoUpdate({
          target: eventReports.eventId,
          set: {
            summary: report.outcomeSummary,
            objectives: report.objectives || '',
            actualEventDate: validActualDate,
            participationSummary: report.participationSummary || '',
            outcomes: report.outcomes || '',
            highlights: report.highlights,
            challenges: report.challenges,
            feedbackObservations: report.feedbackObservations || '',
            evidenceUrl: report.evidenceUrl || '',
            actualAttendance: report.actualAttendance,
            registeredTotal: report.registeredTotal,
            completionStatus: report.completionStatus,
            status: nextStatus,
            history: nextHistory,
            submittedBy: isUuid(report.submittedBy) ? report.submittedBy : null,
            submittedByName: report.submittedByName,
            submittedAt: nextStatus === 'submitted' ? now : existing?.submittedAt ?? now,
            updatedBy: isUuid(report.submittedBy) ? report.submittedBy : null,
            updatedAt: now,
          },
        })
        .returning();

      return mapEventReportRow(upserted, {
        eventTitle: report.eventTitle,
        clubName: report.clubName,
      });
    });
  }

  async reviewEventReport(
    reportId: string,
    actor: {id: string; name: string},
    input: {status: 'under_review' | 'changes_requested' | 'approved' | 'rejected'; reviewNotes: string},
  ): Promise<EventReport> {
    if (!isUuid(reportId)) throw new NotFoundError('Report not found');

    return withRlsTransaction('reports.review', async (tx) => {
      const [existing] = await tx
        .select()
        .from(eventReports)
        .where(eq(eventReports.id, reportId))
        .limit(1);
      if (!existing) throw new NotFoundError('Report not found');

      const [meta] = await tx
        .select({eventTitle: events.title, clubName: clubs.name})
        .from(events)
        .innerJoin(clubs, eq(events.clubId, clubs.id))
        .where(eq(events.id, existing.eventId))
        .limit(1);

      const now = new Date();
      const historyEntry: EventReportHistoryEntry = {
        action: `REVIEW_${input.status.toUpperCase()}`,
        status: input.status,
        actorId: actor.id,
        actorName: actor.name,
        actorRole: 'Super Admin',
        notes: input.reviewNotes || undefined,
        timestamp: now.toISOString(),
      };

      const [updated] = await tx
        .update(eventReports)
        .set({
          status: input.status,
          reviewedBy: isUuid(actor.id) ? actor.id : null,
          reviewedByName: actor.name,
          reviewedAt: now,
          reviewNotes: input.reviewNotes,
          history: [...(existing.history || []), historyEntry],
          updatedBy: isUuid(actor.id) ? actor.id : null,
          updatedAt: now,
        })
        .where(eq(eventReports.id, reportId))
        .returning();

      const recipientIds = new Set<string>();
      if (existing.submittedBy) recipientIds.add(existing.submittedBy);
      const officerRows = await tx
        .select({userId: clubMemberships.userId})
        .from(clubMemberships)
        .where(
          and(
            eq(clubMemberships.clubId, existing.clubId),
            eq(clubMemberships.status, 'active'),
            inArray(clubMemberships.membershipRole, ['president', 'vice_president']),
          ),
        );
      officerRows.forEach((o) => recipientIds.add(o.userId));

      if (recipientIds.size > 0) {
        const statusLabel = input.status.replace('_', ' ');
        await tx.insert(notifications).values(
          [...recipientIds].map((userId) => ({
            userId,
            type: 'admin',
            title: `Event Report ${statusLabel}: ${meta?.eventTitle || 'Event'}`,
            message: input.reviewNotes
              ? `Super Admin marked the post-event report as ${statusLabel}: "${input.reviewNotes}".`
              : `Super Admin marked the post-event report for ${meta?.eventTitle || 'event'} as ${statusLabel}.`,
            link: '/app/club-admin/reports',
            isRead: false,
          })),
        );
      }

      return mapEventReportRow(updated, {
        eventTitle: meta?.eventTitle || 'Event',
        clubName: meta?.clubName || 'Club',
      });
    });
  }

  async getEventReport(eventId: string): Promise<EventReport | null> {
    if (!isUuid(eventId)) return null;
    return withRlsTransaction('reports.getEventReport', async (tx) => {
      const rows = await tx
        .select({
          report: eventReports,
          eventTitle: events.title,
          clubName: clubs.name,
        })
        .from(eventReports)
        .innerJoin(events, eq(eventReports.eventId, events.id))
        .innerJoin(clubs, eq(eventReports.clubId, clubs.id))
        .where(eq(eventReports.eventId, eventId))
        .limit(1);
      if (!rows[0]) return null;
      return mapEventReportRow(rows[0].report, {
        eventTitle: rows[0].eventTitle,
        clubName: rows[0].clubName,
      });
    });
  }

  async listAllEventReports(): Promise<EventReport[]> {
    return withRlsTransaction('reports.listAllEventReports', async (tx) => {
      const rows = await tx
        .select({
          report: eventReports,
          eventTitle: events.title,
          clubName: clubs.name,
        })
        .from(eventReports)
        .innerJoin(events, eq(eventReports.eventId, events.id))
        .innerJoin(clubs, eq(eventReports.clubId, clubs.id))
        .orderBy(desc(eventReports.submittedAt));
      return rows.map((r) =>
        mapEventReportRow(r.report, {
          eventTitle: r.eventTitle,
          clubName: r.clubName,
        }),
      );
    });
  }

  async upsertFinancialReport(
    report: Omit<FinancialReport, 'id' | 'submittedAt'>,
  ): Promise<FinancialReport> {
    if (!isUuid(report.eventId) || !isUuid(report.clubId)) {
      throw new NotFoundError('Event or club not found');
    }

    const collectionsCents = report.lineItems
      .filter((i) => i.type === 'collection')
      .reduce((sum, i) => sum + toCents(i.amount), 0);
    const expensesCents = report.lineItems
      .filter((i) => i.type === 'expense')
      .reduce((sum, i) => sum + toCents(i.amount), 0);
    const netCents = collectionsCents - expensesCents;

    return withRlsTransaction('finance.upsertReport', async (tx) => {
      const [upserted] = await tx
        .insert(financeReports)
        .values({
          eventId: report.eventId,
          clubId: report.clubId,
          totalCollections: fromCentsToFixed(collectionsCents),
          totalExpenses: fromCentsToFixed(expensesCents),
          netBalance: fromCentsToFixed(netCents),
          totalCollectionsMinorUnits: collectionsCents,
          totalExpensesMinorUnits: expensesCents,
          netBalanceMinorUnits: netCents,
          notes: report.notes,
          submittedBy: isUuid(report.submittedBy) ? report.submittedBy : null,
          submittedByName: report.submittedByName,
        })
        .onConflictDoUpdate({
          target: financeReports.eventId,
          set: {
            totalCollections: fromCentsToFixed(collectionsCents),
            totalExpenses: fromCentsToFixed(expensesCents),
            netBalance: fromCentsToFixed(netCents),
            totalCollectionsMinorUnits: collectionsCents,
            totalExpensesMinorUnits: expensesCents,
            netBalanceMinorUnits: netCents,
            notes: report.notes,
            submittedBy: isUuid(report.submittedBy) ? report.submittedBy : null,
            submittedByName: report.submittedByName,
            updatedAt: new Date(),
          },
        })
        .returning();

      await tx.delete(financeLineItems).where(eq(financeLineItems.financeReportId, upserted.id));

      const insertedItems =
        report.lineItems.length > 0
          ? await tx
              .insert(financeLineItems)
              .values(
                report.lineItems.map((item) => ({
                  financeReportId: upserted.id,
                  itemType: item.type,
                  category: item.category,
                  description: item.label,
                  amount: fromCentsToFixed(toCents(item.amount)),
                  notes: item.notes ?? null,
                })),
              )
              .returning()
          : [];

      return mapFinancialReportRow(upserted, insertedItems, {
        eventTitle: report.eventTitle,
        clubName: report.clubName,
      });
    });
  }

  async getFinancialReport(eventId: string): Promise<FinancialReport | null> {
    if (!isUuid(eventId)) return null;
    return withRlsTransaction('finance.getReport', async (tx) => {
      const rows = await tx
        .select({
          report: financeReports,
          eventTitle: events.title,
          clubName: clubs.name,
        })
        .from(financeReports)
        .innerJoin(events, eq(financeReports.eventId, events.id))
        .innerJoin(clubs, eq(financeReports.clubId, clubs.id))
        .where(eq(financeReports.eventId, eventId))
        .limit(1);
      if (!rows[0]) return null;

      const items = await tx
        .select()
        .from(financeLineItems)
        .where(eq(financeLineItems.financeReportId, rows[0].report.id));

      return mapFinancialReportRow(rows[0].report, items, {
        eventTitle: rows[0].eventTitle,
        clubName: rows[0].clubName,
      });
    });
  }

  async listAllFinancialReports(): Promise<FinancialReport[]> {
    return withRlsTransaction('finance.listAllReports', async (tx) => {
      const rows = await tx
        .select({
          report: financeReports,
          eventTitle: events.title,
          clubName: clubs.name,
        })
        .from(financeReports)
        .innerJoin(events, eq(financeReports.eventId, events.id))
        .innerJoin(clubs, eq(financeReports.clubId, clubs.id))
        .orderBy(desc(financeReports.submittedAt));

      const allItems = await tx.select().from(financeLineItems);
      const itemsByReport = new Map<string, Array<typeof financeLineItems.$inferSelect>>();
      for (const item of allItems) {
        const list = itemsByReport.get(item.financeReportId) || [];
        list.push(item);
        itemsByReport.set(item.financeReportId, list);
      }

      return rows.map((r) =>
        mapFinancialReportRow(r.report, itemsByReport.get(r.report.id) || [], {
          eventTitle: r.eventTitle,
          clubName: r.clubName,
        }),
      );
    });
  }

  async createFinanceEntry(input: {
    clubId: string;
    eventId?: string | null;
    entryType: 'income' | 'expense';
    sourceOrCategory: string;
    description: string;
    amountMinorUnits: number;
    transactionDate: string;
    vendorOrRecipient: string;
    receiptUrl?: string;
    notes?: string;
    createdBy: string;
    createdByName: string;
  }): Promise<FinanceEntry> {
    if (!isUuid(input.clubId)) throw new NotFoundError('Club not found');
    const txDate = new Date(input.transactionDate);
    if (Number.isNaN(txDate.getTime())) {
      throw new BusinessRuleError('INVALID_DATE', 'Transaction date must be a valid date');
    }

    return withRlsTransaction('finance.createEntry', async (tx) => {
      const [clubRow] = await tx
        .select({id: clubs.id, name: clubs.name})
        .from(clubs)
        .where(eq(clubs.id, input.clubId))
        .limit(1);
      if (!clubRow) throw new NotFoundError('Club not found');

      let eventTitle: string | null = null;
      const validEventId = input.eventId && isUuid(input.eventId) ? input.eventId : null;
      if (validEventId) {
        const [evRow] = await tx
          .select({id: events.id, clubId: events.clubId, title: events.title})
          .from(events)
          .where(eq(events.id, validEventId))
          .limit(1);
        if (!evRow) throw new NotFoundError('Linked event not found');
        if (evRow.clubId !== clubRow.id) {
          throw new BusinessRuleError(
            'CROSS_CLUB_EVENT_LINK',
            'Linked event does not belong to the selected club',
          );
        }
        eventTitle = evRow.title;
      }

      const [inserted] = await tx
        .insert(financeEntries)
        .values({
          clubId: clubRow.id,
          eventId: validEventId,
          entryType: input.entryType,
          sourceOrCategory: input.sourceOrCategory.trim(),
          description: input.description.trim(),
          amountMinorUnits: Math.max(0, Math.trunc(input.amountMinorUnits)),
          transactionDate: txDate,
          vendorOrRecipient: input.vendorOrRecipient.trim(),
          receiptUrl: input.receiptUrl?.trim() || '',
          notes: input.notes?.trim() || '',
          createdBy: isUuid(input.createdBy) ? input.createdBy : null,
          createdByName: input.createdByName,
        })
        .returning();

      return mapFinanceEntryRow(inserted, {
        clubName: clubRow.name,
        eventTitle,
      });
    });
  }

  async deleteFinanceEntry(clubId: string, entryId: string): Promise<boolean> {
    if (!isUuid(clubId) || !isUuid(entryId)) return false;
    return withRlsTransaction('finance.deleteEntry', async (tx) => {
      const deleted = await tx
        .delete(financeEntries)
        .where(and(eq(financeEntries.id, entryId), eq(financeEntries.clubId, clubId)))
        .returning({id: financeEntries.id});
      return deleted.length > 0;
    });
  }

  async getFinanceSummary(filters?: {
    clubId?: string;
    eventId?: string;
  }): Promise<FinanceSummaryResponse> {
    return withRlsTransaction('finance.summary', async (tx) => {
      const conditions: SQL[] = [];
      if (filters?.clubId && isUuid(filters.clubId)) {
        conditions.push(eq(financeEntries.clubId, filters.clubId));
      }
      if (filters?.eventId && isUuid(filters.eventId)) {
        conditions.push(eq(financeEntries.eventId, filters.eventId));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const rows = await tx
        .select({
          entry: financeEntries,
          clubName: clubs.name,
          eventTitle: events.title,
        })
        .from(financeEntries)
        .innerJoin(clubs, eq(financeEntries.clubId, clubs.id))
        .leftJoin(events, eq(financeEntries.eventId, events.id))
        .where(whereClause)
        .orderBy(desc(financeEntries.transactionDate), desc(financeEntries.createdAt));

      const entries = rows.map((r) =>
        mapFinanceEntryRow(r.entry, {clubName: r.clubName, eventTitle: r.eventTitle}),
      );

      let totalIncomeMinorUnits = 0;
      let totalExpensesMinorUnits = 0;
      const byClubMap = new Map<string, FinanceClubSummary>();
      const byEventMap = new Map<string, FinanceEventSummary>();

      for (const e of entries) {
        if (e.entryType === 'income') totalIncomeMinorUnits += e.amountMinorUnits;
        else totalExpensesMinorUnits += e.amountMinorUnits;

        const clubAgg = byClubMap.get(e.clubId) || {
          clubId: e.clubId,
          clubName: e.clubName || 'Club',
          totalIncomeMinorUnits: 0,
          totalExpensesMinorUnits: 0,
          netBalanceMinorUnits: 0,
          totalIncome: 0,
          totalExpenses: 0,
          netBalance: 0,
          entryCount: 0,
        };
        if (e.entryType === 'income') clubAgg.totalIncomeMinorUnits += e.amountMinorUnits;
        else clubAgg.totalExpensesMinorUnits += e.amountMinorUnits;
        clubAgg.netBalanceMinorUnits =
          clubAgg.totalIncomeMinorUnits - clubAgg.totalExpensesMinorUnits;
        clubAgg.totalIncome = fromCentsToNumber(clubAgg.totalIncomeMinorUnits);
        clubAgg.totalExpenses = fromCentsToNumber(clubAgg.totalExpensesMinorUnits);
        clubAgg.netBalance = fromCentsToNumber(clubAgg.netBalanceMinorUnits);
        clubAgg.entryCount += 1;
        byClubMap.set(e.clubId, clubAgg);

        if (e.eventId) {
          const evAgg = byEventMap.get(e.eventId) || {
            eventId: e.eventId,
            eventTitle: e.eventTitle || 'Event',
            clubId: e.clubId,
            clubName: e.clubName || 'Club',
            totalIncomeMinorUnits: 0,
            totalExpensesMinorUnits: 0,
            netBalanceMinorUnits: 0,
            totalIncome: 0,
            totalExpenses: 0,
            netBalance: 0,
            entryCount: 0,
          };
          if (e.entryType === 'income') evAgg.totalIncomeMinorUnits += e.amountMinorUnits;
          else evAgg.totalExpensesMinorUnits += e.amountMinorUnits;
          evAgg.netBalanceMinorUnits =
            evAgg.totalIncomeMinorUnits - evAgg.totalExpensesMinorUnits;
          evAgg.totalIncome = fromCentsToNumber(evAgg.totalIncomeMinorUnits);
          evAgg.totalExpenses = fromCentsToNumber(evAgg.totalExpensesMinorUnits);
          evAgg.netBalance = fromCentsToNumber(evAgg.netBalanceMinorUnits);
          evAgg.entryCount += 1;
          byEventMap.set(e.eventId, evAgg);
        }
      }

      const netBalanceMinorUnits = totalIncomeMinorUnits - totalExpensesMinorUnits;
      return {
        entries,
        totalIncomeMinorUnits,
        totalExpensesMinorUnits,
        netBalanceMinorUnits,
        totalIncome: fromCentsToNumber(totalIncomeMinorUnits),
        totalExpenses: fromCentsToNumber(totalExpensesMinorUnits),
        netBalance: fromCentsToNumber(netBalanceMinorUnits),
        byClub: [...byClubMap.values()].sort((a, b) => a.clubName.localeCompare(b.clubName)),
        byEvent: [...byEventMap.values()].sort((a, b) => a.eventTitle.localeCompare(b.eventTitle)),
      };
    });
  }

  async listNotificationsForUser(userId: string): Promise<NotificationItem[]> {
    if (!isUuid(userId)) return [];
    return withRlsTransaction('notifications.forUser', async (tx) => {
      const rows = await tx
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt));
      return rows.map(mapNotificationRow);
    });
  }

  async markNotificationRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationItem | null> {
    if (!isUuid(userId) || !isUuid(notificationId)) return null;
    return withRlsTransaction('notifications.markRead', async (tx) => {
      const [updated] = await tx
        .update(notifications)
        .set({isRead: true})
        .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
        .returning();
      return updated ? mapNotificationRow(updated) : null;
    });
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    if (!isUuid(userId)) return;
    await withRlsTransaction('notifications.markAllRead', async (tx) => {
      await tx
        .update(notifications)
        .set({isRead: true})
        .where(eq(notifications.userId, userId));
    });
  }

  async createNotification(
    input: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>,
  ): Promise<NotificationItem> {
    if (!isUuid(input.userId)) throw new NotFoundError('Notification recipient not found');
    return withRlsTransaction('notifications.create', async (tx) => {
      const [inserted] = await tx
        .insert(notifications)
        .values({
          userId: input.userId,
          type: input.category,
          title: input.title,
          message: input.message,
          link: input.link ?? null,
          isRead: false,
        })
        .returning();
      return mapNotificationRow(inserted);
    });
  }

  async getAdminDashboardStats(): Promise<AdminDashboardStats> {
    return withRlsTransaction('admin.dashboardStats', async (tx) => {
      const [userStats] = await tx
        .select({
          totalStudents: sql<number>`count(*) FILTER (WHERE ${users.globalRole} <> 'super_admin')::int`,
        })
        .from(users);

      const [clubStats] = await tx
        .select({
          totalClubs: sql<number>`count(*)::int`,
          activeClubs: sql<number>`count(*) FILTER (WHERE ${clubs.status} = 'active')::int`,
        })
        .from(clubs);

      const [eventStats] = await tx
        .select({
          totalEvents: sql<number>`count(*)::int`,
          upcomingEvents: sql<number>`count(*) FILTER (WHERE ${events.status} IN ('published', 'registration_open'))::int`,
          completedEvents: sql<number>`count(*) FILTER (WHERE ${events.status} = 'completed')::int`,
        })
        .from(events);

      const [regStats] = await tx
        .select({totalRegistrations: sql<number>`count(*)::int`})
        .from(registrations);

      const [attStats] = await tx
        .select({totalAttendance: sql<number>`count(*)::int`})
        .from(attendanceRecords);

      const [reportStats] = await tx
        .select({
          awaitingApprovalReportsCount: sql<number>`count(*) FILTER (WHERE ${eventReports.status} IN ('submitted', 'under_review'))::int`,
          submittedEventCount: sql<number>`count(*) FILTER (WHERE ${eventReports.status} <> 'draft')::int`,
        })
        .from(eventReports);

      const pendingReportsCount = Math.max(
        0,
        (eventStats?.completedEvents ?? 0) - (reportStats?.submittedEventCount ?? 0),
      );

      const [reportFinanceRows, ledgerEntryRows] = await Promise.all([
        tx
          .select({
            totalCollections: financeReports.totalCollections,
            totalExpenses: financeReports.totalExpenses,
            totalCollectionsMinorUnits: financeReports.totalCollectionsMinorUnits,
            totalExpensesMinorUnits: financeReports.totalExpensesMinorUnits,
          })
          .from(financeReports),
        tx
          .select({
            entryType: financeEntries.entryType,
            amountMinorUnits: financeEntries.amountMinorUnits,
          })
          .from(financeEntries),
      ]);

      const reportCollectionsMinor = reportFinanceRows.reduce(
        (sum, r) => sum + (r.totalCollectionsMinorUnits || toCents(r.totalCollections)),
        0,
      );
      const reportExpensesMinor = reportFinanceRows.reduce(
        (sum, r) => sum + (r.totalExpensesMinorUnits || toCents(r.totalExpenses)),
        0,
      );
      const ledgerIncomeMinor = ledgerEntryRows
        .filter((e) => e.entryType === 'income')
        .reduce((sum, e) => sum + Number(e.amountMinorUnits || 0), 0);
      const ledgerExpensesMinor = ledgerEntryRows
        .filter((e) => e.entryType === 'expense')
        .reduce((sum, e) => sum + Number(e.amountMinorUnits || 0), 0);

      const collectionsCents = reportCollectionsMinor + ledgerIncomeMinor;
      const expensesCents = reportExpensesMinor + ledgerExpensesMinor;

      const recentLogs = await tx
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(8);

      return {
        totalStudents: userStats?.totalStudents ?? 0,
        totalClubs: clubStats?.totalClubs ?? 0,
        activeClubs: clubStats?.activeClubs ?? 0,
        totalEvents: eventStats?.totalEvents ?? 0,
        upcomingEvents: eventStats?.upcomingEvents ?? 0,
        completedEvents: eventStats?.completedEvents ?? 0,
        totalRegistrations: regStats?.totalRegistrations ?? 0,
        totalAttendance: attStats?.totalAttendance ?? 0,
        pendingReportsCount,
        awaitingApprovalReportsCount: reportStats?.awaitingApprovalReportsCount ?? 0,
        totalCollections: fromCentsToNumber(collectionsCents),
        totalExpenses: fromCentsToNumber(expensesCents),
        netBalance: fromCentsToNumber(collectionsCents - expensesCents),
        recentAuditLogs: recentLogs.map(mapAuditLogRow),
      };
    });
  }

  async getAdminAnalytics(): Promise<AdminAnalyticsResponse> {
    return withRlsTransaction('admin.analytics', async (tx) => {
      const [
        clubRows,
        membershipRows,
        eventRows,
        regRows,
        ticketRows,
        reportRows,
        finReportRows,
        finEntryRows,
      ] = await Promise.all([
        tx.select().from(clubs).orderBy(asc(clubs.name)),
        tx
          .select({
            clubId: clubMemberships.clubId,
            role: clubMemberships.membershipRole,
            status: clubMemberships.status,
            name: users.displayName,
            email: users.email,
          })
          .from(clubMemberships)
          .innerJoin(users, eq(clubMemberships.userId, users.id))
          .where(eq(clubMemberships.status, 'active')),
        tx
          .select({event: events, clubName: clubs.name})
          .from(events)
          .innerJoin(clubs, eq(events.clubId, clubs.id))
          .orderBy(desc(events.startsAt)),
        tx
          .select({eventId: registrations.eventId, status: registrations.status})
          .from(registrations),
        tx.select({eventId: tickets.eventId, status: tickets.status}).from(tickets),
        tx.select({eventId: eventReports.eventId, status: eventReports.status}).from(eventReports),
        tx
          .select({
            eventId: financeReports.eventId,
            collectionsMinor: financeReports.totalCollectionsMinorUnits,
            expensesMinor: financeReports.totalExpensesMinorUnits,
            collections: financeReports.totalCollections,
            expenses: financeReports.totalExpenses,
          })
          .from(financeReports),
        tx
          .select({
            eventId: financeEntries.eventId,
            entryType: financeEntries.entryType,
            amountMinorUnits: financeEntries.amountMinorUnits,
          })
          .from(financeEntries),
      ]);

      const clubOverviews: ClubOverviewItem[] = clubRows.map((c) => {
        const members = membershipRows.filter((m) => m.clubId === c.id);
        const president = members.find((m) => m.role === 'president');
        const vp = members.find((m) => m.role === 'vice_president');
        const coreCount = members.filter((m) => m.role === 'core_member').length;
        const clubEvents = eventRows.filter((e) => e.event.clubId === c.id);
        const upcomingCount = clubEvents.filter((e) =>
          ['published', 'registration_open'].includes(e.event.status),
        ).length;
        const completedCount = clubEvents.filter((e) => e.event.status === 'completed').length;

        return {
          club: {
            id: c.id,
            name: c.name,
            slug: c.slug,
            category: c.category as ClubOverviewItem['club']['category'],
            tagline: c.tagline,
            description: c.description,
            logoUrl: c.logoUrl,
            status: c.status as ClubOverviewItem['club']['status'],
            followerCount: c.followerCount,
            memberCount: members.length,
            upcomingEventsCount: upcomingCount,
            foundedYear: c.foundedYear,
            meetingSchedule: c.meetingSchedule,
            contactEmail: c.contactEmail,
            instagramUrl: c.instagramUrl || '',
            createdAt: c.createdAt.toISOString(),
          },
          presidentName: president?.name ?? null,
          presidentEmail: president?.email ?? null,
          vicePresidentName: vp?.name ?? null,
          vicePresidentEmail: vp?.email ?? null,
          activeCoreCount: coreCount,
          totalMembersCount: members.length,
          upcomingEventsCount: upcomingCount,
          completedEventsCount: completedCount,
        };
      });

      const reportStatusByEvent = new Map(
        reportRows.map((r) => [r.eventId, r.status as EventReportStatus]),
      );

      const eventAnalytics: EventAnalyticsItem[] = eventRows.map(({event: ev, clubName}) => {
        const evRegs = regRows.filter((r) => r.eventId === ev.id);
        const confirmedCount = evRegs.filter(
          (r) => r.status === 'confirmed' || r.status === 'attended',
        ).length;
        const attendedCount = evRegs.filter((r) => r.status === 'attended').length;
        const waitlistedCount = evRegs.filter((r) => r.status === 'waitlisted').length;
        const evTickets = ticketRows.filter((t) => t.eventId === ev.id);
        const ticketsReleasedCount = evTickets.filter((t) => t.status === 'released').length;
        const ticketsNotReleasedCount = Math.max(0, confirmedCount - ticketsReleasedCount);

        let incomeMinor = 0;
        let expensesMinor = 0;
        for (const fr of finReportRows.filter((f) => f.eventId === ev.id)) {
          incomeMinor += fr.collectionsMinor || toCents(fr.collections);
          expensesMinor += fr.expensesMinor || toCents(fr.expenses);
        }
        for (const fe of finEntryRows.filter((f) => f.eventId === ev.id)) {
          if (fe.entryType === 'income') incomeMinor += Number(fe.amountMinorUnits || 0);
          else expensesMinor += Number(fe.amountMinorUnits || 0);
        }

        return {
          eventId: ev.id,
          title: ev.title,
          clubId: ev.clubId,
          clubName,
          status: ev.status as EventAnalyticsItem['status'],
          startTime: ev.startsAt.toISOString(),
          venue: ev.venue,
          capacity: ev.capacity,
          confirmedCount,
          waitlistedCount,
          ticketsReleasedCount,
          ticketsNotReleasedCount,
          attendedCount,
          attendancePercentage:
            confirmedCount > 0 ? Math.round((attendedCount / confirmedCount) * 100) : 0,
          reportStatus: reportStatusByEvent.get(ev.id) ?? 'not_submitted',
          totalIncome: fromCentsToNumber(incomeMinor),
          totalExpenses: fromCentsToNumber(expensesMinor),
          netBalance: fromCentsToNumber(incomeMinor - expensesMinor),
        };
      });

      return {clubs: clubOverviews, events: eventAnalytics};
    });
  }

  async listAuditLogs(): Promise<AuditLogEntry[]> {
    return withRlsTransaction('audit.list', async (tx) => {
      const rows = await tx.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200);
      return rows.map(mapAuditLogRow);
    });
  }

  async appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<AuditLogEntry> {
    return withRlsTransaction('audit.append', async (tx) => {
      const [inserted] = await tx
        .insert(auditLogs)
        .values({
          actorUserId: isUuid(entry.actorId) ? entry.actorId : null,
          actorName: entry.actorName,
          actorContext: entry.actorContext,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          targetLabel: entry.targetLabel,
          metadata: {details: entry.details},
        })
        .returning();
      return mapAuditLogRow(inserted);
    });
  }

  async getSystemSettings(): Promise<SystemSettings> {
    return withRlsTransaction('settings.get', async (tx) => {
      const [row] = await tx
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, 'campusverse_config'))
        .limit(1);

      const val = (row?.value || {}) as Record<string, unknown>;
      return {
        maxClubsPerStudent:
          typeof val.maxClubsPerStudent === 'number' ? val.maxClubsPerStudent : MAX_FOLLOWED_CLUBS,
        requireClubApproval:
          typeof val.requireClubApproval === 'boolean' ? val.requireClubApproval : true,
        allowStudentEventFeedback:
          typeof val.allowStudentEventFeedback === 'boolean'
            ? val.allowStudentEventFeedback
            : true,
        phaseLabel:
          typeof val.phaseLabel === 'string' &&
          !val.phaseLabel.startsWith('Phase 2') &&
          !val.phaseLabel.startsWith('Phase 3') &&
          !val.phaseLabel.startsWith('Phase 4')
            ? val.phaseLabel
            : 'Phase 5 — Tickets, Camera QR Check-in, Reports, Finance & Institutional Oversight',
        persistenceMode: 'postgres',
      };
    });
  }

  async updateSystemSettings(updates: Partial<SystemSettings>): Promise<SystemSettings> {
    const current = await this.getSystemSettings();
    const next: SystemSettings = {
      ...current,
      requireClubApproval:
        typeof updates.requireClubApproval === 'boolean'
          ? updates.requireClubApproval
          : current.requireClubApproval,
      allowStudentEventFeedback:
        typeof updates.allowStudentEventFeedback === 'boolean'
          ? updates.allowStudentEventFeedback
          : current.allowStudentEventFeedback,
      persistenceMode: 'postgres',
    };

    await withRlsTransaction('settings.update', async (tx) => {
      await tx
        .insert(systemSettings)
        .values({
          key: 'campusverse_config',
          value: next as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: {
            value: next as unknown as Record<string, unknown>,
            updatedAt: new Date(),
          },
        });
    });

    return next;
  }
}
