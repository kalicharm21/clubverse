import React, {useMemo, useState} from 'react';
import {flushSync} from 'react-dom';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {
  Award,
  BarChart3,
  Bell,
  Building2,
  Calendar,
  ChevronRight,
  Compass,
  DollarSign,
  FileSpreadsheet,
  FileText,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  QrCode,
  Search,
  Settings,
  ShieldCheck,
  Ticket,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import {Link, NavLink, Outlet, useLocation, useNavigate} from 'react-router-dom';
import {
  CLUB_ROLE_LABELS,
  isClubOfficerRole,
} from '../../../shared/constants/permissions.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {useAuth, type WorkspaceContextType} from '../../context/AuthContext.tsx';
import {PWAInstallButton} from '../pwa/PWAInstallButton.tsx';
import {ErrorBoundary} from '../ui/ErrorBoundary.tsx';

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  visible?: boolean;
}

const CONTEXT_LABELS: Record<WorkspaceContextType, string> = {
  student: 'Student Workspace',
  club_admin: 'Club Officer',
  core_member: 'Core Member',
  super_admin: 'Super Admin',
};

export const AppShell: React.FC = () => {
  const {
    user,
    memberships,
    activeContext,
    activeClubId,
    activeMembership,
    switchContext,
    hasPermission,
    logout,
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const {data: notifications = []} = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => apiClient.listNotifications(),
    enabled: Boolean(user),
  });

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiClient.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({queryKey: ['notifications']}),
  });

  const markAllMutation = useMutation({
    mutationFn: () => apiClient.markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({queryKey: ['notifications']}),
  });

  const navItems: NavItem[] = useMemo(() => {
    if (activeContext === 'student') {
      return [
        {label: 'Overview', to: '/app/student/dashboard', icon: <Home className="h-4 w-4" />},
        {label: 'Explore Clubs', to: '/app/student/clubs', icon: <Compass className="h-4 w-4" />},
        {label: 'Hall of Fame', to: '/app/student/hall-of-fame', icon: <Award className="h-4 w-4" />},
        {label: 'Events', to: '/app/student/events', icon: <Calendar className="h-4 w-4" />},
        {label: 'My Registrations', to: '/app/student/registrations', icon: <Ticket className="h-4 w-4" />},
        {label: 'Settings', to: '/app/student/settings', icon: <Settings className="h-4 w-4" />},
      ];
    }

    if (activeContext === 'club_admin') {
      return [
        {label: 'Club Overview', to: '/app/club-admin/dashboard', icon: <LayoutDashboard className="h-4 w-4" />},
        {label: 'Club Profile', to: '/app/club-admin/profile', icon: <Building2 className="h-4 w-4" />},
        {label: 'Team & Permissions', to: '/app/club-admin/team', icon: <Users className="h-4 w-4" />},
        {label: 'Events', to: '/app/club-admin/events', icon: <Calendar className="h-4 w-4" />},
        {label: 'Form Builder', to: '/app/club-admin/forms', icon: <FileSpreadsheet className="h-4 w-4" />},
        {label: 'Registrations', to: '/app/club-admin/registrations', icon: <Ticket className="h-4 w-4" />},
        {label: 'Attendance & QR', to: '/app/club-admin/attendance', icon: <QrCode className="h-4 w-4" />},
        {label: 'Reports & Finance', to: '/app/club-admin/reports', icon: <BarChart3 className="h-4 w-4" />},
        {label: 'Club Settings', to: '/app/club-admin/settings', icon: <Settings className="h-4 w-4" />},
      ];
    }

    if (activeContext === 'core_member') {
      return [
        {label: 'Core Overview', to: '/app/core/dashboard', icon: <LayoutDashboard className="h-4 w-4" />},
        {
          label: 'Events',
          to: '/app/core/events',
          icon: <Calendar className="h-4 w-4" />,
          visible: hasPermission('MANAGE_EVENTS'),
        },
        {
          label: 'Form Builder',
          to: '/app/core/forms',
          icon: <FileSpreadsheet className="h-4 w-4" />,
          visible: hasPermission('MANAGE_FORMS'),
        },
        {
          label: 'Registrations',
          to: '/app/core/registrations',
          icon: <Ticket className="h-4 w-4" />,
          visible: hasPermission('VIEW_REGISTRATIONS'),
        },
        {
          label: 'Attendance QR',
          to: '/app/core/attendance',
          icon: <QrCode className="h-4 w-4" />,
          visible: hasPermission('SCAN_ATTENDANCE'),
        },
        {
          label: 'Reports',
          to: '/app/core/reports',
          icon: <FileText className="h-4 w-4" />,
          visible: hasPermission('SUBMIT_EVENT_REPORTS') || hasPermission('SUBMIT_FINANCE_REPORTS'),
        },
        {label: 'Profile & Role', to: '/app/core/profile', icon: <UserCog className="h-4 w-4" />},
      ].filter((item) => item.visible !== false);
    }

    // super_admin
    return [
      {label: 'Institution Overview', to: '/app/admin/dashboard', icon: <LayoutDashboard className="h-4 w-4" />},
      {label: 'Club Directory', to: '/app/admin/clubs', icon: <Building2 className="h-4 w-4" />},
      {label: 'User Directory', to: '/app/admin/users', icon: <Users className="h-4 w-4" />},
      {label: 'All Events', to: '/app/admin/events', icon: <Calendar className="h-4 w-4" />},
      {label: 'Event Reports', to: '/app/admin/reports', icon: <FileText className="h-4 w-4" />},
      {label: 'Financial Oversight', to: '/app/admin/finance', icon: <DollarSign className="h-4 w-4" />},
      {label: 'Audit Logs', to: '/app/admin/audit-logs', icon: <ShieldCheck className="h-4 w-4" />},
      {label: 'System Settings', to: '/app/admin/settings', icon: <Settings className="h-4 w-4" />},
    ];
  }, [activeContext, hasPermission]);

  const breadcrumbs = useMemo(() => {
    const parts = location.pathname
      .replace(/^\/app\/?/, '')
      .split('/')
      .filter(Boolean);
    return parts.map((segment) =>
      segment
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    );
  }, [location.pathname]);

  const handleContextSelection = (value: string) => {
    if (value === 'student') {
      flushSync(() => {
        switchContext('student');
      });
      navigate('/app/student/dashboard');
      setMobileNavOpen(false);
      return;
    }
    if (value === 'super_admin') {
      flushSync(() => {
        switchContext('super_admin');
      });
      navigate('/app/admin/dashboard');
      setMobileNavOpen(false);
      return;
    }
    const [role, clubId] = value.split(':');
    if (isClubOfficerRole(role) && clubId) {
      flushSync(() => {
        switchContext('club_admin', clubId);
      });
      navigate('/app/club-admin/dashboard');
    } else if (role === 'core_member' && clubId) {
      flushSync(() => {
        switchContext('core_member', clubId);
      });
      navigate('/app/core/dashboard');
    }
    setMobileNavOpen(false);
  };

  const currentSelectorValue =
    activeContext === 'student' || activeContext === 'super_admin'
      ? activeContext
      : `${activeMembership?.role || activeContext}:${activeClubId || ''}`;

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchTerm.trim();
    if (!q) return;
    if (activeContext === 'super_admin') {
      navigate(`/app/admin/clubs?search=${encodeURIComponent(q)}`);
    } else {
      navigate(`/app/student/events?search=${encodeURIComponent(q)}`);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const sidebarContent = (
    <div className="flex h-full flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
        <Link to="/" className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
          CampusVerse
        </Link>
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Multi-context & multi-club switcher */}
      <div className="border-b border-slate-100 p-4">
        <label htmlFor="workspace-context-select" className="block text-xs font-medium text-slate-500">
          Active Context
        </label>
        <select
          id="workspace-context-select"
          value={currentSelectorValue}
          onChange={(e) => handleContextSelection(e.target.value)}
          className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-600 focus:bg-white"
        >
          {user?.isSuperAdmin && <option value="super_admin">Super Admin · Institution</option>}
          <option value="student">Student · Campus Discovery</option>
          {memberships.map((m) => (
            <option key={m.id} value={`${m.role}:${m.clubId}`}>
              {CLUB_ROLE_LABELS[m.role] || m.role} · {m.clubName || m.clubId}
            </option>
          ))}
        </select>
        {activeMembership && (
          <p className="mt-1.5 truncate text-xs text-slate-500">
            {activeMembership.title}
          </p>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Workspace navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setMobileNavOpen(false)}
            className={({isActive}) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-violet-50 text-violet-800'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 font-display text-xs font-semibold text-white">
            {user?.avatarInitials || 'CV'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{user?.name}</p>
            <p className="truncate text-xs text-slate-500">{CONTEXT_LABELS[activeContext]}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50/70">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block">{sidebarContent}</aside>

      {/* Mobile navigation drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-72 max-w-[85vw]">{sidebarContent}</div>
        </div>
      )}

      {/* Main viewport */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>

            <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
              <span className="font-medium text-slate-700 whitespace-nowrap">CampusVerse</span>
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={index}>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span
                    className={`truncate ${
                      index === breadcrumbs.length - 1 ? 'font-medium text-slate-900' : ''
                    }`}
                  >
                    {crumb}
                  </span>
                </React.Fragment>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex items-center">
              <label htmlFor="header-workspace-select" className="sr-only">
                Switch workspace context
              </label>
              <select
                id="header-workspace-select"
                aria-label="Switch workspace context"
                value={currentSelectorValue}
                onChange={(e) => handleContextSelection(e.target.value)}
                className="max-w-[190px] truncate rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:bg-white"
              >
                {user?.isSuperAdmin && <option value="super_admin">Super Admin · Institution</option>}
                <option value="student">Student · Campus Discovery</option>
                {memberships.map((m) => (
                  <option key={m.id} value={`${m.role}:${m.clubId}`}>
                    {CLUB_ROLE_LABELS[m.role] || m.role} · {m.clubName || m.clubId}
                  </option>
                ))}
              </select>
            </div>

            <form onSubmit={handleGlobalSearch} className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search events or clubs..."
                aria-label="Search events or clubs"
                className="w-56 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white"
              />
            </form>

            <PWAInstallButton />

            {/* Notifications popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((prev) => !prev);
                  setProfileOpen(false);
                }}
                aria-label="Notifications"
                className="relative rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-700 px-1 text-[10px] font-semibold text-white tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl z-40">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <span className="text-sm font-semibold text-slate-900">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => markAllMutation.mutate()}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="py-4 text-center text-xs text-slate-500">No notifications yet.</p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            if (!n.read) markReadMutation.mutate(n.id);
                            setNotifOpen(false);
                            if (n.link) navigate(n.link);
                          }}
                          className={`w-full rounded-lg p-2.5 text-left transition-colors ${
                            n.read ? 'bg-white hover:bg-slate-50' : 'bg-violet-50/60 hover:bg-violet-50'
                          }`}
                        >
                          <p className="text-xs font-semibold text-slate-900">{n.title}</p>
                          <p className="mt-0.5 text-xs text-slate-600 line-clamp-2">{n.message}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((prev) => !prev);
                  setNotifOpen(false);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-700 text-[11px] font-semibold text-white">
                  {user?.avatarInitials}
                </span>
                <span className="hidden sm:inline max-w-[120px] truncate">{user?.name}</span>
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl z-40">
                  <div className="border-b border-slate-100 px-3 py-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p>
                    <p className="truncate text-xs text-slate-500">{user?.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate(
                        activeContext === 'super_admin'
                          ? '/app/admin/settings'
                          : activeContext === 'club_admin'
                            ? '/app/club-admin/settings'
                            : activeContext === 'core_member'
                              ? '/app/core/profile'
                              : '/app/student/settings',
                      );
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Settings &amp; Account
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
};
