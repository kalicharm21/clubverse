import React, {Suspense} from 'react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {BrowserRouter, Navigate, Route, Routes} from 'react-router-dom';
import {AppShell} from './components/layout/AppShell.tsx';
import {RequireAuthRoute, RequireContextRoute} from './components/layout/RouteGuards.tsx';
import {OfflineStatusBanner, PWAUpdateBanner} from './components/pwa/PWABanners.tsx';
import {ErrorBoundary} from './components/ui/ErrorBoundary.tsx';
import {LoadingSkeleton} from './components/ui/Feedback.tsx';
import {AuthProvider} from './context/AuthContext.tsx';
import {ToastProvider} from './context/ToastContext.tsx';
import {LandingPage} from './pages/public/LandingPage.tsx';
import {LoginPage} from './pages/public/LoginPage.tsx';
import {NotFoundPage, UnauthorizedPage} from './pages/public/StatusPages.tsx';

// Route-level code splitting for secondary/authenticated portals
const RegisterPage = React.lazy(() =>
  import('./pages/public/AuthPages.tsx').then((m) => ({default: m.RegisterPage})),
);
const VerifyEmailPage = React.lazy(() =>
  import('./pages/public/AuthPages.tsx').then((m) => ({default: m.VerifyEmailPage})),
);
const ForgotPasswordPage = React.lazy(() =>
  import('./pages/public/AuthPages.tsx').then((m) => ({default: m.ForgotPasswordPage})),
);
const ResetPasswordPage = React.lazy(() =>
  import('./pages/public/AuthPages.tsx').then((m) => ({default: m.ResetPasswordPage})),
);
const AcceptInvitePage = React.lazy(() =>
  import('./pages/public/AcceptInvitePage.tsx').then((m) => ({default: m.AcceptInvitePage})),
);

const StudentDashboardPage = React.lazy(() =>
  import('./pages/student/StudentDashboardPage.tsx').then((m) => ({
    default: m.StudentDashboardPage,
  })),
);
const ExploreClubsPage = React.lazy(() =>
  import('./pages/student/ExploreClubsPage.tsx').then((m) => ({default: m.ExploreClubsPage})),
);
const ClubDetailsPage = React.lazy(() =>
  import('./pages/student/ClubDetailsPage.tsx').then((m) => ({default: m.ClubDetailsPage})),
);
const HallOfFamePage = React.lazy(() =>
  import('./pages/student/HallOfFamePage.tsx').then((m) => ({default: m.HallOfFamePage})),
);
const EventsPage = React.lazy(() =>
  import('./pages/student/EventsPage.tsx').then((m) => ({default: m.EventsPage})),
);
const EventDetailsPage = React.lazy(() =>
  import('./pages/student/EventDetailsPage.tsx').then((m) => ({default: m.EventDetailsPage})),
);
const MyRegistrationsPage = React.lazy(() =>
  import('./pages/student/MyRegistrationsPage.tsx').then((m) => ({
    default: m.MyRegistrationsPage,
  })),
);
const StudentSettingsPage = React.lazy(() =>
  import('./pages/student/StudentSettingsPage.tsx').then((m) => ({
    default: m.StudentSettingsPage,
  })),
);

const ClubAdminDashboardPage = React.lazy(() =>
  import('./pages/club/ClubAdminDashboardPage.tsx').then((m) => ({
    default: m.ClubAdminDashboardPage,
  })),
);
const ClubProfilePage = React.lazy(() =>
  import('./pages/club/ClubProfilePage.tsx').then((m) => ({default: m.ClubProfilePage})),
);
const ClubTeamPage = React.lazy(() =>
  import('./pages/club/ClubTeamPage.tsx').then((m) => ({default: m.ClubTeamPage})),
);
const ClubEventsPage = React.lazy(() =>
  import('./pages/club/ClubEventsPage.tsx').then((m) => ({default: m.ClubEventsPage})),
);
const FormBuilderPage = React.lazy(() =>
  import('./pages/club/FormBuilderPage.tsx').then((m) => ({default: m.FormBuilderPage})),
);
const ClubRegistrationsPage = React.lazy(() =>
  import('./pages/club/ClubRegistrationsPage.tsx').then((m) => ({
    default: m.ClubRegistrationsPage,
  })),
);
const AttendancePage = React.lazy(() =>
  import('./pages/club/AttendancePage.tsx').then((m) => ({default: m.AttendancePage})),
);
const ClubReportsPage = React.lazy(() =>
  import('./pages/club/ClubReportsPage.tsx').then((m) => ({default: m.ClubReportsPage})),
);
const ClubSettingsPage = React.lazy(() =>
  import('./pages/club/ClubSettingsPage.tsx').then((m) => ({default: m.ClubSettingsPage})),
);

const CoreMemberDashboardPage = React.lazy(() =>
  import('./pages/core/CoreMemberDashboardPage.tsx').then((m) => ({
    default: m.CoreMemberDashboardPage,
  })),
);
const CoreMemberProfilePage = React.lazy(() =>
  import('./pages/core/CoreMemberProfilePage.tsx').then((m) => ({
    default: m.CoreMemberProfilePage,
  })),
);

const AdminDashboardPage = React.lazy(() =>
  import('./pages/admin/AdminDashboardPage.tsx').then((m) => ({default: m.AdminDashboardPage})),
);
const AdminClubsPage = React.lazy(() =>
  import('./pages/admin/AdminClubsPage.tsx').then((m) => ({default: m.AdminClubsPage})),
);
const AdminUsersPage = React.lazy(() =>
  import('./pages/admin/AdminUsersPage.tsx').then((m) => ({default: m.AdminUsersPage})),
);
const AdminEventsPage = React.lazy(() =>
  import('./pages/admin/AdminEventsPage.tsx').then((m) => ({default: m.AdminEventsPage})),
);
const AdminReportsPage = React.lazy(() =>
  import('./pages/admin/AdminReportsPage.tsx').then((m) => ({default: m.AdminReportsPage})),
);
const AdminFinancePage = React.lazy(() =>
  import('./pages/admin/AdminFinancePage.tsx').then((m) => ({default: m.AdminFinancePage})),
);
const AdminAuditLogsPage = React.lazy(() =>
  import('./pages/admin/AdminAuditLogsPage.tsx').then((m) => ({default: m.AdminAuditLogsPage})),
);
const AdminSettingsPage = React.lazy(() =>
  import('./pages/admin/AdminSettingsPage.tsx').then((m) => ({default: m.AdminSettingsPage})),
);

const RouteFallback: React.FC = () => (
  <div className="mx-auto max-w-5xl p-6">
    <LoadingSkeleton rows={4} />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Public & Auth */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Authenticated Workspace */}
        <Route
          path="/app"
          element={
            <RequireAuthRoute>
              <AppShell />
            </RequireAuthRoute>
          }
        >
          <Route index element={<Navigate to="/app/student/dashboard" replace />} />

          {/* Student Experience */}
          <Route
            path="student/dashboard"
            element={
              <RequireContextRoute allowedContexts={['student']}>
                <StudentDashboardPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="student/clubs"
            element={
              <RequireContextRoute allowedContexts={['student']}>
                <ExploreClubsPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="student/clubs/:clubId"
            element={
              <RequireContextRoute allowedContexts={['student']}>
                <ClubDetailsPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="student/hall-of-fame"
            element={
              <RequireContextRoute allowedContexts={['student']}>
                <HallOfFamePage />
              </RequireContextRoute>
            }
          />
          <Route
            path="student/events"
            element={
              <RequireContextRoute allowedContexts={['student']}>
                <EventsPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="student/events/:eventId"
            element={
              <RequireContextRoute allowedContexts={['student']}>
                <EventDetailsPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="student/registrations"
            element={
              <RequireContextRoute allowedContexts={['student']}>
                <MyRegistrationsPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="student/settings"
            element={
              <RequireContextRoute allowedContexts={['student']}>
                <StudentSettingsPage />
              </RequireContextRoute>
            }
          />

          {/* Club Officer (President & Vice President) Experience */}
          <Route
            path="club-admin/dashboard"
            element={
              <RequireContextRoute allowedContexts={['club_admin']}>
                <ClubAdminDashboardPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="club-admin/profile"
            element={
              <RequireContextRoute allowedContexts={['club_admin']}>
                <ClubProfilePage />
              </RequireContextRoute>
            }
          />
          <Route
            path="club-admin/team"
            element={
              <RequireContextRoute allowedContexts={['club_admin']}>
                <ClubTeamPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="club-admin/events"
            element={
              <RequireContextRoute allowedContexts={['club_admin']}>
                <ClubEventsPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="club-admin/forms"
            element={
              <RequireContextRoute allowedContexts={['club_admin']}>
                <FormBuilderPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="club-admin/registrations"
            element={
              <RequireContextRoute allowedContexts={['club_admin']}>
                <ClubRegistrationsPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="club-admin/attendance"
            element={
              <RequireContextRoute allowedContexts={['club_admin']}>
                <AttendancePage />
              </RequireContextRoute>
            }
          />
          <Route
            path="club-admin/reports"
            element={
              <RequireContextRoute allowedContexts={['club_admin']}>
                <ClubReportsPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="club-admin/settings"
            element={
              <RequireContextRoute allowedContexts={['club_admin']}>
                <ClubSettingsPage />
              </RequireContextRoute>
            }
          />

          {/* Core Member Experience (Permission-Scoped) */}
          <Route
            path="core/dashboard"
            element={
              <RequireContextRoute allowedContexts={['core_member']}>
                <CoreMemberDashboardPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="core/events"
            element={
              <RequireContextRoute
                allowedContexts={['core_member']}
                requiredPermission="MANAGE_EVENTS"
              >
                <ClubEventsPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="core/forms"
            element={
              <RequireContextRoute
                allowedContexts={['core_member']}
                requiredPermission="MANAGE_FORMS"
              >
                <FormBuilderPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="core/registrations"
            element={
              <RequireContextRoute
                allowedContexts={['core_member']}
                requiredPermission="VIEW_REGISTRATIONS"
              >
                <ClubRegistrationsPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="core/attendance"
            element={
              <RequireContextRoute
                allowedContexts={['core_member']}
                requiredPermission="SCAN_ATTENDANCE"
              >
                <AttendancePage />
              </RequireContextRoute>
            }
          />
          <Route
            path="core/reports"
            element={
              <RequireContextRoute allowedContexts={['core_member']}>
                <ClubReportsPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="core/profile"
            element={
              <RequireContextRoute allowedContexts={['core_member']}>
                <CoreMemberProfilePage />
              </RequireContextRoute>
            }
          />

          {/* Super Admin Experience */}
          <Route
            path="admin/dashboard"
            element={
              <RequireContextRoute allowedContexts={['super_admin']}>
                <AdminDashboardPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="admin/clubs"
            element={
              <RequireContextRoute allowedContexts={['super_admin']}>
                <AdminClubsPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="admin/users"
            element={
              <RequireContextRoute allowedContexts={['super_admin']}>
                <AdminUsersPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="admin/events"
            element={
              <RequireContextRoute allowedContexts={['super_admin']}>
                <AdminEventsPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="admin/reports"
            element={
              <RequireContextRoute allowedContexts={['super_admin']}>
                <AdminReportsPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="admin/finance"
            element={
              <RequireContextRoute allowedContexts={['super_admin']}>
                <AdminFinancePage />
              </RequireContextRoute>
            }
          />
          <Route
            path="admin/audit-logs"
            element={
              <RequireContextRoute allowedContexts={['super_admin']}>
                <AdminAuditLogsPage />
              </RequireContextRoute>
            }
          />
          <Route
            path="admin/settings"
            element={
              <RequireContextRoute allowedContexts={['super_admin']}>
                <AdminSettingsPage />
              </RequireContextRoute>
            }
          />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <BrowserRouter>
              <AppRoutes />
              <OfflineStatusBanner />
              <PWAUpdateBanner />
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
