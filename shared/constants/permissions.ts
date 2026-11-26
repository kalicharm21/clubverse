export const MAX_FOLLOWED_CLUBS = 2;
export const MAX_CORE_SCANNERS_PER_CLUB = 4;

export const API_PREFIX = '/api/v1';

export const CLUB_ROLES = ['president', 'vice_president', 'core_member'] as const;
export type ClubRoleValue = (typeof CLUB_ROLES)[number];

export const CLUB_ROLE_LABELS: Record<ClubRoleValue, string> = {
  president: 'President',
  vice_president: 'Vice President',
  core_member: 'Core Member',
};

export function isClubOfficerRole(role: string | undefined | null): boolean {
  return role === 'president' || role === 'vice_president';
}

export const CORE_MEMBER_PERMISSIONS = [
  'MANAGE_EVENTS',
  'MANAGE_FORMS',
  'VIEW_REGISTRATIONS',
  'SCAN_ATTENDANCE',
  'SUBMIT_EVENT_REPORTS',
  'SUBMIT_FINANCE_REPORTS',
] as const;

export type CoreMemberPermission = (typeof CORE_MEMBER_PERMISSIONS)[number];

export function normalizePermissionInput(value: string): CoreMemberPermission | null {
  const trimmed = value.trim();
  if (trimmed === 'can_scan_qr') return 'SCAN_ATTENDANCE';
  if ((CORE_MEMBER_PERMISSIONS as readonly string[]).includes(trimmed)) {
    return trimmed as CoreMemberPermission;
  }
  return null;
}

export const PERMISSION_LABELS: Record<CoreMemberPermission, string> = {
  MANAGE_EVENTS: 'Manage Events',
  MANAGE_FORMS: 'Manage Forms',
  VIEW_REGISTRATIONS: 'View Registrations',
  SCAN_ATTENDANCE: 'Scan Attendance QR',
  SUBMIT_EVENT_REPORTS: 'Submit Event Reports',
  SUBMIT_FINANCE_REPORTS: 'Submit Financial Reports',
};

export const FORM_FIELD_TYPES = [
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'select',
  'radio',
  'checkboxes',
  'checkbox',
  'url',
] as const;

export type FormFieldTypeValue = (typeof FORM_FIELD_TYPES)[number];

export const EVENT_STATUSES = [
  'draft',
  'published',
  'registration_open',
  'registration_closed',
  'completed',
  'cancelled',
] as const;

export const CLUB_CATEGORIES = [
  'Technology',
  'Design',
  'Music & Arts',
  'Debate & Literary',
  'Robotics & Hardware',
  'Entrepreneurship',
  'Social Impact',
  'Sports & Athletics',
] as const;

export type ClubCategory = (typeof CLUB_CATEGORIES)[number];

export const EVENT_CATEGORIES = [
  'Hackathon',
  'Workshop',
  'Seminar',
  'Competition',
  'Cultural',
  'Networking',
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
