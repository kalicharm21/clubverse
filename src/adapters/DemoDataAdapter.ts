import {DemoDataAdapter as ServerDemoAdapter} from '../../server/adapters/DemoDataAdapter.ts';
import {escapeCsvCell, rupeesToMinorUnits} from '../../server/shared/utils/crypto.ts';
import {BusinessRuleError, NotFoundError} from '../../server/shared/errors/AppError.ts';
import type {
  Club,
  ClubRole,
  ClubStatus,
  CoreMemberPermission,
  EventEligibilityRules,
  EventItem,
  EventStatus,
  FinanceEntryType,
  FinancialLineItem,
  FormAnswerValue,
  FormField,
  RegistrationForm,
  SystemSettings,
} from '../../shared/types/domain.ts';
import type {ClientDataAdapter, EventLifecycleAction} from './DataAdapter.ts';

/**
 * Isolated client-side DemoDataAdapter used for offline unit tests or decoupled
 * sandbox checks. Production and live dev builds use ApiDataAdapter -> /api/v1/*.
 */
export class ClientDemoDataAdapter implements ClientDataAdapter {
  private readonly store = new ServerDemoAdapter();
  private currentUserId = 'usr-student-1';

  setAuthToken(): void {
    // No-op in isolated in-memory client adapter
  }

  async getHealth() {
    return {status: 'ok', mode: 'demo', persistence: 'in-memory-client-demo'};
  }

  listDemoPersonas() {
    return this.store.listUsers();
  }

  async loginDemo(input: {personaId?: string; email?: string}) {
    const user = input.personaId
      ? await this.store.getUserById(input.personaId)
      : input.email
        ? await this.store.getUserByEmail(input.email)
        : await this.store.getUserById('usr-student-1');
    if (!user) throw new Error('Persona not found');
    this.currentUserId = user.id;
    const memberships = await this.store.getMembershipsForUser(user.id);
    const follows = await this.store.getFollowsForUser(user.id);
    return {
      token: 'client-demo-token',
      session: {
        user,
        memberships,
        followedClubIds: follows.map((f) => f.clubId),
        mode: 'demo' as const,
      },
    };
  }

  async registerDemo(input: {
    name: string;
    email: string;
    department: string;
    yearOfStudy: string;
    password: string;
  }) {
    const user = await this.store.createDemoUser(input);
    this.currentUserId = user.id;
    return {
      token: 'client-demo-token',
      session: {
        user,
        memberships: [],
        followedClubIds: [],
        mode: 'demo' as const,
      },
    };
  }

  async getMe() {
    const user = (await this.store.getUserById(this.currentUserId))!;
    const memberships = await this.store.getMembershipsForUser(user.id);
    const follows = await this.store.getFollowsForUser(user.id);
    return {
      user,
      memberships,
      followedClubIds: follows.map((f) => f.clubId),
      mode: 'demo' as const,
    };
  }

  async logout() {
    this.currentUserId = 'usr-student-1';
  }

  async updateMyProfile(input: Partial<{name: string; department: string; yearOfStudy: string}>) {
    return (await this.store.updateUserProfile(this.currentUserId, input))!;
  }

  listClubs(params?: {search?: string; category?: string; sortBy?: string}) {
    return this.store.listClubs(params as Parameters<ServerDemoAdapter['listClubs']>[0]);
  }

  listClubsPaginated(params?: {
    search?: string;
    category?: string;
    sortBy?: string;
    page?: number;
    pageSize?: number;
  }) {
    return this.store.listClubsPaginated(
      params as Parameters<ServerDemoAdapter['listClubsPaginated']>[0],
    );
  }

  async getClubDetail(clubId: string) {
    return (await this.store.getClubDetail(clubId, this.currentUserId))!;
  }

  async updateClub(clubId: string, updates: Partial<Club>) {
    return (await this.store.updateClub(clubId, updates))!;
  }

  createClub(input: {
    name: string;
    slug?: string;
    category: Club['category'];
    tagline: string;
    description: string;
    meetingSchedule: string;
    contactEmail: string;
    foundedYear?: number;
    status?: ClubStatus;
  }) {
    return this.store.createClub({...input, createdByUserId: this.currentUserId});
  }

  async getMyMemberships() {
    return {
      memberships: await this.store.getMembershipsForUser(this.currentUserId),
      follows: await this.store.getFollowsForUser(this.currentUserId),
    };
  }

  async getMyFollowedClubs(): Promise<Club[]> {
    const [follows, activeClubs] = await Promise.all([
      this.store.getFollowsForUser(this.currentUserId),
      this.store.listClubs(),
    ]);
    const followedSet = new Set(follows.map((f) => f.clubId));
    return activeClubs.filter((club) => followedSet.has(club.id));
  }

  followClub(clubId: string) {
    return this.store.followClub(this.currentUserId, clubId);
  }

  async unfollowClub(clubId: string) {
    await this.store.unfollowClub(this.currentUserId, clubId);
  }

  getClubTeam(clubId: string) {
    return this.store.getClubMemberships(clubId);
  }

  async upsertClubMember(
    clubId: string,
    input: {
      email?: string;
      userId?: string;
      role: ClubRole;
      title: string;
      permissions: CoreMemberPermission[];
    },
  ) {
    const user = input.userId
      ? await this.store.getUserById(input.userId)
      : input.email
        ? await this.store.getUserByEmail(input.email)
        : null;
    if (!user) throw new Error('User not found');
    return this.store.upsertClubMembership({
      clubId,
      userId: user.id,
      role: input.role,
      title: input.title,
      permissions: input.permissions,
      assignedByUserId: this.currentUserId,
      strictInsert: true,
    });
  }

  async updateMemberPermissions(
    clubId: string,
    membershipId: string,
    updates: {
      role?: ClubRole;
      title?: string;
      permissions?: CoreMemberPermission[];
    },
  ) {
    return (await this.store.updateMembershipPermissions(clubId, membershipId, updates))!;
  }

  async removeClubMember(clubId: string, membershipId: string) {
    await this.store.removeClubMembership(clubId, membershipId);
  }

  assignClubLeadership(
    clubId: string,
    input: {
      email: string;
      role: 'president' | 'vice_president';
      title?: string;
      replaceExisting?: boolean;
      sendInvitation?: boolean;
    },
  ) {
    return this.store.assignClubLeadership({
      clubId,
      ...input,
      actorUserId: this.currentUserId,
    });
  }

  listClubInvitations(clubId: string) {
    return this.store.listClubInvitations(clubId);
  }

  createClubInvitation(
    clubId: string,
    input: {
      email: string;
      role: ClubRole;
      title?: string;
      permissions: CoreMemberPermission[];
      replaceExisting?: boolean;
    },
  ) {
    return this.store.createClubInvitation({
      clubId,
      ...input,
      inviterUserId: this.currentUserId,
    });
  }

  resendClubInvitation(clubId: string, invitationId: string) {
    return this.store.resendClubInvitation(clubId, invitationId, this.currentUserId);
  }

  async revokeClubInvitation(clubId: string, invitationId: string) {
    return (await this.store.revokeClubInvitation(clubId, invitationId))!;
  }

  previewInvitation(token: string) {
    return this.store.previewInvitation(token);
  }

  async acceptInvitation(input: {
    token: string;
    name?: string;
    department?: string;
    yearOfStudy?: string;
  }) {
    const user = (await this.store.getUserById(this.currentUserId))!;
    return this.store.acceptInvitation({
      token: input.token,
      authUserId: user.id,
      email: user.email,
      name: input.name || user.name,
      department: input.department || user.department,
      yearOfStudy: input.yearOfStudy || user.yearOfStudy,
      emailVerified: true,
      isBootstrapSuperAdmin: user.isSuperAdmin,
    });
  }

  getHallOfFame() {
    return this.store.getHallOfFame();
  }

  listEvents(params?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
  }) {
    return this.store.listEvents(params);
  }

  listEventsPaginated(params?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
    page?: number;
    pageSize?: number;
  }) {
    return this.store.listEventsPaginated(params);
  }

  async getEventDetail(eventId: string) {
    return (await this.store.getEventById(eventId))!;
  }

  createEvent(
    clubId: string,
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
      eligibilityRules?: EventEligibilityRules;
    },
  ) {
    return this.store.createEvent(clubId, input);
  }

  async updateEvent(eventId: string, updates: Partial<EventItem>) {
    return (await this.store.updateEvent(eventId, updates))!;
  }

  async publishEvent(eventId: string) {
    return (await this.store.publishEvent(eventId))!;
  }

  async transitionEventLifecycle(eventId: string, action: EventLifecycleAction) {
    const map: Record<EventLifecycleAction, EventStatus> = {
      publish: 'published',
      unpublish: 'draft',
      'open-registration': 'registration_open',
      'close-registration': 'registration_closed',
      cancel: 'cancelled',
      complete: 'completed',
    };
    return (await this.store.updateEventLifecycle(eventId, map[action]))!;
  }

  async getEventForm(
    eventId: string,
    optsOrVersion?: number | {version?: number; publishedOnly?: boolean},
  ): Promise<RegistrationForm> {
    const version = typeof optsOrVersion === 'number' ? optsOrVersion : optsOrVersion?.version;
    const publishedOnly =
      typeof optsOrVersion === 'object' ? Boolean(optsOrVersion?.publishedOnly) : false;

    if (publishedOnly || typeof version === 'number') {
      const snap = await this.store.getPublishedFormVersion(eventId, version);
      if (!snap) {
        throw new BusinessRuleError(
          'FORM_NOT_PUBLISHED',
          'The event organizer has not published a registration form yet.',
        );
      }
      return {
        id: snap.formId,
        eventId: snap.eventId,
        version: snap.version,
        publishedVersion: snap.version,
        status: 'published',
        title: snap.title,
        description: snap.description,
        fields: snap.fields,
        updatedAt: snap.publishedAt,
      };
    }

    return this.store.getRegistrationForm(eventId);
  }

  saveEventForm(
    eventId: string,
    fields: FormField[],
    meta?: {title?: string; description?: string},
  ) {
    return this.store.upsertRegistrationForm(eventId, fields, {
      ...meta,
      updatedBy: this.currentUserId,
    });
  }

  publishEventForm(eventId: string) {
    return this.store.publishRegistrationForm(eventId, this.currentUserId);
  }

  async getPublishedFormVersion(eventId: string, version?: number) {
    return (await this.store.getPublishedFormVersion(eventId, version))!;
  }

  async submitRegistration(eventId: string, answers: Record<string, FormAnswerValue>) {
    const user = (await this.store.getUserById(this.currentUserId))!;
    return this.store.createRegistration({
      eventId,
      studentId: user.id,
      studentName: user.name,
      studentEmail: user.email,
      answers,
      qrToken: `CV-QR-${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
    });
  }

  cancelMyRegistration(eventId: string) {
    return this.store.cancelRegistration(eventId, this.currentUserId);
  }

  listEventRegistrations(eventId: string) {
    return this.store.listRegistrationsForEvent(eventId);
  }

  listEventRegistrationsPaginated(
    eventId: string,
    params?: {page?: number; pageSize?: number; search?: string; status?: string},
  ) {
    return this.store.listRegistrationsForEventPaginated(eventId, params);
  }

  listMyRegistrations() {
    return this.store.listRegistrationsForStudent(this.currentUserId);
  }

  async scanAttendance(
    eventId: string,
    input: {
      qrToken?: string;
      registrationId?: string;
      method: 'qr_scan' | 'manual_override';
      reason?: string;
    },
  ) {
    const reg = input.qrToken
      ? await this.store.getRegistrationByQrToken(eventId, input.qrToken)
      : input.registrationId
        ? await this.store.getRegistrationById(input.registrationId)
        : null;
    if (!reg) throw new Error('Registration not found');
    return this.store.recordAttendance({
      eventId,
      registrationId: reg.id,
      studentId: reg.studentId,
      studentName: reg.studentName,
      studentCode: reg.studentId,
      qrToken: reg.qrToken,
      method: input.method,
      manualReason: input.reason,
      checkedInBy: this.currentUserId,
    });
  }

  manualAttendance(eventId: string, input: {registrationId: string; reason: string}) {
    return this.scanAttendance(eventId, {
      registrationId: input.registrationId,
      method: 'manual_override',
      reason: input.reason,
    });
  }

  async getEventAttendance(
    eventId: string,
    params?: {page?: number; pageSize?: number; search?: string},
  ) {
    const [res, summary, ev] = await Promise.all([
      this.store.listAttendanceForEventPaginated(eventId, params),
      this.store.getAttendanceSummary(eventId),
      this.store.getEventById(eventId),
    ]);
    return {
      records: res.items,
      registeredCount: ev?.registeredCount || 0,
      attendedCount: summary.attendedCount,
      summary,
      pagination: res.pagination,
    };
  }

  async releaseEventTickets(
    eventId: string,
    input?: {confirmParticipantCount?: number; note?: string},
  ) {
    const user = (await this.store.getUserById(this.currentUserId))!;
    void input;
    return this.store.releaseEventTickets(eventId, {id: user.id, name: user.name});
  }

  listEventTickets(eventId: string) {
    return this.store.listEventTickets(eventId);
  }

  listMyTickets() {
    return this.store.listStudentTickets(this.currentUserId);
  }

  async revokeTicket(ticketId: string, reason?: string) {
    const user = (await this.store.getUserById(this.currentUserId))!;
    const revoked = await this.store.revokeTicket(ticketId, {id: user.id, name: user.name}, reason);
    if (!revoked) throw new NotFoundError('Ticket not found');
    return revoked;
  }

  async submitEventReport(
    eventId: string,
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
  ) {
    const ev = (await this.store.getEventById(eventId))!;
    const user = (await this.store.getUserById(this.currentUserId))!;
    return this.store.upsertEventReport({
      eventId,
      eventTitle: ev.title,
      clubId: ev.clubId,
      clubName: ev.clubName,
      submittedBy: user.id,
      submittedByName: user.name,
      outcomeSummary: input.outcomeSummary,
      objectives: input.objectives,
      actualEventDate: input.actualEventDate,
      participationSummary: input.participationSummary,
      outcomes: input.outcomes,
      highlights: input.highlights,
      challenges: input.challenges,
      feedbackObservations: input.feedbackObservations,
      evidenceUrl: input.evidenceUrl,
      actualAttendance: input.actualAttendance,
      completionStatus: input.completionStatus,
      status: input.status || 'submitted',
      registeredTotal: ev.registeredCount,
    });
  }

  getEventReport(eventId: string) {
    return this.store.getEventReport(eventId);
  }

  async submitFinancialReport(
    eventId: string,
    input: {lineItems: FinancialLineItem[]; notes: string},
  ) {
    const ev = (await this.store.getEventById(eventId))!;
    const user = (await this.store.getUserById(this.currentUserId))!;
    const totalCollections = input.lineItems
      .filter((i) => i.type === 'collection')
      .reduce((s, i) => s + i.amount, 0);
    const totalExpenses = input.lineItems
      .filter((i) => i.type === 'expense')
      .reduce((s, i) => s + i.amount, 0);
    return this.store.upsertFinancialReport({
      eventId,
      eventTitle: ev.title,
      clubId: ev.clubId,
      clubName: ev.clubName,
      submittedBy: user.id,
      submittedByName: user.name,
      totalCollections,
      totalExpenses,
      netBalance: totalCollections - totalExpenses,
      lineItems: input.lineItems,
      notes: input.notes,
    });
  }

  getFinancialReport(eventId: string) {
    return this.store.getFinancialReport(eventId);
  }

  getClubFinance(clubId: string) {
    return this.store.getFinanceSummary({clubId});
  }

  async createClubFinanceEntry(
    clubId: string,
    input: {
      eventId?: string | null;
      entryType: FinanceEntryType;
      sourceOrCategory: string;
      description: string;
      amountMinorUnits?: number;
      amount?: number;
      transactionDate: string;
      vendorOrRecipient?: string;
      receiptUrl?: string;
      notes?: string;
    },
  ) {
    const user = (await this.store.getUserById(this.currentUserId))!;
    const amountMinorUnits =
      typeof input.amountMinorUnits === 'number'
        ? Math.trunc(input.amountMinorUnits)
        : rupeesToMinorUnits(input.amount ?? 0);
    return this.store.createFinanceEntry({
      clubId,
      eventId: input.eventId ?? null,
      entryType: input.entryType,
      sourceOrCategory: input.sourceOrCategory,
      description: input.description,
      amountMinorUnits,
      transactionDate: input.transactionDate,
      vendorOrRecipient: input.vendorOrRecipient || '',
      receiptUrl: input.receiptUrl,
      notes: input.notes,
      createdBy: user.id,
      createdByName: user.name,
    });
  }

  async deleteClubFinanceEntry(clubId: string, entryId: string) {
    await this.store.deleteFinanceEntry(clubId, entryId);
  }

  getEventFinance(eventId: string) {
    return this.store.getFinanceSummary({eventId});
  }

  async createEventFinanceEntry(
    eventId: string,
    input: {
      entryType: FinanceEntryType;
      sourceOrCategory: string;
      description: string;
      amountMinorUnits?: number;
      amount?: number;
      transactionDate: string;
      vendorOrRecipient?: string;
      receiptUrl?: string;
      notes?: string;
    },
  ) {
    const ev = await this.store.getEventById(eventId);
    if (!ev) throw new NotFoundError('Event not found');
    return this.createClubFinanceEntry(ev.clubId, {...input, eventId: ev.id});
  }

  listNotifications() {
    return this.store.listNotificationsForUser(this.currentUserId);
  }

  async markNotificationRead(notificationId: string) {
    return (await this.store.markNotificationRead(this.currentUserId, notificationId))!;
  }

  markAllNotificationsRead() {
    return this.store.markAllNotificationsRead(this.currentUserId);
  }

  getAdminDashboard() {
    return this.store.getAdminDashboardStats();
  }

  getAdminAnalytics() {
    return this.store.getAdminAnalytics();
  }

  listAdminClubs() {
    return this.store.listClubs({includeAllStatuses: true});
  }

  listAdminMemberships() {
    return this.store.listAllMemberships();
  }

  async updateClubStatus(clubId: string, status: ClubStatus) {
    return (await this.store.updateClubStatus(clubId, status))!;
  }

  listAdminUsers() {
    return this.store.listUsers();
  }

  async updateUserStatus(userId: string, status: 'active' | 'suspended') {
    return (await this.store.updateUserStatus(userId, status))!;
  }

  listAdminReports() {
    return this.store.listAllEventReports();
  }

  async reviewAdminReport(
    reportId: string,
    input: {
      status: 'under_review' | 'changes_requested' | 'approved' | 'rejected';
      reviewNotes: string;
    },
  ) {
    const user = (await this.store.getUserById(this.currentUserId))!;
    return this.store.reviewEventReport(reportId, {id: user.id, name: user.name}, input);
  }

  async getAdminFinance() {
    const [reports, ledgerSummary] = await Promise.all([
      this.store.listAllFinancialReports(),
      this.store.getFinanceSummary(),
    ]);
    const reportCollections = reports.reduce((s, r) => s + r.totalCollections, 0);
    const reportExpenses = reports.reduce((s, r) => s + r.totalExpenses, 0);
    const totalCollections = reportCollections + ledgerSummary.totalIncome;
    const totalExpenses = reportExpenses + ledgerSummary.totalExpenses;
    return {
      reports,
      totalCollections,
      totalExpenses,
      netBalance: totalCollections - totalExpenses,
      ledgerSummary,
    };
  }

  async downloadAdminCsv(kind: 'reports' | 'finance') {
    if (kind === 'reports') {
      const reports = await this.store.listAllEventReports();
      const header = ['Report ID', 'Event', 'Club', 'Status', 'Attendance', 'Submitted By'];
      const rows = reports.map((r) =>
        [
          escapeCsvCell(r.id),
          escapeCsvCell(r.eventTitle),
          escapeCsvCell(r.clubName),
          escapeCsvCell(r.status),
          escapeCsvCell(`${r.actualAttendance}/${r.registeredTotal}`),
          escapeCsvCell(r.submittedByName),
        ].join(','),
      );
      const csv = [header.map(escapeCsvCell).join(','), ...rows].join('\n');
      return {
        blob: new Blob([csv], {type: 'text/csv;charset=utf-8'}),
        filename: 'campusverse-event-reports.csv',
      };
    }

    const summary = await this.store.getFinanceSummary();
    const header = ['Entry ID', 'Club', 'Event', 'Type', 'Category', 'Amount (INR)', 'Date'];
    const rows = summary.entries.map((e) =>
      [
        escapeCsvCell(e.id),
        escapeCsvCell(e.clubName || ''),
        escapeCsvCell(e.eventTitle || ''),
        escapeCsvCell(e.entryType),
        escapeCsvCell(e.sourceOrCategory),
        escapeCsvCell(e.amount.toFixed(2)),
        escapeCsvCell(e.transactionDate),
      ].join(','),
    );
    const csv = [header.map(escapeCsvCell).join(','), ...rows].join('\n');
    return {
      blob: new Blob([csv], {type: 'text/csv;charset=utf-8'}),
      filename: 'campusverse-finance-ledger.csv',
    };
  }

  listAdminAuditLogs() {
    return this.store.listAuditLogs();
  }

  getAdminSettings() {
    return this.store.getSystemSettings();
  }

  updateAdminSettings(updates: Partial<SystemSettings>) {
    return this.store.updateSystemSettings(updates);
  }
}
