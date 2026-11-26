import {
  CORE_MEMBER_PERMISSIONS,
  MAX_CORE_SCANNERS_PER_CLUB,
  isClubOfficerRole,
} from '../../shared/constants/permissions.ts';
import type {
  AdminAnalyticsResponse,
  AdminDashboardStats,
  AttendanceRecord,
  AttendanceSummary,
  AuditLogEntry,
  Club,
  ClubDetail,
  ClubFollow,
  ClubInvitation,
  ClubMembership,
  ClubOverviewItem,
  ClubRole,
  ClubStatus,
  CoreMemberPermission,
  EventAnalyticsItem,
  EventFormVersion,
  EventItem,
  EventReport,
  EventReportHistoryEntry,
  EventReportStatus,
  EventStatus,
  FinanceClubSummary,
  FinanceEntry,
  FinanceEntryType,
  FinanceEventSummary,
  FinanceSummaryResponse,
  FinancialReport,
  FormAnswerValue,
  FormField,
  HallOfFameEntry,
  NotificationItem,
  PaginatedResult,
  Registration,
  RegistrationForm,
  SystemSettings,
  TicketRecord,
  TicketReleaseSummary,
  TicketStatus,
  UserAccount,
} from '../../shared/types/domain.ts';
import {MAX_FOLLOWED_CLUBS} from '../config/constants.ts';
import {env} from '../config/env.ts';
import {invitationMailer} from '../shared/email/invitationMailer.ts';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../shared/errors/AppError.ts';
import {
  generateInvitationToken,
  generateOpaqueQrToken,
  generateTicketCode,
  hashInvitationToken,
  minorUnitsToRupees,
  rupeesToMinorUnits,
  sealTicketToken,
  unsealTicketToken,
} from '../shared/utils/crypto.ts';
import type {DataAdapter, ResolvedAuthContext} from './DataAdapter.ts';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface StoredInvitation extends ClubInvitation {
  tokenHash: string;
  normalizedEmail: string;
}

interface StoredTicket extends TicketRecord {
  tokenHash: string | null;
  sealedToken: string | null;
}

export class DemoDataAdapter implements DataAdapter {
  private users: UserAccount[] = [];
  private clubs: Club[] = [];
  private memberships: ClubMembership[] = [];
  private invitations: StoredInvitation[] = [];
  private follows: ClubFollow[] = [];
  private events: EventItem[] = [];
  private forms: Map<string, RegistrationForm> = new Map();
  private formVersions: EventFormVersion[] = [];
  private registrations: Registration[] = [];
  private tickets: StoredTicket[] = [];
  private attendance: AttendanceRecord[] = [];
  private eventReports: EventReport[] = [];
  private financialReports: FinancialReport[] = [];
  private financeEntries: FinanceEntry[] = [];
  private notifications: NotificationItem[] = [];
  private auditLogs: AuditLogEntry[] = [];
  private settings: SystemSettings = {
    maxClubsPerStudent: MAX_FOLLOWED_CLUBS,
    requireClubApproval: true,
    allowStudentEventFeedback: true,
    phaseLabel: 'Phase 5 — Development Sandbox (In-Memory Demo Adapter)',
    persistenceMode: 'in_memory_demo',
  };

  constructor() {
    this.seed();
  }

  public resetForTests(): void {
    this.users = [];
    this.clubs = [];
    this.memberships = [];
    this.invitations = [];
    this.follows = [];
    this.events = [];
    this.forms.clear();
    this.formVersions = [];
    this.registrations = [];
    this.tickets = [];
    this.attendance = [];
    this.eventReports = [];
    this.financialReports = [];
    this.financeEntries = [];
    this.notifications = [];
    this.auditLogs = [];
    this.seed();
  }

  private seed(): void {
    this.users = [
      {
        id: 'usr-student-1',
        name: 'Aarav Mehta',
        email: 'aarav.mehta@campusverse.edu',
        department: 'Computer Science & Engineering',
        yearOfStudy: 'Junior (Year 3)',
        studentId: 'STU-2024-0412',
        isSuperAdmin: false,
        status: 'active',
        emailVerified: true,
        avatarInitials: 'AM',
        createdAt: '2026-08-15T09:00:00.000Z',
      },
      {
        id: 'usr-club-admin-1',
        name: 'Priya Nair',
        email: 'priya.nair@campusverse.edu',
        department: 'Robotics & Automation',
        yearOfStudy: 'Senior (Year 4)',
        studentId: 'STU-2023-0188',
        isSuperAdmin: false,
        status: 'active',
        emailVerified: true,
        avatarInitials: 'PN',
        createdAt: '2026-08-12T10:00:00.000Z',
      },
      {
        id: 'usr-core-1',
        name: 'Rohan Verma',
        email: 'rohan.verma@campusverse.edu',
        department: 'Electrical Engineering',
        yearOfStudy: 'Junior (Year 3)',
        studentId: 'STU-2024-0295',
        isSuperAdmin: false,
        status: 'active',
        emailVerified: true,
        avatarInitials: 'RV',
        createdAt: '2026-08-18T11:30:00.000Z',
      },
      {
        id: 'usr-multi-1',
        name: 'Sneha Kulkarni',
        email: 'sneha.kulkarni@campusverse.edu',
        department: 'Visual Communication & Design',
        yearOfStudy: 'Senior (Year 4)',
        studentId: 'STU-2023-0074',
        isSuperAdmin: false,
        status: 'active',
        emailVerified: true,
        avatarInitials: 'SK',
        createdAt: '2026-08-10T08:15:00.000Z',
      },
      {
        id: 'usr-student-2',
        name: 'Kabir Rao',
        email: 'kabir.rao@campusverse.edu',
        department: 'Mechanical Engineering',
        yearOfStudy: 'Sophomore (Year 2)',
        studentId: 'STU-2025-0633',
        isSuperAdmin: false,
        status: 'active',
        emailVerified: true,
        avatarInitials: 'KR',
        createdAt: '2026-09-01T14:20:00.000Z',
      },
      {
        id: 'usr-super-admin',
        name: 'Dr. Elena Vance',
        email: 'elena.vance@campusverse.edu',
        department: 'Office of Student Affairs',
        yearOfStudy: 'Dean of Campus Life',
        studentId: 'FAC-2019-0004',
        isSuperAdmin: true,
        status: 'active',
        emailVerified: true,
        avatarInitials: 'EV',
        createdAt: '2026-07-01T08:00:00.000Z',
      },
    ];

    this.clubs = [
      {
        id: 'club-robotics',
        name: 'Apex Robotics Lab',
        slug: 'apex-robotics-lab',
        category: 'Robotics & Hardware',
        tagline: 'Autonomous rovers, embedded firmware, and combat robotics engineering.',
        description:
          'Apex Robotics Lab brings together mechanical, electrical, and software students to design autonomous navigation platforms, custom PCBs, and inter-university competition robots.',
        logoUrl: '/src/assets/images/club_robotics_emblem_1795447591960.jpg',
        status: 'active',
        followerCount: 342,
        memberCount: 28,
        upcomingEventsCount: 2,
        foundedYear: 2018,
        meetingSchedule: 'Wednesdays & Saturdays · 17:30 · Innovation Hangar B2',
        contactEmail: 'robotics@campusverse.edu',
        instagramUrl: 'https://www.instagram.com/apexrobotics.campusverse/',
        createdAt: '2026-08-01T09:00:00.000Z',
      },
      {
        id: 'club-design',
        name: 'Atelier Design Guild',
        slug: 'atelier-design-guild',
        category: 'Design',
        tagline: 'Product design critiques, typography labs, and campus editorial systems.',
        description:
          'Atelier Design Guild fosters multidisciplinary visual craft across UI systems, industrial product prototyping, print publication design, and weekly portfolio critiques.',
        logoUrl: '/src/assets/images/club_design_emblem_1795447591826.jpg',
        status: 'active',
        followerCount: 289,
        memberCount: 22,
        upcomingEventsCount: 2,
        foundedYear: 2020,
        meetingSchedule: 'Thursdays · 18:00 · Studio Annex 104',
        contactEmail: 'atelier@campusverse.edu',
        createdAt: '2026-08-02T09:00:00.000Z',
      },
      {
        id: 'club-music',
        name: 'Resonance Acoustic Society',
        slug: 'resonance-acoustic-society',
        category: 'Music & Arts',
        tagline: 'Live acoustic sessions, studio production, and campus concert engineering.',
        description:
          'Resonance Acoustic Society runs the campus recording booth, hosts unplugged quad evenings, and trains students in live sound mixing and arrangement.',
        logoUrl: '/src/assets/images/club_music_emblem_1795447592008.jpg',
        status: 'active',
        followerCount: 289,
        memberCount: 31,
        upcomingEventsCount: 1,
        foundedYear: 2016,
        meetingSchedule: 'Fridays · 18:30 · Performing Arts Hall',
        contactEmail: 'resonance@campusverse.edu',
        createdAt: '2026-08-03T09:00:00.000Z',
      },
      {
        id: 'club-quantum',
        name: 'Quantum Computing Circle',
        slug: 'quantum-computing-circle',
        category: 'Technology',
        tagline: 'Systems algorithms, cloud architecture, and open-source engineering.',
        description:
          'A technical guild dedicated to distributed systems, applied algorithms, security CTFs, and mentoring freshmen through their first production open-source pull requests.',
        logoUrl: '',
        status: 'active',
        followerCount: 245,
        memberCount: 19,
        upcomingEventsCount: 2,
        foundedYear: 2021,
        meetingSchedule: 'Tuesdays · 17:00 · Turing Auditorium 301',
        contactEmail: 'quantum@campusverse.edu',
        createdAt: '2026-08-04T09:00:00.000Z',
      },
      {
        id: 'club-debate',
        name: 'Civic Debate Forum',
        slug: 'civic-debate-forum',
        category: 'Debate & Literary',
        tagline: 'British Parliamentary debate, policy briefs, and public rhetoric.',
        description:
          'Civic Debate Forum prepares varsity parliamentary teams for regional tournaments and hosts campus-wide town halls on technology policy and civic ethics.',
        logoUrl: '',
        status: 'active',
        followerCount: 198,
        memberCount: 16,
        upcomingEventsCount: 1,
        foundedYear: 2015,
        meetingSchedule: 'Mondays · 18:00 · Humanities Seminar 202',
        contactEmail: 'debate@campusverse.edu',
        createdAt: '2026-08-05T09:00:00.000Z',
      },
      {
        id: 'club-venture',
        name: 'Venture Foundry',
        slug: 'venture-foundry',
        category: 'Entrepreneurship',
        tagline: 'Student founder cohorts, product teardowns, and demo day showcases.',
        description:
          'Venture Foundry connects technical builders and business students with alumni founders for structured 8-week product sprints and customer discovery clinics.',
        logoUrl: '',
        status: 'active',
        followerCount: 176,
        memberCount: 15,
        upcomingEventsCount: 1,
        foundedYear: 2022,
        meetingSchedule: 'Wednesdays · 19:00 · Incubation Commons',
        contactEmail: 'foundry@campusverse.edu',
        createdAt: '2026-08-06T09:00:00.000Z',
      },
      {
        id: 'club-green',
        name: 'GreenCampus Collective',
        slug: 'greencampus-collective',
        category: 'Social Impact',
        tagline: 'Campus zero-waste audits, solar microgrids, and community outreach.',
        description:
          'Students working directly with facilities engineering to audit energy consumption, manage campus composting, and run annual sustainability summits.',
        logoUrl: '',
        status: 'active',
        followerCount: 134,
        memberCount: 24,
        upcomingEventsCount: 0,
        foundedYear: 2019,
        meetingSchedule: 'Saturdays · 10:00 · Botanical Pavilion',
        contactEmail: 'green@campusverse.edu',
        createdAt: '2026-08-07T09:00:00.000Z',
      },
      {
        id: 'club-athletics',
        name: 'Trailblazers Athletics',
        slug: 'trailblazers-athletics',
        category: 'Sports & Athletics',
        tagline: 'Endurance running, intramural leagues, and alpine trekking.',
        description:
          'Trailblazers organizes dawn track intervals, inter-departmental futsal tournaments, and weekend guided trail expeditions.',
        logoUrl: '',
        status: 'pending_review',
        followerCount: 92,
        memberCount: 12,
        upcomingEventsCount: 0,
        foundedYear: 2024,
        meetingSchedule: 'Tuesdays & Fridays · 06:30 · North Track Field',
        contactEmail: 'trailblazers@campusverse.edu',
        createdAt: '2026-09-10T09:00:00.000Z',
      },
    ];

    this.memberships = [
      {
        id: 'mem-1',
        userId: 'usr-club-admin-1',
        userName: 'Priya Nair',
        userEmail: 'priya.nair@campusverse.edu',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        role: 'president',
        title: 'Club President',
        permissions: [
          'MANAGE_EVENTS',
          'MANAGE_FORMS',
          'VIEW_REGISTRATIONS',
          'SCAN_ATTENDANCE',
          'SUBMIT_EVENT_REPORTS',
          'SUBMIT_FINANCE_REPORTS',
        ],
        canScanQr: true,
        joinedAt: '2026-08-12T10:00:00.000Z',
      },
      {
        id: 'mem-2',
        userId: 'usr-core-1',
        userName: 'Rohan Verma',
        userEmail: 'rohan.verma@campusverse.edu',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        role: 'core_member',
        title: 'Operations & Check-In Lead',
        permissions: ['VIEW_REGISTRATIONS', 'SCAN_ATTENDANCE', 'SUBMIT_EVENT_REPORTS'],
        canScanQr: true,
        assignedTasks: [
          'Verify QR check-in readiness at Main Auditorium Gate A',
          'Submit Autonomous Rover Buildathon completion summary',
        ],
        joinedAt: '2026-08-18T11:30:00.000Z',
      },
      {
        id: 'mem-3',
        userId: 'usr-multi-1',
        userName: 'Sneha Kulkarni',
        userEmail: 'sneha.kulkarni@campusverse.edu',
        clubId: 'club-design',
        clubName: 'Atelier Design Guild',
        role: 'president',
        title: 'Design Director',
        permissions: [
          'MANAGE_EVENTS',
          'MANAGE_FORMS',
          'VIEW_REGISTRATIONS',
          'SCAN_ATTENDANCE',
          'SUBMIT_EVENT_REPORTS',
          'SUBMIT_FINANCE_REPORTS',
        ],
        canScanQr: true,
        joinedAt: '2026-08-10T08:15:00.000Z',
      },
      {
        id: 'mem-4',
        userId: 'usr-multi-1',
        userName: 'Sneha Kulkarni',
        userEmail: 'sneha.kulkarni@campusverse.edu',
        clubId: 'club-music',
        clubName: 'Resonance Acoustic Society',
        role: 'core_member',
        title: 'Stage & Visual Coordinator',
        permissions: ['MANAGE_EVENTS', 'VIEW_REGISTRATIONS'],
        assignedTasks: ['Publish Winter Acoustic Showcase schedule'],
        joinedAt: '2026-08-22T09:00:00.000Z',
      },
      {
        id: 'mem-5',
        userId: 'usr-club-admin-1',
        userName: 'Priya Nair',
        userEmail: 'priya.nair@campusverse.edu',
        clubId: 'club-quantum',
        clubName: 'Quantum Computing Circle',
        role: 'core_member',
        title: 'Hardware Track Mentor',
        permissions: ['VIEW_REGISTRATIONS', 'SCAN_ATTENDANCE'],
        assignedTasks: ['Assist with Embedded Systems workshop check-ins'],
        joinedAt: '2026-09-02T09:00:00.000Z',
      },
    ];

    // Aarav follows 1 club initially so user can test following a 2nd and seeing the 3rd blocked!
    this.follows = [
      {
        id: 'fol-1',
        userId: 'usr-student-1',
        clubId: 'club-robotics',
        followedAt: '2026-10-05T12:00:00.000Z',
      },
      {
        id: 'fol-2',
        userId: 'usr-student-2',
        clubId: 'club-design',
        followedAt: '2026-10-06T12:00:00.000Z',
      },
      {
        id: 'fol-3',
        userId: 'usr-student-2',
        clubId: 'club-music',
        followedAt: '2026-10-07T12:00:00.000Z',
      },
    ];

    this.events = [
      {
        id: 'evt-rover-sprint',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        title: 'Autonomous Rover Buildathon 2026',
        category: 'Hackathon',
        description:
          'A 24-hour hardware and ROS2 navigation sprint. Teams receive an aluminum chassis kit, LiDAR sensor module, and bench power to complete an indoor obstacle course.',
        venue: 'Innovation Hangar B2 & Main Atrium',
        startTime: '2026-12-05T09:00:00.000Z',
        endTime: '2026-12-06T12:00:00.000Z',
        registrationDeadline: '2026-12-02T23:59:00.000Z',
        capacity: 120,
        registeredCount: 2,
        attendedCount: 0,
        status: 'published',
        bannerUrl: '/src/assets/images/event_hackathon_banner_1795447592033.jpg',
        isPaid: true,
        feeAmount: 250,
        createdAt: '2026-10-15T10:00:00.000Z',
        updatedAt: '2026-10-20T14:00:00.000Z',
      },
      {
        id: 'evt-pcb-workshop',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        title: 'KiCad 4-Layer PCB Fabrication Lab',
        category: 'Workshop',
        description:
          'Hands-on schematic capture, differential-pair routing, and Gerber export clinic for student robotics teams preparing spring competition boards.',
        venue: 'Electronics Lab 204',
        startTime: '2026-12-12T14:00:00.000Z',
        endTime: '2026-12-12T17:30:00.000Z',
        registrationDeadline: '2026-12-10T23:59:00.000Z',
        capacity: 45,
        registeredCount: 1,
        attendedCount: 1,
        status: 'completed',
        bannerUrl: '/src/assets/images/club_robotics_emblem_1795447591960.jpg',
        isPaid: false,
        feeAmount: 0,
        createdAt: '2026-09-20T10:00:00.000Z',
        updatedAt: '2026-10-28T18:00:00.000Z',
      },
      {
        id: 'evt-drone-draft',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        title: 'Micro-Drone Flight Controller Clinic',
        category: 'Workshop',
        description:
          'Draft workshop covering PID tuning, brushless ESC telemetry, and indoor flight safety protocols.',
        venue: 'Robotics Cage C1',
        startTime: '2026-12-19T15:00:00.000Z',
        endTime: '2026-12-19T18:00:00.000Z',
        registrationDeadline: '2026-12-17T23:59:00.000Z',
        capacity: 30,
        registeredCount: 0,
        attendedCount: 0,
        status: 'draft',
        bannerUrl: '/src/assets/images/club_robotics_emblem_1795447591960.jpg',
        isPaid: false,
        feeAmount: 0,
        createdAt: '2026-11-10T10:00:00.000Z',
        updatedAt: '2026-11-10T10:00:00.000Z',
      },
      {
        id: 'evt-design-systems',
        clubId: 'club-design',
        clubName: 'Atelier Design Guild',
        title: 'Editorial Grid & Design Token Workshop',
        category: 'Workshop',
        description:
          'Learn systematic typographic scales, contrast ratios, and token handoff between Figma and Tailwind CSS 4.',
        venue: 'Studio Annex 104',
        startTime: '2026-12-08T16:00:00.000Z',
        endTime: '2026-12-08T18:30:00.000Z',
        registrationDeadline: '2026-12-07T23:59:00.000Z',
        capacity: 60,
        registeredCount: 1,
        attendedCount: 0,
        status: 'published',
        bannerUrl: '/src/assets/images/club_design_emblem_1795447591826.jpg',
        isPaid: false,
        feeAmount: 0,
        createdAt: '2026-11-01T09:00:00.000Z',
        updatedAt: '2026-11-01T09:00:00.000Z',
      },
      {
        id: 'evt-portfolio-night',
        clubId: 'club-design',
        clubName: 'Atelier Design Guild',
        title: 'Winter Design Critique & Review Night',
        category: 'Networking',
        description:
          'Bring two case studies for structured 15-minute peer and alumni design director feedback sessions.',
        venue: 'Architecture Gallery Hall',
        startTime: '2026-12-14T18:00:00.000Z',
        endTime: '2026-12-14T20:30:00.000Z',
        registrationDeadline: '2026-12-13T23:59:00.000Z',
        capacity: 50,
        registeredCount: 0,
        attendedCount: 0,
        status: 'published',
        bannerUrl: '/src/assets/images/club_design_emblem_1795447591826.jpg',
        isPaid: false,
        feeAmount: 0,
        createdAt: '2026-11-04T09:00:00.000Z',
        updatedAt: '2026-11-04T09:00:00.000Z',
      },
      {
        id: 'evt-acoustic-eve',
        clubId: 'club-music',
        clubName: 'Resonance Acoustic Society',
        title: 'Winter Quad Unplugged Showcase',
        category: 'Cultural',
        description:
          'An evening of original student acoustic compositions, chamber ensembles, and live multi-track studio recording at the central courtyard.',
        venue: 'University Student Union Amphitheater',
        startTime: '2026-12-11T18:30:00.000Z',
        endTime: '2026-12-11T21:00:00.000Z',
        registrationDeadline: '2026-12-11T12:00:00.000Z',
        capacity: 220,
        registeredCount: 1,
        attendedCount: 0,
        status: 'published',
        bannerUrl: '/src/assets/images/club_music_emblem_1795447592008.jpg',
        isPaid: false,
        feeAmount: 0,
        createdAt: '2026-11-02T11:00:00.000Z',
        updatedAt: '2026-11-02T11:00:00.000Z',
      },
      {
        id: 'evt-quantum-ctf',
        clubId: 'club-quantum',
        clubName: 'Quantum Computing Circle',
        title: 'Campus Systems Security & CTF Sprint',
        category: 'Competition',
        description:
          'Capture-the-flag challenge covering web security, cryptography, and cloud IAM misconfigurations.',
        venue: 'Turing Auditorium 301',
        startTime: '2026-12-09T10:00:00.000Z',
        endTime: '2026-12-09T17:00:00.000Z',
        registrationDeadline: '2026-12-08T20:00:00.000Z',
        capacity: 100,
        registeredCount: 0,
        attendedCount: 0,
        status: 'published',
        bannerUrl: '/src/assets/images/event_hackathon_banner_1795447592033.jpg',
        isPaid: true,
        feeAmount: 100,
        createdAt: '2026-11-05T10:00:00.000Z',
        updatedAt: '2026-11-05T10:00:00.000Z',
      },
      {
        id: 'evt-debate-open',
        clubId: 'club-debate',
        clubName: 'Civic Debate Forum',
        title: 'AI Governance & Civic Policy Open',
        category: 'Seminar',
        description:
          'Inter-collegiate parliamentary rounds and faculty panel examining algorithmic transparency in public institutions.',
        venue: 'Humanities Seminar 202',
        startTime: '2026-12-16T16:00:00.000Z',
        endTime: '2026-12-16T19:00:00.000Z',
        registrationDeadline: '2026-12-15T23:59:00.000Z',
        capacity: 80,
        registeredCount: 0,
        attendedCount: 0,
        status: 'published',
        bannerUrl: '/src/assets/images/hero_campus_quad_1795447592217.jpg',
        isPaid: false,
        feeAmount: 0,
        createdAt: '2026-11-08T10:00:00.000Z',
        updatedAt: '2026-11-08T10:00:00.000Z',
      },
    ];

    const defaultFields = (extra?: FormField[]): FormField[] => [
      {
        id: 'fld-track',
        label: 'Preferred Track or Role',
        type: 'select',
        required: true,
        options: ['Participant', 'Team Lead', 'Observer'],
      },
      {
        id: 'fld-experience',
        label: 'Relevant Experience Level',
        type: 'select',
        required: true,
        options: ['Beginner', 'Intermediate', 'Advanced'],
      },
      ...(extra || []),
      {
        id: 'fld-code-conduct',
        label: 'I agree to follow the CampusVerse Event Code of Conduct',
        type: 'checkbox',
        required: true,
      },
    ];

    for (const ev of this.events) {
      const fields =
        ev.id === 'evt-rover-sprint'
          ? defaultFields([
              {
                id: 'fld-team-name',
                label: 'Team Name (or Solo)',
                type: 'text',
                required: true,
                placeholder: 'e.g. MechaSpark',
              },
              {
                id: 'fld-hardware-notes',
                label: 'Special Lab Equipment Needed',
                type: 'textarea',
                required: false,
                placeholder: 'Soldering station, oscilloscope, etc.',
              },
            ])
          : defaultFields();
      this.forms.set(ev.id, {
        id: `frm-${ev.id}`,
        eventId: ev.id,
        version: 1,
        status: ev.status === 'draft' ? 'draft' : 'published',
        publishedVersion: ev.status === 'draft' ? 0 : 1,
        title: `${ev.title} Registration`,
        description: '',
        fields,
        updatedAt: ev.updatedAt,
      });
      if (ev.status !== 'draft') {
        this.formVersions.push({
          id: `frm-ver-${ev.id}-1`,
          formId: `frm-${ev.id}`,
          eventId: ev.id,
          version: 1,
          title: `${ev.title} Registration`,
          description: '',
          fields: fields.map((f) => ({...f})),
          publishedBy: null,
          publishedAt: ev.updatedAt,
        });
      }
    }

    this.registrations = [
      {
        id: 'reg-101',
        eventId: 'evt-rover-sprint',
        eventTitle: 'Autonomous Rover Buildathon 2026',
        eventStartTime: '2026-12-05T09:00:00.000Z',
        eventVenue: 'Innovation Hangar B2 & Main Atrium',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        studentId: 'usr-student-1',
        studentName: 'Aarav Mehta',
        studentEmail: 'aarav.mehta@campusverse.edu',
        answers: {
          'fld-track': 'Participant',
          'fld-experience': 'Intermediate',
          'fld-team-name': 'Vector Dynamics',
          'fld-code-conduct': true,
        },
        status: 'confirmed',
        ticketStatus: 'released',
        ticketCode: 'TCK-ROVER-101',
        ticketReleasedAt: '2026-11-12T10:00:00.000Z',
        qrToken: 'CV-TCK-8F92A1C4',
        qrUsedAt: null,
        createdAt: '2026-11-12T09:30:00.000Z',
      },
      {
        id: 'reg-102',
        eventId: 'evt-rover-sprint',
        eventTitle: 'Autonomous Rover Buildathon 2026',
        eventStartTime: '2026-12-05T09:00:00.000Z',
        eventVenue: 'Innovation Hangar B2 & Main Atrium',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        studentId: 'usr-student-2',
        studentName: 'Kabir Rao',
        studentEmail: 'kabir.rao@campusverse.edu',
        answers: {
          'fld-track': 'Team Lead',
          'fld-experience': 'Advanced',
          'fld-team-name': 'TorqueForge',
          'fld-code-conduct': true,
        },
        status: 'confirmed',
        ticketStatus: 'not_released',
        ticketCode: 'TCK-ROVER-102',
        ticketReleasedAt: null,
        qrToken: '',
        qrUsedAt: null,
        createdAt: '2026-11-13T11:15:00.000Z',
      },
      {
        id: 'reg-103',
        eventId: 'evt-pcb-workshop',
        eventTitle: 'KiCad 4-Layer PCB Fabrication Lab',
        eventStartTime: '2026-12-12T14:00:00.000Z',
        eventVenue: 'Electronics Lab 204',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        studentId: 'usr-student-1',
        studentName: 'Aarav Mehta',
        studentEmail: 'aarav.mehta@campusverse.edu',
        answers: {
          'fld-track': 'Participant',
          'fld-experience': 'Beginner',
          'fld-code-conduct': true,
        },
        status: 'attended',
        ticketStatus: 'released',
        ticketCode: 'TCK-PCB-103',
        ticketReleasedAt: '2026-10-25T10:00:00.000Z',
        qrToken: 'CV-TCK-6C44E2B8',
        qrUsedAt: '2026-10-28T14:05:00.000Z',
        createdAt: '2026-10-20T10:00:00.000Z',
      },
      {
        id: 'reg-104',
        eventId: 'evt-design-systems',
        eventTitle: 'Editorial Grid & Design Token Workshop',
        eventStartTime: '2026-12-08T16:00:00.000Z',
        eventVenue: 'Studio Annex 104',
        clubId: 'club-design',
        clubName: 'Atelier Design Guild',
        studentId: 'usr-student-2',
        studentName: 'Kabir Rao',
        studentEmail: 'kabir.rao@campusverse.edu',
        answers: {
          'fld-track': 'Participant',
          'fld-experience': 'Intermediate',
          'fld-code-conduct': true,
        },
        status: 'confirmed',
        ticketStatus: 'not_released',
        ticketCode: 'TCK-DES-104',
        ticketReleasedAt: null,
        qrToken: '',
        qrUsedAt: null,
        createdAt: '2026-11-14T15:40:00.000Z',
      },
      {
        id: 'reg-105',
        eventId: 'evt-acoustic-eve',
        eventTitle: 'Winter Quad Unplugged Showcase',
        eventStartTime: '2026-12-11T18:30:00.000Z',
        eventVenue: 'University Student Union Amphitheater',
        clubId: 'club-music',
        clubName: 'Resonance Acoustic Society',
        studentId: 'usr-student-1',
        studentName: 'Aarav Mehta',
        studentEmail: 'aarav.mehta@campusverse.edu',
        answers: {
          'fld-track': 'Observer',
          'fld-experience': 'Beginner',
          'fld-code-conduct': true,
        },
        status: 'confirmed',
        ticketStatus: 'released',
        ticketCode: 'TCK-MUS-105',
        ticketReleasedAt: '2026-11-15T17:00:00.000Z',
        qrToken: 'CV-TCK-55F0C8A1',
        qrUsedAt: null,
        createdAt: '2026-11-15T16:10:00.000Z',
      },
    ];

    this.tickets = this.registrations.map((reg) => {
      const isReleased = reg.ticketStatus === 'released' && Boolean(reg.qrToken);
      return {
        id: `tck-${reg.id}`,
        registrationId: reg.id,
        eventId: reg.eventId,
        userId: reg.studentId,
        studentName: reg.studentName,
        studentEmail: reg.studentEmail,
        registrationStatus: reg.status,
        ticketCode: reg.ticketCode || generateTicketCode(),
        status: reg.ticketStatus || 'not_released',
        tokenHash: isReleased ? hashInvitationToken(reg.qrToken) : null,
        sealedToken: isReleased ? sealTicketToken(reg.qrToken) : null,
        releasedBy: isReleased ? 'usr-club-admin-1' : null,
        releasedAt: reg.ticketReleasedAt ?? null,
        revokedBy: null,
        revokedAt: null,
        createdAt: reg.createdAt,
        updatedAt: reg.ticketReleasedAt || reg.createdAt,
      };
    });

    this.attendance = [
      {
        id: 'att-1',
        eventId: 'evt-pcb-workshop',
        registrationId: 'reg-103',
        studentId: 'usr-student-1',
        studentName: 'Aarav Mehta',
        studentCode: 'STU-2024-0412',
        qrToken: 'TCK-PCB-103',
        method: 'qr_scan',
        checkedInBy: 'Rohan Verma',
        checkedInAt: '2026-10-28T14:05:00.000Z',
      },
    ];

    this.eventReports = [
      {
        id: 'rep-evt-1',
        eventId: 'evt-pcb-workshop',
        eventTitle: 'KiCad 4-Layer PCB Fabrication Lab',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        submittedBy: 'usr-club-admin-1',
        submittedByName: 'Priya Nair',
        outcomeSummary:
          'Completed full 4-layer schematic to Gerber fabrication walkthrough with student hardware teams; 12 boards exported cleanly for panelization.',
        objectives: 'Train student teams to design manufacturing-ready 4-layer PCBs in KiCad 8.',
        actualEventDate: '2026-10-28',
        participationSummary: '38 active student attendees across Robotics and EE labs.',
        outcomes: '12 verified Gerber packages ready for fabrication batch.',
        highlights: 'Zero DRC errors across final student boards; strong cross-year mentorship.',
        challenges: 'Projector adapter needed quick swap before session start.',
        feedbackObservations: 'Participants requested a follow-up SMD reflow workshop.',
        evidenceUrl: 'https://campusverse.edu/evidence/pcb-lab-2026',
        actualAttendance: 38,
        registeredTotal: 42,
        completionStatus: 'completed',
        status: 'approved',
        reviewedBy: 'usr-super-admin',
        reviewedByName: 'Dr. Elena Vance',
        reviewedAt: '2026-10-30T09:15:00.000Z',
        reviewNotes: 'Approved. Strong hands-on hardware outcomes.',
        history: [
          {
            action: 'SUBMITTED',
            status: 'submitted',
            actorId: 'usr-club-admin-1',
            actorName: 'Priya Nair',
            actorRole: 'Club President',
            timestamp: '2026-10-29T11:20:00.000Z',
          },
          {
            action: 'REVIEW_APPROVED',
            status: 'approved',
            actorId: 'usr-super-admin',
            actorName: 'Dr. Elena Vance',
            actorRole: 'Super Admin',
            notes: 'Approved. Strong hands-on hardware outcomes.',
            timestamp: '2026-10-30T09:15:00.000Z',
          },
        ],
        submittedAt: '2026-10-29T11:20:00.000Z',
        updatedAt: '2026-10-30T09:15:00.000Z',
      },
    ];

    this.financialReports = [
      {
        id: 'fin-rep-1',
        eventId: 'evt-pcb-workshop',
        eventTitle: 'KiCad 4-Layer PCB Fabrication Lab',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        submittedBy: 'usr-club-admin-1',
        submittedByName: 'Priya Nair',
        totalCollections: 12000,
        totalExpenses: 9450,
        netBalance: 2550,
        totalCollectionsMinorUnits: 1200000,
        totalExpensesMinorUnits: 945000,
        netBalanceMinorUnits: 255000,
        lineItems: [
          {
            id: 'li-1',
            type: 'collection',
            label: 'Department Hardware Grant',
            category: 'Institutional Grant',
            amount: 12000,
            notes: 'Approved Fall Lab Allocation',
          },
          {
            id: 'li-2',
            type: 'expense',
            label: 'FR4 Prototype PCB Batch Order',
            category: 'Materials',
            amount: 6800,
            notes: 'Invoice #PCB-904',
          },
          {
            id: 'li-3',
            type: 'expense',
            label: 'SMD Stencils & Solder Paste',
            category: 'Consumables',
            amount: 2650,
          },
        ],
        notes: 'Surplus retained in Apex Robotics Lab spring rover fund.',
        submittedAt: '2026-10-30T15:45:00.000Z',
      },
    ];

    this.financeEntries = [
      {
        id: 'fin-ent-1',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        eventId: 'evt-rover-sprint',
        eventTitle: 'Autonomous Rover Buildathon 2026',
        entryType: 'income',
        sourceOrCategory: 'Alumni Hardware Sponsorship',
        description: 'LiDAR & Chassis Component Sponsorship',
        amountMinorUnits: 1500000,
        amount: 15000,
        transactionDate: '2026-11-10T00:00:00.000Z',
        vendorOrRecipient: 'Apex Alumni Guild',
        receiptUrl: '',
        notes: 'Dedicated rover buildathon parts pool',
        createdBy: 'usr-club-admin-1',
        createdByName: 'Priya Nair',
        createdAt: '2026-11-10T10:00:00.000Z',
        updatedAt: '2026-11-10T10:00:00.000Z',
      },
      {
        id: 'fin-ent-2',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        eventId: 'evt-rover-sprint',
        eventTitle: 'Autonomous Rover Buildathon 2026',
        entryType: 'expense',
        sourceOrCategory: 'Hardware Equipment',
        description: '10 Aluminum Chassis Kits & Motor Drivers',
        amountMinorUnits: 850000,
        amount: 8500,
        transactionDate: '2026-11-12T00:00:00.000Z',
        vendorOrRecipient: 'RoboCraft Components Pvt Ltd',
        receiptUrl: '',
        notes: 'Invoice #RC-2026-44',
        createdBy: 'usr-club-admin-1',
        createdByName: 'Priya Nair',
        createdAt: '2026-11-12T12:00:00.000Z',
        updatedAt: '2026-11-12T12:00:00.000Z',
      },
    ];

    this.notifications = [
      {
        id: 'not-1',
        userId: 'usr-student-1',
        title: 'Ticket Released: Autonomous Rover Buildathon 2026',
        message: 'Your QR pass (TCK-ROVER-101) is ready in My Registrations.',
        category: 'registration',
        read: false,
        link: '/app/student/registrations',
        createdAt: '2026-11-12T09:31:00.000Z',
      },
      {
        id: 'not-2',
        userId: 'usr-student-1',
        title: 'New Event from Apex Robotics Lab',
        message: 'KiCad 4-Layer PCB Fabrication Lab report summary has been posted.',
        category: 'club',
        read: true,
        link: '/app/student/events',
        createdAt: '2026-11-01T08:00:00.000Z',
      },
      {
        id: 'not-3',
        userId: 'usr-club-admin-1',
        title: '2 Confirmed Registrations for Rover Buildathon',
        message: 'Check participant directory and finalize gate scanner assignments.',
        category: 'event',
        read: false,
        link: '/app/club-admin/registrations',
        createdAt: '2026-11-13T11:20:00.000Z',
      },
      {
        id: 'not-4',
        userId: 'usr-super-admin',
        title: 'Club Pending Review: Trailblazers Athletics',
        message: 'New club charter application awaiting Student Affairs verification.',
        category: 'admin',
        read: false,
        link: '/app/admin/clubs',
        createdAt: '2026-11-14T10:00:00.000Z',
      },
    ];

    this.auditLogs = [
      {
        id: 'aud-1',
        actorId: 'usr-super-admin',
        actorName: 'Dr. Elena Vance',
        actorContext: 'Super Admin',
        action: 'APPROVED_CLUB_CHARTER',
        targetType: 'club',
        targetId: 'club-venture',
        targetLabel: 'Venture Foundry',
        details: 'Verified faculty advisor sign-off and activated club status.',
        createdAt: '2026-10-18T11:00:00.000Z',
      },
      {
        id: 'aud-2',
        actorId: 'usr-club-admin-1',
        actorName: 'Priya Nair',
        actorContext: 'Club Admin · Apex Robotics Lab',
        action: 'SUBMITTED_FINANCIAL_REPORT',
        targetType: 'report',
        targetId: 'fin-rep-1',
        targetLabel: 'KiCad 4-Layer PCB Fabrication Lab',
        details: 'Logged INR 12,000 collections and INR 9,450 expenses.',
        createdAt: '2026-10-30T15:45:00.000Z',
      },
      {
        id: 'aud-3',
        actorId: 'usr-club-admin-1',
        actorName: 'Priya Nair',
        actorContext: 'Club Admin · Apex Robotics Lab',
        action: 'PUBLISHED_EVENT',
        targetType: 'event',
        targetId: 'evt-rover-sprint',
        targetLabel: 'Autonomous Rover Buildathon 2026',
        details: 'Published event registration with 120 participant capacity.',
        createdAt: '2026-10-20T14:00:00.000Z',
      },
    ];
  }

  getPersistenceMode(): 'in_memory_demo' | 'postgres' {
    return 'in_memory_demo';
  }

  async checkReadiness(): Promise<{
    ready: boolean;
    latencyMs: number;
    persistence: string;
    error?: string;
  }> {
    return {
      ready: true,
      latencyMs: 0,
      persistence: 'in-memory-demo-adapter',
    };
  }

  async getUserById(userId: string): Promise<UserAccount | null> {
    return this.users.find((u) => u.id === userId) || null;
  }

  async getUserByEmail(email: string): Promise<UserAccount | null> {
    const normalized = email.trim().toLowerCase();
    return this.users.find((u) => u.email.toLowerCase() === normalized) || null;
  }

  async provisionAuthenticatedUser(input: {
    authUserId: string;
    email: string;
    name?: string;
    department?: string;
    yearOfStudy?: string;
    emailVerified: boolean;
    isBootstrapSuperAdmin: boolean;
  }): Promise<UserAccount> {
    const existing = await this.getUserByEmail(input.email);
    if (existing) {
      if (input.isBootstrapSuperAdmin) {
        existing.isSuperAdmin = true;
      }
      if (input.emailVerified) {
        existing.emailVerified = true;
      }
      return {...existing};
    }

    const displayName = input.name?.trim() || input.email.split('@')[0];
    const initials = displayName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const user: UserAccount = {
      id: input.authUserId,
      name: displayName,
      email: input.email.toLowerCase(),
      department: input.department || 'General Engineering',
      yearOfStudy: input.yearOfStudy || 'Undergraduate',
      studentId: `STU-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 8999)}`,
      isSuperAdmin: input.isBootstrapSuperAdmin,
      status: 'active',
      emailVerified: input.emailVerified,
      avatarInitials: initials || 'CV',
      createdAt: new Date().toISOString(),
    };
    this.users.push(user);
    return {...user};
  }

  async recordAuthSession(): Promise<void> {
    // No-op in in-memory sandbox
  }

  async listUsers(): Promise<UserAccount[]> {
    return [...this.users];
  }

  async updateUserProfile(
    userId: string,
    updates: Partial<Pick<UserAccount, 'name' | 'department' | 'yearOfStudy'>>,
  ): Promise<UserAccount | null> {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return null;
    if (updates.name) {
      user.name = updates.name;
      user.avatarInitials = updates.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    }
    if (updates.department) user.department = updates.department;
    if (updates.yearOfStudy) user.yearOfStudy = updates.yearOfStudy;
    return {...user};
  }

  async updateUserStatus(
    userId: string,
    status: 'active' | 'suspended',
  ): Promise<UserAccount | null> {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return null;
    user.status = status;
    return {...user};
  }

  async createDemoUser(input: {
    name: string;
    email: string;
    department: string;
    yearOfStudy: string;
  }): Promise<UserAccount> {
    const existing = await this.getUserByEmail(input.email);
    if (existing) {
      throw new ConflictError('An account with this institutional email already exists');
    }
    const initials = input.name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const user: UserAccount = {
      id: `usr-${Date.now()}`,
      name: input.name,
      email: input.email.toLowerCase(),
      department: input.department,
      yearOfStudy: input.yearOfStudy,
      studentId: `STU-2026-${Math.floor(1000 + Math.random() * 8999)}`,
      isSuperAdmin: false,
      status: 'active',
      emailVerified: false,
      avatarInitials: initials || 'ST',
      createdAt: new Date().toISOString(),
    };
    this.users.push(user);
    return {...user};
  }

  async resolveAuthenticatedContext(input: {
    authUserId: string;
    email: string;
    name?: string;
    department?: string;
    yearOfStudy?: string;
    emailVerified: boolean;
    isBootstrapSuperAdmin: boolean;
  }): Promise<ResolvedAuthContext> {
    const user = await this.provisionAuthenticatedUser(input);
    const [memberships, follows] = await Promise.all([
      this.getMembershipsForUser(user.id),
      this.getFollowsForUser(user.id),
    ]);
    return {
      user,
      memberships,
      followedClubIds: follows.map((f) => f.clubId),
    };
  }

  async listClubs(filters?: {
    search?: string;
    category?: string;
    status?: ClubStatus;
    includeAllStatuses?: boolean;
    sortBy?: 'followers' | 'name' | 'events';
    page?: number;
    pageSize?: number;
  }): Promise<Club[]> {
    const filtered = this.clubs
      .filter((club) => {
        if (!filters?.includeAllStatuses && club.status !== 'active') return false;
        if (filters?.status && club.status !== filters.status) return false;
        if (filters?.category && filters.category !== 'All' && club.category !== filters.category) {
          return false;
        }
        if (filters?.search) {
          const q = filters.search.trim().toLowerCase();
          if (q) {
            return (
              club.name.toLowerCase().includes(q) ||
              club.slug.toLowerCase().includes(q) ||
              club.tagline.toLowerCase().includes(q) ||
              club.category.toLowerCase().includes(q)
            );
          }
        }
        return true;
      })
      .map((c) => ({
        ...c,
        upcomingEventsCount: this.events.filter(
          (e) =>
            e.clubId === c.id &&
            (e.status === 'published' ||
              e.status === 'registration_open' ||
              e.status === 'registration_closed'),
        ).length,
      }));

    if (filters?.sortBy === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (filters?.sortBy === 'events') {
      filtered.sort(
        (a, b) => b.upcomingEventsCount - a.upcomingEventsCount || a.name.localeCompare(b.name),
      );
    } else {
      filtered.sort((a, b) => b.followerCount - a.followerCount || a.name.localeCompare(b.name));
    }

    if (filters?.page && filters?.pageSize) {
      const page = Math.max(1, filters.page);
      const pageSize = Math.min(100, Math.max(1, filters.pageSize));
      return filtered.slice((page - 1) * pageSize, page * pageSize);
    }

    return filtered;
  }

  async listClubsPaginated(filters?: {
    search?: string;
    category?: string;
    status?: ClubStatus;
    includeAllStatuses?: boolean;
    sortBy?: 'followers' | 'name' | 'events';
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<Club>> {
    const all = await this.listClubs({...filters, page: undefined, pageSize: undefined});
    const page = Math.max(1, filters?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 24));
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    return {
      items: all.slice((safePage - 1) * pageSize, safePage * pageSize),
      pagination: {
        total,
        page: safePage,
        pageSize,
        totalPages,
      },
    };
  }

  async getClubDetail(clubId: string, viewerUserId?: string): Promise<ClubDetail | null> {
    const club = this.clubs.find((c) => c.id === clubId || c.slug === clubId);
    if (!club) return null;
    const viewer = viewerUserId ? this.users.find((u) => u.id === viewerUserId) : undefined;
    const isSuperAdmin = Boolean(viewer?.isSuperAdmin);
    const isMember = viewerUserId
      ? this.memberships.some((m) => m.clubId === club.id && m.userId === viewerUserId)
      : false;
    if (club.status !== 'active' && !isSuperAdmin && !isMember) {
      return null;
    }

    const isClubOfficer = viewerUserId
      ? this.memberships.some(
          (m) => m.clubId === club.id && m.userId === viewerUserId && isClubOfficerRole(m.role),
        )
      : false;
    const rawTeam = await this.getClubMemberships(club.id);
    const team = rawTeam.map((m) =>
      isSuperAdmin || isClubOfficer ? m : {...m, userEmail: undefined},
    );
    const upcomingEvents = this.events.filter(
      (e) =>
        e.clubId === club.id &&
        (e.status === 'published' ||
          e.status === 'registration_open' ||
          e.status === 'registration_closed'),
    );
    const isFollowing = viewerUserId
      ? this.follows.some((f) => f.userId === viewerUserId && f.clubId === club.id)
      : false;
    return {
      ...club,
      upcomingEventsCount: upcomingEvents.length,
      team,
      upcomingEvents,
      isFollowing,
    };
  }

  async createClub(input: {
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
    createdByUserId?: string;
  }): Promise<Club> {
    const requestedSlug = input.slug?.trim() ? slugify(input.slug) : '';
    const slug = requestedSlug || slugify(input.name);
    if (this.clubs.some((c) => c.slug === slug)) {
      throw new ConflictError(`A club with slug "${slug}" already exists`);
    }
    const club: Club = {
      id: `club-${Date.now()}`,
      name: input.name,
      slug,
      category: input.category,
      tagline: input.tagline,
      description: input.description,
      logoUrl: '',
      status: input.status || (this.settings.requireClubApproval ? 'pending_review' : 'active'),
      followerCount: 0,
      memberCount: 0,
      upcomingEventsCount: 0,
      foundedYear: input.foundedYear || new Date().getFullYear(),
      meetingSchedule: input.meetingSchedule,
      contactEmail: input.contactEmail,
      instagramUrl: input.instagramUrl || '',
      createdAt: new Date().toISOString(),
    };
    this.clubs.push(club);
    return {...club};
  }

  async updateClub(clubId: string, updates: Partial<Club>): Promise<Club | null> {
    const club = this.clubs.find((c) => c.id === clubId);
    if (!club) return null;
    if (updates.slug && this.clubs.some((c) => c.id !== clubId && c.slug === updates.slug)) {
      throw new ConflictError(`Slug "${updates.slug}" is already taken`);
    }
    Object.assign(club, updates);
    return {...club};
  }

  async updateClubStatus(clubId: string, status: ClubStatus): Promise<Club | null> {
    const club = this.clubs.find((c) => c.id === clubId);
    if (!club) return null;
    club.status = status;
    return {...club};
  }

  async getMembershipsForUser(userId: string): Promise<ClubMembership[]> {
    return this.memberships
      .filter((m) => m.userId === userId)
      .map((m) => {
        const club = this.clubs.find((c) => c.id === m.clubId);
        return {
          ...m,
          canScanQr: isClubOfficerRole(m.role) || m.permissions.includes('SCAN_ATTENDANCE'),
          clubName: club?.name || m.clubName,
        };
      });
  }

  async getClubMemberships(clubId: string): Promise<ClubMembership[]> {
    return this.memberships
      .filter((m) => m.clubId === clubId)
      .map((m) => {
        const user = this.users.find((u) => u.id === m.userId);
        return {
          ...m,
          canScanQr: isClubOfficerRole(m.role) || m.permissions.includes('SCAN_ATTENDANCE'),
          userName: user?.name || m.userName,
          userEmail: user?.email || m.userEmail,
        };
      });
  }

  async listAllMemberships(): Promise<ClubMembership[]> {
    return this.memberships.map((m) => {
      const user = this.users.find((u) => u.id === m.userId);
      const club = this.clubs.find((c) => c.id === m.clubId);
      return {
        ...m,
        canScanQr: isClubOfficerRole(m.role) || m.permissions.includes('SCAN_ATTENDANCE'),
        userName: user?.name || m.userName,
        userEmail: user?.email || m.userEmail,
        clubName: club?.name || m.clubName,
      };
    });
  }

  private assertCoreScannerLimit(clubId: string, excludeMembershipId?: string): void {
    const count = this.memberships.filter(
      (m) =>
        m.clubId === clubId &&
        m.role === 'core_member' &&
        m.permissions.includes('SCAN_ATTENDANCE') &&
        m.id !== excludeMembershipId,
    ).length;
    if (count >= MAX_CORE_SCANNERS_PER_CLUB) {
      throw new BusinessRuleError(
        'SCANNER_SLOT_LIMIT_EXCEEDED',
        `Maximum ${MAX_CORE_SCANNERS_PER_CLUB} active Core Members with QR scanning permission allowed per club.`,
        {limit: MAX_CORE_SCANNERS_PER_CLUB, activeCoreScanners: count},
      );
    }
  }

  async upsertClubMembership(input: {
    clubId: string;
    userId: string;
    role: ClubMembership['role'];
    title: string;
    permissions: CoreMemberPermission[];
    assignedByUserId?: string;
    strictInsert?: boolean;
  }): Promise<ClubMembership> {
    const club = this.clubs.find((c) => c.id === input.clubId);
    const user = this.users.find((u) => u.id === input.userId);
    if (!club) throw new NotFoundError('Club not found');
    if (!user) throw new NotFoundError('User not found');

    const effectivePermissions: CoreMemberPermission[] = isClubOfficerRole(input.role)
      ? [...CORE_MEMBER_PERMISSIONS]
      : [...input.permissions];

    const existing = this.memberships.find(
      (m) => m.clubId === input.clubId && m.userId === input.userId,
    );

    if (isClubOfficerRole(input.role)) {
      const conflictOfficer = this.memberships.find(
        (m) => m.clubId === input.clubId && m.role === input.role && m.userId !== input.userId,
      );
      if (conflictOfficer) {
        throw new ConflictError(`This club already has an active ${input.role.replace('_', ' ')}`);
      }
    }

    if (input.role === 'core_member' && effectivePermissions.includes('SCAN_ATTENDANCE')) {
      this.assertCoreScannerLimit(input.clubId, existing?.id);
    }

    if (existing) {
      if (input.strictInsert) {
        throw new ConflictError(`${user.name} is already a member of ${club.name}`);
      }
      existing.role = input.role;
      existing.title = input.title;
      existing.permissions = effectivePermissions;
      existing.canScanQr =
        isClubOfficerRole(input.role) || effectivePermissions.includes('SCAN_ATTENDANCE');
      return {...existing, userName: user.name, userEmail: user.email, clubName: club.name};
    }

    const membership: ClubMembership = {
      id: `mem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      clubId: club.id,
      clubName: club.name,
      role: input.role,
      title: input.title,
      permissions: effectivePermissions,
      canScanQr:
        isClubOfficerRole(input.role) || effectivePermissions.includes('SCAN_ATTENDANCE'),
      joinedAt: new Date().toISOString(),
    };
    this.memberships.push(membership);
    club.memberCount += 1;
    return {...membership};
  }

  async updateMembershipPermissions(
    clubId: string,
    membershipId: string,
    updates: {
      role?: ClubMembership['role'];
      title?: string;
      permissions?: CoreMemberPermission[];
    },
  ): Promise<ClubMembership | null> {
    const membership = this.memberships.find(
      (m) => m.id === membershipId && m.clubId === clubId,
    );
    if (!membership) return null;
    const prevRole = membership.role;
    const nextRole = updates.role || prevRole;

    if (isClubOfficerRole(nextRole)) {
      const conflictOfficer = this.memberships.find(
        (m) => m.clubId === clubId && m.role === nextRole && m.id !== membershipId,
      );
      if (conflictOfficer) {
        throw new ConflictError(`This club already has an active ${nextRole.replace('_', ' ')}`);
      }
    }

    const nextPermissions: CoreMemberPermission[] = isClubOfficerRole(nextRole)
      ? [...CORE_MEMBER_PERMISSIONS]
      : updates.permissions !== undefined
        ? [...updates.permissions]
        : isClubOfficerRole(prevRole)
          ? []
          : [...membership.permissions];

    if (nextRole === 'core_member' && nextPermissions.includes('SCAN_ATTENDANCE')) {
      this.assertCoreScannerLimit(clubId, membershipId);
    }

    membership.role = nextRole;
    if (updates.title) membership.title = updates.title;
    membership.permissions = nextPermissions;
    membership.canScanQr =
      isClubOfficerRole(nextRole) || nextPermissions.includes('SCAN_ATTENDANCE');
    return {...membership};
  }

  async removeClubMembership(clubId: string, membershipId: string): Promise<boolean> {
    const idx = this.memberships.findIndex((m) => m.id === membershipId && m.clubId === clubId);
    if (idx === -1) return false;
    this.memberships.splice(idx, 1);
    const club = this.clubs.find((c) => c.id === clubId);
    if (club && club.memberCount > 0) club.memberCount -= 1;
    return true;
  }

  async assignClubLeadership(input: {
    clubId: string;
    email: string;
    role: 'president' | 'vice_president';
    title?: string;
    replaceExisting?: boolean;
    sendInvitation?: boolean;
    actorUserId: string;
  }) {
    const club = this.clubs.find((c) => c.id === input.clubId);
    if (!club) throw new NotFoundError('Club not found');

    const normalizedEmail = input.email.trim().toLowerCase();
    const title =
      input.title?.trim() || (input.role === 'president' ? 'President' : 'Vice President');

    const targetUser = this.users.find((u) => u.email.toLowerCase() === normalizedEmail);
    const existingIdx = this.memberships.findIndex(
      (m) => m.clubId === input.clubId && m.role === input.role,
    );
    const existingLeader = existingIdx !== -1 ? this.memberships[existingIdx] : null;

    if (existingLeader && existingLeader.userId !== targetUser?.id && !input.replaceExisting) {
      throw new ConflictError(
        `This club already has an active ${input.role.replace('_', ' ')}. Enable replaceExisting to transfer leadership.`,
      );
    }

    let replacedUserId: string | null = null;
    if (existingLeader && existingLeader.userId !== targetUser?.id && input.replaceExisting) {
      replacedUserId = existingLeader.userId;
      this.memberships.splice(existingIdx, 1);
    }

    if (targetUser && input.sendInvitation === false) {
      const membership = await this.upsertClubMembership({
        clubId: input.clubId,
        userId: targetUser.id,
        role: input.role,
        title,
        permissions: [...CORE_MEMBER_PERMISSIONS],
        assignedByUserId: input.actorUserId,
      });
      return {mode: 'assigned' as const, membership, replacedUserId};
    }

    const invitation = await this.createClubInvitation({
      clubId: input.clubId,
      email: input.email,
      role: input.role,
      title,
      permissions: [...CORE_MEMBER_PERMISSIONS],
      inviterUserId: input.actorUserId,
      replaceExisting: true,
    });
    return {mode: 'invited' as const, invitation, replacedUserId};
  }

  private stripInvitationSecret(inv: StoredInvitation): ClubInvitation {
    const effectiveStatus =
      inv.status === 'pending' && new Date(inv.expiresAt).getTime() <= Date.now()
        ? 'expired'
        : inv.status;
    return {
      id: inv.id,
      clubId: inv.clubId,
      clubName: inv.clubName,
      inviterUserId: inv.inviterUserId,
      inviterName: inv.inviterName,
      inviteeEmail: inv.inviteeEmail,
      intendedRole: inv.intendedRole,
      title: inv.title,
      permissions: [...inv.permissions],
      status: effectiveStatus,
      expiresAt: inv.expiresAt,
      acceptedAt: inv.acceptedAt,
      revokedAt: inv.revokedAt,
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
      deliveryMode: inv.deliveryMode,
    };
  }

  async createClubInvitation(input: {
    clubId: string;
    email: string;
    role: ClubRole;
    title?: string;
    permissions: CoreMemberPermission[];
    inviterUserId: string;
    replaceExisting?: boolean;
  }): Promise<ClubInvitation> {
    const club = this.clubs.find((c) => c.id === input.clubId);
    if (!club) throw new NotFoundError('Club not found');
    const normalizedEmail = input.email.trim().toLowerCase();

    if (isClubOfficerRole(input.role)) {
      const existingLeader = this.memberships.find(
        (m) => m.clubId === input.clubId && m.role === input.role,
      );
      if (existingLeader && !input.replaceExisting) {
        throw new ConflictError(
          `This club already has an active ${input.role.replace('_', ' ')}`,
        );
      }
    }

    const effectivePermissions: CoreMemberPermission[] = isClubOfficerRole(input.role)
      ? [...CORE_MEMBER_PERMISSIONS]
      : [...input.permissions];

    if (input.role === 'core_member' && effectivePermissions.includes('SCAN_ATTENDANCE')) {
      this.assertCoreScannerLimit(input.clubId);
    }

    const now = new Date();
    for (const inv of this.invitations) {
      if (
        inv.clubId === input.clubId &&
        inv.status === 'pending' &&
        (inv.normalizedEmail === normalizedEmail ||
          (isClubOfficerRole(input.role) && inv.intendedRole === input.role))
      ) {
        inv.status = 'revoked';
        inv.revokedAt = now.toISOString();
        inv.updatedAt = now.toISOString();
      }
    }

    const rawToken = generateInvitationToken();
    const expiresAt = new Date(now.getTime() + env.invitationTtlHours * 60 * 60 * 1000).toISOString();
    const inviter = this.users.find((u) => u.id === input.inviterUserId);
    const title =
      input.title?.trim() ||
      (input.role === 'president'
        ? 'President'
        : input.role === 'vice_president'
          ? 'Vice President'
          : 'Core Member');

    const stored: StoredInvitation = {
      id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      clubId: club.id,
      clubName: club.name,
      inviterUserId: input.inviterUserId,
      inviterName: inviter?.name,
      inviteeEmail: input.email.trim(),
      normalizedEmail,
      intendedRole: input.role,
      title,
      permissions: effectivePermissions,
      tokenHash: hashInvitationToken(rawToken),
      status: 'pending',
      expiresAt,
      acceptedAt: null,
      revokedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      deliveryMode: invitationMailer.getDeliveryMode(),
    };

    this.invitations.unshift(stored);

    await invitationMailer.sendClubInvitation({
      invitationId: stored.id,
      clubId: club.id,
      clubName: club.name,
      toEmail: stored.inviteeEmail,
      intendedRole: stored.intendedRole,
      title: stored.title,
      token: rawToken,
      expiresAt,
    });

    return this.stripInvitationSecret(stored);
  }

  async listClubInvitations(clubId: string): Promise<ClubInvitation[]> {
    return this.invitations
      .filter((inv) => inv.clubId === clubId)
      .map((inv) => this.stripInvitationSecret(inv));
  }

  async resendClubInvitation(
    clubId: string,
    invitationId: string,
    actorUserId: string,
  ): Promise<ClubInvitation> {
    const inv = this.invitations.find((i) => i.id === invitationId && i.clubId === clubId);
    if (!inv) throw new NotFoundError('Invitation not found');
    if (inv.status === 'accepted') throw new ConflictError('Accepted invitations cannot be resent');
    if (inv.status === 'revoked') {
      throw new BusinessRuleError('INVITATION_REVOKED', 'Revoked invitations cannot be resent');
    }

    const rawToken = generateInvitationToken();
    const now = new Date();
    inv.tokenHash = hashInvitationToken(rawToken);
    inv.status = 'pending';
    inv.expiresAt = new Date(now.getTime() + env.invitationTtlHours * 60 * 60 * 1000).toISOString();
    inv.inviterUserId = actorUserId;
    inv.updatedAt = now.toISOString();

    await invitationMailer.sendClubInvitation({
      invitationId: inv.id,
      clubId: inv.clubId,
      clubName: inv.clubName || 'Club',
      toEmail: inv.inviteeEmail,
      intendedRole: inv.intendedRole,
      title: inv.title,
      token: rawToken,
      expiresAt: inv.expiresAt,
    });

    return this.stripInvitationSecret(inv);
  }

  async revokeClubInvitation(
    clubId: string,
    invitationId: string,
  ): Promise<ClubInvitation | null> {
    const inv = this.invitations.find((i) => i.id === invitationId && i.clubId === clubId);
    if (!inv) return null;
    if (inv.status === 'accepted') {
      throw new ConflictError('An accepted invitation cannot be revoked');
    }
    const now = new Date().toISOString();
    inv.status = 'revoked';
    inv.revokedAt = now;
    inv.updatedAt = now;
    return this.stripInvitationSecret(inv);
  }

  async previewInvitation(token: string) {
    const tokenHash = hashInvitationToken(token);
    const inv = this.invitations.find((i) => i.tokenHash === tokenHash);
    if (!inv) throw new NotFoundError('Invitation link is invalid or has been replaced');
    const club = this.clubs.find((c) => c.id === inv.clubId);
    const hasExistingAccount = this.users.some(
      (u) => u.email.toLowerCase() === inv.normalizedEmail,
    );
    return {
      invitation: this.stripInvitationSecret(inv),
      clubName: club?.name || inv.clubName || 'Club',
      clubSlug: club?.slug || inv.clubId,
      hasExistingAccount,
    };
  }

  async acceptInvitation(input: {
    token: string;
    authUserId: string;
    email: string;
    name?: string;
    department?: string;
    yearOfStudy?: string;
    emailVerified: boolean;
    isBootstrapSuperAdmin: boolean;
  }) {
    if (!input.emailVerified) {
      throw new ForbiddenError('Verify your institutional email before accepting this invitation');
    }
    const normalizedEmail = input.email.trim().toLowerCase();
    const tokenHash = hashInvitationToken(input.token);
    const inv = this.invitations.find((i) => i.tokenHash === tokenHash);
    if (!inv) throw new NotFoundError('Invitation link is invalid or has been superseded');
    if (inv.status === 'revoked') {
      throw new BusinessRuleError('INVITATION_REVOKED', 'This invitation has been revoked');
    }
    if (inv.status === 'accepted') {
      throw new ConflictError('This invitation has already been accepted');
    }
    if (new Date(inv.expiresAt).getTime() <= Date.now() || inv.status === 'expired') {
      inv.status = 'expired';
      throw new BusinessRuleError('INVITATION_EXPIRED', 'This invitation link has expired');
    }
    if (inv.normalizedEmail !== normalizedEmail) {
      throw new ForbiddenError(
        `This invitation was issued to ${inv.inviteeEmail}. Sign in with that institutional email to accept.`,
      );
    }

    const user = await this.provisionAuthenticatedUser({
      authUserId: input.authUserId,
      email: input.email,
      name: input.name,
      department: input.department,
      yearOfStudy: input.yearOfStudy,
      emailVerified: input.emailVerified,
      isBootstrapSuperAdmin: input.isBootstrapSuperAdmin,
    });

    if (isClubOfficerRole(inv.intendedRole)) {
      const idx = this.memberships.findIndex(
        (m) => m.clubId === inv.clubId && m.role === inv.intendedRole && m.userId !== user.id,
      );
      if (idx !== -1) this.memberships.splice(idx, 1);
    }

    const membership = await this.upsertClubMembership({
      clubId: inv.clubId,
      userId: user.id,
      role: inv.intendedRole,
      title: inv.title,
      permissions: inv.permissions,
      assignedByUserId: inv.inviterUserId || undefined,
    });

    const now = new Date().toISOString();
    inv.status = 'accepted';
    inv.acceptedAt = now;
    inv.updatedAt = now;

    return {
      invitation: this.stripInvitationSecret(inv),
      membership,
      user,
    };
  }

  async getFollowsForUser(userId: string): Promise<ClubFollow[]> {
    return this.follows.filter((f) => f.userId === userId);
  }

  async followClub(userId: string, clubId: string): Promise<ClubFollow> {
    const club = this.clubs.find((c) => c.id === clubId || c.slug === clubId);
    if (!club) throw new NotFoundError('Club not found');
    if (club.status !== 'active') {
      throw new BusinessRuleError(
        'CLUB_NOT_ACTIVE',
        `Cannot follow ${club.name} because its status is ${club.status.replace('_', ' ')}`,
        {status: club.status},
      );
    }

    const already = this.follows.find((f) => f.userId === userId && f.clubId === club.id);
    if (already) {
      throw new ConflictError('You are already following this club');
    }

    const userFollows = this.follows.filter((f) => f.userId === userId);
    if (userFollows.length >= MAX_FOLLOWED_CLUBS) {
      throw new BusinessRuleError(
        'MAX_CLUB_FOLLOW_LIMIT_REACHED',
        `Students can follow a maximum of ${MAX_FOLLOWED_CLUBS} clubs. Unfollow an existing club before following ${club.name}.`,
        {limit: MAX_FOLLOWED_CLUBS, currentCount: userFollows.length},
      );
    }

    const follow: ClubFollow = {
      id: `fol-${Date.now()}`,
      userId,
      clubId: club.id,
      followedAt: new Date().toISOString(),
    };
    this.follows.push(follow);
    club.followerCount += 1;
    return {...follow};
  }

  async unfollowClub(userId: string, clubId: string): Promise<boolean> {
    const idx = this.follows.findIndex((f) => f.userId === userId && f.clubId === clubId);
    if (idx === -1) return false;
    this.follows.splice(idx, 1);
    const club = this.clubs.find((c) => c.id === clubId);
    if (club && club.followerCount > 0) club.followerCount -= 1;
    return true;
  }

  async getHallOfFame(): Promise<HallOfFameEntry[]> {
    const activeClubs = this.clubs
      .filter((c) => c.status === 'active')
      .sort((a, b) => {
        if (b.followerCount !== a.followerCount) {
          return b.followerCount - a.followerCount;
        }
        return a.name.localeCompare(b.name);
      });

    let currentRank = 1;
    return activeClubs.map((club, index) => {
      if (index > 0 && club.followerCount < activeClubs[index - 1].followerCount) {
        currentRank = index + 1;
      }
      const tieCount = activeClubs.filter(
        (other) => other.followerCount === club.followerCount,
      ).length;
      const eventsHosted = this.events.filter(
        (e) =>
          e.clubId === club.id &&
          ['published', 'registration_open', 'registration_closed', 'completed'].includes(
            e.status,
          ),
      ).length;
      return {
        rank: currentRank,
        club: {...club},
        followerCount: club.followerCount,
        eventsHosted,
        tieCount,
      };
    });
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
    const filtered = this.events
      .filter((ev) => {
        if (filters?.clubId && ev.clubId !== filters.clubId) return false;
        if (filters?.category && filters.category !== 'All' && ev.category !== filters.category) {
          return false;
        }
        if (filters?.status && filters.status !== 'All' && ev.status !== filters.status) {
          return false;
        }
        if (
          filters?.upcomingOnly &&
          ev.status !== 'published' &&
          ev.status !== 'registration_open'
        ) {
          return false;
        }
        if (filters?.search) {
          const q = filters.search.trim().toLowerCase();
          if (q) {
            return (
              ev.title.toLowerCase().includes(q) ||
              ev.clubName.toLowerCase().includes(q) ||
              ev.venue.toLowerCase().includes(q)
            );
          }
        }
        return true;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((e) => ({
        ...e,
        waitlistedCount: this.registrations.filter(
          (r) => r.eventId === e.id && r.status === 'waitlisted',
        ).length,
      }));

    if (filters?.page && filters?.pageSize) {
      const page = Math.max(1, filters.page);
      const pageSize = Math.min(100, Math.max(1, filters.pageSize));
      return filtered.slice((page - 1) * pageSize, page * pageSize);
    }

    return filtered;
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
    const all = await this.listEvents({...filters, page: undefined, pageSize: undefined});
    const page = Math.max(1, filters?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 24));
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    return {
      items: all.slice((safePage - 1) * pageSize, safePage * pageSize),
      pagination: {
        total,
        page: safePage,
        pageSize,
        totalPages,
      },
    };
  }

  async getEventById(eventId: string): Promise<EventItem | null> {
    const ev = this.events.find((e) => e.id === eventId || e.slug === eventId);
    if (!ev) return null;
    return {
      ...ev,
      waitlistedCount: this.registrations.filter(
        (r) => r.eventId === ev.id && r.status === 'waitlisted',
      ).length,
    };
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
    const club = this.clubs.find((c) => c.id === clubId);
    if (!club) throw new NotFoundError('Club not found');
    const now = new Date().toISOString();
    const ev: EventItem = {
      id: `evt-${Date.now()}`,
      clubId: club.id,
      clubName: club.name,
      ...input,
      registeredCount: 0,
      waitlistedCount: 0,
      attendedCount: 0,
      status: 'draft',
      bannerUrl: club.logoUrl || '/src/assets/images/event_hackathon_banner_1795447592033.jpg',
      createdAt: now,
      updatedAt: now,
    };
    this.events.push(ev);
    this.forms.set(ev.id, {
      id: `frm-${ev.id}`,
      eventId: ev.id,
      version: 1,
      status: 'draft',
      publishedVersion: 0,
      title: `${ev.title} Registration`,
      description: '',
      fields: [
        {
          id: 'fld-track',
          label: 'Participation Role',
          type: 'select',
          required: true,
          options: ['Participant', 'Observer'],
        },
        {
          id: 'fld-code-conduct',
          label: 'I agree to follow the CampusVerse Event Code of Conduct',
          type: 'checkbox',
          required: true,
        },
      ],
      updatedAt: now,
    });
    return {...ev};
  }

  async updateEvent(eventId: string, updates: Partial<EventItem>): Promise<EventItem | null> {
    const ev = this.events.find((e) => e.id === eventId);
    if (!ev) return null;
    if (updates.capacity !== undefined && updates.capacity < ev.registeredCount) {
      throw new BusinessRuleError(
        'CAPACITY_BELOW_REGISTERED',
        `Capacity cannot be lowered below active confirmed/attended seats (${ev.registeredCount})`,
      );
    }
    Object.assign(ev, updates, {updatedAt: new Date().toISOString()});
    return {...ev};
  }

  async updateEventLifecycle(
    eventId: string,
    targetStatus: EventStatus,
  ): Promise<EventItem | null> {
    const ev = this.events.find((e) => e.id === eventId);
    if (!ev) return null;
    const club = this.clubs.find((c) => c.id === ev.clubId);
    if (
      (targetStatus === 'published' || targetStatus === 'registration_open') &&
      club &&
      club.status !== 'active'
    ) {
      throw new BusinessRuleError(
        'CLUB_NOT_ACTIVE',
        `Events for ${club.name} cannot be published while club status is ${club.status}`,
      );
    }
    if (ev.status === 'cancelled' && targetStatus !== 'cancelled') {
      throw new BusinessRuleError(
        'INVALID_EVENT_TRANSITION',
        'Cancelled events cannot be reopened',
      );
    }
    ev.status = targetStatus;
    ev.updatedAt = new Date().toISOString();
    return {...ev};
  }

  async publishEvent(eventId: string): Promise<EventItem | null> {
    return this.updateEventLifecycle(eventId, 'published');
  }

  async getRegistrationForm(eventId: string): Promise<RegistrationForm> {
    const existing = this.forms.get(eventId);
    if (existing) return {...existing, fields: [...existing.fields]};
    const fallback: RegistrationForm = {
      id: `frm-${eventId}`,
      eventId,
      version: 1,
      status: 'draft',
      publishedVersion: 0,
      title: 'Event Registration',
      description: '',
      fields: [
        {
          id: 'fld-notes',
          label: 'Registration Notes',
          type: 'text',
          required: false,
          placeholder: 'Any dietary or accessibility needs',
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    this.forms.set(eventId, fallback);
    return fallback;
  }

  async upsertRegistrationForm(
    eventId: string,
    fields: FormField[],
    meta?: {title?: string; description?: string; updatedBy?: string},
  ): Promise<RegistrationForm> {
    const ev = this.events.find((e) => e.id === eventId);
    if (!ev) throw new NotFoundError('Event not found');
    const current = this.forms.get(eventId);
    const updated: RegistrationForm = {
      id: current?.id || `frm-${eventId}`,
      eventId,
      version: (current?.version || 0) + 1,
      status: 'draft',
      publishedVersion: current?.publishedVersion ?? 0,
      title: meta?.title?.trim() || current?.title || `${ev.title} Registration`,
      description:
        meta?.description !== undefined ? meta.description.trim() : current?.description || '',
      fields: fields.map((f) => ({...f})),
      updatedAt: new Date().toISOString(),
    };
    this.forms.set(eventId, updated);
    return {...updated};
  }

  async publishRegistrationForm(
    eventId: string,
    publishedBy?: string,
  ): Promise<EventFormVersion> {
    const ev = this.events.find((e) => e.id === eventId);
    if (!ev) throw new NotFoundError('Event not found');
    const form = await this.getRegistrationForm(eventId);
    const nextVer = (form.publishedVersion || 0) + 1;
    const now = new Date().toISOString();
    form.publishedVersion = nextVer;
    form.version = Math.max(form.version, nextVer);
    form.status = 'published';
    form.updatedAt = now;
    this.forms.set(eventId, form);

    const snapshot: EventFormVersion = {
      id: `frm-ver-${eventId}-${nextVer}`,
      formId: form.id,
      eventId,
      version: nextVer,
      title: form.title || `${ev.title} Registration`,
      description: form.description || '',
      fields: form.fields.map((f) => ({...f})),
      publishedBy: publishedBy ?? null,
      publishedAt: now,
    };
    this.formVersions.push(snapshot);
    return {...snapshot};
  }

  async getPublishedFormVersion(
    eventId: string,
    version?: number,
  ): Promise<EventFormVersion | null> {
    const matches = this.formVersions
      .filter((v) => v.eventId === eventId)
      .sort((a, b) => b.version - a.version);
    if (typeof version === 'number') {
      return matches.find((m) => m.version === version) || null;
    }
    return matches[0] || null;
  }

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
    const ev = this.events.find((e) => e.id === input.eventId);
    if (!ev) throw new NotFoundError('Event not found');
    if (ev.status !== 'published' && ev.status !== 'registration_open') {
      throw new BusinessRuleError(
        'EVENT_NOT_OPEN',
        'Registrations are only allowed while registration is open',
      );
    }
    const now = new Date();
    if (ev.registrationOpensAt && now < new Date(ev.registrationOpensAt)) {
      throw new BusinessRuleError(
        'REGISTRATION_NOT_OPEN_YET',
        `Registration opens at ${ev.registrationOpensAt}`,
      );
    }
    if (ev.registrationDeadline && now > new Date(ev.registrationDeadline)) {
      throw new BusinessRuleError(
        'REGISTRATION_DEADLINE_PASSED',
        'Registration deadline for this event has passed',
      );
    }

    const existing = this.registrations.find(
      (r) => r.eventId === input.eventId && r.studentId === input.studentId,
    );
    if (existing && existing.status !== 'cancelled') {
      throw new ConflictError('You are already registered for this event');
    }

    const latestVersion = await this.getPublishedFormVersion(ev.id);
    const status = ev.registeredCount >= ev.capacity ? 'waitlisted' : 'confirmed';
    const regRef = `REG-${generateOpaqueQrToken().slice(7, 19)}`;

    if (existing && existing.status === 'cancelled') {
      existing.status = status;
      existing.answers = input.answers;
      existing.qrToken = '';
      existing.ticketStatus = 'not_released';
      existing.ticketReleasedAt = null;
      existing.qrUsedAt = null;
      existing.formVersion = input.formVersion ?? latestVersion?.version ?? 1;
      existing.formVersionId = input.formVersionId ?? latestVersion?.id ?? null;
      existing.createdAt = now.toISOString();
      if (status === 'confirmed') ev.registeredCount += 1;
      const existingTicket = this.tickets.find((t) => t.registrationId === existing.id);
      const ticketCode = existingTicket?.ticketCode || generateTicketCode();
      if (existingTicket) {
        existingTicket.status = 'not_released';
        existingTicket.tokenHash = null;
        existingTicket.sealedToken = null;
        existingTicket.releasedAt = null;
        existingTicket.revokedAt = null;
        existingTicket.updatedAt = now.toISOString();
      } else {
        this.tickets.push({
          id: `tck-${existing.id}`,
          registrationId: existing.id,
          eventId: ev.id,
          userId: input.studentId,
          studentName: input.studentName,
          studentEmail: input.studentEmail,
          registrationStatus: status,
          ticketCode,
          status: 'not_released',
          tokenHash: null,
          sealedToken: null,
          releasedBy: null,
          releasedAt: null,
          revokedBy: null,
          revokedAt: null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
      }
      return {...existing, ticketCode, ticketStatus: 'not_released', qrToken: ''};
    }

    const ticketCode = generateTicketCode();
    const reg: Registration = {
      id: `reg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      eventId: ev.id,
      eventTitle: ev.title,
      eventStartTime: ev.startTime,
      eventVenue: ev.venue,
      clubId: ev.clubId,
      clubName: ev.clubName,
      studentId: input.studentId,
      studentName: input.studentName,
      studentEmail: input.studentEmail,
      formVersion: input.formVersion ?? latestVersion?.version ?? 1,
      formVersionId: input.formVersionId ?? latestVersion?.id ?? null,
      answers: input.answers,
      status,
      ticketStatus: 'not_released',
      ticketCode,
      ticketReleasedAt: null,
      attendanceStatus: 'not_checked_in',
      waitlistPosition:
        status === 'waitlisted'
          ? this.registrations.filter((r) => r.eventId === ev.id && r.status === 'waitlisted')
              .length + 1
          : null,
      qrToken: '',
      qrUsedAt: null,
      createdAt: now.toISOString(),
    };
    this.registrations.push(reg);
    this.tickets.push({
      id: `tck-${reg.id}`,
      registrationId: reg.id,
      eventId: ev.id,
      userId: input.studentId,
      studentName: input.studentName,
      studentEmail: input.studentEmail,
      registrationStatus: status,
      ticketCode,
      status: 'not_released',
      tokenHash: null,
      sealedToken: null,
      releasedBy: null,
      releasedAt: null,
      revokedBy: null,
      revokedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    if (status === 'confirmed') ev.registeredCount += 1;
    void regRef;
    return {...reg};
  }

  async cancelRegistration(eventId: string, studentId: string, registrationId?: string) {
    const reg = this.registrations.find(
      (r) =>
        r.eventId === eventId &&
        r.studentId === studentId &&
        (!registrationId || r.id === registrationId),
    );
    if (!reg) throw new NotFoundError('Registration not found');
    if (reg.status === 'cancelled') {
      throw new ConflictError('This registration has already been cancelled');
    }
    if (reg.status === 'attended') {
      throw new BusinessRuleError(
        'CANNOT_CANCEL_ATTENDED',
        'Checked-in registrations cannot be cancelled',
      );
    }

    const wasConfirmed = reg.status === 'confirmed';
    const nowIso = new Date().toISOString();
    reg.status = 'cancelled';
    reg.ticketStatus = 'revoked';
    reg.qrToken = '';

    const ticket = this.tickets.find((t) => t.registrationId === reg.id);
    if (ticket) {
      ticket.status = 'revoked';
      ticket.tokenHash = null;
      ticket.sealedToken = null;
      ticket.revokedBy = studentId;
      ticket.revokedAt = nowIso;
      ticket.updatedAt = nowIso;
    }

    const ev = this.events.find((e) => e.id === eventId);
    if (wasConfirmed && ev && ev.registeredCount > 0) {
      ev.registeredCount -= 1;
    }

    let promotedRegistrationId: string | null = null;
    let promotedUserId: string | null = null;

    if (wasConfirmed && ev && ev.registeredCount < ev.capacity) {
      const nextWaitlisted = this.registrations
        .filter((r) => r.eventId === eventId && r.status === 'waitlisted')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (nextWaitlisted) {
        nextWaitlisted.status = 'confirmed';
        nextWaitlisted.waitlistPosition = null;
        ev.registeredCount += 1;
        promotedRegistrationId = nextWaitlisted.id;
        promotedUserId = nextWaitlisted.studentId;
        await this.createNotification({
          userId: nextWaitlisted.studentId,
          title: 'Waitlist Seat Confirmed',
          message: `A seat opened up for ${ev.title}. Your registration is confirmed and your ticket will be available once the club releases tickets.`,
          category: 'registration',
          link: '/app/student/registrations',
        });
      }
    }

    return {
      cancelled: {...reg},
      promotedRegistrationId,
      promotedUserId,
    };
  }

  async listRegistrationsForEventPaginated(
    eventId: string,
    opts?: {page?: number; pageSize?: number; search?: string; status?: string},
  ): Promise<PaginatedResult<Registration>> {
    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, opts?.pageSize ?? 25));
    const filtered = this.registrations
      .filter((r) => {
        if (r.eventId !== eventId) return false;
        if (opts?.status && opts.status !== 'All' && r.status !== opts.status) return false;
        if (opts?.search?.trim()) {
          const q = opts.search.trim().toLowerCase();
          return (
            r.studentName.toLowerCase().includes(q) ||
            r.studentEmail.toLowerCase().includes(q) ||
            (r.ticketCode || '').toLowerCase().includes(q)
          );
        }
        return true;
      })
      .map((r) => {
        const ticket = this.tickets.find((t) => t.registrationId === r.id);
        return {
          ...r,
          ticketStatus: ticket?.status ?? r.ticketStatus ?? 'not_released',
          ticketCode: ticket?.ticketCode ?? r.ticketCode,
          ticketReleasedAt: ticket?.releasedAt ?? r.ticketReleasedAt ?? null,
          qrToken: '',
          attendanceStatus: (r.status === 'attended' || Boolean(r.qrUsedAt)
            ? 'present'
            : 'not_checked_in') as Registration['attendanceStatus'],
        };
      });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    return {
      items: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
      pagination: {
        total,
        page: safePage,
        pageSize,
        totalPages,
      },
    };
  }

  async listRegistrationsForEvent(eventId: string): Promise<Registration[]> {
    const res = await this.listRegistrationsForEventPaginated(eventId, {page: 1, pageSize: 500});
    return res.items;
  }

  async listRegistrationsForStudent(studentId: string): Promise<Registration[]> {
    return this.registrations
      .filter((r) => r.studentId === studentId)
      .map((r) => {
        const ev = this.events.find((e) => e.id === r.eventId);
        const ticket = this.tickets.find((t) => t.registrationId === r.id);
        const ticketStatus: TicketStatus = ticket?.status ?? r.ticketStatus ?? 'not_released';
        const unsealed =
          ticketStatus === 'released' ? unsealTicketToken(ticket?.sealedToken) || r.qrToken : '';
        return {
          ...r,
          ticketStatus,
          ticketCode: ticket?.ticketCode ?? r.ticketCode,
          ticketReleasedAt: ticket?.releasedAt ?? r.ticketReleasedAt ?? null,
          qrToken: unsealed,
          attendanceStatus: (r.status === 'attended' || Boolean(r.qrUsedAt)
            ? 'present'
            : 'not_checked_in') as Registration['attendanceStatus'],
          eventTitle: ev?.title || r.eventTitle,
          eventStartTime: ev?.startTime || r.eventStartTime,
          eventVenue: ev?.venue || r.eventVenue,
          clubId: ev?.clubId || r.clubId,
          clubName: ev?.clubName || r.clubName,
        };
      });
  }

  async getRegistrationById(registrationId: string): Promise<Registration | null> {
    const reg = this.registrations.find((r) => r.id === registrationId);
    if (!reg) return null;
    const ticket = this.tickets.find((t) => t.registrationId === reg.id);
    const ticketStatus: TicketStatus = ticket?.status ?? reg.ticketStatus ?? 'not_released';
    return {
      ...reg,
      ticketStatus,
      ticketCode: ticket?.ticketCode ?? reg.ticketCode,
      ticketReleasedAt: ticket?.releasedAt ?? reg.ticketReleasedAt ?? null,
      qrToken:
        ticketStatus === 'released' ? unsealTicketToken(ticket?.sealedToken) || reg.qrToken : '',
    };
  }

  async getRegistrationByQrToken(eventId: string, qrToken: string): Promise<Registration | null> {
    const raw = qrToken.trim();
    if (!raw) return null;
    const tokenHash = hashInvitationToken(raw);
    const ticket = this.tickets.find((t) => t.tokenHash === tokenHash);
    if (ticket) {
      if (ticket.eventId !== eventId) {
        throw new BusinessRuleError(
          'WRONG_EVENT_TICKET',
          'This ticket belongs to a different event and cannot be checked in here',
        );
      }
      if (ticket.status === 'revoked') {
        throw new BusinessRuleError(
          'TICKET_REVOKED',
          'This ticket has been revoked and cannot be used for check-in',
        );
      }
      if (ticket.status !== 'released') {
        throw new BusinessRuleError(
          'TICKET_NOT_RELEASED',
          'Tickets have not been released for this registration yet',
        );
      }
      const reg = this.registrations.find((r) => r.id === ticket.registrationId);
      return reg ? {...reg, ticketStatus: ticket.status, ticketCode: ticket.ticketCode} : null;
    }

    const codeTicket = this.tickets.find(
      (t) => t.eventId === eventId && t.ticketCode.toUpperCase() === raw.toUpperCase(),
    );
    if (codeTicket) {
      if (codeTicket.status === 'not_released') {
        throw new BusinessRuleError(
          'TICKET_NOT_RELEASED',
          'Ticket has not been released for this participant yet',
        );
      }
      if (codeTicket.status === 'revoked') {
        throw new BusinessRuleError(
          'TICKET_REVOKED',
          'This ticket has been revoked and is no longer valid',
        );
      }
    }
    return null;
  }

  async releaseEventTickets(
    eventId: string,
    actor: {id: string; name: string},
  ): Promise<TicketReleaseSummary> {
    const ev = this.events.find((e) => e.id === eventId);
    if (!ev) throw new NotFoundError('Event not found');
    if (ev.status === 'draft' || ev.status === 'cancelled') {
      throw new BusinessRuleError(
        'EVENT_NOT_TICKET_ELIGIBLE',
        `Cannot release tickets while event status is ${ev.status}`,
      );
    }

    const eligibleRegs = this.registrations.filter(
      (r) => r.eventId === eventId && (r.status === 'confirmed' || r.status === 'attended'),
    );
    const nowIso = new Date().toISOString();
    let releasedCount = 0;
    let alreadyReleasedCount = 0;

    for (const reg of eligibleRegs) {
      let ticket = this.tickets.find((t) => t.registrationId === reg.id);
      if (ticket && ticket.status === 'released') {
        alreadyReleasedCount += 1;
        continue;
      }
      if (ticket && ticket.status === 'revoked') {
        continue;
      }

      const rawToken = generateOpaqueQrToken();
      const tokenHash = hashInvitationToken(rawToken);
      const sealedToken = sealTicketToken(rawToken);
      const ticketCode = ticket?.ticketCode || reg.ticketCode || generateTicketCode();

      if (ticket) {
        ticket.status = 'released';
        ticket.tokenHash = tokenHash;
        ticket.sealedToken = sealedToken;
        ticket.releasedBy = actor.id;
        ticket.releasedAt = nowIso;
        ticket.updatedAt = nowIso;
      } else {
        ticket = {
          id: `tck-${reg.id}`,
          registrationId: reg.id,
          eventId,
          userId: reg.studentId,
          studentName: reg.studentName,
          studentEmail: reg.studentEmail,
          registrationStatus: reg.status,
          ticketCode,
          status: 'released',
          tokenHash,
          sealedToken,
          releasedBy: actor.id,
          releasedAt: nowIso,
          revokedBy: null,
          revokedAt: null,
          createdAt: reg.createdAt,
          updatedAt: nowIso,
        };
        this.tickets.push(ticket);
      }

      reg.ticketStatus = 'released';
      reg.ticketCode = ticketCode;
      reg.ticketReleasedAt = nowIso;
      reg.qrToken = rawToken;

      releasedCount += 1;
      await this.createNotification({
        userId: reg.studentId,
        title: `Ticket Released: ${ev.title}`,
        message: `Your QR pass (${ticketCode}) for ${ev.title} is now available in My Registrations.`,
        category: 'registration',
        link: '/app/student/registrations',
      });
    }

    const releaseTimestamp = ev.ticketsReleasedAt && releasedCount === 0 ? ev.ticketsReleasedAt : nowIso;
    ev.ticketsReleasedAt = releaseTimestamp;
    ev.ticketsReleasedBy = actor.id;
    ev.updatedAt = nowIso;

    return {
      eventId,
      releasedCount,
      alreadyReleasedCount,
      totalReleased: releasedCount + alreadyReleasedCount,
      eligibleCount: eligibleRegs.length,
      ticketsReleasedAt: releaseTimestamp,
      emailDelivery: 'not_configured',
    };
  }

  async listEventTickets(eventId: string): Promise<TicketRecord[]> {
    return this.tickets
      .filter((t) => t.eventId === eventId)
      .map((t) => {
        const reg = this.registrations.find((r) => r.id === t.registrationId);
        return {
          id: t.id,
          registrationId: t.registrationId,
          eventId: t.eventId,
          userId: t.userId,
          studentName: reg?.studentName || t.studentName,
          studentEmail: reg?.studentEmail || t.studentEmail,
          registrationStatus: reg?.status || t.registrationStatus,
          ticketCode: t.ticketCode,
          status: t.status,
          releasedBy: t.releasedBy,
          releasedAt: t.releasedAt,
          revokedBy: t.revokedBy,
          revokedAt: t.revokedAt,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        };
      });
  }

  async listStudentTickets(userId: string): Promise<TicketRecord[]> {
    return this.tickets
      .filter((t) => t.userId === userId)
      .map((t) => {
        const reg = this.registrations.find((r) => r.id === t.registrationId);
        return {
          id: t.id,
          registrationId: t.registrationId,
          eventId: t.eventId,
          userId: t.userId,
          registrationStatus: reg?.status || t.registrationStatus,
          ticketCode: t.ticketCode,
          status: t.status,
          qrToken: t.status === 'released' ? unsealTicketToken(t.sealedToken) : undefined,
          releasedBy: t.releasedBy,
          releasedAt: t.releasedAt,
          revokedBy: t.revokedBy,
          revokedAt: t.revokedAt,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        };
      });
  }

  async getTicketById(ticketId: string): Promise<TicketRecord | null> {
    const t = this.tickets.find((item) => item.id === ticketId);
    if (!t) return null;
    const reg = this.registrations.find((r) => r.id === t.registrationId);
    return {
      id: t.id,
      registrationId: t.registrationId,
      eventId: t.eventId,
      userId: t.userId,
      studentName: reg?.studentName || t.studentName,
      studentEmail: reg?.studentEmail || t.studentEmail,
      registrationStatus: reg?.status || t.registrationStatus,
      ticketCode: t.ticketCode,
      status: t.status,
      releasedBy: t.releasedBy,
      releasedAt: t.releasedAt,
      revokedBy: t.revokedBy,
      revokedAt: t.revokedAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  async revokeTicket(
    ticketId: string,
    actor: {id: string; name: string},
    reason?: string,
  ): Promise<TicketRecord | null> {
    const t = this.tickets.find((item) => item.id === ticketId);
    if (!t) return null;
    const nowIso = new Date().toISOString();
    t.status = 'revoked';
    t.sealedToken = null;
    t.revokedBy = actor.id;
    t.revokedAt = nowIso;
    t.updatedAt = nowIso;

    const reg = this.registrations.find((r) => r.id === t.registrationId);
    if (reg) {
      reg.ticketStatus = 'revoked';
      reg.qrToken = '';
    }

    const ev = this.events.find((e) => e.id === t.eventId);
    await this.createNotification({
      userId: t.userId,
      title: `Ticket Revoked: ${ev?.title || 'Event'}`,
      message: reason
        ? `Your ticket (${t.ticketCode}) was revoked: ${reason}`
        : `Your ticket (${t.ticketCode}) has been revoked by the organizing club.`,
      category: 'registration',
      link: '/app/student/registrations',
    });

    return this.getTicketById(ticketId);
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
  }): Promise<AttendanceRecord> {
    const ev = this.events.find((e) => e.id === input.eventId);
    if (!ev) throw new NotFoundError('Event not found');
    if (ev.status === 'cancelled' || ev.status === 'draft') {
      throw new BusinessRuleError(
        'EVENT_NOT_CHECKIN_ELIGIBLE',
        `Check-in is not allowed while event status is ${ev.status}`,
      );
    }

    const reg = this.registrations.find((r) => r.id === input.registrationId);
    if (!reg) throw new NotFoundError('Registration not found');
    if (reg.eventId !== input.eventId) {
      throw new BusinessRuleError(
        'WRONG_EVENT_TICKET',
        'This registration does not belong to the selected event',
      );
    }
    if (reg.status === 'cancelled') {
      throw new BusinessRuleError(
        'REGISTRATION_CANCELLED',
        'Cancelled registrations cannot be checked in',
      );
    }
    if (reg.status === 'waitlisted') {
      throw new BusinessRuleError(
        'REGISTRATION_WAITLISTED',
        'Waitlisted registrations cannot be checked in until confirmed',
      );
    }

    if (input.method === 'qr_scan') {
      const ticket = this.tickets.find((t) => t.registrationId === input.registrationId);
      if (!ticket || ticket.status === 'not_released') {
        throw new BusinessRuleError(
          'TICKET_NOT_RELEASED',
          'Ticket has not been released for this registration yet',
        );
      }
      if (ticket.status === 'revoked') {
        throw new BusinessRuleError(
          'TICKET_REVOKED',
          'This ticket has been revoked and cannot be used for check-in',
        );
      }
    }

    const existing = this.attendance.find((a) => a.registrationId === input.registrationId);
    if (existing) {
      throw new ConflictError(
        `Duplicate scan prevented: ${input.studentName} was already checked in at ${existing.checkedInAt}`,
      );
    }

    const now = new Date().toISOString();
    reg.status = 'attended';
    reg.qrUsedAt = now;
    ev.attendedCount += 1;

    const record: AttendanceRecord = {
      id: `att-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      eventId: input.eventId,
      registrationId: input.registrationId,
      studentId: input.studentId,
      studentName: input.studentName,
      studentCode: input.studentCode,
      qrToken: input.qrToken,
      method: input.method,
      manualReason: input.manualReason ?? null,
      checkedInBy: input.checkedInBy,
      checkedInAt: now,
    };
    this.attendance.push(record);
    return {...record};
  }

  async listAttendanceForEventPaginated(
    eventId: string,
    opts?: {page?: number; pageSize?: number; search?: string},
  ): Promise<PaginatedResult<AttendanceRecord>> {
    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, opts?.pageSize ?? 25));
    const filtered = this.attendance.filter((a) => {
      if (a.eventId !== eventId) return false;
      if (opts?.search?.trim()) {
        const q = opts.search.trim().toLowerCase();
        return (
          a.studentName.toLowerCase().includes(q) ||
          a.studentCode.toLowerCase().includes(q) ||
          a.checkedInBy.toLowerCase().includes(q)
        );
      }
      return true;
    });
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    return {
      items: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
      pagination: {
        total,
        page: safePage,
        pageSize,
        totalPages,
      },
    };
  }

  async listAttendanceForEvent(eventId: string): Promise<AttendanceRecord[]> {
    return this.attendance.filter((a) => a.eventId === eventId).map((a) => ({...a}));
  }

  async getAttendanceSummary(eventId: string): Promise<AttendanceSummary> {
    const confirmedRegs = this.registrations.filter(
      (r) => r.eventId === eventId && (r.status === 'confirmed' || r.status === 'attended'),
    );
    const confirmedCount = confirmedRegs.length;
    const attendedCount = confirmedRegs.filter((r) => r.status === 'attended').length;
    const evTickets = this.tickets.filter(
      (t) => t.eventId === eventId && confirmedRegs.some((r) => r.id === t.registrationId),
    );
    const ticketsReleasedCount = evTickets.filter((t) => t.status === 'released').length;
    const ticketsNotReleasedCount = Math.max(0, confirmedCount - ticketsReleasedCount);
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
  }

  async upsertEventReport(
    report: Omit<EventReport, 'id' | 'submittedAt'> & {actorRole?: string},
  ): Promise<EventReport> {
    const now = new Date().toISOString();
    const existing = this.eventReports.find((r) => r.eventId === report.eventId);
    const nextStatus: EventReportStatus = report.status === 'draft' ? 'draft' : 'submitted';
    const historyEntry: EventReportHistoryEntry = {
      action:
        existing && existing.status === 'changes_requested' && nextStatus === 'submitted'
          ? 'RESUBMITTED'
          : nextStatus === 'draft'
            ? 'SAVED_DRAFT'
            : 'SUBMITTED',
      status: nextStatus,
      actorId: report.submittedBy,
      actorName: report.submittedByName,
      actorRole: report.actorRole || 'Club Officer',
      notes:
        existing && existing.status === 'changes_requested' && nextStatus === 'submitted'
          ? 'Resubmitted report after addressing review feedback.'
          : undefined,
      timestamp: now,
    };

    if (existing) {
      const nextHistory = [...(existing.history || []), historyEntry];
      Object.assign(existing, report, {
        status: nextStatus,
        history: nextHistory,
        submittedAt: nextStatus === 'submitted' ? now : existing.submittedAt,
        updatedAt: now,
      });
      return {...existing};
    }

    const created: EventReport = {
      id: `rep-evt-${Date.now()}`,
      ...report,
      status: nextStatus,
      history: [historyEntry],
      submittedAt: now,
      updatedAt: now,
    };
    this.eventReports.push(created);
    return {...created};
  }

  async reviewEventReport(
    reportId: string,
    actor: {id: string; name: string},
    input: {
      status: 'under_review' | 'changes_requested' | 'approved' | 'rejected';
      reviewNotes: string;
    },
  ): Promise<EventReport> {
    const existing = this.eventReports.find((r) => r.id === reportId);
    if (!existing) throw new NotFoundError('Report not found');
    const now = new Date().toISOString();
    const entry: EventReportHistoryEntry = {
      action: `REVIEW_${input.status.toUpperCase()}`,
      status: input.status,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: 'Super Admin',
      notes: input.reviewNotes || undefined,
      timestamp: now,
    };
    existing.status = input.status;
    existing.reviewedBy = actor.id;
    existing.reviewedByName = actor.name;
    existing.reviewedAt = now;
    existing.reviewNotes = input.reviewNotes;
    existing.history = [...(existing.history || []), entry];
    existing.updatedAt = now;

    const recipients = new Set<string>([existing.submittedBy]);
    this.memberships
      .filter(
        (m) =>
          m.clubId === existing.clubId &&
          (m.role === 'president' || m.role === 'vice_president'),
      )
      .forEach((m) => recipients.add(m.userId));
    for (const userId of recipients) {
      await this.createNotification({
        userId,
        title: `Event Report ${input.status.replace('_', ' ')}: ${existing.eventTitle}`,
        message: input.reviewNotes
          ? `Super Admin marked the report as ${input.status.replace('_', ' ')}: "${input.reviewNotes}".`
          : `Super Admin marked the report for ${existing.eventTitle} as ${input.status.replace('_', ' ')}.`,
        category: 'admin',
        link: '/app/club-admin/reports',
      });
    }
    return {...existing};
  }

  async getEventReport(eventId: string): Promise<EventReport | null> {
    const r = this.eventReports.find((rep) => rep.eventId === eventId);
    return r ? {...r} : null;
  }

  async listAllEventReports(): Promise<EventReport[]> {
    return [...this.eventReports];
  }

  async upsertFinancialReport(
    report: Omit<FinancialReport, 'id' | 'submittedAt'>,
  ): Promise<FinancialReport> {
    const now = new Date().toISOString();
    const collectionsMinor = report.lineItems
      .filter((i) => i.type === 'collection')
      .reduce((sum, i) => sum + rupeesToMinorUnits(i.amount), 0);
    const expensesMinor = report.lineItems
      .filter((i) => i.type === 'expense')
      .reduce((sum, i) => sum + rupeesToMinorUnits(i.amount), 0);
    const netMinor = collectionsMinor - expensesMinor;

    const payload: FinancialReport = {
      id: `fin-rep-${Date.now()}`,
      ...report,
      totalCollectionsMinorUnits: collectionsMinor,
      totalExpensesMinorUnits: expensesMinor,
      netBalanceMinorUnits: netMinor,
      totalCollections: minorUnitsToRupees(collectionsMinor),
      totalExpenses: minorUnitsToRupees(expensesMinor),
      netBalance: minorUnitsToRupees(netMinor),
      submittedAt: now,
    };

    const existing = this.financialReports.find((r) => r.eventId === report.eventId);
    if (existing) {
      Object.assign(existing, payload, {id: existing.id});
      return {...existing};
    }
    this.financialReports.push(payload);
    return {...payload};
  }

  async getFinancialReport(eventId: string): Promise<FinancialReport | null> {
    const r = this.financialReports.find((rep) => rep.eventId === eventId);
    return r ? {...r} : null;
  }

  async listAllFinancialReports(): Promise<FinancialReport[]> {
    return [...this.financialReports];
  }

  async createFinanceEntry(input: {
    clubId: string;
    eventId?: string | null;
    entryType: FinanceEntryType;
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
    const club = this.clubs.find((c) => c.id === input.clubId);
    if (!club) throw new NotFoundError('Club not found');
    let eventTitle: string | null = null;
    if (input.eventId) {
      const ev = this.events.find((e) => e.id === input.eventId);
      if (!ev) throw new NotFoundError('Linked event not found');
      if (ev.clubId !== club.id) {
        throw new BusinessRuleError(
          'CROSS_CLUB_EVENT_LINK',
          'Linked event does not belong to the selected club',
        );
      }
      eventTitle = ev.title;
    }
    const now = new Date().toISOString();
    const amountMinorUnits = Math.max(0, Math.trunc(input.amountMinorUnits));
    const entry: FinanceEntry = {
      id: `fin-ent-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      clubId: club.id,
      clubName: club.name,
      eventId: input.eventId ?? null,
      eventTitle,
      entryType: input.entryType,
      sourceOrCategory: input.sourceOrCategory.trim(),
      description: input.description.trim(),
      amountMinorUnits,
      amount: minorUnitsToRupees(amountMinorUnits),
      transactionDate: input.transactionDate,
      vendorOrRecipient: input.vendorOrRecipient.trim(),
      receiptUrl: input.receiptUrl?.trim() || '',
      notes: input.notes?.trim() || '',
      createdBy: input.createdBy,
      createdByName: input.createdByName,
      createdAt: now,
      updatedAt: now,
    };
    this.financeEntries.unshift(entry);
    return {...entry};
  }

  async deleteFinanceEntry(clubId: string, entryId: string): Promise<boolean> {
    const idx = this.financeEntries.findIndex((e) => e.id === entryId && e.clubId === clubId);
    if (idx === -1) return false;
    this.financeEntries.splice(idx, 1);
    return true;
  }

  async getFinanceSummary(filters?: {
    clubId?: string;
    eventId?: string;
  }): Promise<FinanceSummaryResponse> {
    const entries = this.financeEntries
      .filter((e) => {
        if (filters?.clubId && e.clubId !== filters.clubId) return false;
        if (filters?.eventId && e.eventId !== filters.eventId) return false;
        return true;
      })
      .map((e) => ({...e}));

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
      clubAgg.netBalanceMinorUnits = clubAgg.totalIncomeMinorUnits - clubAgg.totalExpensesMinorUnits;
      clubAgg.totalIncome = minorUnitsToRupees(clubAgg.totalIncomeMinorUnits);
      clubAgg.totalExpenses = minorUnitsToRupees(clubAgg.totalExpensesMinorUnits);
      clubAgg.netBalance = minorUnitsToRupees(clubAgg.netBalanceMinorUnits);
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
        evAgg.netBalanceMinorUnits = evAgg.totalIncomeMinorUnits - evAgg.totalExpensesMinorUnits;
        evAgg.totalIncome = minorUnitsToRupees(evAgg.totalIncomeMinorUnits);
        evAgg.totalExpenses = minorUnitsToRupees(evAgg.totalExpensesMinorUnits);
        evAgg.netBalance = minorUnitsToRupees(evAgg.netBalanceMinorUnits);
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
      totalIncome: minorUnitsToRupees(totalIncomeMinorUnits),
      totalExpenses: minorUnitsToRupees(totalExpensesMinorUnits),
      netBalance: minorUnitsToRupees(netBalanceMinorUnits),
      byClub: [...byClubMap.values()].sort((a, b) => a.clubName.localeCompare(b.clubName)),
      byEvent: [...byEventMap.values()].sort((a, b) => a.eventTitle.localeCompare(b.eventTitle)),
    };
  }

  async listNotificationsForUser(userId: string): Promise<NotificationItem[]> {
    return this.notifications
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((n) => ({...n}));
  }

  async markNotificationRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationItem | null> {
    const n = this.notifications.find((item) => item.id === notificationId && item.userId === userId);
    if (!n) return null;
    n.read = true;
    return {...n};
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    this.notifications.forEach((n) => {
      if (n.userId === userId) n.read = true;
    });
  }

  async createNotification(
    input: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>,
  ): Promise<NotificationItem> {
    const item: NotificationItem = {
      id: `not-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...input,
      read: false,
      createdAt: new Date().toISOString(),
    };
    this.notifications.unshift(item);
    return {...item};
  }

  async getAdminDashboardStats(): Promise<AdminDashboardStats> {
    const reportCollectionsMinor = this.financialReports.reduce(
      (acc, r) => acc + (r.totalCollectionsMinorUnits ?? rupeesToMinorUnits(r.totalCollections)),
      0,
    );
    const reportExpensesMinor = this.financialReports.reduce(
      (acc, r) => acc + (r.totalExpensesMinorUnits ?? rupeesToMinorUnits(r.totalExpenses)),
      0,
    );
    const ledgerIncomeMinor = this.financeEntries
      .filter((e) => e.entryType === 'income')
      .reduce((acc, e) => acc + e.amountMinorUnits, 0);
    const ledgerExpensesMinor = this.financeEntries
      .filter((e) => e.entryType === 'expense')
      .reduce((acc, e) => acc + e.amountMinorUnits, 0);

    const collectionsMinor = reportCollectionsMinor + ledgerIncomeMinor;
    const expensesMinor = reportExpensesMinor + ledgerExpensesMinor;
    const completedEvents = this.events.filter((e) => e.status === 'completed').length;
    const submittedReportsCount = this.eventReports.filter((r) => r.status !== 'draft').length;
    const awaitingApprovalReportsCount = this.eventReports.filter(
      (r) => r.status === 'submitted' || r.status === 'under_review',
    ).length;

    return {
      totalStudents: this.users.filter((u) => !u.isSuperAdmin).length,
      totalClubs: this.clubs.length,
      activeClubs: this.clubs.filter((c) => c.status === 'active').length,
      totalEvents: this.events.length,
      upcomingEvents: this.events.filter(
        (e) => e.status === 'published' || e.status === 'registration_open',
      ).length,
      completedEvents,
      totalRegistrations: this.registrations.length,
      totalAttendance: this.attendance.length,
      pendingReportsCount: Math.max(0, completedEvents - submittedReportsCount),
      awaitingApprovalReportsCount,
      totalCollections: minorUnitsToRupees(collectionsMinor),
      totalExpenses: minorUnitsToRupees(expensesMinor),
      netBalance: minorUnitsToRupees(collectionsMinor - expensesMinor),
      recentAuditLogs: this.auditLogs.slice(0, 8),
    };
  }

  async getAdminAnalytics(): Promise<AdminAnalyticsResponse> {
    const clubs: ClubOverviewItem[] = this.clubs.map((c) => {
      const members = this.memberships.filter((m) => m.clubId === c.id);
      const president = members.find((m) => m.role === 'president');
      const vp = members.find((m) => m.role === 'vice_president');
      const coreCount = members.filter((m) => m.role === 'core_member').length;
      const clubEvents = this.events.filter((e) => e.clubId === c.id);
      return {
        club: {...c},
        presidentName: president?.userName ?? null,
        presidentEmail: president?.userEmail ?? null,
        vicePresidentName: vp?.userName ?? null,
        vicePresidentEmail: vp?.userEmail ?? null,
        activeCoreCount: coreCount,
        totalMembersCount: members.length,
        upcomingEventsCount: clubEvents.filter(
          (e) => e.status === 'published' || e.status === 'registration_open',
        ).length,
        completedEventsCount: clubEvents.filter((e) => e.status === 'completed').length,
      };
    });

    const events: EventAnalyticsItem[] = this.events.map((ev) => {
      const evRegs = this.registrations.filter((r) => r.eventId === ev.id);
      const confirmedCount = evRegs.filter(
        (r) => r.status === 'confirmed' || r.status === 'attended',
      ).length;
      const attendedCount = evRegs.filter((r) => r.status === 'attended').length;
      const waitlistedCount = evRegs.filter((r) => r.status === 'waitlisted').length;
      const evTickets = this.tickets.filter((t) => t.eventId === ev.id);
      const ticketsReleasedCount = evTickets.filter((t) => t.status === 'released').length;
      const ticketsNotReleasedCount = Math.max(0, confirmedCount - ticketsReleasedCount);
      const report = this.eventReports.find((r) => r.eventId === ev.id);

      let incomeMinor = 0;
      let expensesMinor = 0;
      for (const fr of this.financialReports.filter((f) => f.eventId === ev.id)) {
        incomeMinor += fr.totalCollectionsMinorUnits ?? rupeesToMinorUnits(fr.totalCollections);
        expensesMinor += fr.totalExpensesMinorUnits ?? rupeesToMinorUnits(fr.totalExpenses);
      }
      for (const fe of this.financeEntries.filter((f) => f.eventId === ev.id)) {
        if (fe.entryType === 'income') incomeMinor += fe.amountMinorUnits;
        else expensesMinor += fe.amountMinorUnits;
      }

      return {
        eventId: ev.id,
        title: ev.title,
        clubId: ev.clubId,
        clubName: ev.clubName,
        status: ev.status,
        startTime: ev.startTime,
        venue: ev.venue,
        capacity: ev.capacity,
        confirmedCount,
        waitlistedCount,
        ticketsReleasedCount,
        ticketsNotReleasedCount,
        attendedCount,
        attendancePercentage:
          confirmedCount > 0 ? Math.round((attendedCount / confirmedCount) * 100) : 0,
        reportStatus: report?.status ?? 'not_submitted',
        totalIncome: minorUnitsToRupees(incomeMinor),
        totalExpenses: minorUnitsToRupees(expensesMinor),
        netBalance: minorUnitsToRupees(incomeMinor - expensesMinor),
      };
    });

    return {clubs, events};
  }

  async listAuditLogs(): Promise<AuditLogEntry[]> {
    return [...this.auditLogs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<AuditLogEntry> {
    const log: AuditLogEntry = {
      id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...entry,
      createdAt: new Date().toISOString(),
    };
    this.auditLogs.unshift(log);
    return {...log};
  }

  async getSystemSettings(): Promise<SystemSettings> {
    return {...this.settings};
  }

  async updateSystemSettings(updates: Partial<SystemSettings>): Promise<SystemSettings> {
    if (typeof updates.requireClubApproval === 'boolean') {
      this.settings.requireClubApproval = updates.requireClubApproval;
    }
    if (typeof updates.allowStudentEventFeedback === 'boolean') {
      this.settings.allowStudentEventFeedback = updates.allowStudentEventFeedback;
    }
    return {...this.settings};
  }
}

export const demoDataAdapter = new DemoDataAdapter();
