import {and, asc, desc, eq, ilike, inArray, or, sql, type SQL} from 'drizzle-orm';
import type {
  EventFormVersion,
  EventItem,
  EventStatus,
  FormField,
  PaginatedResult,
  RegistrationForm,
} from '../../../shared/types/domain.ts';
import {publicReadCache} from '../../shared/cache/publicReadCache.ts';
import {
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/AppError.ts';
import {withRlsTransaction, type DbTx} from '../index.ts';
import {dbRequestContext} from '../requestContext.ts';
import {
  attendanceRecords,
  clubs,
  eventForms,
  eventFormVersions,
  events,
  formFields,
  registrations,
} from '../schema.ts';
import {
  fromCentsToFixed,
  isUuid,
  mapEventRow,
  mapFormRow,
  mapFormVersionRow,
  slugify,
  toCents,
} from './mappers.ts';

const PUBLIC_EVENT_STATUSES: EventStatus[] = [
  'published',
  'registration_open',
  'registration_closed',
  'completed',
];

const UPCOMING_EVENT_STATUSES: EventStatus[] = ['published', 'registration_open'];

const ALLOWED_LIFECYCLE_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  draft: ['published', 'registration_open', 'cancelled'],
  published: ['draft', 'registration_open', 'registration_closed', 'completed', 'cancelled'],
  registration_open: ['published', 'registration_closed', 'completed', 'cancelled'],
  registration_closed: ['registration_open', 'published', 'completed', 'cancelled'],
  completed: ['completed'],
  cancelled: ['cancelled'],
};

export class EventsRepository {
  private async findEventRow(
    tx: DbTx,
    eventIdOrSlug: string,
  ): Promise<{event: typeof events.$inferSelect; clubName: string; clubStatus: string} | null> {
    const condition = isUuid(eventIdOrSlug)
      ? eq(events.id, eventIdOrSlug)
      : eq(events.slug, eventIdOrSlug);

    const rows = await tx
      .select({
        event: events,
        clubName: clubs.name,
        clubStatus: clubs.status,
      })
      .from(events)
      .innerJoin(clubs, eq(events.clubId, clubs.id))
      .where(condition)
      .limit(1);

    return rows[0] || null;
  }

  private async ensurePublishedSnapshotTx(
    tx: DbTx,
    eventRow: typeof events.$inferSelect,
    publishedBy?: string | null,
  ): Promise<EventFormVersion> {
    let [formRow] = await tx
      .select()
      .from(eventForms)
      .where(eq(eventForms.eventId, eventRow.id))
      .limit(1);

    if (!formRow) {
      const [insertedForm] = await tx
        .insert(eventForms)
        .values({
          eventId: eventRow.id,
          version: 1,
          publishedVersion: 0,
          status: 'draft',
          title: `${eventRow.title} Registration`,
          description: '',
          updatedBy: isUuid(publishedBy) ? publishedBy : null,
        })
        .returning();
      formRow = insertedForm;
      await tx.insert(formFields).values([
        {
          formId: formRow.id,
          fieldKey: 'fld-track',
          label: 'Participation Role',
          fieldType: 'select',
          required: true,
          options: ['Participant', 'Observer'],
          sortOrder: 0,
        },
        {
          formId: formRow.id,
          fieldKey: 'fld-code-conduct',
          label: 'I agree to follow the CampusVerse Event Code of Conduct',
          fieldType: 'checkbox',
          required: true,
          options: [],
          sortOrder: 1,
        },
      ]);
    }

    const fieldRows = await tx
      .select()
      .from(formFields)
      .where(eq(formFields.formId, formRow.id))
      .orderBy(asc(formFields.sortOrder));

    const mappedForm = mapFormRow(formRow, fieldRows);
    const nextPublishedVersion = Math.max(formRow.publishedVersion + 1, 1);

    const [snapshotRow] = await tx
      .insert(eventFormVersions)
      .values({
        formId: formRow.id,
        eventId: eventRow.id,
        version: nextPublishedVersion,
        title: formRow.title,
        description: formRow.description || '',
        schemaSnapshot: mappedForm.fields,
        publishedBy: isUuid(publishedBy) ? publishedBy : null,
      })
      .returning();

    await tx
      .update(eventForms)
      .set({
        version: Math.max(formRow.version, nextPublishedVersion),
        publishedVersion: nextPublishedVersion,
        status: 'published',
        updatedBy: isUuid(publishedBy) ? publishedBy : formRow.updatedBy,
        updatedAt: new Date(),
      })
      .where(eq(eventForms.id, formRow.id));

    return mapFormVersionRow(snapshotRow);
  }

  private buildEventConditions(filters?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
  }): SQL[] {
    const conditions: SQL[] = [];
    if (filters?.clubId && isUuid(filters.clubId)) {
      conditions.push(eq(events.clubId, filters.clubId));
    }
    if (filters?.category && filters.category !== 'All') {
      conditions.push(eq(events.category, filters.category));
    }
    if (filters?.status && filters.status !== 'All') {
      conditions.push(eq(events.status, filters.status));
    }
    if (filters?.upcomingOnly) {
      conditions.push(inArray(events.status, UPCOMING_EVENT_STATUSES));
    }
    if (filters?.search?.trim()) {
      const pattern = `%${filters.search.trim()}%`;
      const searchCond = or(
        ilike(events.title, pattern),
        ilike(events.venue, pattern),
        ilike(clubs.name, pattern),
      );
      if (searchCond) conditions.push(searchCond);
    }
    return conditions;
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
    const page = Math.max(1, filters?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 24));
    const ctx = dbRequestContext.get();

    const canCache =
      ctx.globalRole === 'public' &&
      (!filters?.status ||
        filters.status === 'All' ||
        PUBLIC_EVENT_STATUSES.includes(filters.status as EventStatus));

    const cacheKey = `events:list:${JSON.stringify({
      s: filters?.search?.trim().toLowerCase() || '',
      c: filters?.category || 'All',
      club: filters?.clubId || '',
      st: filters?.status || 'All',
      up: Boolean(filters?.upcomingOnly),
      p: page,
      ps: pageSize,
    })}`;

    const loader = () =>
      withRlsTransaction('events.listPaginated', async (tx) => {
        const conditions = this.buildEventConditions(filters);
        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const [countRows, rows] = await Promise.all([
          tx
            .select({count: sql<number>`count(*)::int`})
            .from(events)
            .innerJoin(clubs, eq(events.clubId, clubs.id))
            .where(whereClause),
          tx
            .select({
              event: events,
              clubName: clubs.name,
            })
            .from(events)
            .innerJoin(clubs, eq(events.clubId, clubs.id))
            .where(whereClause)
            .orderBy(asc(events.startsAt))
            .limit(pageSize)
            .offset((page - 1) * pageSize),
        ]);

        const total = countRows[0]?.count ?? 0;
        const eventIds = rows.map((r) => r.event.id);
        let attendedMap = new Map<string, number>();
        let waitlistMap = new Map<string, number>();

        if (eventIds.length > 0) {
          const [attRows, wlRows] = await Promise.all([
            tx
              .select({
                eventId: attendanceRecords.eventId,
                count: sql<number>`count(*)::int`,
              })
              .from(attendanceRecords)
              .where(inArray(attendanceRecords.eventId, eventIds))
              .groupBy(attendanceRecords.eventId),
            tx
              .select({
                eventId: registrations.eventId,
                count: sql<number>`count(*)::int`,
              })
              .from(registrations)
              .where(
                and(
                  inArray(registrations.eventId, eventIds),
                  eq(registrations.status, 'waitlisted'),
                ),
              )
              .groupBy(registrations.eventId),
          ]);
          attendedMap = new Map(attRows.map((a) => [a.eventId, a.count]));
          waitlistMap = new Map(wlRows.map((w) => [w.eventId, w.count]));
        }

        const items = rows.map((r) =>
          mapEventRow(r.event, {
            clubName: r.clubName,
            attendedCount: attendedMap.get(r.event.id) ?? 0,
            waitlistedCount: waitlistMap.get(r.event.id) ?? 0,
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

    return canCache ? publicReadCache.getOrLoad(cacheKey, loader) : loader();
  }

  async listEvents(filters?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<EventItem[]> {
    const result = await this.listEventsPaginated({
      ...filters,
      page: filters?.page ?? 1,
      pageSize: filters?.pageSize ?? 100,
    });
    return result.items;
  }

  async getEventById(eventIdOrSlug: string): Promise<EventItem | null> {
    const ctx = dbRequestContext.get();
    const loader = () =>
      withRlsTransaction('events.getById', async (tx) => {
        const found = await this.findEventRow(tx, eventIdOrSlug);
        if (!found) return null;

        const [attCount, wlCount] = await Promise.all([
          tx
            .select({count: sql<number>`count(*)::int`})
            .from(attendanceRecords)
            .where(eq(attendanceRecords.eventId, found.event.id)),
          tx
            .select({count: sql<number>`count(*)::int`})
            .from(registrations)
            .where(
              and(
                eq(registrations.eventId, found.event.id),
                eq(registrations.status, 'waitlisted'),
              ),
            ),
        ]);

        return mapEventRow(found.event, {
          clubName: found.clubName,
          attendedCount: attCount[0]?.count ?? 0,
          waitlistedCount: wlCount[0]?.count ?? 0,
        });
      });

    if (ctx.globalRole === 'public') {
      return publicReadCache.getOrLoad(`event:${eventIdOrSlug}`, loader);
    }
    return loader();
  }

  async createEvent(
    clubId: string,
    input: Omit<
      EventItem,
      | 'id'
      | 'clubId'
      | 'clubName'
      | 'registeredCount'
      | 'attendedCount'
      | 'status'
      | 'bannerUrl'
      | 'createdAt'
      | 'updatedAt'
    >,
  ): Promise<EventItem> {
    if (!isUuid(clubId)) throw new NotFoundError('Club not found');
    const startsAt = new Date(input.startTime);
    const endsAt = new Date(input.endTime);
    const deadline = new Date(input.registrationDeadline);
    const opensAt = input.registrationOpensAt ? new Date(input.registrationOpensAt) : null;

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new ValidationError('Invalid start or end timestamp');
    }
    if (endsAt <= startsAt) {
      throw new ValidationError('Event end time must be after start time');
    }
    if (opensAt && Number.isNaN(opensAt.getTime())) {
      throw new ValidationError('Invalid registration opens timestamp');
    }
    if (opensAt && !Number.isNaN(deadline.getTime()) && opensAt >= deadline) {
      throw new ValidationError('Registration opening time must be before the deadline');
    }

    const created = await withRlsTransaction('events.create', async (tx) => {
      const [clubRow] = await tx.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
      if (!clubRow) throw new NotFoundError('Club not found');

      const baseSlug = slugify(input.title) || 'campus-event';
      const uniqueSlug = `${baseSlug}-${Date.now().toString().slice(-5)}`;
      const feeCents = input.isPaid ? toCents(input.feeAmount) : 0;
      const feeFixed = fromCentsToFixed(feeCents);

      const [inserted] = await tx
        .insert(events)
        .values({
          clubId: clubRow.id,
          title: input.title.trim(),
          slug: uniqueSlug,
          category: input.category,
          description: input.description.trim(),
          venue: input.venue.trim(),
          startsAt,
          endsAt,
          registrationOpensAt: opensAt,
          registrationDeadline: Number.isNaN(deadline.getTime()) ? startsAt : deadline,
          capacity: input.capacity,
          registeredCount: 0,
          isPaid: input.isPaid,
          feeAmount: feeFixed,
          feeMinorUnits: feeCents,
          eligibilityRules: input.eligibilityRules || {},
          bannerUrl:
            clubRow.logoUrl || '/src/assets/images/event_hackathon_banner_1795447592033.jpg',
          status: 'draft',
        })
        .returning();

      const [formRow] = await tx
        .insert(eventForms)
        .values({
          eventId: inserted.id,
          version: 1,
          publishedVersion: 0,
          status: 'draft',
          title: `${inserted.title} Registration`,
          description: '',
        })
        .returning();

      await tx.insert(formFields).values([
        {
          formId: formRow.id,
          fieldKey: 'fld-track',
          label: 'Participation Role',
          fieldType: 'select',
          required: true,
          options: ['Participant', 'Observer'],
          sortOrder: 0,
        },
        {
          formId: formRow.id,
          fieldKey: 'fld-code-conduct',
          label: 'I agree to follow the CampusVerse Event Code of Conduct',
          fieldType: 'checkbox',
          required: true,
          options: [],
          sortOrder: 1,
        },
      ]);

      return mapEventRow(inserted, {
        clubName: clubRow.name,
        attendedCount: 0,
        waitlistedCount: 0,
      });
    });

    publicReadCache.invalidateEvents();
    publicReadCache.invalidateClubs();
    return created;
  }

  async updateEvent(eventId: string, updates: Partial<EventItem>): Promise<EventItem | null> {
    if (!isUuid(eventId)) return null;
    const updated = await withRlsTransaction('events.update', async (tx) => {
      const [existing] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
      if (!existing) return null;

      const setData: Partial<typeof events.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (updates.title !== undefined) setData.title = updates.title.trim();
      if (updates.category !== undefined) setData.category = updates.category;
      if (updates.description !== undefined) setData.description = updates.description.trim();
      if (updates.venue !== undefined) setData.venue = updates.venue.trim();
      if (updates.startTime !== undefined) setData.startsAt = new Date(updates.startTime);
      if (updates.endTime !== undefined) setData.endsAt = new Date(updates.endTime);
      if (updates.registrationOpensAt !== undefined) {
        setData.registrationOpensAt = updates.registrationOpensAt
          ? new Date(updates.registrationOpensAt)
          : null;
      }
      if (updates.registrationDeadline !== undefined) {
        setData.registrationDeadline = new Date(updates.registrationDeadline);
      }
      if (updates.capacity !== undefined) {
        if (updates.capacity < existing.registeredCount) {
          throw new BusinessRuleError(
            'CAPACITY_BELOW_REGISTERED',
            `Capacity cannot be lowered below currently confirmed/attended seats (${existing.registeredCount})`,
          );
        }
        setData.capacity = updates.capacity;
      }
      if (updates.isPaid !== undefined) setData.isPaid = updates.isPaid;
      if (updates.feeAmount !== undefined) {
        const feeCents = updates.isPaid === false ? 0 : toCents(updates.feeAmount);
        setData.feeAmount = fromCentsToFixed(feeCents);
        setData.feeMinorUnits = feeCents;
      }
      if (updates.eligibilityRules !== undefined) {
        setData.eligibilityRules = updates.eligibilityRules || {};
      }
      if (updates.status !== undefined) setData.status = updates.status;

      const nextStart = setData.startsAt ?? existing.startsAt;
      const nextEnd = setData.endsAt ?? existing.endsAt;
      if (nextEnd <= nextStart) {
        throw new ValidationError('Event end time must be after start time');
      }

      const [saved] = await tx
        .update(events)
        .set(setData)
        .where(eq(events.id, eventId))
        .returning();
      if (!saved) return null;

      const [clubRow] = await tx
        .select({name: clubs.name})
        .from(clubs)
        .where(eq(clubs.id, saved.clubId))
        .limit(1);

      return mapEventRow(saved, {clubName: clubRow?.name || ''});
    });

    if (updated) {
      publicReadCache.invalidateEvents();
      publicReadCache.invalidateClubs();
    }
    return updated;
  }

  async updateEventLifecycle(
    eventId: string,
    targetStatus: EventStatus,
  ): Promise<EventItem | null> {
    if (!isUuid(eventId)) return null;
    const updated = await withRlsTransaction('events.lifecycle', async (tx) => {
      const [existing] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
      if (!existing) return null;

      const currentStatus = existing.status as EventStatus;
      const allowedNext = ALLOWED_LIFECYCLE_TRANSITIONS[currentStatus] || [];
      if (currentStatus !== targetStatus && !allowedNext.includes(targetStatus)) {
        throw new BusinessRuleError(
          'INVALID_EVENT_TRANSITION',
          `Cannot transition event from ${currentStatus.replace('_', ' ')} to ${targetStatus.replace('_', ' ')}`,
          {currentStatus, targetStatus},
        );
      }

      const [clubRow] = await tx
        .select({id: clubs.id, name: clubs.name, status: clubs.status})
        .from(clubs)
        .where(eq(clubs.id, existing.clubId))
        .limit(1);
      if (!clubRow) throw new NotFoundError('Club not found');

      if (
        (targetStatus === 'published' || targetStatus === 'registration_open') &&
        clubRow.status !== 'active'
      ) {
        throw new BusinessRuleError(
          'CLUB_NOT_ACTIVE',
          `Events for ${clubRow.name} cannot be published while club status is ${clubRow.status.replace('_', ' ')}`,
        );
      }

      const [saved] = await tx
        .update(events)
        .set({
          status: targetStatus,
          publishedAt:
            (targetStatus === 'published' || targetStatus === 'registration_open') &&
            !existing.publishedAt
              ? new Date()
              : existing.publishedAt,
          updatedAt: new Date(),
        })
        .where(eq(events.id, eventId))
        .returning();

      return mapEventRow(saved, {clubName: clubRow.name});
    });

    if (updated) {
      publicReadCache.invalidateEvents();
      publicReadCache.invalidateClubs();
    }
    return updated;
  }

  async publishEvent(eventId: string): Promise<EventItem | null> {
    return this.updateEventLifecycle(eventId, 'published');
  }

  async getRegistrationForm(eventId: string): Promise<RegistrationForm> {
    if (!isUuid(eventId)) throw new NotFoundError('Event not found');
    const ctx = dbRequestContext.get();

    const loader = () =>
      withRlsTransaction('forms.get', async (tx) => {
        const [ev] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
        if (!ev) throw new NotFoundError('Event not found');

        const [formRow] = await tx
          .select()
          .from(eventForms)
          .where(eq(eventForms.eventId, eventId))
          .limit(1);

        if (!formRow) {
          return {
            id: `default-${eventId}`,
            eventId,
            version: 1,
            status: 'draft' as const,
            publishedVersion: 0,
            title: `${ev.title} Registration`,
            description: '',
            fields: [
              {
                id: 'fld-notes',
                label: 'Registration Notes',
                type: 'text' as const,
                required: false,
                placeholder: 'Any dietary or accessibility needs',
              },
            ],
            updatedAt: new Date().toISOString(),
          };
        }

        const fields = await tx
          .select()
          .from(formFields)
          .where(eq(formFields.formId, formRow.id))
          .orderBy(asc(formFields.sortOrder));

        return mapFormRow(formRow, fields);
      });

    if (ctx.globalRole === 'public') {
      return publicReadCache.getOrLoad(`form:${eventId}`, loader);
    }
    return loader();
  }

  async upsertRegistrationForm(
    eventId: string,
    fields: FormField[],
    meta?: {title?: string; description?: string; updatedBy?: string},
  ): Promise<RegistrationForm> {
    if (!isUuid(eventId)) throw new NotFoundError('Event not found');

    const savedForm = await withRlsTransaction('forms.upsert', async (tx) => {
      const [ev] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
      if (!ev) throw new NotFoundError('Event not found');

      const [existing] = await tx
        .select()
        .from(eventForms)
        .where(eq(eventForms.eventId, eventId))
        .limit(1);

      let formRow: typeof eventForms.$inferSelect;
      if (existing) {
        const [updated] = await tx
          .update(eventForms)
          .set({
            version: existing.version + 1,
            status: 'draft',
            title: meta?.title?.trim() || existing.title,
            description: meta?.description !== undefined ? meta.description.trim() : existing.description,
            updatedBy: isUuid(meta?.updatedBy) ? meta.updatedBy : existing.updatedBy,
            updatedAt: new Date(),
          })
          .where(eq(eventForms.id, existing.id))
          .returning();
        formRow = updated;
        await tx.delete(formFields).where(eq(formFields.formId, formRow.id));
      } else {
        const [inserted] = await tx
          .insert(eventForms)
          .values({
            eventId,
            version: 1,
            publishedVersion: 0,
            status: 'draft',
            title: meta?.title?.trim() || `${ev.title} Registration`,
            description: meta?.description?.trim() || '',
            updatedBy: isUuid(meta?.updatedBy) ? meta.updatedBy : null,
          })
          .returning();
        formRow = inserted;
      }

      const seenKeys = new Set<string>();
      const fieldValues = fields.map((f, index) => {
        let key = f.id.trim() || `field-${index}`;
        if (seenKeys.has(key)) key = `${key}-${index}`;
        seenKeys.add(key);
        return {
          formId: formRow.id,
          fieldKey: key,
          label: f.label.trim(),
          description: f.description?.trim() || '',
          fieldType: f.type,
          placeholder: f.placeholder ?? null,
          required: Boolean(f.required),
          options: f.options ? f.options.map((o) => o.trim()).filter(Boolean) : [],
          validationRules: f.validationRules || {},
          sortOrder: index,
        };
      });

      const insertedFields =
        fieldValues.length > 0 ? await tx.insert(formFields).values(fieldValues).returning() : [];

      return mapFormRow(formRow, insertedFields);
    });

    publicReadCache.invalidateEvents();
    return savedForm;
  }

  async publishRegistrationForm(
    eventId: string,
    publishedBy?: string,
  ): Promise<EventFormVersion> {
    if (!isUuid(eventId)) throw new NotFoundError('Event not found');
    const snapshot = await withRlsTransaction('forms.publish', async (tx) => {
      const [ev] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
      if (!ev) throw new NotFoundError('Event not found');
      return this.ensurePublishedSnapshotTx(tx, ev, publishedBy);
    });

    publicReadCache.invalidateEvents();
    return snapshot;
  }

  async getPublishedFormVersion(
    eventId: string,
    version?: number,
  ): Promise<EventFormVersion | null> {
    if (!isUuid(eventId)) return null;
    return withRlsTransaction('forms.getPublishedVersion', async (tx) => {
      if (typeof version === 'number') {
        const rows = await tx
          .select()
          .from(eventFormVersions)
          .where(
            and(
              eq(eventFormVersions.eventId, eventId),
              eq(eventFormVersions.version, version),
            ),
          )
          .limit(1);
        return rows[0] ? mapFormVersionRow(rows[0]) : null;
      }

      const rows = await tx
        .select()
        .from(eventFormVersions)
        .where(eq(eventFormVersions.eventId, eventId))
        .orderBy(desc(eventFormVersions.version))
        .limit(1);
      return rows[0] ? mapFormVersionRow(rows[0]) : null;
    });
  }
}
