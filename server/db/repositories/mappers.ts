import crypto from 'crypto';
import {
  isClubOfficerRole,
  type CoreMemberPermission,
} from '../../../shared/constants/permissions.ts';
import type {
  AuditLogEntry,
  Club,
  ClubInvitation,
  ClubMembership,
  ClubRole,
  ClubStatus,
  EventFormVersion,
  EventItem,
  EventReport,
  EventReportStatus,
  EventStatus,
  FinanceEntry,
  FinanceEntryType,
  FinancialLineItem,
  FinancialReport,
  FormField,
  FormFieldType,
  InvitationStatus,
  NotificationItem,
  Registration,
  RegistrationForm,
  RegistrationStatus,
  TicketRecord,
  TicketStatus,
  UserAccount,
} from '../../../shared/types/domain.ts';
import type {
  auditLogs,
  clubInvitations,
  clubMemberships,
  clubs,
  eventFormVersions,
  eventForms,
  eventReports,
  events,
  financeEntries,
  financeLineItems,
  financeReports,
  formFields,
  notifications,
  registrations,
  tickets,
  users,
} from '../schema.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined | null): value is string {
  return Boolean(value && UUID_REGEX.test(value.trim()));
}

export function getPgErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const errObj = error as {code?: string; cause?: {code?: string}};
  return errObj.code || errObj.cause?.code;
}

export function getPgErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error || '');
  const errObj = error as {message?: string; cause?: {message?: string}};
  return errObj.cause?.message || errObj.message || '';
}

export function isPgUniqueViolation(error: unknown): boolean {
  return getPgErrorCode(error) === '23505';
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function hashSha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toUpperCase()).digest('hex');
}

export function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CV';
  return parts
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function toCents(amount: number | string): number {
  const num = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

export function fromCentsToFixed(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function fromCentsToNumber(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

export function normalizeClubStatus(status: string): ClubStatus {
  if (status === 'pending') return 'pending_review';
  if (
    status === 'active' ||
    status === 'inactive' ||
    status === 'suspended' ||
    status === 'pending_review'
  ) {
    return status;
  }
  return 'pending_review';
}

export function mapUserRow(row: typeof users.$inferSelect): UserAccount {
  return {
    id: row.id,
    name: row.displayName,
    email: row.email,
    department: row.department,
    yearOfStudy: row.yearOfStudy,
    studentId: row.studentId || `STU-${row.id.slice(0, 8).toUpperCase()}`,
    isSuperAdmin: row.globalRole === 'super_admin',
    status: row.accountStatus === 'suspended' || row.accountStatus === 'disabled' ? 'suspended' : 'active',
    emailVerified: Boolean(row.emailVerifiedAt),
    avatarInitials: computeInitials(row.displayName),
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapClubRow(
  row: typeof clubs.$inferSelect,
  stats?: {memberCount?: number; upcomingEventsCount?: number},
): Club {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category as Club['category'],
    tagline: row.tagline,
    description: row.description,
    logoUrl: row.logoUrl,
    status: normalizeClubStatus(row.status),
    followerCount: row.followerCount,
    memberCount: stats?.memberCount ?? 0,
    upcomingEventsCount: stats?.upcomingEventsCount ?? 0,
    foundedYear: row.foundedYear,
    meetingSchedule: row.meetingSchedule,
    contactEmail: row.contactEmail,
    instagramUrl: row.instagramUrl || '',
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapMembershipRow(
  row: typeof clubMemberships.$inferSelect,
  extras?: {userName?: string; userEmail?: string; clubName?: string},
): ClubMembership {
  const perms = (row.permissions || []) as CoreMemberPermission[];
  const role = row.membershipRole as ClubRole;
  return {
    id: row.id,
    userId: row.userId,
    userName: extras?.userName,
    userEmail: extras?.userEmail,
    clubId: row.clubId,
    clubName: extras?.clubName,
    role,
    title: row.title,
    permissions: perms,
    canScanQr: isClubOfficerRole(role) || perms.includes('SCAN_ATTENDANCE'),
    assignedTasks: row.assignedTasks || [],
    joinedAt: row.createdAt.toISOString(),
  };
}

export function mapInvitationRow(
  row: typeof clubInvitations.$inferSelect,
  extras?: {clubName?: string; inviterName?: string},
): ClubInvitation {
  const effectiveStatus: InvitationStatus =
    row.status === 'pending' && row.expiresAt.getTime() <= Date.now()
      ? 'expired'
      : (row.status as InvitationStatus);

  return {
    id: row.id,
    clubId: row.clubId,
    clubName: extras?.clubName,
    inviterUserId: row.inviterUserId,
    inviterName: extras?.inviterName,
    inviteeEmail: row.inviteeEmail,
    intendedRole: row.intendedRole as ClubRole,
    title: row.title,
    permissions: (row.permissions || []) as CoreMemberPermission[],
    status: effectiveStatus,
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deliveryMode:
      row.deliveryMode === 'supabase_admin' || row.deliveryMode === 'smtp'
        ? row.deliveryMode
        : 'test_adapter',
  };
}

export function mapEventRow(
  row: typeof events.$inferSelect,
  extras?: {clubName?: string; attendedCount?: number; waitlistedCount?: number},
): EventItem {
  return {
    id: row.id,
    clubId: row.clubId,
    clubName: extras?.clubName || '',
    title: row.title,
    slug: row.slug,
    category: row.category as EventItem['category'],
    description: row.description,
    venue: row.venue,
    startTime: row.startsAt.toISOString(),
    endTime: row.endsAt.toISOString(),
    registrationOpensAt: row.registrationOpensAt ? row.registrationOpensAt.toISOString() : null,
    registrationDeadline: row.registrationDeadline.toISOString(),
    capacity: row.capacity,
    registeredCount: row.registeredCount,
    waitlistedCount: extras?.waitlistedCount ?? 0,
    attendedCount: extras?.attendedCount ?? 0,
    status: row.status as EventStatus,
    bannerUrl: row.bannerUrl,
    isPaid: row.isPaid,
    feeAmount: Number(row.feeAmount),
    feeMinorUnits: row.feeMinorUnits ?? toCents(row.feeAmount),
    eligibilityRules: row.eligibilityRules || {},
    ticketsReleasedAt: row.ticketsReleasedAt ? row.ticketsReleasedAt.toISOString() : null,
    ticketsReleasedBy: row.ticketsReleasedBy ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapFormRow(
  formRow: typeof eventForms.$inferSelect,
  fieldRows: Array<typeof formFields.$inferSelect>,
): RegistrationForm {
  const fields: FormField[] = [...fieldRows]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f) => ({
      id: f.fieldKey,
      label: f.label,
      description: f.description || undefined,
      type: f.fieldType as FormFieldType,
      required: f.required,
      placeholder: f.placeholder ?? undefined,
      options: f.options && f.options.length > 0 ? f.options : undefined,
      validationRules:
        f.validationRules && Object.keys(f.validationRules).length > 0
          ? f.validationRules
          : undefined,
    }));

  return {
    id: formRow.id,
    eventId: formRow.eventId,
    version: formRow.version,
    status: formRow.status === 'published' ? 'published' : 'draft',
    publishedVersion: formRow.publishedVersion ?? 0,
    title: formRow.title,
    description: formRow.description || '',
    fields,
    updatedAt: formRow.updatedAt.toISOString(),
  };
}

export function mapFormVersionRow(row: typeof eventFormVersions.$inferSelect): EventFormVersion {
  return {
    id: row.id,
    formId: row.formId,
    eventId: row.eventId,
    version: row.version,
    title: row.title,
    description: row.description,
    fields: Array.isArray(row.schemaSnapshot) ? row.schemaSnapshot : [],
    publishedBy: row.publishedBy,
    publishedAt: row.publishedAt.toISOString(),
  };
}

export function mapTicketRow(
  row: typeof tickets.$inferSelect,
  extras?: {
    studentName?: string;
    studentEmail?: string;
    registrationStatus?: RegistrationStatus;
    unsealedQrToken?: string;
  },
): TicketRecord {
  const status = row.status as TicketStatus;
  return {
    id: row.id,
    registrationId: row.registrationId,
    eventId: row.eventId,
    userId: row.userId,
    studentName: extras?.studentName,
    studentEmail: extras?.studentEmail,
    registrationStatus: extras?.registrationStatus,
    ticketCode: row.ticketCode,
    status,
    qrToken: status === 'released' ? extras?.unsealedQrToken || undefined : undefined,
    releasedBy: row.releasedBy ?? null,
    releasedAt: row.releasedAt ? row.releasedAt.toISOString() : null,
    revokedBy: row.revokedBy ?? null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapRegistrationRow(
  row: typeof registrations.$inferSelect,
  extras?: {
    eventTitle?: string;
    eventStartTime?: string;
    eventVenue?: string;
    clubId?: string;
    clubName?: string;
    studentName?: string;
    studentEmail?: string;
    qrUsedAt?: string | null;
    waitlistPosition?: number | null;
    ticketStatus?: TicketStatus;
    ticketCode?: string;
    ticketReleasedAt?: string | null;
    qrToken?: string;
  },
): Registration {
  const status = row.status as RegistrationStatus;
  const ticketStatus = extras?.ticketStatus ?? 'not_released';
  return {
    id: row.id,
    eventId: row.eventId,
    eventTitle: extras?.eventTitle,
    eventStartTime: extras?.eventStartTime,
    eventVenue: extras?.eventVenue,
    clubId: extras?.clubId,
    clubName: extras?.clubName,
    studentId: row.userId,
    studentName: extras?.studentName || 'Student',
    studentEmail: extras?.studentEmail || '',
    formVersion: row.formVersion,
    formVersionId: row.formVersionId ?? null,
    answers: row.answers || {},
    status,
    ticketStatus,
    ticketCode: extras?.ticketCode,
    ticketReleasedAt: extras?.ticketReleasedAt ?? null,
    attendanceStatus: status === 'attended' || Boolean(extras?.qrUsedAt) ? 'present' : 'not_checked_in',
    waitlistPosition: extras?.waitlistPosition ?? null,
    qrToken: ticketStatus === 'released' ? (extras?.qrToken ?? '') : '',
    qrUsedAt: extras?.qrUsedAt ?? null,
    createdAt: row.submittedAt.toISOString(),
  };
}

export function mapEventReportRow(
  row: typeof eventReports.$inferSelect,
  extras: {eventTitle: string; clubName: string},
): EventReport {
  return {
    id: row.id,
    eventId: row.eventId,
    eventTitle: extras.eventTitle,
    clubId: row.clubId,
    clubName: extras.clubName,
    submittedBy: row.submittedBy || '',
    submittedByName: row.submittedByName,
    outcomeSummary: row.summary,
    objectives: row.objectives || '',
    actualEventDate: row.actualEventDate ? row.actualEventDate.toISOString() : undefined,
    participationSummary: row.participationSummary || '',
    outcomes: row.outcomes || '',
    highlights: row.highlights,
    challenges: row.challenges,
    feedbackObservations: row.feedbackObservations || '',
    evidenceUrl: row.evidenceUrl || '',
    actualAttendance: row.actualAttendance,
    registeredTotal: row.registeredTotal,
    completionStatus: row.completionStatus as EventReport['completionStatus'],
    status: (row.status || 'submitted') as EventReportStatus,
    reviewedBy: row.reviewedBy ?? null,
    reviewedByName: row.reviewedByName ?? null,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    reviewNotes: row.reviewNotes || '',
    history: Array.isArray(row.history) ? row.history : [],
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapFinancialReportRow(
  row: typeof financeReports.$inferSelect,
  items: Array<typeof financeLineItems.$inferSelect>,
  extras: {eventTitle: string; clubName: string},
): FinancialReport {
  const lineItems: FinancialLineItem[] = items.map((i) => ({
    id: i.id,
    type: i.itemType === 'expense' ? 'expense' : 'collection',
    label: i.description,
    category: i.category,
    amount: Number(i.amount),
    notes: i.notes ?? undefined,
  }));

  const collectionsMinor = row.totalCollectionsMinorUnits || toCents(row.totalCollections);
  const expensesMinor = row.totalExpensesMinorUnits || toCents(row.totalExpenses);
  const netMinor = collectionsMinor - expensesMinor;

  return {
    id: row.id,
    eventId: row.eventId,
    eventTitle: extras.eventTitle,
    clubId: row.clubId,
    clubName: extras.clubName,
    submittedBy: row.submittedBy || '',
    submittedByName: row.submittedByName,
    totalCollections: fromCentsToNumber(collectionsMinor),
    totalExpenses: fromCentsToNumber(expensesMinor),
    netBalance: fromCentsToNumber(netMinor),
    totalCollectionsMinorUnits: collectionsMinor,
    totalExpensesMinorUnits: expensesMinor,
    netBalanceMinorUnits: netMinor,
    lineItems,
    notes: row.notes,
    submittedAt: row.submittedAt.toISOString(),
  };
}

export function mapFinanceEntryRow(
  row: typeof financeEntries.$inferSelect,
  extras?: {clubName?: string; eventTitle?: string | null},
): FinanceEntry {
  const minor = Number(row.amountMinorUnits) || 0;
  return {
    id: row.id,
    clubId: row.clubId,
    clubName: extras?.clubName,
    eventId: row.eventId ?? null,
    eventTitle: extras?.eventTitle ?? null,
    entryType: row.entryType as FinanceEntryType,
    sourceOrCategory: row.sourceOrCategory,
    description: row.description,
    amountMinorUnits: minor,
    amount: fromCentsToNumber(minor),
    transactionDate: row.transactionDate.toISOString(),
    vendorOrRecipient: row.vendorOrRecipient,
    receiptUrl: row.receiptUrl || '',
    notes: row.notes || '',
    createdBy: row.createdBy || '',
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapNotificationRow(row: typeof notifications.$inferSelect): NotificationItem {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    message: row.message,
    category: (['event', 'club', 'registration', 'admin'].includes(row.type)
      ? row.type
      : 'event') as NotificationItem['category'],
    read: row.isRead,
    link: row.link ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapAuditLogRow(row: typeof auditLogs.$inferSelect): AuditLogEntry {
  const details =
    typeof row.metadata?.details === 'string' ? row.metadata.details : row.action;
  return {
    id: row.id,
    actorId: row.actorUserId || 'system',
    actorName: row.actorName,
    actorContext: row.actorContext,
    action: row.action,
    targetType: row.targetType as AuditLogEntry['targetType'],
    targetId: row.targetId,
    targetLabel: row.targetLabel,
    details,
    createdAt: row.createdAt.toISOString(),
  };
}
