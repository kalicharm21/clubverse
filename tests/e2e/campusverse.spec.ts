import fs from 'node:fs';
import path from 'node:path';
import {expect, test, type Page} from '@playwright/test';

interface AuthConfigResponse {
  data: {
    mode: 'demo' | 'supabase';
    persistenceMode: 'in_memory_demo' | 'postgres';
    demoModeEnabled: boolean;
  };
}

interface StoredTestCredential {
  email: string;
  password: string;
  role: string;
}

function loadProvisionedCredentials(): StoredTestCredential[] {
  const credPath = path.resolve(process.cwd(), '.secrets', 'test-credentials.json');
  if (!fs.existsSync(credPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(credPath, 'utf-8')) as {
      accounts?: StoredTestCredential[];
    };
    return parsed.accounts ?? [];
  } catch {
    return [];
  }
}

async function getServerAuthConfig(page: Page) {
  const res = await page.request.get('/api/v1/auth/config');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as AuthConfigResponse;
  return body.data;
}

test.describe('CampusVerse End-to-End Verification', () => {
  test('Public Portal, Live API Health/Readiness, Discovery & Browser Performance Budget', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    // 1. Verify API health, readiness, public catalog, and auth boundary
    const healthRes = await page.request.get('/api/v1/health');
    expect(healthRes.status()).toBe(200);
    const healthJson = await healthRes.json();
    expect(healthJson.data.phase).toBe('phase-5');

    const authConfig = await getServerAuthConfig(page);
    if (authConfig.persistenceMode === 'postgres') {
      const readyRes = await page.request.get('/api/v1/health/ready');
      expect(readyRes.status()).toBe(200);
    }

    const clubsRes = await page.request.get('/api/v1/clubs');
    expect(clubsRes.status()).toBe(200);
    const clubsJson = await clubsRes.json();
    expect(Array.isArray(clubsJson.data)).toBe(true);
    expect(clubsJson.data.length).toBeGreaterThan(0);

    const eventsRes = await page.request.get('/api/v1/events');
    expect(eventsRes.status()).toBe(200);

    const unauthMe = await page.request.get('/api/v1/auth/me');
    expect(unauthMe.status()).toBe(401);

    // 2. Landing page loads cleanly with CampusVerse branding and fast paint timing
    await page.goto('/');
    await expect(page.getByRole('link', {name: 'CampusVerse'})).toBeVisible();
    await expect(page.getByRole('link', {name: /Open Campus Portal/i})).toBeVisible();

    const perfMetrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;
      const paints = performance.getEntriesByType('paint');
      const fcp = paints.find((p) => p.name === 'first-contentful-paint');
      return {
        domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : 0,
        loadMs: nav ? Math.round(nav.loadEventEnd) : 0,
        fcpMs: fcp ? Math.round(fcp.startTime) : 0,
      };
    });
    expect(perfMetrics.domContentLoadedMs).toBeLessThan(5000);

    const hofRes = await page.request.get('/api/v1/hall-of-fame');
    expect(hofRes.status()).toBe(200);
    const hofJson = await hofRes.json();
    expect(Array.isArray(hofJson.data)).toBe(true);

    // 3. Public registration & protected route redirect guard
    await page.goto('/register');
    await expect(page.getByRole('heading', {name: /Student Registration/i})).toBeVisible();

    await page.goto('/app/student/clubs');
    await expect(page).toHaveURL(/\/login/);

    // 4. Login page mode parity
    await page.goto('/login');
    if (authConfig.demoModeEnabled) {
      await expect(page.getByText(/Phase 1 Development Auth Adapter/i)).toBeVisible();
    } else {
      await expect(page.getByText(/Institutional Single Workspace/i)).toBeVisible();
      await expect(page.getByText(/Phase 1 Development Auth Adapter/i)).toHaveCount(0);
    }

    expect(consoleErrors).toEqual([]);
  });

  test('Authenticated Phase 5 Workflows (Supabase Test Accounts or Sandbox when enabled)', async ({
    page,
  }) => {
    const authConfig = await getServerAuthConfig(page);
    const provisioned = loadProvisionedCredentials();

    if (!authConfig.demoModeEnabled && provisioned.length === 0) {
      test.info().annotations.push({
        type: 'env-blocker',
        description:
          'ENABLE_DEMO_MODE=false and .secrets/test-credentials.json not present (SUPABASE_SERVICE_ROLE_KEY not configured); interactive authenticated browser E2E requires Supabase test passwords.',
      });
      return;
    }

    if (authConfig.demoModeEnabled) {
      // Student workflow: Active Events + 2-club limit + My Registrations released vs unreleased QR pass
      await page.goto('/login');
      await page.getByRole('button', {name: /Aarav Mehta/i}).click();
      await expect(page).toHaveURL(/\/app\/student\/dashboard/);
      await expect(page.getByRole('heading', {name: /Active Events/i})).toBeVisible();
      await expect(page.getByText('1 / 2')).toBeVisible();

      await page.getByRole('link', {name: 'Explore Clubs'}).first().click();
      await expect(page).toHaveURL(/\/app\/student\/clubs/);
      await page.getByRole('button', {name: 'Follow Club'}).first().click();
      await expect(page.getByText(/Two-Club Follow Limit Reached/i)).toBeVisible();

      await page.getByRole('link', {name: 'My Registrations'}).click();
      await expect(page).toHaveURL(/\/app\/student\/registrations/);
      await page.getByRole('button', {name: /Open QR Pass/i}).first().click();
      await expect(page.getByText(/Single-use opaque attendance token/i)).toBeVisible();

      // Club President workflow: Events, Ticket Release, Scanner toggle, Report & Finance
      await page.goto('/login');
      await page.getByRole('button', {name: /Priya Nair/i}).click();
      await expect(page).toHaveURL(/\/app\/club-admin\/dashboard/);

      // Top-header persistent switcher preserves Student Dashboard access
      const headerSwitcher = page.locator('#header-workspace-select');
      await expect(headerSwitcher).toBeVisible();
      await headerSwitcher.selectOption('student');
      await expect(page).toHaveURL(/\/app\/student\/dashboard/);
      await headerSwitcher.selectOption('club_admin:club-robotics');
      await expect(page).toHaveURL(/\/app\/club-admin\/dashboard/);

      await page.getByRole('link', {name: 'Events', exact: true}).click();
      await page.getByRole('button', {name: /Create Event/i}).click();
      await page.getByLabel('Event Title').fill('Spring Telemetry Lab');
      await page.getByLabel('Venue').fill('Hangar C3');
      await page
        .getByLabel('Event Description')
        .fill('Hands-on telemetry logging and microcontroller debugging workshop.');
      await page.getByRole('button', {name: /Create Draft Event/i}).click();
      await expect(page.getByText('Spring Telemetry Lab')).toBeVisible();

      await page.getByRole('link', {name: /Registrations/i}).first().click();
      await expect(page.getByRole('button', {name: /Release Tickets/i})).toBeVisible();

      await page.getByRole('link', {name: /Attendance & QR/i}).click();
      await expect(page.getByRole('button', {name: /Open QR Scanner/i})).toBeVisible();
      await page.getByRole('button', {name: /^Scan$/i}).first().click();
      await expect(page.getByText(/Checked in/i).first()).toBeVisible();

      await page.getByRole('link', {name: /Reports & Finance/i}).click();
      await page
        .getByLabel('Outcome Summary *')
        .fill('Successfully completed robotics buildathon with high turnout across cohorts.');
      await page.getByLabel('Key Highlights *').fill('All 12 teams completed autonomous runs.');
      await page
        .getByRole('button', {
          name: /Submit for Review|Update & Submit for Review|Resubmit for Review/i,
        })
        .click();
      await expect(page.getByText(/Post-event report saved/i)).toBeVisible();

      // Core Member scoped permissions & Super Admin oversight
      await page.goto('/login');
      await page.getByRole('button', {name: /Rohan Verma/i}).click();
      await expect(page).toHaveURL(/\/app\/core\/dashboard/);
      await expect(page.getByRole('link', {name: 'Form Builder'})).toHaveCount(0);

      await page.goto('/login');
      await page.getByRole('button', {name: /Dr\. Elena Vance/i}).click();
      await expect(page).toHaveURL(/\/app\/admin\/dashboard/);
      await page.getByRole('link', {name: 'Audit Logs'}).first().click();
      await expect(page).toHaveURL(/\/app\/admin\/audit-logs/);
      await expect(page.getByText('APPROVED_CLUB_CHARTER')).toBeVisible();
    } else {
      // Sign in with real provisioned Supabase Auth student account
      const studentCred = provisioned.find((a) => a.email.startsWith('student.test@'));
      if (studentCred) {
        await page.goto('/login');
        await page.getByLabel(/Email/i).fill(studentCred.email);
        await page.getByLabel(/Password/i).fill(studentCred.password);
        await page.getByRole('button', {name: /Sign In/i}).click();
        await expect(page).toHaveURL(/\/app\/student\/dashboard/);
        await expect(page.getByRole('heading', {name: /Active Events/i})).toBeVisible();
      }
    }
  });
});
