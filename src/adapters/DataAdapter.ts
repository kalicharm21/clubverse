import type {
  AdminAnalyticsResponse,
  AdminDashboardStats,
  AttendanceRecord,
  AttendanceSummary,
  AuditLogEntry,
  AuthSessionResponse,
  Club,
  ClubDetail,
  ClubFollow,
  ClubInvitation,
  ClubMembership,
  ClubRole,
  ClubStatus,
  CoreMemberPermission,
  EventEligibilityRules,
  EventFormVersion,
  EventItem,
  EventReport,
  FinanceEntry,
  FinanceEntryType,
  FinanceSummaryResponse,
  FinancialLineItem,
  FinancialReport,
  FormAnswerValue,
  FormField,
  HallOfFameEntry,
  NotificationItem,
  PaginatedResult,
  PaginationMeta,
  Registration,
  RegistrationForm,
  SystemSettings,
  TicketRecord,
  TicketReleaseSummary,
  UserAccount,
} from '../../shared/types/domain.ts';

export type EventLifecycleAction =
  | 'publish'
  | 'unpublish'
  | 'open-registration'
  | 'close-registration'
  | 'cancel'
  | 'complete';

export interface ClientDataAdapter {
  setAuthToken(token: string | null): void;
  getHealth(): Promise<{status: string; mode: string; persistence: string}>;

  // Auth
  listDemoPersonas(): Promise<UserAccount[]>;
  loginDemo(input: {personaId?: string; email?: string; password?: string}): Promise<{
    token: string;
    session: AuthSessionResponse;
  }>;
  registerDemo(input: {
    name: string;
    email: string;
    department: string;
    yearOfStudy: string;
    password: string;
  }): Promise<{token: string; session: AuthSessionResponse}>;
  getMe(): Promise<AuthSessionResponse>;
  logout(): Promise<void>;

  // Users
  updateMyProfile(
    input: Partial<{name: string; department: string; yearOfStudy: string}>,
  ): Promise<UserAccount>;

  // Clubs & Follows
  listClubs(params?: {search?: string; category?: string; sortBy?: string}): Promise<Club[]>;
  listClubsPaginated(params?: {
    search?: string;
    category?: string;
    sortBy?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<Club>>;
  getClubDetail(clubId: string): Promise<ClubDetail>;
  updateClub(clubId: string, updates: Partial<Club>): Promise<Club>;
  createClub(input: {
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
  }): Promise<Club>;

  getMyMemberships(): Promise<{memberships: ClubMembership[]; follows: ClubFollow[]}>;
  getMyFollowedClubs(): Promise<Club[]>;
  followClub(clubId: string): Promise<ClubFollow>;
  unfollowClub(clubId: string): Promise<void>;
  getClubTeam(clubId: string): Promise<ClubMembership[]>;
  upsertClubMember(
    clubId: string,
    input: {
      email?: string;
      userId?: string;
      role: ClubRole;
      title: string;
      permissions: CoreMemberPermission[];
    },
  ): Promise<ClubMembership>;
  updateMemberPermissions(
    clubId: string,
    membershipId: string,
    updates: {
      role?: ClubRole;
      title?: string;
      permissions?: CoreMemberPermission[];
    },
  ): Promise<ClubMembership>;
  removeClubMember(clubId: string, membershipId: string): Promise<void>;

  // Leadership & Invitations
  assignClubLeadership(
    clubId: string,
    input: {
      email: string;
      role: 'president' | 'vice_president';
      title?: string;
      replaceExisting?: boolean;
      sendInvitation?: boolean;
    },
  ): Promise<{
    mode: 'assigned' | 'invited';
    membership?: ClubMembership;
    invitation?: ClubInvitation;
    replacedUserId?: string | null;
  }>;
  listClubInvitations(clubId: string): Promise<ClubInvitation[]>;
  createClubInvitation(
    clubId: string,
    input: {
      email: string;
      role: ClubRole;
      title?: string;
      permissions: CoreMemberPermission[];
      replaceExisting?: boolean;
    },
  ): Promise<ClubInvitation>;
  resendClubInvitation(clubId: string, invitationId: string): Promise<ClubInvitation>;
  revokeClubInvitation(clubId: string, invitationId: string): Promise<ClubInvitation>;
  previewInvitation(token: string): Promise<{
    invitation: ClubInvitation;
    clubName: string;
    clubSlug: string;
    hasExistingAccount: boolean;
  }>;
  acceptInvitation(input: {
    token: string;
    name?: string;
    department?: string;
    yearOfStudy?: string;
  }): Promise<{
    invitation: ClubInvitation;
    membership: ClubMembership;
    user: UserAccount;
  }>;

  // Hall of Fame
  getHallOfFame(): Promise<HallOfFameEntry[]>;

  // Events & Forms
  listEvents(params?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
  }): Promise<EventItem[]>;
  listEventsPaginated(params?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<EventItem>>;
  getEventDetail(eventId: string): Promise<EventItem>;
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
  ): Promise<EventItem>;
  updateEvent(eventId: string, updates: Partial<EventItem>): Promise<EventItem>;
  publishEvent(eventId: string): Promise<EventItem>;
  transitionEventLifecycle(eventId: string, action: EventLifecycleAction): Promise<EventItem>;

  getEventForm(
    eventId: string,
    optsOrVersion?: number | {version?: number; publishedOnly?: boolean},
  ): Promise<RegistrationForm>;
  saveEventForm(
    eventId: string,
    fields: FormField[],
    meta?: {title?: string; description?: string},
  ): Promise<RegistrationForm>;
  publishEventForm(eventId: string): Promise<EventFormVersion>;
  getPublishedFormVersion(eventId: string, version?: number): Promise<EventFormVersion>;

  // Registrations & Attendance
  submitRegistration(
    eventId: string,
    answers: Record<string, FormAnswerValue>,
  ): Promise<Registration>;
  cancelMyRegistration(eventId: string): Promise<{
    cancelled: Registration;
    promotedUserId?: string | null;
    promotedRegistrationId?: string | null;
  }>;
  listEventRegistrations(eventId: string): Promise<Registration[]>;
  listEventRegistrationsPaginated(
    eventId: string,
    params?: {page?: number; pageSize?: number; search?: string; status?: string},
  ): Promise<PaginatedResult<Registration>>;
  listMyRegistrations(): Promise<Registration[]>;

  scanAttendance(
    eventId: string,
    input: {
      qrToken?: string;
      registrationId?: string;
      method: 'qr_scan' | 'manual_override';
      reason?: string;
    },
  ): Promise<AttendanceRecord>;
  manualAttendance(
    eventId: string,
    input: {registrationId: string; reason: string},
  ): Promise<AttendanceRecord>;
  getEventAttendance(
    eventId: string,
    params?: {page?: number; pageSize?: number; search?: string},
  ): Promise<{
    records: AttendanceRecord[];
    registeredCount: number;
    attendedCount: number;
    summary?: AttendanceSummary;
    pagination?: PaginationMeta;
  }>;

  // Tickets
  releaseEventTickets(
    eventId: string,
    input?: {confirmParticipantCount?: number; note?: string},
  ): Promise<TicketReleaseSummary>;
  listEventTickets(eventId: string): Promise<TicketRecord[]>;
  listMyTickets(): Promise<TicketRecord[]>;
  revokeTicket(ticketId: string, reason?: string): Promise<TicketRecord>;

  // Reports & Finance
  submitEventReport(
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
  ): Promise<EventReport>;
  getEventReport(eventId: string): Promise<EventReport | null>;

  submitFinancialReport(
    eventId: string,
    input: {lineItems: FinancialLineItem[]; notes: string},
  ): Promise<FinancialReport>;
  getFinancialReport(eventId: string): Promise<FinancialReport | null>;
  getClubFinance(clubId: string): Promise<FinanceSummaryResponse>;
  createClubFinanceEntry(
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
  ): Promise<FinanceEntry>;
  deleteClubFinanceEntry(clubId: string, entryId: string): Promise<void>;
  getEventFinance(eventId: string): Promise<FinanceSummaryResponse>;
  createEventFinanceEntry(
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
  ): Promise<FinanceEntry>;

  // Notifications
  listNotifications(): Promise<NotificationItem[]>;
  markNotificationRead(notificationId: string): Promise<NotificationItem>;
  markAllNotificationsRead(): Promise<void>;

  // Super Admin
  getAdminDashboard(): Promise<AdminDashboardStats>;
  getAdminAnalytics(): Promise<AdminAnalyticsResponse>;
  listAdminClubs(): Promise<Club[]>;
  listAdminMemberships(): Promise<ClubMembership[]>;
  updateClubStatus(clubId: string, status: ClubStatus, reason?: string): Promise<Club>;
  listAdminUsers(): Promise<UserAccount[]>;
  updateUserStatus(userId: string, status: 'active' | 'suspended', reason?: string): Promise<UserAccount>;
  listAdminReports(): Promise<EventReport[]>;
  reviewAdminReport(
    reportId: string,
    input: {
      status: 'under_review' | 'changes_requested' | 'approved' | 'rejected';
      reviewNotes: string;
    },
  ): Promise<EventReport>;
  getAdminFinance(): Promise<{
    reports: FinancialReport[];
    totalCollections: number;
    totalExpenses: number;
    netBalance: number;
    ledgerSummary?: FinanceSummaryResponse;
  }>;
  downloadAdminCsv(kind: 'reports' | 'finance'): Promise<{blob: Blob; filename: string}>;
  listAdminAuditLogs(): Promise<AuditLogEntry[]>;
  getAdminSettings(): Promise<SystemSettings>;
  updateAdminSettings(updates: Partial<SystemSettings>): Promise<SystemSettings>;
}
