import {API_PREFIX} from '../../shared/constants/permissions.ts';
import type {
  AdminAnalyticsResponse,
  AdminDashboardStats,
  ApiResponse,
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
import type {ClientDataAdapter, EventLifecycleAction} from './DataAdapter.ts';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ApiDataAdapter implements ClientDataAdapter {
  private authToken: string | null = null;

  public setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  private async requestWithMeta<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<{data: T; meta?: Record<string, unknown>}> {
    const headers = new Headers(options.headers);
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (this.authToken) {
      headers.set('Authorization', `Bearer ${this.authToken}`);
    }

    const res = await fetch(`${API_PREFIX}${path}`, {
      ...options,
      headers,
    });

    const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
    if (!res.ok || !json || !json.success) {
      const err = json && !json.success ? json.error : null;
      throw new ApiClientError(
        res.status,
        err?.code || 'API_ERROR',
        err?.message || `Request failed with status ${res.status}`,
        err?.details,
      );
    }
    return {data: json.data, meta: json.meta};
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const {data} = await this.requestWithMeta<T>(path, options);
    return data;
  }

  async downloadEventCsv(
    eventId: string,
    kind: 'registrations' | 'attendance',
  ): Promise<{blob: Blob; filename: string}> {
    const headers = new Headers();
    if (this.authToken) {
      headers.set('Authorization', `Bearer ${this.authToken}`);
    }
    const res = await fetch(
      `${API_PREFIX}/events/${encodeURIComponent(eventId)}/${kind}/export`,
      {headers},
    );
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      const err = json && !json.success ? json.error : null;
      throw new ApiClientError(
        res.status,
        err?.code || 'EXPORT_FAILED',
        err?.message || `CSV export failed (${res.status})`,
      );
    }
    const cd = res.headers.get('content-disposition') || '';
    const match = cd.match(/filename="?([^"]+)"?/i);
    const filename = match?.[1] || `${kind}-${eventId}.csv`;
    const blob = await res.blob();
    return {blob, filename};
  }

  getHealth() {
    return this.request<{status: string; mode: string; persistence: string}>('/health');
  }

  getReadyHealth() {
    return this.request<{status: string; persistence: string; latencyMs: number}>('/health/ready');
  }

  getAuthConfig() {
    return this.request<{
      mode: 'demo' | 'supabase';
      persistenceMode: 'in_memory_demo' | 'postgres';
      demoModeEnabled: boolean;
      supabaseUrl: string | null;
      supabasePublishableKey: string | null;
      institutionalEmailDomains: string[];
    }>('/auth/config');
  }

  listDemoPersonas() {
    return this.request<UserAccount[]>('/auth/demo-personas');
  }

  loginDemo(input: {personaId?: string; email?: string; password?: string}) {
    return this.request<{token: string; session: AuthSessionResponse}>('/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  registerDemo(input: {
    name: string;
    email: string;
    department: string;
    yearOfStudy: string;
    password: string;
  }) {
    return this.request<{token: string; session: AuthSessionResponse}>('/auth/demo-register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  getMe() {
    return this.request<AuthSessionResponse>('/auth/me');
  }

  logout() {
    return this.request<void>('/auth/logout', {method: 'POST'});
  }

  updateMyProfile(input: Partial<{name: string; department: string; yearOfStudy: string}>) {
    return this.request<UserAccount>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  listClubs(params?: {search?: string; category?: string; sortBy?: string}) {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.category && params.category !== 'All') qs.set('category', params.category);
    if (params?.sortBy) qs.set('sortBy', params.sortBy);
    const query = qs.toString();
    return this.request<Club[]>(`/clubs${query ? `?${query}` : ''}`);
  }

  async listClubsPaginated(params?: {
    search?: string;
    category?: string;
    sortBy?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<Club>> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.category && params.category !== 'All') qs.set('category', params.category);
    if (params?.sortBy) qs.set('sortBy', params.sortBy);
    qs.set('page', String(params?.page ?? 1));
    qs.set('pageSize', String(params?.pageSize ?? 12));
    const {data, meta} = await this.requestWithMeta<Club[]>(`/clubs?${qs.toString()}`);
    const pagination = (meta?.pagination as PaginationMeta) || {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 12,
      total: data.length,
      totalPages: 1,
    };
    return {items: data, pagination};
  }

  getClubDetail(clubId: string) {
    return this.request<ClubDetail>(`/clubs/${encodeURIComponent(clubId)}`);
  }

  updateClub(clubId: string, updates: Partial<Club>) {
    return this.request<Club>(`/clubs/${encodeURIComponent(clubId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

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
  }) {
    return this.request<Club>('/clubs', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  getMyMemberships() {
    return this.request<{memberships: ClubMembership[]; follows: ClubFollow[]}>('/memberships/me');
  }

  getMyFollowedClubs() {
    return this.request<Club[]>('/users/me/followed-clubs');
  }

  followClub(clubId: string) {
    return this.request<ClubFollow>(`/clubs/${encodeURIComponent(clubId)}/follow`, {
      method: 'POST',
    });
  }

  unfollowClub(clubId: string) {
    return this.request<void>(`/clubs/${encodeURIComponent(clubId)}/follow`, {
      method: 'DELETE',
    });
  }

  getClubTeam(clubId: string) {
    return this.request<ClubMembership[]>(`/clubs/${encodeURIComponent(clubId)}/members`);
  }

  upsertClubMember(
    clubId: string,
    input: {
      email?: string;
      userId?: string;
      role: ClubRole;
      title: string;
      permissions: CoreMemberPermission[];
    },
  ) {
    return this.request<ClubMembership>(`/clubs/${encodeURIComponent(clubId)}/members`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateMemberPermissions(
    clubId: string,
    membershipId: string,
    updates: {
      role?: ClubRole;
      title?: string;
      permissions?: CoreMemberPermission[];
    },
  ) {
    return this.request<ClubMembership>(
      `/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(membershipId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      },
    );
  }

  removeClubMember(clubId: string, membershipId: string) {
    return this.request<void>(
      `/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(membershipId)}`,
      {method: 'DELETE'},
    );
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
    return this.request<{
      mode: 'assigned' | 'invited';
      membership?: ClubMembership;
      invitation?: ClubInvitation;
      replacedUserId?: string | null;
    }>(`/admin/clubs/${encodeURIComponent(clubId)}/leadership`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  listClubInvitations(clubId: string) {
    return this.request<ClubInvitation[]>(`/clubs/${encodeURIComponent(clubId)}/invitations`);
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
    return this.request<ClubInvitation>(`/clubs/${encodeURIComponent(clubId)}/invitations`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  resendClubInvitation(clubId: string, invitationId: string) {
    return this.request<ClubInvitation>(
      `/clubs/${encodeURIComponent(clubId)}/invitations/${encodeURIComponent(invitationId)}/resend`,
      {method: 'POST'},
    );
  }

  revokeClubInvitation(clubId: string, invitationId: string) {
    return this.request<ClubInvitation>(
      `/clubs/${encodeURIComponent(clubId)}/invitations/${encodeURIComponent(invitationId)}`,
      {method: 'DELETE'},
    );
  }

  previewInvitation(token: string) {
    return this.request<{
      invitation: ClubInvitation;
      clubName: string;
      clubSlug: string;
      hasExistingAccount: boolean;
    }>(`/invitations/preview?token=${encodeURIComponent(token)}`);
  }

  acceptInvitation(input: {
    token: string;
    name?: string;
    department?: string;
    yearOfStudy?: string;
  }) {
    return this.request<{
      invitation: ClubInvitation;
      membership: ClubMembership;
      user: UserAccount;
    }>('/invitations/accept', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  getHallOfFame() {
    return this.request<HallOfFameEntry[]>('/hall-of-fame');
  }

  listEvents(params?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
  }) {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.category && params.category !== 'All') qs.set('category', params.category);
    if (params?.clubId && params.clubId !== 'All') qs.set('clubId', params.clubId);
    if (params?.status && params.status !== 'All') qs.set('status', params.status);
    if (params?.upcomingOnly) qs.set('upcomingOnly', 'true');
    const query = qs.toString();
    return this.request<EventItem[]>(`/events${query ? `?${query}` : ''}`);
  }

  async listEventsPaginated(params?: {
    search?: string;
    category?: string;
    clubId?: string;
    status?: string;
    upcomingOnly?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<EventItem>> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.category && params.category !== 'All') qs.set('category', params.category);
    if (params?.clubId && params.clubId !== 'All') qs.set('clubId', params.clubId);
    if (params?.status && params.status !== 'All') qs.set('status', params.status);
    if (params?.upcomingOnly) qs.set('upcomingOnly', 'true');
    qs.set('page', String(params?.page ?? 1));
    qs.set('pageSize', String(params?.pageSize ?? 12));
    const {data, meta} = await this.requestWithMeta<EventItem[]>(`/events?${qs.toString()}`);
    const pagination = (meta?.pagination as PaginationMeta) || {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 12,
      total: data.length,
      totalPages: 1,
    };
    return {items: data, pagination};
  }

  getEventDetail(eventId: string) {
    return this.request<EventItem>(`/events/${encodeURIComponent(eventId)}`);
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
    return this.request<EventItem>(`/clubs/${encodeURIComponent(clubId)}/events`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateEvent(eventId: string, updates: Partial<EventItem>) {
    return this.request<EventItem>(`/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  publishEvent(eventId: string) {
    return this.request<EventItem>(`/events/${encodeURIComponent(eventId)}/publish`, {
      method: 'POST',
    });
  }

  transitionEventLifecycle(eventId: string, action: EventLifecycleAction) {
    return this.request<EventItem>(`/events/${encodeURIComponent(eventId)}/${action}`, {
      method: 'POST',
    });
  }

  getEventForm(
    eventId: string,
    optsOrVersion?: number | {version?: number; publishedOnly?: boolean},
  ) {
    const qs = new URLSearchParams();
    if (typeof optsOrVersion === 'number') {
      qs.set('version', String(optsOrVersion));
    } else if (optsOrVersion) {
      if (optsOrVersion.version) qs.set('version', String(optsOrVersion.version));
      if (optsOrVersion.publishedOnly) qs.set('published', 'true');
    }
    const query = qs.toString();
    return this.request<RegistrationForm>(
      `/events/${encodeURIComponent(eventId)}/form${query ? `?${query}` : ''}`,
    );
  }

  saveEventForm(
    eventId: string,
    fields: FormField[],
    meta?: {title?: string; description?: string},
  ) {
    return this.request<RegistrationForm>(`/events/${encodeURIComponent(eventId)}/form`, {
      method: 'PUT',
      body: JSON.stringify({fields, title: meta?.title, description: meta?.description}),
    });
  }

  publishEventForm(eventId: string) {
    return this.request<EventFormVersion>(`/events/${encodeURIComponent(eventId)}/form/publish`, {
      method: 'POST',
    });
  }

  getPublishedFormVersion(eventId: string, version?: number) {
    const query = version ? `?version=${version}` : '?version=1';
    return this.request<EventFormVersion>(`/events/${encodeURIComponent(eventId)}/form${query}`);
  }

  submitRegistration(eventId: string, answers: Record<string, FormAnswerValue>) {
    return this.request<Registration>(`/events/${encodeURIComponent(eventId)}/registrations`, {
      method: 'POST',
      body: JSON.stringify({answers}),
    });
  }

  cancelMyRegistration(eventId: string) {
    return this.request<{
      cancelled: Registration;
      promotedUserId?: string | null;
      promotedRegistrationId?: string | null;
    }>(`/events/${encodeURIComponent(eventId)}/registrations/me`, {
      method: 'DELETE',
    });
  }

  listEventRegistrations(eventId: string) {
    return this.request<Registration[]>(`/events/${encodeURIComponent(eventId)}/registrations`);
  }

  async listEventRegistrationsPaginated(
    eventId: string,
    params?: {page?: number; pageSize?: number; search?: string; status?: string},
  ): Promise<PaginatedResult<Registration>> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    qs.set('page', String(params?.page ?? 1));
    qs.set('pageSize', String(params?.pageSize ?? 25));
    const {data, meta} = await this.requestWithMeta<Registration[]>(
      `/events/${encodeURIComponent(eventId)}/registrations?${qs.toString()}`,
    );
    const pagination = (meta?.pagination as PaginationMeta) || {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 25,
      total: data.length,
      totalPages: 1,
    };
    return {items: data, pagination};
  }

  listMyRegistrations() {
    return this.request<Registration[]>('/registrations/me');
  }

  scanAttendance(
    eventId: string,
    input: {
      qrToken?: string;
      registrationId?: string;
      method: 'qr_scan' | 'manual_override';
      reason?: string;
    },
  ) {
    return this.request<AttendanceRecord>(`/events/${encodeURIComponent(eventId)}/attendance/scan`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  manualAttendance(eventId: string, input: {registrationId: string; reason: string}) {
    return this.request<AttendanceRecord>(`/events/${encodeURIComponent(eventId)}/attendance/manual`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  getEventAttendance(
    eventId: string,
    params?: {page?: number; pageSize?: number; search?: string},
  ) {
    const qs = new URLSearchParams();
    if (params?.page !== undefined) qs.set('page', String(params.page));
    if (params?.pageSize !== undefined) qs.set('pageSize', String(params.pageSize));
    if (params?.search) qs.set('search', params.search);
    const query = qs.toString();
    return this.request<{
      records: AttendanceRecord[];
      registeredCount: number;
      attendedCount: number;
      summary?: AttendanceSummary;
      pagination?: PaginationMeta;
    }>(`/events/${encodeURIComponent(eventId)}/attendance${query ? `?${query}` : ''}`);
  }

  releaseEventTickets(
    eventId: string,
    input?: {confirmParticipantCount?: number; note?: string},
  ) {
    return this.request<TicketReleaseSummary>(
      `/events/${encodeURIComponent(eventId)}/tickets/release`,
      {
        method: 'POST',
        body: JSON.stringify(input ?? {}),
      },
    );
  }

  listEventTickets(eventId: string) {
    return this.request<TicketRecord[]>(`/events/${encodeURIComponent(eventId)}/tickets`);
  }

  listMyTickets() {
    return this.request<TicketRecord[]>('/tickets/me');
  }

  revokeTicket(ticketId: string, reason?: string) {
    return this.request<TicketRecord>(`/tickets/${encodeURIComponent(ticketId)}/revoke`, {
      method: 'POST',
      body: JSON.stringify({reason}),
    });
  }

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
  ) {
    return this.request<EventReport>(`/events/${encodeURIComponent(eventId)}/report`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  getEventReport(eventId: string) {
    return this.request<EventReport | null>(`/events/${encodeURIComponent(eventId)}/report`);
  }

  submitFinancialReport(
    eventId: string,
    input: {lineItems: FinancialLineItem[]; notes: string},
  ) {
    return this.request<FinancialReport>(`/events/${encodeURIComponent(eventId)}/finance-report`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  getFinancialReport(eventId: string) {
    return this.request<FinancialReport | null>(`/events/${encodeURIComponent(eventId)}/finance-report`);
  }

  getClubFinance(clubId: string) {
    return this.request<FinanceSummaryResponse>(`/clubs/${encodeURIComponent(clubId)}/finance`);
  }

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
  ) {
    return this.request<FinanceEntry>(`/clubs/${encodeURIComponent(clubId)}/finance/entries`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  deleteClubFinanceEntry(clubId: string, entryId: string) {
    return this.request<void>(
      `/clubs/${encodeURIComponent(clubId)}/finance/entries/${encodeURIComponent(entryId)}`,
      {method: 'DELETE'},
    );
  }

  getEventFinance(eventId: string) {
    return this.request<FinanceSummaryResponse>(`/events/${encodeURIComponent(eventId)}/finance`);
  }

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
  ) {
    return this.request<FinanceEntry>(`/events/${encodeURIComponent(eventId)}/finance/entries`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  listNotifications() {
    return this.request<NotificationItem[]>('/notifications');
  }

  markNotificationRead(notificationId: string) {
    return this.request<NotificationItem>(
      `/notifications/${encodeURIComponent(notificationId)}/read`,
      {method: 'PATCH'},
    );
  }

  markAllNotificationsRead() {
    return this.request<void>('/notifications/read-all', {method: 'POST'});
  }

  getAdminDashboard() {
    return this.request<AdminDashboardStats>('/admin/dashboard');
  }

  getAdminAnalytics() {
    return this.request<AdminAnalyticsResponse>('/admin/analytics');
  }

  listAdminClubs() {
    return this.request<Club[]>('/admin/clubs');
  }

  listAdminMemberships() {
    return this.request<ClubMembership[]>('/admin/memberships');
  }

  updateClubStatus(clubId: string, status: ClubStatus, reason?: string) {
    return this.request<Club>(`/admin/clubs/${encodeURIComponent(clubId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({status, reason}),
    });
  }

  listAdminUsers() {
    return this.request<UserAccount[]>('/admin/users');
  }

  updateUserStatus(userId: string, status: 'active' | 'suspended', reason?: string) {
    return this.request<UserAccount>(`/admin/users/${encodeURIComponent(userId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({status, reason}),
    });
  }

  listAdminReports() {
    return this.request<EventReport[]>('/admin/reports');
  }

  reviewAdminReport(
    reportId: string,
    input: {
      status: 'under_review' | 'changes_requested' | 'approved' | 'rejected';
      reviewNotes: string;
    },
  ) {
    return this.request<EventReport>(`/admin/reports/${encodeURIComponent(reportId)}/review`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  getAdminFinance() {
    return this.request<{
      reports: FinancialReport[];
      totalCollections: number;
      totalExpenses: number;
      netBalance: number;
      ledgerSummary?: FinanceSummaryResponse;
    }>('/admin/finance');
  }

  async downloadAdminCsv(kind: 'reports' | 'finance'): Promise<{blob: Blob; filename: string}> {
    const headers = new Headers();
    if (this.authToken) {
      headers.set('Authorization', `Bearer ${this.authToken}`);
    }
    const res = await fetch(`${API_PREFIX}/admin/${kind}/export`, {headers});
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      const err = json && !json.success ? json.error : null;
      throw new ApiClientError(
        res.status,
        err?.code || 'EXPORT_FAILED',
        err?.message || `CSV export failed (${res.status})`,
      );
    }
    const cd = res.headers.get('content-disposition') || '';
    const match = cd.match(/filename="?([^"]+)"?/i);
    const filename = match?.[1] || `admin-${kind}.csv`;
    const blob = await res.blob();
    return {blob, filename};
  }

  listAdminAuditLogs() {
    return this.request<AuditLogEntry[]>('/admin/audit-logs');
  }

  getAdminSettings() {
    return this.request<SystemSettings>('/admin/settings');
  }

  updateAdminSettings(updates: Partial<SystemSettings>) {
    return this.request<SystemSettings>('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }
}

export const apiClient = new ApiDataAdapter();
