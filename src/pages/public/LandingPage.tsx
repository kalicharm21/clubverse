import React from 'react';
import {ArrowRight, Award, CalendarCheck, QrCode, ShieldCheck, Users} from 'lucide-react';
import {Link} from 'react-router-dom';
import {PWAInstallButton} from '../../components/pwa/PWAInstallButton.tsx';

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Strict 3-zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          <Link
            to="/"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            CampusVerse
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="#capabilities"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#workflow"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
            <a
              href="#contexts"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              User Contexts
            </a>
            <a
              href="#governance"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Governance
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton />
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-4 py-2 text-xs font-medium text-white hover:bg-violet-800 transition-colors whitespace-nowrap shrink-0"
            >
              Sign In
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Split */}
      <section className="mx-auto max-w-6xl px-4 pt-12 pb-10 sm:px-6 lg:pt-16">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-stretch">
          <div className="flex flex-col justify-center lg:col-span-6">
            <p className="text-xs font-medium text-violet-700">
              Campus Clubs · Events · Attendance · Institutional Reporting
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl leading-[1.1] [text-wrap:balance]">
              One operational system for every campus club and student event.
            </h1>
            <p className="mt-5 max-w-xl text-base text-slate-600 leading-relaxed">
              CampusVerse replaces scattered spreadsheets, group chats, and paper sign-in sheets
              with scoped club management, custom event registration forms, non-PII QR attendance,
              and transparent financial reporting.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-800 transition-colors whitespace-nowrap"
              >
                Open Campus Portal
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                Create Student Account
              </Link>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-72 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:h-96 lg:h-full">
              <img
                src="/src/assets/images/hero_campus_quad_1795447592217.jpg"
                alt="Students collaborating at the modern university student union courtyard"
                width={1200}
                height={800}
                fetchPriority="high"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>

        {/* Full-width 4-column campus metrics strip below hero */}
        <div className="mt-10 grid grid-cols-2 gap-4 border-y border-slate-200 py-6 sm:grid-cols-4">
          <div>
            <p className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">4 Contexts</p>
            <p className="mt-1 text-xs text-slate-500">Student, Core, President/VP, Super Admin</p>
          </div>
          <div>
            <p className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">2-Club Cap</p>
            <p className="mt-1 text-xs text-slate-500">Focused student follow limit enforced</p>
          </div>
          <div>
            <p className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">Single-Use QR</p>
            <p className="mt-1 text-xs text-slate-500">Opaque tokens with zero embedded PII</p>
          </div>
          <div>
            <p className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">6 Permissions</p>
            <p className="mt-1 text-xs text-slate-500">Granular Core Member club delegation</p>
          </div>
        </div>
      </section>

      {/* Capabilities Asymmetric Bento Grid */}
      <section id="capabilities" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Built for real campus governance, not generic social feeds.
          </h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Every workflow connects student participation directly to club operations and Student
            Affairs oversight.
          </p>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6 md:col-span-2">
            <div className="flex items-center gap-2.5 text-violet-700">
              <QrCode className="h-5 w-5" />
              <span className="text-sm font-semibold text-slate-900">
                01. Dynamic Registration Forms &amp; Non-PII QR Check-In
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Club teams build custom event intake fields per event, publish capacity limits, and
              issue opaque entry tokens like <span className="font-mono text-slate-800">CV-QR-8F92A1C4</span>.
              Gate scanners verify attendance once per registration and reject duplicate scans.
            </p>
            <div className="mt-5 h-44 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              <img
                src="/src/assets/images/event_hackathon_banner_1795447592033.jpg"
                alt="Students checking in and collaborating during an engineering hackathon"
                width={1200}
                height={675}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5 text-blue-600">
                <Award className="h-5 w-5" />
                <span className="text-sm font-semibold text-slate-900">
                  02. Intentional Two-Club Limit &amp; Hall of Fame
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                Students can follow at most two clubs, turning follower metrics in the campus Hall
                of Fame into an authentic signal of student commitment with deterministic tie
                ranking.
              </p>
            </div>
            <div className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">
              Real-time enforcement across API and UI
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-6">
            <div className="flex items-center gap-2.5 text-violet-700">
              <Users className="h-5 w-5" />
              <span className="text-sm font-semibold text-slate-900">
                03. Multi-Club Scoped Permissions
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              A student can serve as Club President or Vice President in one organization and a Core
              Member with strictly delegated attendance or reporting rights in another—never
              mutually exclusive global roles.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 md:col-span-2">
            <div className="flex items-center gap-2.5 text-blue-600">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-sm font-semibold text-slate-900">
                04. Event Completion &amp; Private Financial Reconciliation
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Authorized club officers submit post-event outcome summaries and itemized collection
              and expense ledgers. Financial reports remain strictly hidden from general students
              while giving Super Admins institution-wide audit visibility.
            </p>
          </div>
        </div>
      </section>

      {/* How CampusVerse Works */}
      <section id="workflow" className="border-y border-slate-200 bg-slate-50/60 py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            How CampusVerse works end to end
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: '01. Discover & Follow',
                desc: 'Students browse verified campus clubs, inspect leadership teams, and commit to up to two clubs.',
              },
              {
                step: '02. Configure & Publish',
                desc: 'Club Presidents, Vice Presidents, and permitted Core Members draft events, build custom intake forms, and publish schedules.',
              },
              {
                step: '03. Register & Verify',
                desc: 'Students submit forms to receive single-use opaque QR passes verified at the venue gate.',
              },
              {
                step: '04. Report & Audit',
                desc: 'Clubs close events with attendance and financial reports reviewed in the Super Admin audit console.',
              },
            ].map((item) => (
              <div key={item.step} className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="font-display text-sm font-semibold text-slate-900">{item.step}</p>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contexts & Governance */}
      <section id="contexts" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div id="governance" className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
              Four workspaces designed around real university accountability.
            </h2>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Switch seamlessly between your student identity and your active club leadership roles
              in the top workspace selector without logging out.
            </p>
            <div className="mt-6 space-y-3 text-sm">
              <div className="border-b border-slate-100 pb-3">
                <span className="font-semibold text-slate-900">Student</span>
                <span className="mx-2 text-slate-300">·</span>
                <span className="text-slate-600">
                  Explore clubs, follow up to 2 clubs, view Hall of Fame, register, and access QR passes.
                </span>
              </div>
              <div className="border-b border-slate-100 pb-3">
                <span className="font-semibold text-slate-900">Club President &amp; Vice President</span>
                <span className="mx-2 text-slate-300">·</span>
                <span className="text-slate-600">
                  Edit club profile, manage core member permissions, publish events, and submit reports.
                </span>
              </div>
              <div className="border-b border-slate-100 pb-3">
                <span className="font-semibold text-slate-900">Core Member</span>
                <span className="mx-2 text-slate-300">·</span>
                <span className="text-slate-600">
                  Permission-scoped access to assigned tasks, gate QR scanning, forms, or event reporting.
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-900">Super Admin</span>
                <span className="mx-2 text-slate-300">·</span>
                <span className="text-slate-600">
                  Institution-wide oversight of clubs, user status, financial summaries, and audit logs.
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-6">
            <div className="flex items-center gap-2.5 text-slate-900">
              <CalendarCheck className="h-5 w-5 text-violet-700" />
              <h3 className="font-display text-base font-semibold">
                Institutional Portal Access
              </h3>
            </div>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Sign in with your verified institutional email to explore student discovery, manage
              club operations, scan single-use QR attendance passes, and review audit trails.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Backed by PostgreSQL transactional persistence, Row-Level Security (RLS), and
              verified Supabase institutional authentication.
            </p>
            <div className="mt-5">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
              >
                Enter Campus Portal
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <span className="font-display text-sm font-semibold text-slate-900">CampusVerse</span>
            <span>·</span>
            <span>College Clubs, Events &amp; Administration</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/login" className="hover:text-slate-900">
              Sign In
            </Link>
            <Link to="/register" className="hover:text-slate-900">
              Register
            </Link>
            <Link to="/forgot-password" className="hover:text-slate-900">
              Reset Access
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
