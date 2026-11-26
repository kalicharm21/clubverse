// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AuthProvider} from '../../src/context/AuthContext.tsx';
import {ToastProvider} from '../../src/context/ToastContext.tsx';
import {apiClient} from '../../src/adapters/ApiDataAdapter.ts';
import {ClubRegistrationsPage} from '../../src/pages/club/ClubRegistrationsPage.tsx';
import {ClubTeamPage} from '../../src/pages/club/ClubTeamPage.tsx';
import {AttendancePage} from '../../src/pages/club/AttendancePage.tsx';
import {AcceptInvitePage} from '../../src/pages/public/AcceptInvitePage.tsx';
import {LandingPage} from '../../src/pages/public/LandingPage.tsx';
import {LoginPage} from '../../src/pages/public/LoginPage.tsx';
import {HallOfFamePage} from '../../src/pages/student/HallOfFamePage.tsx';
import {MyRegistrationsPage} from '../../src/pages/student/MyRegistrationsPage.tsx';
import {StudentDashboardPage} from '../../src/pages/student/StudentDashboardPage.tsx';
import {SafeExternalLink} from '../../src/components/ui/Feedback.tsx';

vi.mock('../../src/adapters/ApiDataAdapter.ts', async () => {
  const actual = await vi.importActual<typeof import('../../src/adapters/ApiDataAdapter.ts')>(
    '../../src/adapters/ApiDataAdapter.ts',
  );
  const mockClient = Object.assign(
    Object.create(Object.getPrototypeOf(actual.apiClient)),
    actual.apiClient,
    {
      setAuthToken: vi.fn(),
      getAuthConfig: vi.fn().mockResolvedValue({
        mode: 'demo',
        persistenceMode: 'in_memory_demo',
        demoModeEnabled: true,
        supabaseUrl: null,
        supabasePublishableKey: null,
        institutionalEmailDomains: ['vitbhopal.ac.in'],
      }),
      listDemoPersonas: vi.fn().mockResolvedValue([
        {
          id: 'usr-student-1',
          name: 'Aarav Mehta',
          email: 'aarav.mehta@campusverse.edu',
          department: 'CS',
          yearOfStudy: 'Year 3',
          studentId: 'STU-1',
          isSuperAdmin: false,
          status: 'active',
          emailVerified: true,
          avatarInitials: 'AM',
          createdAt: '2026-08-01T00:00:00Z',
        },
        {
          id: 'usr-super-admin',
          name: 'Dr. Elena Vance',
          email: 'elena.vance@campusverse.edu',
          department: 'Student Affairs',
          yearOfStudy: 'Dean',
          studentId: 'FAC-1',
          isSuperAdmin: true,
          status: 'active',
          emailVerified: true,
          avatarInitials: 'EV',
          createdAt: '2026-07-01T00:00:00Z',
        },
      ]),
      getHallOfFame: vi.fn().mockResolvedValue([
        {
          rank: 1,
          followerCount: 342,
          eventsHosted: 2,
          tieCount: 1,
          club: {
            id: 'club-robotics',
            name: 'Apex Robotics Lab',
            slug: 'apex-robotics-lab',
            category: 'Robotics & Hardware',
            tagline: 'Autonomous rovers and embedded firmware.',
            description: 'Robotics club',
            logoUrl: '',
            status: 'active',
            followerCount: 342,
            memberCount: 28,
            upcomingEventsCount: 2,
            foundedYear: 2018,
            meetingSchedule: 'Wed',
            contactEmail: 'robotics@campusverse.edu',
            createdAt: '2026-08-01T00:00:00Z',
          },
        },
        {
          rank: 2,
          followerCount: 289,
          eventsHosted: 2,
          tieCount: 2,
          club: {
            id: 'club-design',
            name: 'Atelier Design Guild',
            slug: 'atelier-design-guild',
            category: 'Design',
            tagline: 'Product design critiques and typography.',
            description: 'Design club',
            logoUrl: '',
            status: 'active',
            followerCount: 289,
            memberCount: 22,
            upcomingEventsCount: 2,
            foundedYear: 2020,
            meetingSchedule: 'Thu',
            contactEmail: 'atelier@campusverse.edu',
            createdAt: '2026-08-02T00:00:00Z',
          },
        },
        {
          rank: 2,
          followerCount: 289,
          eventsHosted: 1,
          tieCount: 2,
          club: {
            id: 'club-music',
            name: 'Resonance Acoustic Society',
            slug: 'resonance-acoustic-society',
            category: 'Music & Arts',
            tagline: 'Live acoustic sessions.',
            description: 'Music club',
            logoUrl: '',
            status: 'active',
            followerCount: 289,
            memberCount: 31,
            upcomingEventsCount: 1,
            foundedYear: 2016,
            meetingSchedule: 'Fri',
            contactEmail: 'resonance@campusverse.edu',
            createdAt: '2026-08-03T00:00:00Z',
          },
        },
      ]),
    },
  );
  return {
    ...actual,
    apiClient: mockClient,
  };
});

function renderWithProviders(ui: React.ReactElement, initialEntries: string[] = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false}},
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('CampusVerse Frontend Components', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders public LandingPage with CampusVerse top bar and primary CTA', () => {
    renderWithProviders(<LandingPage />);
    expect(screen.getByRole('link', {name: 'CampusVerse'})).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /One operational system for every campus club and student event/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', {name: /Open Campus Portal/i})).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('renders LoginPage with isolated Development Auth Adapter when demoModeEnabled is true', async () => {
    renderWithProviders(<LoginPage />);
    expect(await screen.findByText(/Phase 1 Development Auth Adapter/i)).toBeInTheDocument();
    expect(await screen.findByText('Aarav Mehta')).toBeInTheDocument();
    expect(screen.getByText('Dr. Elena Vance')).toBeInTheDocument();
  });

  it('hides demo personas when PostgreSQL & Supabase Auth mode is active', async () => {
    const {apiClient: mockedClient} = await import('../../src/adapters/ApiDataAdapter.ts');
    vi.mocked(mockedClient.getAuthConfig).mockResolvedValueOnce({
      mode: 'supabase',
      persistenceMode: 'postgres',
      demoModeEnabled: false,
      supabaseUrl: 'https://example.supabase.co',
      supabasePublishableKey: 'sb_publishable_test',
      institutionalEmailDomains: ['vitbhopal.ac.in'],
    });
    renderWithProviders(<LoginPage />);
    expect(await screen.findByText(/Institutional Single Workspace/i)).toBeInTheDocument();
    expect(screen.queryByText(/Phase 1 Development Auth Adapter/i)).not.toBeInTheDocument();
  });

  it('renders HallOfFamePage with top 3 clubs and tie indicators', async () => {
    renderWithProviders(<HallOfFamePage />);
    expect(await screen.findByText('Apex Robotics Lab')).toBeInTheDocument();
    expect(screen.getByText('Atelier Design Guild')).toBeInTheDocument();
    expect(screen.getByText('Resonance Acoustic Society')).toBeInTheDocument();
    expect(screen.getAllByText(/Rank #2 \(Tied\)/)).toHaveLength(2);
  });
});

describe('CampusVerse Phase 3 & Phase 4 Frontend Workflows', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows all clubs tied at rank #3 inside the Hall of Fame podium showcase', async () => {
    const spy = vi.spyOn(apiClient, 'getHallOfFame').mockResolvedValue([
      {
        rank: 1,
        followerCount: 10,
        eventsHosted: 2,
        tieCount: 1,
        club: {
          id: 'c1',
          name: 'First Place Club',
          slug: 'first',
          category: 'Technology',
          tagline: 'Leader',
          description: 'Desc',
          logoUrl: '',
          status: 'active',
          followerCount: 10,
          memberCount: 5,
          upcomingEventsCount: 1,
          foundedYear: 2020,
          meetingSchedule: 'Mon',
          contactEmail: 'a@campusverse.edu',
          createdAt: '2026-08-01T00:00:00Z',
        },
      },
      {
        rank: 2,
        followerCount: 6,
        eventsHosted: 1,
        tieCount: 1,
        club: {
          id: 'c2',
          name: 'Second Place Club',
          slug: 'second',
          category: 'Design',
          tagline: 'Runner up',
          description: 'Desc',
          logoUrl: '',
          status: 'active',
          followerCount: 6,
          memberCount: 4,
          upcomingEventsCount: 1,
          foundedYear: 2021,
          meetingSchedule: 'Tue',
          contactEmail: 'b@campusverse.edu',
          createdAt: '2026-08-01T00:00:00Z',
        },
      },
      {
        rank: 3,
        followerCount: 4,
        eventsHosted: 1,
        tieCount: 2,
        club: {
          id: 'c3',
          name: 'Third Place Tie Alpha',
          slug: 'third-a',
          category: 'Music & Arts',
          tagline: 'Tied 3rd A',
          description: 'Desc',
          logoUrl: '',
          status: 'active',
          followerCount: 4,
          memberCount: 3,
          upcomingEventsCount: 0,
          foundedYear: 2022,
          meetingSchedule: 'Wed',
          contactEmail: 'c@campusverse.edu',
          createdAt: '2026-08-01T00:00:00Z',
        },
      },
      {
        rank: 3,
        followerCount: 4,
        eventsHosted: 0,
        tieCount: 2,
        club: {
          id: 'c4',
          name: 'Third Place Tie Beta',
          slug: 'third-b',
          category: 'Social Impact',
          tagline: 'Tied 3rd B',
          description: 'Desc',
          logoUrl: '',
          status: 'active',
          followerCount: 4,
          memberCount: 3,
          upcomingEventsCount: 0,
          foundedYear: 2023,
          meetingSchedule: 'Thu',
          contactEmail: 'd@campusverse.edu',
          createdAt: '2026-08-01T00:00:00Z',
        },
      },
    ]);

    try {
      renderWithProviders(<HallOfFamePage />);
      expect(await screen.findByText('First Place Club')).toBeInTheDocument();
      expect(screen.getByText('Third Place Tie Alpha')).toBeInTheDocument();
      expect(screen.getByText('Third Place Tie Beta')).toBeInTheDocument();
      expect(screen.getAllByText(/Rank #3 \(Tied\)/)).toHaveLength(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('renders ClubTeamPage with 4-scanner quota meter and Invite Team Member modal restricted for non-President', async () => {
    renderWithProviders(<ClubTeamPage />);
    expect(await screen.findByText(/Core Member QR Scanner Quota/i)).toBeInTheDocument();
    expect(screen.getByText(/0 \/ 4 slots used/i)).toBeInTheDocument();
    const inviteButton = await screen.findByRole('button', {name: /Invite Team Member/i});
    fireEvent.click(inviteButton);
    expect(await screen.findByText(/Invite Club Team Member/i)).toBeInTheDocument();
    expect(screen.getByText('Core Member (Scoped)')).toBeInTheDocument();
  });

  it('renders AcceptInvitePage with club leadership invitation preview from query token', async () => {
    const previewSpy = vi.spyOn(apiClient, 'previewInvitation').mockResolvedValue({
      clubName: 'Apex Robotics Lab',
      clubSlug: 'apex-robotics-lab',
      hasExistingAccount: false,
      invitation: {
        id: 'inv-1',
        clubId: 'club-robotics',
        clubName: 'Apex Robotics Lab',
        inviteeEmail: 'ananya@vitbhopal.ac.in',
        intendedRole: 'core_member',
        title: 'Gate Scanner Lead',
        permissions: ['SCAN_ATTENDANCE', 'VIEW_REGISTRATIONS'],
        status: 'pending',
        expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    try {
      renderWithProviders(<AcceptInvitePage />, ['/accept-invite?token=CV-INV-TESTTOKEN1234567890']);
      expect(await screen.findByText(/Join Apex Robotics Lab/i)).toBeInTheDocument();
      expect(screen.getByText('ananya@vitbhopal.ac.in')).toBeInTheDocument();
      expect(screen.getByText(/Gate Scanner Lead/i)).toBeInTheDocument();
    } finally {
      previewSpy.mockRestore();
    }
  });

  it('renders ClubRegistrationsPage and AttendancePage Phase 5 ticket release, metrics & scanner controls', async () => {
    renderWithProviders(<ClubRegistrationsPage />);
    expect(await screen.findByText(/Participant Directory & Ticket Management/i)).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /Export CSV/i})).toBeInTheDocument();
    cleanup();

    renderWithProviders(<AttendancePage />);
    expect(await screen.findByText(/Attendance & QR Check-In Gate/i)).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /Export Attendance CSV/i})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /Open QR Scanner/i})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /Verify & Check In/i})).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Tickets Released')).toBeInTheDocument();
    expect(screen.getByText('Not Released')).toBeInTheDocument();
    expect(screen.getByText('Checked In')).toBeInTheDocument();
    expect(screen.getByText('Remaining')).toBeInTheDocument();
    expect(screen.getByText('Attendance %')).toBeInTheDocument();
  });

  it('SafeExternalLink renders canonical Instagram links safely and suppresses javascript: XSS URIs', () => {
    render(
      <div>
        <SafeExternalLink href="https://www.instagram.com/apexroboticslab/">
          Instagram Profile
        </SafeExternalLink>
        <SafeExternalLink href="javascript:alert(1)">Blocked XSS Link</SafeExternalLink>
      </div>,
    );

    const safeAnchor = screen.getByRole('link', {name: 'Instagram Profile'});
    expect(safeAnchor).toHaveAttribute('href', 'https://www.instagram.com/apexroboticslab/');
    expect(safeAnchor).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByText('Blocked XSS Link')).not.toBeInTheDocument();
  });

  it('MyRegistrationsPage hides QR pass when ticketStatus is not_released and reveals it only when released', async () => {
    const regSpy = vi.spyOn(apiClient, 'listMyRegistrations').mockResolvedValue([
      {
        id: 'reg-unreleased',
        eventId: 'evt-1',
        eventTitle: 'Unreleased Ticket Event',
        eventStartTime: '2026-12-20T10:00:00Z',
        eventVenue: 'Hall 1',
        clubId: 'club-1',
        clubName: 'Apex Robotics Lab',
        studentId: 'stu-1',
        studentName: 'Aarav Mehta',
        studentEmail: 'aarav@campusverse.edu',
        answers: {},
        status: 'confirmed',
        ticketStatus: 'not_released',
        ticketCode: 'TCK-PEND-1',
        qrToken: '',
        qrUsedAt: null,
        createdAt: '2026-11-20T10:00:00Z',
      },
      {
        id: 'reg-released',
        eventId: 'evt-2',
        eventTitle: 'Released Ticket Event',
        eventStartTime: '2026-12-21T10:00:00Z',
        eventVenue: 'Hall 2',
        clubId: 'club-1',
        clubName: 'Apex Robotics Lab',
        studentId: 'stu-1',
        studentName: 'Aarav Mehta',
        studentEmail: 'aarav@campusverse.edu',
        answers: {},
        status: 'confirmed',
        ticketStatus: 'released',
        ticketCode: 'TCK-REL-2',
        qrToken: 'CV-TCK-TEST12345678',
        qrUsedAt: null,
        createdAt: '2026-11-20T11:00:00Z',
      },
    ]);

    try {
      renderWithProviders(<MyRegistrationsPage />);
      expect(await screen.findByText('Unreleased Ticket Event')).toBeInTheDocument();
      expect(screen.getByText('Released Ticket Event')).toBeInTheDocument();
      expect(screen.getByText(/Ticket pending release/i)).toBeInTheDocument();
      expect(screen.getAllByRole('button', {name: /Open QR Pass/i})).toHaveLength(1);
    } finally {
      regSpy.mockRestore();
    }
  });

  it('StudentDashboardPage renders Active Events feed from paginated API', async () => {
    const eventsSpy = vi.spyOn(apiClient, 'listEventsPaginated').mockResolvedValue({
      items: [
        {
          id: 'evt-active-1',
          clubId: 'club-robotics',
          clubName: 'Apex Robotics Lab',
          title: 'Active Rover Build Sprint',
          category: 'Workshop',
          description: 'Live active event',
          venue: 'Hangar B2',
          startTime: '2026-12-20T10:00:00Z',
          endTime: '2026-12-20T14:00:00Z',
          registrationDeadline: '2026-12-19T23:59:00Z',
          capacity: 50,
          registeredCount: 12,
          attendedCount: 0,
          status: 'registration_open',
          bannerUrl: '',
          isPaid: false,
          feeAmount: 0,
          createdAt: '2026-11-20T00:00:00Z',
          updatedAt: '2026-11-20T00:00:00Z',
        },
      ],
      pagination: {page: 1, pageSize: 6, total: 1, totalPages: 1},
    });
    const clubsSpy = vi.spyOn(apiClient, 'listClubs').mockResolvedValue([]);
    const regsSpy = vi.spyOn(apiClient, 'listMyRegistrations').mockResolvedValue([]);
    const notifSpy = vi.spyOn(apiClient, 'listNotifications').mockResolvedValue([]);

    try {
      renderWithProviders(<StudentDashboardPage />);
      expect(await screen.findByRole('heading', {name: /Active Events/i})).toBeInTheDocument();
      expect(await screen.findByText('Active Rover Build Sprint')).toBeInTheDocument();
    } finally {
      eventsSpy.mockRestore();
      clubsSpy.mockRestore();
      regsSpy.mockRestore();
      notifSpy.mockRestore();
    }
  });
});
