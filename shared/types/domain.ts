import type {
  ClubCategory,
  CoreMemberPermission,
  EventCategory,
  FormFieldTypeValue,
} from '../constants/permissions.ts';
export type {CoreMemberPermission, ClubCategory, EventCategory};

export type AccountStatus = 'active' | 'suspended' | 'pending_verification';
export type ClubStatus = 'active' | 'inactive' | 'suspended' | 'pending_review';
export type ClubRole = 'president' | 'vice_president' | 'core_member';
export type EventStatus =
  | 'draft'
  | 'published'
  | 'registration_open'
  | 'registration_closed'
  | 'completed'
  | 'cancelled';
export type RegistrationStatus = 'pending' | 'confirmed' | 'waitlisted' | 'cancelled' | 'attended';
export type TicketStatus = 'not_released' | 'released' | 'revoked';
export type EventReportStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'changes_requested'
  | 'approved'
  | 'rejected';
export type FinanceEntryType = 'income' | 'expense';
export type FormFieldType = FormFieldTypeValue;
export type FormAnswerValue = string | boolean | number | string[];
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';
export type LeadershipAssignmentState =
  | 'not_assigned'
  | 'pending'
  | 'accepted'
  | 'active'
  | 'expired'
  | 'revoked';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  department: string;
  yearOfStudy: string;
  studentId: string;
  isSuperAdmin: boolean;
  status: AccountStatus;
  emailVerified: boolean;
  avatarInitials: string;
  createdAt: string;
}

export interface ClubMembership {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  clubId: string;
  clubName?: string;
  role: ClubRole;
  title: string;
  permissions: CoreMemberPermission[];
  canScanQr?: boolean;
  assignedTasks?: string[];
  joinedAt: string;
}

export interface ClubInvitation {
  id: string;
  clubId: string;
  clubName?: string;
  inviterUserId?: string | null;
  inviterName?: string;
  inviteeEmail: string;
  intendedRole: ClubRole;
  title: string;
  permissions: CoreMemberPermission[];
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  deliveryMode?: 'supabase_admin' | 'test_adapter' | 'smtp';
}

export interface ClubFollow {
  id: string;
  userId: string;
  clubId: string;
  followedAt: string;
}

export interface Club {
  id: string;
  name: string;
  slug: string;
  category: ClubCategory;
  tagline: string;
  description: string;
  logoUrl: string;
  status: ClubStatus;
  followerCount: number;
  memberCount: number;
  upcomingEventsCount: number;
  foundedYear: number;
  meetingSchedule: string;
  contactEmail: string;
  instagramUrl?: string;
  createdAt: string;
}

export interface ClubDetail extends Club {
  team: ClubMembership[];
  upcomingEvents: EventItem[];
  isFollowing?: boolean;
}

export interface HallOfFameEntry {
  rank: number;
  club: Club;
  followerCount: number;
  eventsHosted: number;
  tieCount: number;
}

export interface EventEligibilityRules {
  allowedDomains?: string[];
  allowedDepartments?: string[];
  allowedYears?: string[];
  notes?: string;
}

export interface EventItem {
  id: string;
  clubId: string;
  clubName: string;
  title: string;
  slug?: string;
  category: EventCategory;
  description: string;
  venue: string;
  startTime: string;
  endTime: string;
  registrationOpensAt?: string | null;
  registrationDeadline: string;
  capacity: number;
  registeredCount: number;
  waitlistedCount?: number;
  attendedCount: number;
  status: EventStatus;
  bannerUrl: string;
  isPaid: boolean;
  feeAmount: number;
  feeMinorUnits?: number;
  eligibilityRules?: EventEligibilityRules;
  ticketsReleasedAt?: string | null;
  ticketsReleasedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FormFieldValidationRules {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  patternMessage?: string;
}

export interface FormField {
  id: string;
  label: string;
  description?: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
  validationRules?: FormFieldValidationRules;
}

export interface RegistrationForm {
  id: string;
  eventId: string;
  version: number;
  status?: 'draft' | 'published';
  publishedVersion?: number;
  title?: string;
  description?: string;
  fields: FormField[];
  updatedAt: string;
}

export interface EventFormVersion {
  id: string;
  formId: string;
  eventId: string;
  version: number;
  title: string;
  description: string;
  fields: FormField[];
  publishedBy?: string | null;
  publishedAt: string;
}

export interface QrCredential {
  token: string;
  registrationId: string;
  eventId: string;
  issuedAt: string;
  usedAt: string | null;
}

export interface TicketRecord {
  id: string;
  registrationId: string;
  eventId: string;
  userId: string;
  studentName?: string;
  studentEmail?: string;
  registrationStatus?: RegistrationStatus;
  ticketCode: string;
  status: TicketStatus;
  qrToken?: string;
  releasedBy?: string | null;
  releasedAt?: string | null;
  revokedBy?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketReleaseSummary {
  eventId: string;
  releasedCount: number;
  alreadyReleasedCount: number;
  totalReleased: number;
  eligibleCount: number;
  ticketsReleasedAt: string;
  emailDelivery: 'not_configured' | 'sent' | 'partial';
}

export interface Registration {
  id: string;
  eventId: string;
  eventTitle?: string;
  eventStartTime?: string;
  eventVenue?: string;
  clubId?: string;
  clubName?: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  formVersion?: number;
  formVersionId?: string | null;
  answers: Record<string, FormAnswerValue>;
  status: RegistrationStatus;
  ticketStatus?: TicketStatus;
  ticketCode?: string;
  ticketReleasedAt?: string | null;
  attendanceStatus?: 'present' | 'not_checked_in';
  waitlistPosition?: number | null;
  qrToken: string;
  qrUsedAt: string | null;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  eventId: string;
  registrationId: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  qrToken: string;
  method: 'qr_scan' | 'manual_override';
  manualReason?: string | null;
  checkedInBy: string;
  checkedInAt: string;
}

export interface AttendanceSummary {
  eventId: string;
  confirmedCount: number;
  ticketsReleasedCount: number;
  ticketsNotReleasedCount: number;
  attendedCount: number;
  remainingCount: number;
  attendancePercentage: number;
}

export interface EventReportHistoryEntry {
  action: string;
  status: EventReportStatus;
  actorId: string;
  actorName: string;
  actorRole: string;
  notes?: string;
  timestamp: string;
}

export interface EventReport {
  id: string;
  eventId: string;
  eventTitle: string;
  clubId: string;
  clubName: string;
  submittedBy: string;
  submittedByName: string;
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
  registeredTotal: number;
  completionStatus: 'completed' | 'partial';
  status: EventReportStatus;
  reviewedBy?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string;
  history?: EventReportHistoryEntry[];
  submittedAt: string;
  updatedAt?: string;
}

export interface FinancialLineItem {
  id: string;
  type: 'collection' | 'expense';
  label: string;
  category: string;
  amount: number;
  notes?: string;
}

export interface FinancialReport {
  id: string;
  eventId: string;
  eventTitle: string;
  clubId: string;
  clubName: string;
  submittedBy: string;
  submittedByName: string;
  totalCollections: number;
  totalExpenses: number;
  netBalance: number;
  totalCollectionsMinorUnits?: number;
  totalExpensesMinorUnits?: number;
  netBalanceMinorUnits?: number;
  lineItems: FinancialLineItem[];
  notes: string;
  submittedAt: string;
}

export interface FinanceEntry {
  id: string;
  clubId: string;
  clubName?: string;
  eventId?: string | null;
  eventTitle?: string | null;
  entryType: FinanceEntryType;
  sourceOrCategory: string;
  description: string;
  amountMinorUnits: number;
  amount: number;
  transactionDate: string;
  vendorOrRecipient: string;
  receiptUrl?: string;
  notes?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceClubSummary {
  clubId: string;
  clubName: string;
  totalIncomeMinorUnits: number;
  totalExpensesMinorUnits: number;
  netBalanceMinorUnits: number;
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  entryCount: number;
}

export interface FinanceEventSummary {
  eventId: string;
  eventTitle: string;
  clubId: string;
  clubName: string;
  totalIncomeMinorUnits: number;
  totalExpensesMinorUnits: number;
  netBalanceMinorUnits: number;
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  entryCount: number;
}

export interface FinanceSummaryResponse {
  entries: FinanceEntry[];
  totalIncomeMinorUnits: number;
  totalExpensesMinorUnits: number;
  netBalanceMinorUnits: number;
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  byClub?: FinanceClubSummary[];
  byEvent?: FinanceEventSummary[];
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  category: 'event' | 'club' | 'registration' | 'admin';
  read: boolean;
  link?: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorContext: string;
  action: string;
  targetType: 'club' | 'user' | 'event' | 'report' | 'membership' | 'invitation' | 'system';
  targetId: string;
  targetLabel: string;
  details: string;
  createdAt: string;
}

export interface AuthSessionResponse {
  user: UserAccount;
  memberships: ClubMembership[];
  followedClubIds: string[];
  mode: 'demo' | 'supabase';
}

export interface AdminDashboardStats {
  totalStudents: number;
  totalClubs: number;
  activeClubs: number;
  totalEvents: number;
  upcomingEvents: number;
  completedEvents: number;
  totalRegistrations: number;
  totalAttendance: number;
  pendingReportsCount: number;
  awaitingApprovalReportsCount: number;
  totalCollections: number;
  totalExpenses: number;
  netBalance: number;
  recentAuditLogs: AuditLogEntry[];
}

export interface ClubOverviewItem {
  club: Club;
  presidentName: string | null;
  presidentEmail: string | null;
  vicePresidentName: string | null;
  vicePresidentEmail: string | null;
  activeCoreCount: number;
  totalMembersCount: number;
  upcomingEventsCount: number;
  completedEventsCount: number;
}

export interface EventAnalyticsItem {
  eventId: string;
  title: string;
  clubId: string;
  clubName: string;
  status: EventStatus;
  startTime: string;
  venue: string;
  capacity: number;
  confirmedCount: number;
  waitlistedCount: number;
  ticketsReleasedCount: number;
  ticketsNotReleasedCount: number;
  attendedCount: number;
  attendancePercentage: number;
  reportStatus: EventReportStatus | 'not_submitted';
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
}

export interface AdminAnalyticsResponse {
  clubs: ClubOverviewItem[];
  events: EventAnalyticsItem[];
}

export interface SystemSettings {
  maxClubsPerStudent: number;
  requireClubApproval: boolean;
  allowStudentEventFeedback: boolean;
  phaseLabel: string;
  persistenceMode: 'in_memory_demo' | 'postgres';
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
