import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {createClient} from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {inArray, sql} from 'drizzle-orm';
import {createDbPool} from './index.ts';
import {
  attendanceRecords,
  auditLogs,
  clubFollows,
  clubMemberships,
  clubs,
  eventForms,
  eventFormVersions,
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
} from './schema.ts';
import {sealTicketToken} from '../shared/utils/crypto.ts';
import type {CoreMemberPermission} from '../../shared/constants/permissions.ts';

dotenv.config();

interface TestIdentitySpec {
  id: string;
  authUserId: string;
  email: string;
  name: string;
  department: string;
  yearOfStudy: string;
  studentId: string;
  globalRole: 'user' | 'super_admin';
  roleSummary: string;
}

const TEST_USERS: TestIdentitySpec[] = [
  {
    id: '90000000-0000-4000-8000-000000000001',
    authUserId: '91000000-0000-4000-8000-000000000001',
    email: 'superadmin.test@campusverse.test',
    name: 'Test Super Admin',
    department: 'Institutional Affairs',
    yearOfStudy: 'Administration',
    studentId: 'TEST-ADMIN-01',
    globalRole: 'super_admin',
    roleSummary: 'Institution-wide Super Admin',
  },
  {
    id: '90000000-0000-4000-8000-000000000002',
    authUserId: '91000000-0000-4000-8000-000000000002',
    email: 'student.test@campusverse.test',
    name: 'Test Student Basic',
    department: 'Computer Science & Engineering',
    yearOfStudy: 'Year 2',
    studentId: 'TEST-STU-01',
    globalRole: 'user',
    roleSummary: 'Student with no club role',
  },
  {
    id: '90000000-0000-4000-8000-000000000003',
    authUserId: '91000000-0000-4000-8000-000000000003',
    email: 'president.cluba.test@campusverse.test',
    name: 'Test President Club A',
    department: 'Mechanical Engineering',
    yearOfStudy: 'Year 4',
    studentId: 'TEST-PRES-A',
    globalRole: 'user',
    roleSummary: 'President of Test Club A (Robotics)',
  },
  {
    id: '90000000-0000-4000-8000-000000000004',
    authUserId: '91000000-0000-4000-8000-000000000004',
    email: 'vicepresident.cluba.test@campusverse.test',
    name: 'Test Vice President Club A',
    department: 'Electronics Engineering',
    yearOfStudy: 'Year 3',
    studentId: 'TEST-VP-A',
    globalRole: 'user',
    roleSummary: 'Vice President of Test Club A (Robotics)',
  },
  {
    id: '90000000-0000-4000-8000-000000000005',
    authUserId: '91000000-0000-4000-8000-000000000005',
    email: 'core.scanner.cluba.test@campusverse.test',
    name: 'Test Core Scanner Club A',
    department: 'Computer Science & Engineering',
    yearOfStudy: 'Year 3',
    studentId: 'TEST-CORE-SCAN',
    globalRole: 'user',
    roleSummary: 'Core Member of Test Club A with SCAN_ATTENDANCE & VIEW_REGISTRATIONS',
  },
  {
    id: '90000000-0000-4000-8000-000000000006',
    authUserId: '91000000-0000-4000-8000-000000000006',
    email: 'core.noscanner.cluba.test@campusverse.test',
    name: 'Test Core No-Scanner Club A',
    department: 'Design',
    yearOfStudy: 'Year 2',
    studentId: 'TEST-CORE-NOSCAN',
    globalRole: 'user',
    roleSummary: 'Core Member of Test Club A with MANAGE_FORMS only (no SCAN_ATTENDANCE)',
  },
  {
    id: '90000000-0000-4000-8000-000000000007',
    authUserId: '91000000-0000-4000-8000-000000000007',
    email: 'president.clubb.test@campusverse.test',
    name: 'Test President Club B',
    department: 'Architecture & Design',
    yearOfStudy: 'Year 4',
    studentId: 'TEST-PRES-B',
    globalRole: 'user',
    roleSummary: 'President of Test Club B (Design)',
  },
  {
    id: '90000000-0000-4000-8000-000000000008',
    authUserId: '91000000-0000-4000-8000-000000000008',
    email: 'multirole.test@campusverse.test',
    name: 'Test Multi-Role Student',
    department: 'Computer Science & Engineering',
    yearOfStudy: 'Year 3',
    studentId: 'TEST-MULTI-01',
    globalRole: 'user',
    roleSummary:
      'Student + President of Test Club C (Innovation) + Core Member of Test Club B (VIEW_REGISTRATIONS)',
  },
  {
    id: '90000000-0000-4000-8000-000000000009',
    authUserId: '91000000-0000-4000-8000-000000000009',
    email: 'participant.released.test@campusverse.test',
    name: 'Test Participant Released',
    department: 'Computer Science & Engineering',
    yearOfStudy: 'Year 2',
    studentId: 'TEST-PART-REL',
    globalRole: 'user',
    roleSummary: 'Registered participant with released QR ticket',
  },
  {
    id: '90000000-0000-4000-8000-000000000010',
    authUserId: '91000000-0000-4000-8000-000000000010',
    email: 'participant.pending.test@campusverse.test',
    name: 'Test Participant Pending Ticket',
    department: 'Mechanical Engineering',
    yearOfStudy: 'Year 1',
    studentId: 'TEST-PART-PEND',
    globalRole: 'user',
    roleSummary: 'Registered participant whose ticket has not yet been released',
  },
];

const TEST_CLUBS = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    name: 'Test Club A — Rover Systems Guild',
    slug: 'test-club-a-rover-systems',
    category: 'Robotics & Hardware',
    tagline: 'Test fixture club for rover prototyping and autonomous navigation sprints.',
    description:
      'Isolated non-production test club A used for Phase 5 verification of leadership, ticket release, QR verification, reports, and integer-paise finance.',
    meetingSchedule: 'Wednesdays · 17:30 · Hangar Test Bay',
    contactEmail: 'cluba.test@campusverse.test',
    instagramUrl: 'https://www.instagram.com/testcluba_rover/',
    status: 'active',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    name: 'Test Club B — Civic Design Studio',
    slug: 'test-club-b-civic-design',
    category: 'Design',
    tagline: 'Test fixture club for design systems, print critiques, and cross-club isolation.',
    description:
      'Isolated non-production test club B used to verify cross-club isolation, multi-role core permissions, and independent finance ledgers.',
    meetingSchedule: 'Thursdays · 18:00 · Studio Annex T2',
    contactEmail: 'clubb.test@campusverse.test',
    instagramUrl: 'https://www.instagram.com/testclubb_design/',
    status: 'active',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    name: 'Test Club C — Innovation Foundry',
    slug: 'test-club-c-innovation-foundry',
    category: 'Entrepreneurship',
    tagline: 'Test fixture club for multi-role leadership and draft event workflows.',
    description:
      'Isolated non-production test club C led by multirole.test to exercise multi-club context switching alongside persistent Student identity.',
    meetingSchedule: 'Fridays · 17:00 · Incubation Lab T3',
    contactEmail: 'clubc.test@campusverse.test',
    instagramUrl: 'https://www.instagram.com/testclubc_foundry/',
    status: 'active',
  },
] as const;

const TEST_EVENTS = [
  {
    id: 'b0000000-0000-4000-8000-000000000001',
    clubId: TEST_CLUBS[0].id,
    title: 'Test Event A1 — Released Tickets & Gate Check-In',
    slug: 'test-event-a1-released-tickets',
    category: 'Workshop',
    description:
      'Active test event with published registration form and batch-released tickets ready for QR gate scanning verification.',
    venue: 'Test Hangar Bay 1',
    startsAt: new Date(Date.now() + 7 * 86_400_000),
    endsAt: new Date(Date.now() + 7 * 86_400_000 + 3 * 3_600_000),
    registrationOpensAt: new Date(Date.now() - 2 * 86_400_000),
    registrationDeadline: new Date(Date.now() + 6 * 86_400_000),
    capacity: 60,
    isPaid: false,
    feeMinorUnits: 0,
    status: 'registration_open',
    ticketsReleasedAt: new Date(),
    ticketsReleasedBy: TEST_USERS[2].id,
  },
  {
    id: 'b0000000-0000-4000-8000-000000000002',
    clubId: TEST_CLUBS[0].id,
    title: 'Test Event A2 — Pending Ticket Release',
    slug: 'test-event-a2-pending-tickets',
    category: 'Hackathon',
    description:
      'Active test event where participant registrations are confirmed in PostgreSQL while tickets remain not_released awaiting organizer release.',
    venue: 'Test Hangar Bay 2',
    startsAt: new Date(Date.now() + 14 * 86_400_000),
    endsAt: new Date(Date.now() + 14 * 86_400_000 + 5 * 3_600_000),
    registrationOpensAt: new Date(Date.now() - 86_400_000),
    registrationDeadline: new Date(Date.now() + 12 * 86_400_000),
    capacity: 80,
    isPaid: true,
    feeMinorUnits: 15000,
    status: 'registration_open',
    ticketsReleasedAt: null,
    ticketsReleasedBy: null,
  },
  {
    id: 'b0000000-0000-4000-8000-000000000003',
    clubId: TEST_CLUBS[0].id,
    title: 'Test Event A3 — Completed With Report & Finance',
    slug: 'test-event-a3-completed',
    category: 'Seminar',
    description:
      'Completed test event with recorded attendance, submitted post-event completion report, and reconciled integer-paise financial entries.',
    venue: 'Main Auditorium Test',
    startsAt: new Date(Date.now() - 5 * 86_400_000),
    endsAt: new Date(Date.now() - 5 * 86_400_000 + 2 * 3_600_000),
    registrationOpensAt: new Date(Date.now() - 15 * 86_400_000),
    registrationDeadline: new Date(Date.now() - 6 * 86_400_000),
    capacity: 100,
    isPaid: false,
    feeMinorUnits: 0,
    status: 'completed',
    ticketsReleasedAt: new Date(Date.now() - 6 * 86_400_000),
    ticketsReleasedBy: TEST_USERS[2].id,
  },
  {
    id: 'b0000000-0000-4000-8000-000000000004',
    clubId: TEST_CLUBS[1].id,
    title: 'Test Event B1 — Draft Form Isolation Check',
    slug: 'test-event-b1-draft-form',
    category: 'Workshop',
    description:
      'Published Club B event with an unpublished draft form to test FORM_NOT_PUBLISHED protection and cross-club isolation.',
    venue: 'Studio Annex Test',
    startsAt: new Date(Date.now() + 10 * 86_400_000),
    endsAt: new Date(Date.now() + 10 * 86_400_000 + 2 * 3_600_000),
    registrationOpensAt: new Date(Date.now() - 86_400_000),
    registrationDeadline: new Date(Date.now() + 9 * 86_400_000),
    capacity: 40,
    isPaid: false,
    feeMinorUnits: 0,
    status: 'published',
    ticketsReleasedAt: null,
    ticketsReleasedBy: null,
  },
] as const;

const TEST_FORMS = [
  {
    id: 'c0000000-0000-4000-8000-000000000001',
    eventId: TEST_EVENTS[0].id,
    status: 'published' as const,
    publishedVersion: 1,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000002',
    eventId: TEST_EVENTS[1].id,
    status: 'published' as const,
    publishedVersion: 1,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000003',
    eventId: TEST_EVENTS[2].id,
    status: 'published' as const,
    publishedVersion: 1,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000004',
    eventId: TEST_EVENTS[3].id,
    status: 'draft' as const,
    publishedVersion: 0,
  },
];

const TEST_REGISTRATIONS = {
  released: 'd0000000-0000-4000-8000-000000000001',
  pending: 'd0000000-0000-4000-8000-000000000002',
  attended: 'd0000000-0000-4000-8000-000000000003',
};

const TEST_TICKETS = {
  released: 'e0000000-0000-4000-8000-000000000001',
  pending: 'e0000000-0000-4000-8000-000000000002',
  attended: 'e0000000-0000-4000-8000-000000000003',
};

function generateStrongPassword(): string {
  return `${crypto.randomBytes(16).toString('base64url')}!A9x`;
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function provisionSupabaseAuthUsers(reset: boolean): Promise<{
  mode: 'provisioned' | 'skipped';
  credentialsPath?: string;
  reason?: string;
}> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      mode: 'skipped',
      reason:
        'SUPABASE_SERVICE_ROLE_KEY is not configured; skipped Supabase Auth user creation while PostgreSQL test records remain seeded.',
    };
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {autoRefreshToken: false, persistSession: false},
  });

  const existingUsersByEmail = new Map<string, string>();
  let page = 1;
  while (true) {
    const {data, error} = await supabaseAdmin.auth.admin.listUsers({page, perPage: 200});
    if (error) {
      throw new Error(`Supabase Admin listUsers failed: ${error.message}`);
    }
    for (const u of data.users) {
      if (u.email) {
        existingUsersByEmail.set(u.email.toLowerCase(), u.id);
      }
    }
    if (data.users.length < 200) break;
    page += 1;
  }

  if (reset) {
    for (const spec of TEST_USERS) {
      const existingAuthId = existingUsersByEmail.get(spec.email.toLowerCase());
      if (existingAuthId) {
        await supabaseAdmin.auth.admin.deleteUser(existingAuthId);
        existingUsersByEmail.delete(spec.email.toLowerCase());
      }
    }
    const secretsFile = path.resolve(process.cwd(), '.secrets', 'test-credentials.json');
    if (fs.existsSync(secretsFile)) {
      fs.unlinkSync(secretsFile);
    }
    return {mode: 'provisioned'};
  }

  const credentialsOutput: Array<{
    email: string;
    password: string;
    role: string;
    userId: string;
    authUserId: string;
    nonProduction: true;
  }> = [];

  for (const spec of TEST_USERS) {
    const password = generateStrongPassword();
    const existingAuthId = existingUsersByEmail.get(spec.email.toLowerCase());
    if (existingAuthId) {
      const {data, error} = await supabaseAdmin.auth.admin.updateUserById(existingAuthId, {
        password,
        email_confirm: true,
        user_metadata: {
          name: spec.name,
          non_production_test_account: true,
          role_summary: spec.roleSummary,
        },
      });
      if (error || !data.user) {
        throw new Error(`Failed updating Supabase test user ${spec.email}: ${error?.message}`);
      }
      spec.authUserId = data.user.id;
    } else {
      const {data, error} = await supabaseAdmin.auth.admin.createUser({
        email: spec.email,
        password,
        email_confirm: true,
        user_metadata: {
          name: spec.name,
          non_production_test_account: true,
          role_summary: spec.roleSummary,
        },
      });
      if (error || !data.user) {
        throw new Error(`Failed creating Supabase test user ${spec.email}: ${error?.message}`);
      }
      spec.authUserId = data.user.id;
    }

    credentialsOutput.push({
      email: spec.email,
      password,
      role: spec.roleSummary,
      userId: spec.id,
      authUserId: spec.authUserId,
      nonProduction: true,
    });
  }

  const secretsDir = path.resolve(process.cwd(), '.secrets');
  fs.mkdirSync(secretsDir, {recursive: true, mode: 0o700});
  const credentialsPath = path.join(secretsDir, 'test-credentials.json');
  fs.writeFileSync(
    credentialsPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        note: 'Non-production local/staging test credentials only. Never commit this file.',
        accounts: credentialsOutput,
      },
      null,
      2,
    ),
    {mode: 0o600},
  );

  return {mode: 'provisioned', credentialsPath};
}

async function resetTestDatabaseRecords(url: string): Promise<void> {
  const {client, db} = createDbPool(url, 2);
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_user_id', '', true), set_config('app.current_global_role', 'system_seed', true)`,
      );

      const testClubIds = TEST_CLUBS.map((c) => c.id);
      const testEventIds = TEST_EVENTS.map((e) => e.id);
      const testUserIds = TEST_USERS.map((u) => u.id);

      await tx.delete(tickets).where(inArray(tickets.eventId, testEventIds));
      await tx.delete(attendanceRecords).where(inArray(attendanceRecords.eventId, testEventIds));
      await tx.delete(registrations).where(inArray(registrations.eventId, testEventIds));
      await tx.delete(eventReports).where(inArray(eventReports.eventId, testEventIds));
      await tx.delete(financeEntries).where(inArray(financeEntries.clubId, testClubIds));
      await tx.delete(financeReports).where(inArray(financeReports.eventId, testEventIds));
      await tx.delete(eventFormVersions).where(inArray(eventFormVersions.eventId, testEventIds));
      await tx.delete(eventForms).where(inArray(eventForms.eventId, testEventIds));
      await tx.delete(events).where(inArray(events.id, testEventIds));
      await tx.delete(clubFollows).where(inArray(clubFollows.userId, testUserIds));
      await tx.delete(clubMemberships).where(inArray(clubMemberships.clubId, testClubIds));
      await tx.delete(notifications).where(inArray(notifications.userId, testUserIds));
      await tx.delete(clubs).where(inArray(clubs.id, testClubIds));
      await tx.delete(users).where(inArray(users.id, testUserIds));
    });
  } finally {
    await client.end({timeout: 5});
  }
}

async function seedTestDatabaseRecords(url: string): Promise<void> {
  const {client, db} = createDbPool(url, 2);
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_user_id', '', true), set_config('app.current_global_role', 'system_seed', true)`,
      );

      // 1. Test users (no passwords stored in PostgreSQL)
      for (const spec of TEST_USERS) {
        await tx
          .insert(users)
          .values({
            id: spec.id,
            authUserId: spec.authUserId,
            email: spec.email,
            normalizedEmail: spec.email.toLowerCase(),
            displayName: spec.name,
            department: spec.department,
            yearOfStudy: spec.yearOfStudy,
            studentId: spec.studentId,
            globalRole: spec.globalRole,
            accountStatus: 'active',
            emailVerifiedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: users.id,
            set: {
              authUserId: spec.authUserId,
              displayName: spec.name,
              department: spec.department,
              yearOfStudy: spec.yearOfStudy,
              globalRole: spec.globalRole,
              accountStatus: 'active',
              updatedAt: new Date(),
            },
          });
      }

      // 2. Test clubs
      for (const club of TEST_CLUBS) {
        await tx
          .insert(clubs)
          .values({
            id: club.id,
            name: club.name,
            slug: club.slug,
            category: club.category,
            tagline: club.tagline,
            description: club.description,
            meetingSchedule: club.meetingSchedule,
            contactEmail: club.contactEmail,
            instagramUrl: club.instagramUrl,
            status: club.status,
            foundedYear: 2024,
            followerCount: 0,
            createdBy: TEST_USERS[0].id,
          })
          .onConflictDoUpdate({
            target: clubs.id,
            set: {
              name: club.name,
              tagline: club.tagline,
              description: club.description,
              instagramUrl: club.instagramUrl,
              status: club.status,
              updatedAt: new Date(),
            },
          });
      }

      // 3. Memberships & scoped permissions
      const membershipSpecs: Array<{
        userId: string;
        clubId: string;
        membershipRole: 'president' | 'vice_president' | 'core_member';
        title: string;
        permissions: CoreMemberPermission[];
      }> = [
        {
          userId: TEST_USERS[2].id,
          clubId: TEST_CLUBS[0].id,
          membershipRole: 'president',
          title: 'Club President',
          permissions: [
            'MANAGE_EVENTS',
            'MANAGE_FORMS',
            'VIEW_REGISTRATIONS',
            'SCAN_ATTENDANCE',
            'SUBMIT_EVENT_REPORTS',
            'SUBMIT_FINANCE_REPORTS',
          ],
        },
        {
          userId: TEST_USERS[3].id,
          clubId: TEST_CLUBS[0].id,
          membershipRole: 'vice_president',
          title: 'Vice President',
          permissions: [
            'MANAGE_EVENTS',
            'MANAGE_FORMS',
            'VIEW_REGISTRATIONS',
            'SCAN_ATTENDANCE',
            'SUBMIT_EVENT_REPORTS',
            'SUBMIT_FINANCE_REPORTS',
          ],
        },
        {
          userId: TEST_USERS[4].id,
          clubId: TEST_CLUBS[0].id,
          membershipRole: 'core_member',
          title: 'Gate Operations Lead',
          permissions: ['SCAN_ATTENDANCE', 'VIEW_REGISTRATIONS'],
        },
        {
          userId: TEST_USERS[5].id,
          clubId: TEST_CLUBS[0].id,
          membershipRole: 'core_member',
          title: 'Registration Forms Coordinator',
          permissions: ['MANAGE_FORMS', 'VIEW_REGISTRATIONS'],
        },
        {
          userId: TEST_USERS[6].id,
          clubId: TEST_CLUBS[1].id,
          membershipRole: 'president',
          title: 'Club President',
          permissions: [
            'MANAGE_EVENTS',
            'MANAGE_FORMS',
            'VIEW_REGISTRATIONS',
            'SCAN_ATTENDANCE',
            'SUBMIT_EVENT_REPORTS',
            'SUBMIT_FINANCE_REPORTS',
          ],
        },
        {
          userId: TEST_USERS[7].id,
          clubId: TEST_CLUBS[2].id,
          membershipRole: 'president',
          title: 'Club President',
          permissions: [
            'MANAGE_EVENTS',
            'MANAGE_FORMS',
            'VIEW_REGISTRATIONS',
            'SCAN_ATTENDANCE',
            'SUBMIT_EVENT_REPORTS',
            'SUBMIT_FINANCE_REPORTS',
          ],
        },
        {
          userId: TEST_USERS[7].id,
          clubId: TEST_CLUBS[1].id,
          membershipRole: 'core_member',
          title: 'Studio Outreach Core Member',
          permissions: ['VIEW_REGISTRATIONS', 'MANAGE_FORMS'],
        },
      ];

      for (const m of membershipSpecs) {
        await tx
          .insert(clubMemberships)
          .values({
            userId: m.userId,
            clubId: m.clubId,
            membershipRole: m.membershipRole,
            title: m.title,
            permissions: m.permissions,
            status: 'active',
            assignedBy: TEST_USERS[0].id,
          })
          .onConflictDoUpdate({
            target: [clubMemberships.userId, clubMemberships.clubId],
            set: {
              membershipRole: m.membershipRole,
              title: m.title,
              permissions: m.permissions,
              status: 'active',
              updatedAt: new Date(),
            },
          });
      }

      // 4. Test club follows (respects max 2 clubs per student)
      const followPairs: Array<[string, string]> = [
        [TEST_USERS[1].id, TEST_CLUBS[0].id],
        [TEST_USERS[7].id, TEST_CLUBS[0].id],
        [TEST_USERS[8].id, TEST_CLUBS[0].id],
        [TEST_USERS[8].id, TEST_CLUBS[1].id],
      ];
      for (const [userId, clubId] of followPairs) {
        await tx
          .insert(clubFollows)
          .values({userId, clubId})
          .onConflictDoNothing({target: [clubFollows.userId, clubFollows.clubId]});
      }

      // 5. Test events & forms (published + unpublished draft)
      for (const ev of TEST_EVENTS) {
        await tx
          .insert(events)
          .values({
            id: ev.id,
            clubId: ev.clubId,
            title: ev.title,
            slug: ev.slug,
            category: ev.category,
            description: ev.description,
            venue: ev.venue,
            startsAt: ev.startsAt,
            endsAt: ev.endsAt,
            registrationOpensAt: ev.registrationOpensAt,
            registrationDeadline: ev.registrationDeadline,
            capacity: ev.capacity,
            registeredCount: 0,
            isPaid: ev.isPaid,
            feeAmount: (ev.feeMinorUnits / 100).toFixed(2),
            feeMinorUnits: ev.feeMinorUnits,
            status: ev.status,
            publishedAt: new Date(),
            ticketsReleasedAt: ev.ticketsReleasedAt,
            ticketsReleasedBy: ev.ticketsReleasedBy,
            createdBy: TEST_USERS[2].id,
          })
          .onConflictDoNothing({target: events.id});
      }

      for (const formSpec of TEST_FORMS) {
        await tx
          .insert(eventForms)
          .values({
            id: formSpec.id,
            eventId: formSpec.eventId,
            version: 1,
            publishedVersion: formSpec.publishedVersion,
            status: formSpec.status,
            title: 'Test Event Registration Form',
            description: 'Phase 5 verification form',
          })
          .onConflictDoNothing({target: eventForms.eventId});

        const fieldsSpec = [
          {
            fieldKey: 'team_or_role',
            label: 'Team / Interest Track',
            fieldType: 'select',
            required: true,
            options: ['Participant', 'Observer', 'Team Lead'],
            sortOrder: 0,
          },
          {
            fieldKey: 'experience_note',
            label: 'Experience Summary',
            fieldType: 'textarea',
            required: false,
            options: [],
            sortOrder: 1,
          },
        ];

        for (const f of fieldsSpec) {
          await tx
            .insert(formFields)
            .values({
              formId: formSpec.id,
              fieldKey: f.fieldKey,
              label: f.label,
              fieldType: f.fieldType,
              required: f.required,
              options: f.options,
              sortOrder: f.sortOrder,
            })
            .onConflictDoNothing({target: [formFields.formId, formFields.fieldKey]});
        }

        if (formSpec.status === 'published') {
          await tx
            .insert(eventFormVersions)
            .values({
              formId: formSpec.id,
              eventId: formSpec.eventId,
              version: 1,
              title: 'Test Event Registration Form',
              description: 'Phase 5 verification form',
              schemaSnapshot: fieldsSpec.map((f) => ({
                id: f.fieldKey,
                label: f.label,
                type: f.fieldType as 'select' | 'textarea',
                required: f.required,
                options: f.options.length > 0 ? f.options : undefined,
              })),
              publishedBy: TEST_USERS[2].id,
            })
            .onConflictDoNothing({
              target: [eventFormVersions.eventId, eventFormVersions.version],
            });
        }
      }

      // 6. Registrations + Released & Unreleased Tickets + Attendance
      const releasedRawToken = `CV-TCK-TESTREL-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      const attendedRawToken = `CV-TCK-TESTATT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      const pendingPlaceholderHash = sha256Hex(`pending:${TEST_REGISTRATIONS.pending}`);

      // Registration 1: Released ticket on Event A1
      await tx
        .insert(registrations)
        .values({
          id: TEST_REGISTRATIONS.released,
          eventId: TEST_EVENTS[0].id,
          userId: TEST_USERS[8].id,
          formVersion: 1,
          status: 'confirmed',
          answers: {team_or_role: 'Participant', experience_note: 'Ready for check-in test'},
          qrToken: `HASH:${sha256Hex(releasedRawToken)}`,
          qrTokenHash: sha256Hex(releasedRawToken),
        })
        .onConflictDoNothing({target: registrations.id});

      await tx
        .insert(tickets)
        .values({
          id: TEST_TICKETS.released,
          registrationId: TEST_REGISTRATIONS.released,
          eventId: TEST_EVENTS[0].id,
          userId: TEST_USERS[8].id,
          ticketCode: 'TCK-TESTA101',
          tokenHash: sha256Hex(releasedRawToken),
          sealedToken: sealTicketToken(releasedRawToken),
          status: 'released',
          releasedBy: TEST_USERS[2].id,
          releasedAt: new Date(),
        })
        .onConflictDoNothing({target: tickets.id});

      // Registration 2: Pending (not_released) ticket on Event A2
      await tx
        .insert(registrations)
        .values({
          id: TEST_REGISTRATIONS.pending,
          eventId: TEST_EVENTS[1].id,
          userId: TEST_USERS[9].id,
          formVersion: 1,
          status: 'confirmed',
          answers: {team_or_role: 'Team Lead', experience_note: 'Awaiting organizer ticket release'},
          qrToken: `PENDING:${TEST_REGISTRATIONS.pending}`,
          qrTokenHash: pendingPlaceholderHash,
        })
        .onConflictDoNothing({target: registrations.id});

      await tx
        .insert(tickets)
        .values({
          id: TEST_TICKETS.pending,
          registrationId: TEST_REGISTRATIONS.pending,
          eventId: TEST_EVENTS[1].id,
          userId: TEST_USERS[9].id,
          ticketCode: 'TCK-TESTA201',
          tokenHash: null,
          sealedToken: null,
          status: 'not_released',
        })
        .onConflictDoNothing({target: tickets.id});

      // Registration 3: Completed event attended registration
      await tx
        .insert(registrations)
        .values({
          id: TEST_REGISTRATIONS.attended,
          eventId: TEST_EVENTS[2].id,
          userId: TEST_USERS[8].id,
          formVersion: 1,
          status: 'attended',
          answers: {team_or_role: 'Participant'},
          qrToken: `HASH:${sha256Hex(attendedRawToken)}`,
          qrTokenHash: sha256Hex(attendedRawToken),
        })
        .onConflictDoNothing({target: registrations.id});

      await tx
        .insert(tickets)
        .values({
          id: TEST_TICKETS.attended,
          registrationId: TEST_REGISTRATIONS.attended,
          eventId: TEST_EVENTS[2].id,
          userId: TEST_USERS[8].id,
          ticketCode: 'TCK-TESTA301',
          tokenHash: sha256Hex(attendedRawToken),
          sealedToken: sealTicketToken(attendedRawToken),
          status: 'released',
          releasedBy: TEST_USERS[2].id,
          releasedAt: new Date(Date.now() - 6 * 86_400_000),
        })
        .onConflictDoNothing({target: tickets.id});

      await tx
        .insert(attendanceRecords)
        .values({
          registrationId: TEST_REGISTRATIONS.attended,
          eventId: TEST_EVENTS[2].id,
          scannedBy: TEST_USERS[4].id,
          scannedByName: TEST_USERS[4].name,
          scanMethod: 'qr_scan',
          scannedAt: new Date(Date.now() - 5 * 86_400_000),
        })
        .onConflictDoNothing({target: attendanceRecords.registrationId});

      // 7. Post-event report for completed Test Event A3
      await tx
        .insert(eventReports)
        .values({
          eventId: TEST_EVENTS[2].id,
          clubId: TEST_CLUBS[0].id,
          summary:
            'Test Event A3 completed smoothly with 100% check-in rate on released QR passes and full hardware lab safety compliance.',
          objectives: 'Validate end-to-end attendance tracking and structured post-event reporting.',
          actualEventDate: new Date(Date.now() - 5 * 86_400_000),
          participationSummary: 'Confirmed participants checked in via Core Member QR scanner.',
          outcomes: 'All technical lab milestones met on schedule.',
          highlights: 'Zero duplicate gate check-ins and prompt participant feedback.',
          challenges: 'None reported',
          feedbackObservations: 'Participants requested a follow-up advanced ROS2 workshop.',
          evidenceUrl: '',
          actualAttendance: 1,
          registeredTotal: 1,
          completionStatus: 'completed',
          status: 'submitted',
          submittedBy: TEST_USERS[2].id,
          submittedByName: TEST_USERS[2].name,
          history: [
            {
              action: 'submitted',
              status: 'submitted',
              actorId: TEST_USERS[2].id,
              actorName: TEST_USERS[2].name,
              actorRole: 'Club President',
              notes: 'Seeded initial report for Super Admin review testing',
              timestamp: new Date().toISOString(),
            },
          ],
          updatedBy: TEST_USERS[2].id,
        })
        .onConflictDoNothing({target: eventReports.eventId});

      // 8. Integer-paise Finance Ledger & Event Reconciliation
      const existingEntries = await tx
        .select({id: financeEntries.id})
        .from(financeEntries)
        .where(inArray(financeEntries.clubId, [TEST_CLUBS[0].id]))
        .limit(1);

      if (existingEntries.length === 0) {
        await tx.insert(financeEntries).values([
          {
            clubId: TEST_CLUBS[0].id,
            eventId: TEST_EVENTS[2].id,
            entryType: 'income',
            sourceOrCategory: 'Institutional Grant',
            description: 'Robotics lab equipment grant for Test Event A3',
            amountMinorUnits: 1250000, // ₹12,500.00
            transactionDate: new Date(Date.now() - 7 * 86_400_000),
            vendorOrRecipient: 'University Student Affairs',
            notes: 'Approved semester test allocation',
            createdBy: TEST_USERS[2].id,
            createdByName: TEST_USERS[2].name,
          },
          {
            clubId: TEST_CLUBS[0].id,
            eventId: TEST_EVENTS[2].id,
            entryType: 'expense',
            sourceOrCategory: 'Hardware Supplies',
            description: 'Sensor kits and soldering consumables',
            amountMinorUnits: 485050, // ₹4,850.50
            transactionDate: new Date(Date.now() - 5 * 86_400_000),
            vendorOrRecipient: 'Bhopal Robotics Components',
            notes: 'Invoice #TEST-INV-01',
            createdBy: TEST_USERS[2].id,
            createdByName: TEST_USERS[2].name,
          },
        ]);
      }

      const [existingReport] = await tx
        .select({id: financeReports.id})
        .from(financeReports)
        .where(inArray(financeReports.eventId, [TEST_EVENTS[2].id]))
        .limit(1);

      if (!existingReport) {
        const [insertedReport] = await tx
          .insert(financeReports)
          .values({
            eventId: TEST_EVENTS[2].id,
            clubId: TEST_CLUBS[0].id,
            totalCollections: '12500.00',
            totalExpenses: '4850.50',
            netBalance: '7649.50',
            totalCollectionsMinorUnits: 1250000,
            totalExpensesMinorUnits: 485050,
            netBalanceMinorUnits: 764950,
            notes: 'Seeded test event reconciliation (integer paise)',
            submittedBy: TEST_USERS[2].id,
            submittedByName: TEST_USERS[2].name,
          })
          .returning();

        await tx.insert(financeLineItems).values([
          {
            financeReportId: insertedReport.id,
            itemType: 'collection',
            category: 'Institutional Grant',
            description: 'Robotics lab equipment grant',
            amount: '12500.00',
          },
          {
            financeReportId: insertedReport.id,
            itemType: 'expense',
            category: 'Hardware Supplies',
            description: 'Sensor kits and consumables',
            amount: '4850.50',
          },
        ]);
      }

      // 9. Audit entry
      await tx.insert(auditLogs).values({
        actorUserId: TEST_USERS[0].id,
        actorName: TEST_USERS[0].name,
        actorContext: 'Test Seed CLI',
        action: 'PHASE5_TEST_ACCOUNTS_SEEDED',
        targetType: 'system',
        targetId: 'test_fixtures',
        targetLabel: 'CampusVerse Phase 5 Test Fixtures',
        metadata: {
          testUsersCount: TEST_USERS.length,
          testClubsCount: TEST_CLUBS.length,
          testEventsCount: TEST_EVENTS.length,
        },
      });
    });
  } finally {
    await client.end({timeout: 5});
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to provision or reset test accounts when NODE_ENV=production.',
    );
  }

  const reset = process.argv.includes('--reset');
  const dbUrl =
    process.env.DATABASE_MIGRATION_URL?.trim() || process.env.DATABASE_URL?.trim() || '';
  if (!dbUrl) {
    throw new Error('DATABASE_MIGRATION_URL or DATABASE_URL is required.');
  }

  if (reset) {
    await resetTestDatabaseRecords(dbUrl);
    const authRes = await provisionSupabaseAuthUsers(true);
    console.log(
      `Test data reset complete. Supabase Auth cleanup: ${authRes.mode}${authRes.reason ? ` (${authRes.reason})` : ''}.`,
    );
    return;
  }

  const authRes = await provisionSupabaseAuthUsers(false);
  await seedTestDatabaseRecords(dbUrl);

  console.log(
    `Phase 5 test fixtures seeded cleanly (${TEST_USERS.length} test accounts, ${TEST_CLUBS.length} clubs, ${TEST_EVENTS.length} events).`,
  );
  if (authRes.mode === 'provisioned' && authRes.credentialsPath) {
    console.log(
      `Generated Supabase Auth test credentials saved to gitignored file: ${path.relative(process.cwd(), authRes.credentialsPath)}`,
    );
  } else if (authRes.reason) {
    console.warn(`Warning: ${authRes.reason}`);
  }
}

main().catch((err) => {
  console.error('Test provisioning failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
