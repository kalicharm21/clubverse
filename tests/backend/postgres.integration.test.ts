import crypto from 'crypto';
import {sql} from 'drizzle-orm';
import request from 'supertest';
import {afterAll, describe, expect, it} from 'vitest';
import {PostgresDataAdapter} from '../../server/adapters/PostgresDataAdapter.ts';
import {createApp} from '../../server/app.ts';
import {closeDbPool, createDbPool, getSqlClient} from '../../server/db/index.ts';
import {
  clearCapturedInvitationEmailsForTests,
  getCapturedInvitationEmailsForTests,
} from '../../server/shared/email/invitationMailer.ts';
import {hashSha256} from '../../server/db/repositories/mappers.ts';
import {dbRequestContext} from '../../server/db/requestContext.ts';
import {hashInvitationToken} from '../../server/shared/utils/crypto.ts';

const hasLiveDatabase = Boolean(
  process.env.DATABASE_URL?.trim() || process.env.DATABASE_MIGRATION_URL?.trim(),
);

describe.skipIf(!hasLiveDatabase)(
  'CampusVerse Phase 2 — Live Supabase PostgreSQL, Concurrency & RLS Integration',
  () => {
    const testRunSuffix = Date.now().toString(36);
    const createdUserIds: string[] = [];
    const createdClubIds: string[] = [];
    const createdAuditIds: string[] = [];

    afterAll(async () => {
      const migrationUrl =
        process.env.DATABASE_MIGRATION_URL?.trim() || process.env.DATABASE_URL?.trim();
      if (migrationUrl) {
        const {client} = createDbPool(migrationUrl, 1);
        try {
          await client.begin(async (tx) => {
            await tx`SELECT set_config('app.current_global_role', 'super_admin', true)`;
            for (const clubId of createdClubIds) {
              await tx`DELETE FROM public.clubs WHERE id = ${clubId}`;
            }
            for (const userId of createdUserIds) {
              await tx`DELETE FROM public.users WHERE id = ${userId}`;
            }
            for (const auditId of createdAuditIds) {
              await tx`DELETE FROM public.audit_logs WHERE id = ${auditId}`;
            }
          });
        } finally {
          await client.end({timeout: 5});
        }
      }
      await closeDbPool();
    });

    it('passes /api/v1/health/ready and verifies RLS + campusverse_app role attributes', async () => {
      const adapter = new PostgresDataAdapter();
      const app = createApp(adapter);

      const res = await request(app).get('/api/v1/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ready');
      expect(res.body.data.persistence).toBe('postgresql-drizzle-rls');

      const client = getSqlClient();
      const roleRows = await client<Array<{rolname: string; rolsuper: boolean; rolbypassrls: boolean}>>`
        SELECT rolname, rolsuper, rolbypassrls
        FROM pg_roles
        WHERE rolname = 'campusverse_app'
      `;
      expect(roleRows).toHaveLength(1);
      expect(roleRows[0].rolsuper).toBe(false);
      expect(roleRows[0].rolbypassrls).toBe(false);

      const rlsTables = await client<Array<{tablename: string; rowsecurity: boolean}>>`
        SELECT tablename, rowsecurity
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN ('users', 'clubs', 'registrations', 'tickets', 'attendance_records', 'event_reports', 'finance_reports', 'finance_entries', 'audit_logs')
      `;
      expect(rlsTables).toHaveLength(9);
      expect(rlsTables.every((t) => t.rowsecurity === true)).toBe(true);
    });

    it('provisions users idempotently and grants bootstrap Super Admin only to configured email', async () => {
      const adapter = new PostgresDataAdapter();

      const studentAuthId = crypto.randomUUID();
      const studentEmail = `student.int.${testRunSuffix}@vitbhopal.ac.in`;
      const s1 = await adapter.provisionAuthenticatedUser({
        authUserId: studentAuthId,
        email: studentEmail,
        name: 'Integration Test Student',
        emailVerified: true,
        isBootstrapSuperAdmin: false,
      });
      createdUserIds.push(s1.id);

      const s1Again = await adapter.provisionAuthenticatedUser({
        authUserId: studentAuthId,
        email: studentEmail,
        emailVerified: true,
        isBootstrapSuperAdmin: false,
      });
      expect(s1Again.id).toBe(s1.id);
      expect(s1Again.isSuperAdmin).toBe(false);

      const adminAuthId = crypto.randomUUID();
      const adminEmail = `bootstrap.admin.${testRunSuffix}@vitbhopal.ac.in`;
      const adminUser = await adapter.provisionAuthenticatedUser({
        authUserId: adminAuthId,
        email: adminEmail,
        name: 'Bootstrap Admin Candidate',
        emailVerified: true,
        isBootstrapSuperAdmin: true,
      });
      createdUserIds.push(adminUser.id);
      expect(adminUser.isSuperAdmin).toBe(true);
    });

    it('persists clubs and events across Postgres pool shutdown and adapter re-instantiation', async () => {
      const adapter1 = new PostgresDataAdapter();
      const createdClub = await dbRequestContext.run(
        {userId: '', globalRole: 'super_admin'},
        () =>
          adapter1.createClub({
            name: `Persistence Guild ${testRunSuffix}`,
            category: 'Technology',
            tagline: 'Verifying durable PostgreSQL persistence across restarts.',
            description:
              'Automated integration verification club created to confirm real database durability across restarts.',
            meetingSchedule: 'Fridays · 17:00',
            contactEmail: `persist.${testRunSuffix}@vitbhopal.ac.in`,
          }),
      );
      createdClubIds.push(createdClub.id);

      await closeDbPool();

      const adapter2 = new PostgresDataAdapter();
      const fetched = await adapter2.getClubDetail(createdClub.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe(`Persistence Guild ${testRunSuffix}`);
    });

    it('enforces strict concurrency invariants: 2-club follow limit, capacity=1 final seat, duplicate reg, and single-scan QR', async () => {
      const adapter = new PostgresDataAdapter();

      // Create 2 test students
      const studentA = await adapter.provisionAuthenticatedUser({
        authUserId: crypto.randomUUID(),
        email: `race.a.${testRunSuffix}@vitbhopal.ac.in`,
        name: 'Concurrency Student A',
        emailVerified: true,
        isBootstrapSuperAdmin: false,
      });
      const studentB = await adapter.provisionAuthenticatedUser({
        authUserId: crypto.randomUUID(),
        email: `race.b.${testRunSuffix}@vitbhopal.ac.in`,
        name: 'Concurrency Student B',
        emailVerified: true,
        isBootstrapSuperAdmin: false,
      });
      createdUserIds.push(studentA.id, studentB.id);

      // Fetch 3 active seeded clubs
      const activeClubs = await adapter.listClubs();
      expect(activeClubs.length).toBeGreaterThanOrEqual(3);
      const [c1, c2, c3] = activeClubs;

      // 1. Follow 1st club
      await dbRequestContext.run(
        {userId: studentA.id, globalRole: 'user'},
        () => adapter.followClub(studentA.id, c1.id),
      );

      // 2. Concurrent follow of 2nd & 3rd club -> strictly 1 succeeds, 1 throws MAX_CLUB_FOLLOW_LIMIT_REACHED
      const followResults = await Promise.allSettled([
        dbRequestContext.run({userId: studentA.id, globalRole: 'user'}, () =>
          adapter.followClub(studentA.id, c2.id),
        ),
        dbRequestContext.run({userId: studentA.id, globalRole: 'user'}, () =>
          adapter.followClub(studentA.id, c3.id),
        ),
      ]);
      const fulfilledFollows = followResults.filter((r) => r.status === 'fulfilled');
      const rejectedFollows = followResults.filter((r) => r.status === 'rejected');
      expect(fulfilledFollows).toHaveLength(1);
      expect(rejectedFollows).toHaveLength(1);
      expect((rejectedFollows[0] as PromiseRejectedResult).reason.code).toBe(
        'MAX_CLUB_FOLLOW_LIMIT_REACHED',
      );

      const finalFollows = await dbRequestContext.run(
        {userId: studentA.id, globalRole: 'user'},
        () => adapter.getFollowsForUser(studentA.id),
      );
      expect(finalFollows).toHaveLength(2);

      // 3. Create capacity=1 event for concurrency & QR tests
      const club = await dbRequestContext.run({userId: '', globalRole: 'super_admin'}, () =>
        adapter.createClub({
          name: `Race Verification Club ${testRunSuffix}`,
          category: 'Robotics & Hardware',
          tagline: 'Concurrency test club for capacity and QR locks.',
          description:
            'Temporary club verifying PostgreSQL FOR UPDATE row locking on registrations and attendance.',
          meetingSchedule: 'Mondays · 16:00',
          contactEmail: `race.${testRunSuffix}@vitbhopal.ac.in`,
        }),
      );
      createdClubIds.push(club.id);

      const event = await dbRequestContext.run({userId: '', globalRole: 'super_admin'}, async () => {
        const ev = await adapter.createEvent(club.id, {
          title: `Single Seat Sprint ${testRunSuffix}`,
          category: 'Workshop',
          description: 'Concurrency test event with capacity=1.',
          venue: 'Lab 101',
          startTime: '2026-12-28T10:00:00.000Z',
          endTime: '2026-12-28T12:00:00.000Z',
          registrationDeadline: '2026-12-27T23:59:00.000Z',
          capacity: 1,
          isPaid: false,
          feeAmount: 0,
        });
        return (await adapter.publishEvent(ev.id))!;
      });

      // 4. Simultaneous capacity=1 registration by two students -> strictly 1 confirmed, 1 waitlisted
      const qrA = `CV-QR-TESTA-${testRunSuffix}`;
      const qrB = `CV-QR-TESTB-${testRunSuffix}`;
      const [regA, regB] = await Promise.all([
        dbRequestContext.run({userId: studentA.id, globalRole: 'user'}, () =>
          adapter.createRegistration({
            eventId: event.id,
            studentId: studentA.id,
            studentName: studentA.name,
            studentEmail: studentA.email,
            answers: {'fld-track': 'Participant', 'fld-code-conduct': true},
            qrToken: qrA,
          }),
        ),
        dbRequestContext.run({userId: studentB.id, globalRole: 'user'}, () =>
          adapter.createRegistration({
            eventId: event.id,
            studentId: studentB.id,
            studentName: studentB.name,
            studentEmail: studentB.email,
            answers: {'fld-track': 'Participant', 'fld-code-conduct': true},
            qrToken: qrB,
          }),
        ),
      ]);

      const statuses = [regA.status, regB.status].sort();
      expect(statuses).toEqual(['confirmed', 'waitlisted']);

      const updatedEvent = await adapter.getEventById(event.id);
      expect(updatedEvent?.registeredCount).toBe(1);

      // 5. Simultaneous duplicate registration by same student -> 1 fails with 409 Conflict
      const dupResults = await Promise.allSettled([
        dbRequestContext.run({userId: studentA.id, globalRole: 'user'}, () =>
          adapter.createRegistration({
            eventId: event.id,
            studentId: studentA.id,
            studentName: studentA.name,
            studentEmail: studentA.email,
            answers: {},
            qrToken: `CV-QR-DUP-${testRunSuffix}`,
          }),
        ),
      ]);
      expect(dupResults[0].status).toBe('rejected');
      expect((dupResults[0] as PromiseRejectedResult).reason.statusCode).toBe(409);

      // 6. Release confirmed ticket, then simultaneous double-scan of QR token -> strictly 1 attendance record, 1 rejected with 409
      const confirmedReg = regA.status === 'confirmed' ? regA : regB;
      const confirmedStudent = regA.status === 'confirmed' ? studentA : studentB;
      await dbRequestContext.run({userId: '', globalRole: 'super_admin'}, () =>
        adapter.releaseEventTickets(event.id, {id: studentA.id, name: 'Test Admin'}),
      );
      const confirmedTickets = await dbRequestContext.run(
        {userId: confirmedStudent.id, globalRole: 'user'},
        () => adapter.listStudentTickets(confirmedStudent.id),
      );
      const releasedQrToken =
        confirmedTickets.find((t) => t.registrationId === confirmedReg.id)?.qrToken ||
        confirmedReg.qrToken;
      const scanResults = await Promise.allSettled([
        dbRequestContext.run({userId: '', globalRole: 'super_admin'}, () =>
          adapter.recordAttendance({
            eventId: event.id,
            registrationId: confirmedReg.id,
            studentId: confirmedStudent.id,
            studentName: confirmedStudent.name,
            studentCode: confirmedStudent.studentId,
            qrToken: releasedQrToken,
            method: 'qr_scan',
            checkedInBy: 'Gate Scanner 1',
          }),
        ),
        dbRequestContext.run({userId: '', globalRole: 'super_admin'}, () =>
          adapter.recordAttendance({
            eventId: event.id,
            registrationId: confirmedReg.id,
            studentId: confirmedStudent.id,
            studentName: confirmedStudent.name,
            studentCode: confirmedStudent.studentId,
            qrToken: releasedQrToken,
            method: 'qr_scan',
            checkedInBy: 'Gate Scanner 2',
          }),
        ),
      ]);
      expect(scanResults.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(scanResults.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(
        (scanResults.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason
          .statusCode,
      ).toBe(409);

      const attList = await dbRequestContext.run({userId: '', globalRole: 'super_admin'}, () =>
        adapter.listAttendanceForEvent(event.id),
      );
      expect(attList).toHaveLength(1);

      // 7. Direct PostgreSQL RLS & Role Isolation as `campusverse_app`
      const client = getSqlClient();
      await client.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL ROLE campusverse_app`);
        await tx`SELECT set_config('app.current_user_id', ${studentA.id}, true), set_config('app.current_global_role', 'user', true)`;

        // Student A CANNOT see Student B's registration
        const studentBRegs = await tx`SELECT id FROM public.registrations WHERE user_id = ${studentB.id}`;
        expect(studentBRegs).toHaveLength(0);

        // Student A CAN see their own registration
        const ownRegs = await tx`SELECT id FROM public.registrations WHERE user_id = ${studentA.id}`;
        expect(ownRegs).toHaveLength(1);

        // Student A CANNOT read finance_reports
        const financeRows = await tx`SELECT id FROM public.finance_reports`;
        expect(financeRows).toHaveLength(0);
      });

      // Student A CANNOT escalate global_role (trigger check in isolated transaction)
      await expect(
        client.begin(async (tx) => {
          await tx.unsafe(`SET LOCAL ROLE campusverse_app`);
          await tx`SELECT set_config('app.current_user_id', ${studentA.id}, true), set_config('app.current_global_role', 'user', true)`;
          await tx`UPDATE public.users SET global_role = 'super_admin' WHERE id = ${studentA.id}`;
        }),
      ).rejects.toThrow(/Privilege escalation denied/i);

      // campusverse_app CANNOT delete or update audit_logs (least-privilege grant check)
      await expect(
        client.begin(async (tx) => {
          await tx.unsafe(`SET LOCAL ROLE campusverse_app`);
          await tx`SELECT set_config('app.current_user_id', ${studentA.id}, true), set_config('app.current_global_role', 'super_admin', true)`;
          await tx`DELETE FROM public.audit_logs`;
        }),
      ).rejects.toThrow(/permission denied/i);

      // 8. EXPLAIN ANALYZE on indexed QR hash lookup
      const qrHash = hashSha256(qrA);
      const explainRows = await client.unsafe<Array<{'QUERY PLAN': string}>>(
        `EXPLAIN (ANALYZE, FORMAT TEXT) SELECT id, status FROM public.registrations WHERE event_id = '${event.id}' AND qr_token_hash = '${qrHash}'`,
      );
        const planText = explainRows.map((r) => r['QUERY PLAN']).join('\n');
        expect(planText).toContain('Execution Time');
      },
      25000,
    );

    it(
      'Phase 3: persists profiles, concurrent 2-club follows, inactive clubs, strict membership conflicts, live Hall of Fame ties, and RLS/trigger enforcement',
      async () => {
        const adapter = new PostgresDataAdapter();
        const client = getSqlClient();

        // Provision test student, club admin candidate, and super admin
        const student = await adapter.provisionAuthenticatedUser({
          authUserId: crypto.randomUUID(),
          email: `p3.student.${testRunSuffix}@vitbhopal.ac.in`,
          name: 'Phase3 Student',
          emailVerified: true,
          isBootstrapSuperAdmin: false,
        });
        const leader = await adapter.provisionAuthenticatedUser({
          authUserId: crypto.randomUUID(),
          email: `p3.leader.${testRunSuffix}@vitbhopal.ac.in`,
          name: 'Phase3 Leader',
          emailVerified: true,
          isBootstrapSuperAdmin: false,
        });
        const followerExtra = await adapter.provisionAuthenticatedUser({
          authUserId: crypto.randomUUID(),
          email: `p3.extra.${testRunSuffix}@vitbhopal.ac.in`,
          name: 'Phase3 Extra Follower',
          emailVerified: true,
          isBootstrapSuperAdmin: false,
        });
        createdUserIds.push(student.id, leader.id, followerExtra.id);

        // 1. Profile update persistence
        const updatedProfile = await dbRequestContext.run(
          {userId: student.id, globalRole: 'user'},
          () =>
            adapter.updateUserProfile(student.id, {
              name: 'Phase3 Updated Student',
              department: 'Aerospace Engineering',
              yearOfStudy: 'Year 4',
            }),
        );
        expect(updatedProfile?.name).toBe('Phase3 Updated Student');
        expect(updatedProfile?.department).toBe('Aerospace Engineering');

        // Unauthenticated RLS check: public role cannot read users table
        await client.begin(async (tx) => {
          await tx.unsafe(`SET LOCAL ROLE campusverse_app`);
          await tx`SELECT set_config('app.current_user_id', '', true), set_config('app.current_global_role', 'public', true)`;
          const publicUsers = await tx`SELECT id FROM public.users`;
          expect(publicUsers).toHaveLength(0);
        });

        // 2. Create 3 active clubs + 1 inactive club
        const [clubA, clubB, clubC, inactiveClub] = await dbRequestContext.run(
          {userId: '', globalRole: 'super_admin'},
          async () => {
            const a = await adapter.createClub({
              name: `P3 Alpha ${testRunSuffix}`,
              category: 'Technology',
              tagline: 'Phase 3 test club Alpha for ranking & follow checks.',
              description: 'Automated integration test club Alpha with persistent DB storage.',
              meetingSchedule: 'Mon 17:00',
              contactEmail: `alpha.${testRunSuffix}@vitbhopal.ac.in`,
              status: 'active',
            });
            const b = await adapter.createClub({
              name: `P3 Beta ${testRunSuffix}`,
              category: 'Design',
              tagline: 'Phase 3 test club Beta for ranking & follow checks.',
              description: 'Automated integration test club Beta with persistent DB storage.',
              meetingSchedule: 'Tue 17:00',
              contactEmail: `beta.${testRunSuffix}@vitbhopal.ac.in`,
              status: 'active',
            });
            const c = await adapter.createClub({
              name: `P3 Gamma ${testRunSuffix}`,
              category: 'Robotics & Hardware',
              tagline: 'Phase 3 test club Gamma for ranking & follow checks.',
              description: 'Automated integration test club Gamma with persistent DB storage.',
              meetingSchedule: 'Wed 17:00',
              contactEmail: `gamma.${testRunSuffix}@vitbhopal.ac.in`,
              status: 'active',
            });
            const d = await adapter.createClub({
              name: `P3 Inactive ${testRunSuffix}`,
              category: 'Social Impact',
              tagline: 'Phase 3 inactive test club excluded from student discovery.',
              description: 'Automated integration test inactive club for visibility checks.',
              meetingSchedule: 'Thu 17:00',
              contactEmail: `inactive.${testRunSuffix}@vitbhopal.ac.in`,
              status: 'inactive',
            });
            return [a, b, c, d];
          },
        );
        createdClubIds.push(clubA.id, clubB.id, clubC.id, inactiveClub.id);

        // Inactive club hidden from public listClubs, student getClubDetail, Hall of Fame, and followClub
        const publicClubs = await adapter.listClubs();
        expect(publicClubs.some((c) => c.id === inactiveClub.id)).toBe(false);
        const hiddenDetail = await dbRequestContext.run(
          {userId: student.id, globalRole: 'user'},
          () => adapter.getClubDetail(inactiveClub.id, student.id),
        );
        expect(hiddenDetail).toBeNull();
        const superDetail = await dbRequestContext.run(
          {userId: '', globalRole: 'super_admin'},
          () => adapter.getClubDetail(inactiveClub.id),
        );
        expect(superDetail?.status).toBe('inactive');

        await expect(
          dbRequestContext.run({userId: student.id, globalRole: 'user'}, () =>
            adapter.followClub(student.id, inactiveClub.id),
          ),
        ).rejects.toMatchObject({code: 'CLUB_NOT_ACTIVE', statusCode: 422});

        // 3. Concurrent 3-way follow from 0 follows -> strictly 2 succeed, 1 fails with MAX_CLUB_FOLLOW_LIMIT_REACHED
        const threeFollows = await Promise.allSettled([
          dbRequestContext.run({userId: student.id, globalRole: 'user'}, () =>
            adapter.followClub(student.id, clubA.id),
          ),
          dbRequestContext.run({userId: student.id, globalRole: 'user'}, () =>
            adapter.followClub(student.id, clubB.id),
          ),
          dbRequestContext.run({userId: student.id, globalRole: 'user'}, () =>
            adapter.followClub(student.id, clubC.id),
          ),
        ]);
        expect(threeFollows.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
        const rejected = threeFollows.filter((r) => r.status === 'rejected');
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason.code).toBe(
          'MAX_CLUB_FOLLOW_LIMIT_REACHED',
        );

        const studentFollows = await dbRequestContext.run(
          {userId: student.id, globalRole: 'user'},
          () => adapter.getFollowsForUser(student.id),
        );
        expect(studentFollows).toHaveLength(2);
        const expectedClubAFollows =
          (studentFollows.some((f) => f.clubId === clubA.id) ? 1 : 0) + 1;

        // Follower counts on live Hall of Fame reflect real follows and exclude inactiveClub
        await dbRequestContext.run({userId: followerExtra.id, globalRole: 'user'}, () =>
          adapter.followClub(followerExtra.id, clubA.id),
        );
        const hof = await adapter.getHallOfFame();
        expect(hof.some((e) => e.club.id === inactiveClub.id)).toBe(false);
        const hofClubA = hof.find((e) => e.club.id === clubA.id);
        expect(hofClubA?.followerCount).toBe(expectedClubAFollows);

        // Verify unfollowing clubA decrements followerCount back by 1 for followerExtra
        await dbRequestContext.run({userId: followerExtra.id, globalRole: 'user'}, () =>
          adapter.unfollowClub(followerExtra.id, clubA.id),
        );
        const hofAfterUnfollow = await adapter.getHallOfFame();
        const hofClubAAfter = hofAfterUnfollow.find((e) => e.club.id === clubA.id);
        expect(hofClubAAfter?.followerCount).toBe(expectedClubAFollows - 1);

        // 4. Concurrent strictInsert duplicate membership -> 1 succeeds, 1 throws 409 Conflict
        const dupMemResults = await Promise.allSettled([
          dbRequestContext.run({userId: '', globalRole: 'super_admin'}, () =>
            adapter.upsertClubMembership({
              clubId: clubA.id,
              userId: leader.id,
              role: 'president',
              title: 'President',
              permissions: ['MANAGE_EVENTS', 'VIEW_REGISTRATIONS'],
              strictInsert: true,
            }),
          ),
          dbRequestContext.run({userId: '', globalRole: 'super_admin'}, () =>
            adapter.upsertClubMembership({
              clubId: clubA.id,
              userId: leader.id,
              role: 'president',
              title: 'President',
              permissions: ['MANAGE_EVENTS', 'VIEW_REGISTRATIONS'],
              strictInsert: true,
            }),
          ),
        ]);
        expect(dupMemResults.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        const memErr = dupMemResults.find((r) => r.status === 'rejected') as PromiseRejectedResult;
        expect(memErr.reason.statusCode).toBe(409);

        // 5. DB trigger blocks non-Super-Admin from modifying clubs.status, clubs.follower_count, or president memberships
        await expect(
          client.begin(async (tx) => {
            await tx.unsafe(`SET LOCAL ROLE campusverse_app`);
            await tx`SELECT set_config('app.current_user_id', ${leader.id}, true), set_config('app.current_global_role', 'user', true)`;
            await tx`UPDATE public.clubs SET status = 'inactive' WHERE id = ${clubA.id}`;
          }),
        ).rejects.toThrow(/only Super Admin can modify club status/i);

        await expect(
          client.begin(async (tx) => {
            await tx.unsafe(`SET LOCAL ROLE campusverse_app`);
            await tx`SELECT set_config('app.current_user_id', ${leader.id}, true), set_config('app.current_global_role', 'user', true)`;
            await tx`UPDATE public.clubs SET follower_count = 9999 WHERE id = ${clubA.id}`;
          }),
        ).rejects.toThrow(/follower_count is maintained transactionally/i);

        await expect(
          client.begin(async (tx) => {
            await tx.unsafe(`SET LOCAL ROLE campusverse_app`);
            await tx`SELECT set_config('app.current_user_id', ${leader.id}, true), set_config('app.current_global_role', 'user', true)`;
            await tx`
              INSERT INTO public.club_memberships (user_id, club_id, membership_role, title, permissions)
              VALUES (${student.id}, ${clubA.id}, 'president', 'Rogue Admin', '[]'::jsonb)
            `;
          }),
        ).rejects.toThrow(/only Super Admin/i);
      },
      25000,
    );

    it(
      'Phase 4: verifies leadership replacement, SHA-256 invitation races, 4-scanner quota, immutable form snapshots, waitlist FIFO promotion, and EXPLAIN ANALYZE index usage',
      async () => {
        clearCapturedInvitationEmailsForTests();
        const adapter = new PostgresDataAdapter();
        const client = getSqlClient();

        // Provision test accounts
        const presAuthId = crypto.randomUUID();
        const pres2AuthId = crypto.randomUUID();
        const coreInviteAuthId = crypto.randomUUID();
        const studentWait1AuthId = crypto.randomUUID();
        const studentWait2AuthId = crypto.randomUUID();

        const [pres1, pres2, sw1, sw2] = await Promise.all([
          adapter.provisionAuthenticatedUser({
            authUserId: presAuthId,
            email: `p4.pres1.${testRunSuffix}@vitbhopal.ac.in`,
            name: 'P4 President 1',
            emailVerified: true,
            isBootstrapSuperAdmin: false,
          }),
          adapter.provisionAuthenticatedUser({
            authUserId: pres2AuthId,
            email: `p4.pres2.${testRunSuffix}@vitbhopal.ac.in`,
            name: 'P4 President 2',
            emailVerified: true,
            isBootstrapSuperAdmin: false,
          }),
          adapter.provisionAuthenticatedUser({
            authUserId: studentWait1AuthId,
            email: `p4.wait1.${testRunSuffix}@vitbhopal.ac.in`,
            name: 'P4 Waitlist Student 1',
            emailVerified: true,
            isBootstrapSuperAdmin: false,
          }),
          adapter.provisionAuthenticatedUser({
            authUserId: studentWait2AuthId,
            email: `p4.wait2.${testRunSuffix}@vitbhopal.ac.in`,
            name: 'P4 Waitlist Student 2',
            emailVerified: true,
            isBootstrapSuperAdmin: false,
          }),
        ]);
        createdUserIds.push(pres1.id, pres2.id, sw1.id, sw2.id);

        // 1. Create club and test leadership assignment + replacement preserving user account
        const p4Club = await dbRequestContext.run({userId: '', globalRole: 'super_admin'}, () =>
          adapter.createClub({
            name: `P4 Governance Club ${testRunSuffix}`,
            category: 'Technology',
            tagline: 'Phase 4 PostgreSQL governance, invitation & waitlist verification.',
            description:
              'Automated Phase 4 integration test club validating leadership, invites, scanner limits, and waitlists.',
            meetingSchedule: 'Fridays · 18:00',
            contactEmail: `p4club.${testRunSuffix}@vitbhopal.ac.in`,
            status: 'active',
          }),
        );
        createdClubIds.push(p4Club.id);

        const firstAssign = await dbRequestContext.run({userId: '', globalRole: 'super_admin'}, () =>
          adapter.assignClubLeadership({
            clubId: p4Club.id,
            email: pres1.email,
            role: 'president',
            sendInvitation: false,
            actorUserId: pres1.id,
          }),
        );
        expect(firstAssign.mode).toBe('assigned');

        // Replacing president preserves pres1 user row
        const replaceAssign = await dbRequestContext.run(
          {userId: '', globalRole: 'super_admin'},
          () =>
            adapter.assignClubLeadership({
              clubId: p4Club.id,
              email: pres2.email,
              role: 'president',
              replaceExisting: true,
              sendInvitation: false,
              actorUserId: pres2.id,
            }),
        );
        expect(replaceAssign.mode).toBe('assigned');
        expect(replaceAssign.replacedUserId).toBe(pres1.id);
        const pres1StillExists = await adapter.getUserById(pres1.id);
        expect(pres1StillExists).not.toBeNull();

        // 2. Invitation stores SHA-256 hash only, rejects wrong email, and enforces single-use under concurrent race
        const inviteEmail = `p4.invitee.${testRunSuffix}@vitbhopal.ac.in`;
        const invite = await dbRequestContext.run(
          {userId: pres2.id, globalRole: 'user'},
          () =>
            adapter.createClubInvitation({
              clubId: p4Club.id,
              email: inviteEmail,
              role: 'core_member',
              title: 'Core Scanner 1',
              permissions: ['SCAN_ATTENDANCE', 'VIEW_REGISTRATIONS'],
              inviterUserId: pres2.id,
            }),
        );

        const sentEmails = getCapturedInvitationEmailsForTests();
        const inviteMail = sentEmails.find((m) => m.invitationId === invite.id)!;
        expect(inviteMail).toBeTruthy();

        // Unscoped query under RLS returns 0 rows (no token_hash leak)
        const unscopedInvRows = await client<Array<{token_hash: string}>>`
          SELECT token_hash FROM public.club_invitations WHERE id = ${invite.id}
        `;
        expect(unscopedInvRows).toHaveLength(0);

        // Super Admin context inspects SHA-256 hash only (never plaintext)
        const dbInvRows = await client.begin(async (tx) => {
          await tx`SELECT set_config('app.current_global_role', 'super_admin', true)`;
          return tx<Array<{token_hash: string}>>`
            SELECT token_hash FROM public.club_invitations WHERE id = ${invite.id}
          `;
        });
        expect(dbInvRows).toHaveLength(1);
        expect(dbInvRows[0].token_hash).toBe(hashInvitationToken(inviteMail.token));
        expect(dbInvRows[0].token_hash).not.toBe(inviteMail.token);

        // Institutional email mismatch rejected
        await expect(
          adapter.acceptInvitation({
            token: inviteMail.token,
            authUserId: sw1AuthOrId(studentWait1AuthId),
            email: sw1.email,
            emailVerified: true,
            isBootstrapSuperAdmin: false,
          }),
        ).rejects.toThrow(/issued to/i);

        // Concurrent dual accept race -> strictly 1 succeeds, 1 throws 409, zero duplicate users
        const acceptRace = await Promise.allSettled([
          adapter.acceptInvitation({
            token: inviteMail.token,
            authUserId: coreInviteAuthId,
            email: inviteEmail,
            name: 'P4 Invited Core',
            department: 'Computer Science',
            yearOfStudy: 'Year 3',
            emailVerified: true,
            isBootstrapSuperAdmin: false,
          }),
          adapter.acceptInvitation({
            token: inviteMail.token,
            authUserId: coreInviteAuthId,
            email: inviteEmail,
            name: 'P4 Invited Core',
            department: 'Computer Science',
            yearOfStudy: 'Year 3',
            emailVerified: true,
            isBootstrapSuperAdmin: false,
          }),
        ]);
        const fulfilledAccepts = acceptRace.filter((r) => r.status === 'fulfilled');
        const rejectedAccepts = acceptRace.filter((r) => r.status === 'rejected');
        expect(fulfilledAccepts).toHaveLength(1);
        expect(rejectedAccepts).toHaveLength(1);
        expect((rejectedAccepts[0] as PromiseRejectedResult).reason.statusCode).toBe(409);

        const invitedUserRow = (fulfilledAccepts[0] as PromiseFulfilledResult<Awaited<ReturnType<PostgresDataAdapter['acceptInvitation']>>>).value.user;
        createdUserIds.push(invitedUserRow.id);

        // 3. Add 3 more core scanners (total 4), then concurrent 5th scanner must reject with SCANNER_SLOT_LIMIT_EXCEEDED
        const scannerUsers = await Promise.all(
          [2, 3, 4, 5].map((idx) =>
            adapter.provisionAuthenticatedUser({
              authUserId: crypto.randomUUID(),
              email: `p4.scan${idx}.${testRunSuffix}@vitbhopal.ac.in`,
              name: `P4 Scanner ${idx}`,
              emailVerified: true,
              isBootstrapSuperAdmin: false,
            }),
          ),
        );
        createdUserIds.push(...scannerUsers.map((u) => u.id));

        for (let i = 0; i < 3; i++) {
          await dbRequestContext.run({userId: pres2.id, globalRole: 'user'}, () =>
            adapter.upsertClubMembership({
              clubId: p4Club.id,
              userId: scannerUsers[i].id,
              role: 'core_member',
              title: `Scanner ${i + 2}`,
              permissions: ['SCAN_ATTENDANCE'],
              strictInsert: true,
            }),
          );
        }

        await expect(
          dbRequestContext.run({userId: pres2.id, globalRole: 'user'}, () =>
            adapter.upsertClubMembership({
              clubId: p4Club.id,
              userId: scannerUsers[3].id,
              role: 'core_member',
              title: 'Scanner 5 Blocked',
              permissions: ['SCAN_ATTENDANCE'],
              strictInsert: true,
            }),
          ),
        ).rejects.toMatchObject({code: 'SCANNER_SLOT_LIMIT_EXCEEDED', statusCode: 422});

        // 4. Immutable event_form_versions snapshot + capacity=1 waitlist + cancelRegistration FIFO promotion
        const p4Event = await dbRequestContext.run({userId: '', globalRole: 'super_admin'}, async () => {
          const ev = await adapter.createEvent(p4Club.id, {
            title: `P4 Waitlist Event ${testRunSuffix}`,
            category: 'Workshop',
            description: 'Phase 4 waitlist promotion and form snapshot verification event.',
            venue: 'Seminar Hall 2',
            startTime: '2026-12-29T10:00:00.000Z',
            endTime: '2026-12-29T12:00:00.000Z',
            registrationDeadline: '2026-12-28T23:59:00.000Z',
            capacity: 1,
            isPaid: false,
            feeAmount: 0,
          });
          await adapter.upsertRegistrationForm(ev.id, [
            {id: 'q1', label: 'Project Link', type: 'url', required: true},
          ]);
          await adapter.publishRegistrationForm(ev.id, pres2.id);
          // Edit draft without publishing v2
          await adapter.upsertRegistrationForm(ev.id, [
            {id: 'q2', label: 'Draft Only Field', type: 'text', required: true},
          ]);
          return (await adapter.publishEvent(ev.id))!;
        });

        const v1Snapshot = await adapter.getPublishedFormVersion(p4Event.id, 1);
        expect(v1Snapshot?.fields).toHaveLength(1);
        expect(v1Snapshot?.fields[0].id).toBe('q1');

        const firstReg = await dbRequestContext.run({userId: sw1.id, globalRole: 'user'}, () =>
          adapter.createRegistration({
            eventId: p4Event.id,
            studentId: sw1.id,
            studentName: sw1.name,
            studentEmail: sw1.email,
            answers: {q1: 'https://example.edu/demo'},
            qrToken: `CV-QR-P4A-${testRunSuffix}`,
            formVersion: v1Snapshot!.version,
            formVersionId: v1Snapshot!.id,
          }),
        );
        expect(firstReg.status).toBe('confirmed');

        const waitReg = await dbRequestContext.run({userId: sw2.id, globalRole: 'user'}, () =>
          adapter.createRegistration({
            eventId: p4Event.id,
            studentId: sw2.id,
            studentName: sw2.name,
            studentEmail: sw2.email,
            answers: {q1: 'https://example.edu/wait'},
            qrToken: `CV-QR-P4B-${testRunSuffix}`,
            formVersion: v1Snapshot!.version,
            formVersionId: v1Snapshot!.id,
          }),
        );
        expect(waitReg.status).toBe('waitlisted');
        expect(waitReg.waitlistPosition).toBe(1);

        const cancelOutcome = await dbRequestContext.run({userId: sw1.id, globalRole: 'user'}, () =>
          adapter.cancelRegistration(p4Event.id, sw1.id),
        );
        expect(cancelOutcome.promotedRegistrationId).toBe(waitReg.id);
        expect(cancelOutcome.promotedUserId).toBe(sw2.id);

        const promotedRow = await dbRequestContext.run({userId: sw2.id, globalRole: 'user'}, () =>
          adapter.getRegistrationById(waitReg.id),
        );
        expect(promotedRow?.status).toBe('confirmed');

        // 5. EXPLAIN ANALYZE on indexed club_invitations token_hash lookup
        const explainInvite = await client.unsafe<Array<{'QUERY PLAN': string}>>(
          `EXPLAIN (ANALYZE, FORMAT TEXT) SELECT id, status FROM public.club_invitations WHERE token_hash = '${hashInvitationToken(inviteMail.token)}'`,
        );
        const invitePlanText = explainInvite.map((r) => r['QUERY PLAN']).join('\n');
        expect(invitePlanText).toContain('Execution Time');
      },
      30000,
    );

    it(
      'Phase 5: persists controlled ticket release hashes, RLS on tickets/finance_entries, report review history, and integer-paise finance summaries',
      async () => {
        const adapter = new PostgresDataAdapter();
        const client = getSqlClient();

        const [leader, stu1, stu2] = await Promise.all([
          adapter.provisionAuthenticatedUser({
            authUserId: crypto.randomUUID(),
            email: `p5.leader.${testRunSuffix}@vitbhopal.ac.in`,
            name: 'P5 Club Leader',
            emailVerified: true,
            isBootstrapSuperAdmin: false,
          }),
          adapter.provisionAuthenticatedUser({
            authUserId: crypto.randomUUID(),
            email: `p5.stu1.${testRunSuffix}@vitbhopal.ac.in`,
            name: 'P5 Student One',
            emailVerified: true,
            isBootstrapSuperAdmin: false,
          }),
          adapter.provisionAuthenticatedUser({
            authUserId: crypto.randomUUID(),
            email: `p5.stu2.${testRunSuffix}@vitbhopal.ac.in`,
            name: 'P5 Student Two',
            emailVerified: true,
            isBootstrapSuperAdmin: false,
          }),
        ]);
        createdUserIds.push(leader.id, stu1.id, stu2.id);

        const p5Club = await dbRequestContext.run({userId: '', globalRole: 'super_admin'}, async () => {
          const c = await adapter.createClub({
            name: `P5 Full Cycle Guild ${testRunSuffix}`,
            category: 'Robotics & Hardware',
            tagline: 'Phase 5 PostgreSQL ticket, report, Instagram & integer-paise ledger check.',
            description:
              'Automated Phase 5 live PostgreSQL test validating ticket hashes, RLS isolation, report review history, and minor-unit finance.',
            meetingSchedule: 'Saturdays · 15:00',
            contactEmail: `p5club.${testRunSuffix}@vitbhopal.ac.in`,
            instagramUrl: 'https://www.instagram.com/p5fullcycle/',
            status: 'active',
          });
          await adapter.upsertClubMembership({
            clubId: c.id,
            userId: leader.id,
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
            strictInsert: true,
          });
          return c;
        });
        createdClubIds.push(p5Club.id);
        expect(p5Club.instagramUrl).toBe('https://www.instagram.com/p5fullcycle/');

        const p5Event = await dbRequestContext.run({userId: leader.id, globalRole: 'user'}, async () => {
          const ev = await adapter.createEvent(p5Club.id, {
            title: `P5 Ticket Release Event ${testRunSuffix}`,
            category: 'Workshop',
            description: 'Testing Postgres ticket release, QR token hashing, report review & finance.',
            venue: 'Hangar Lab 5',
            startTime: '2026-12-30T10:00:00.000Z',
            endTime: '2026-12-30T13:00:00.000Z',
            registrationDeadline: '2026-12-29T23:59:00.000Z',
            capacity: 25,
            isPaid: false,
            feeAmount: 0,
          });
          await adapter.upsertRegistrationForm(ev.id, [
            {id: 'badge', label: 'Badge Handle', type: 'text', required: true},
          ]);
          await adapter.publishRegistrationForm(ev.id, leader.id);
          return (await adapter.publishEvent(ev.id))!;
        });

        // Register student 1 -> starts as not_released with no usable QR token
        const reg = await dbRequestContext.run({userId: stu1.id, globalRole: 'user'}, () =>
          adapter.createRegistration({
            eventId: p5Event.id,
            studentId: stu1.id,
            studentName: stu1.name,
            studentEmail: stu1.email,
            answers: {badge: 'P5-ALPHA'},
            qrToken: '',
            formVersion: 1,
          }),
        );
        expect(reg.ticketStatus).toBe('not_released');
        expect(reg.qrToken).toBe('');

        // Batch release tickets transactionally -> idempotent on second call
        const relSummary = await dbRequestContext.run({userId: leader.id, globalRole: 'user'}, () =>
          adapter.releaseEventTickets(p5Event.id, {id: leader.id, name: leader.name}),
        );
        expect(relSummary.releasedCount).toBe(1);

        const relAgain = await dbRequestContext.run({userId: leader.id, globalRole: 'user'}, () =>
          adapter.releaseEventTickets(p5Event.id, {id: leader.id, name: leader.name}),
        );
        expect(relAgain.releasedCount).toBe(0);
        expect(relAgain.alreadyReleasedCount).toBe(1);

        // Student 1 sees their unsealed CV-TCK token; DB stores hash only (never plaintext in token_hash or registrations.qr_token)
        const stu1Tickets = await dbRequestContext.run({userId: stu1.id, globalRole: 'user'}, () =>
          adapter.listStudentTickets(stu1.id),
        );
        const releasedTicket = stu1Tickets.find((t) => t.eventId === p5Event.id)!;
        expect(releasedTicket.status).toBe('released');
        expect(releasedTicket.qrToken).toMatch(/^CV-TCK-/);

        // RLS under campusverse_app: Student 2 cannot read Student 1's ticket or club finance_entries
        await client.begin(async (tx) => {
          await tx.unsafe(`SET LOCAL ROLE campusverse_app`);
          await tx`SELECT set_config('app.current_user_id', ${stu2.id}, true), set_config('app.current_global_role', 'user', true)`;

          const otherTickets = await tx`SELECT id FROM public.tickets WHERE event_id = ${p5Event.id}`;
          expect(otherTickets).toHaveLength(0);

          const clubFin = await tx`SELECT id FROM public.finance_entries WHERE club_id = ${p5Club.id}`;
          expect(clubFin).toHaveLength(0);
        });

        // Verify plaintext CV-TCK- token is NOT stored in registrations.qr_token or tickets.token_hash
        const rawDbTicketRows = await client.begin(async (tx) => {
          await tx`SELECT set_config('app.current_global_role', 'super_admin', true)`;
          return tx<Array<{token_hash: string; qr_token: string}>>`
            SELECT t.token_hash, r.qr_token
            FROM public.tickets t
            JOIN public.registrations r ON r.id = t.registration_id
            WHERE t.id = ${releasedTicket.id}
          `;
        });
        expect(rawDbTicketRows[0].token_hash).toBe(hashSha256(releasedTicket.qrToken!));
        expect(rawDbTicketRows[0].qr_token).not.toBe(releasedTicket.qrToken!);

        // QR token lookup & attendance summary metrics
        const matchedReg = await dbRequestContext.run({userId: leader.id, globalRole: 'user'}, () =>
          adapter.getRegistrationByQrToken(p5Event.id, releasedTicket.qrToken!),
        );
        expect(matchedReg?.id).toBe(reg.id);

        await dbRequestContext.run({userId: leader.id, globalRole: 'user'}, () =>
          adapter.recordAttendance({
            eventId: p5Event.id,
            registrationId: reg.id,
            studentId: stu1.id,
            studentName: stu1.name,
            studentCode: stu1.studentId,
            qrToken: releasedTicket.qrToken!,
            method: 'qr_scan',
            checkedInBy: leader.name,
            scannedByUserId: leader.id,
          }),
        );

        const attSummary = await dbRequestContext.run({userId: leader.id, globalRole: 'user'}, () =>
          adapter.getAttendanceSummary(p5Event.id),
        );
        expect(attSummary).toMatchObject({
          confirmedCount: 1,
          ticketsReleasedCount: 1,
          ticketsNotReleasedCount: 0,
          attendedCount: 1,
          remainingCount: 0,
          attendancePercentage: 100,
        });

        // Integer-paise finance entries & summary calculation
        await dbRequestContext.run({userId: leader.id, globalRole: 'user'}, async () => {
          await adapter.createFinanceEntry({
            clubId: p5Club.id,
            eventId: p5Event.id,
            entryType: 'income',
            sourceOrCategory: 'Sponsor Grant',
            description: 'Main event sponsorship',
            amountMinorUnits: 250050,
            transactionDate: '2026-12-20',
            vendorOrRecipient: 'Campus Tech Sponsor',
            createdBy: leader.id,
            createdByName: leader.name,
          });
          await adapter.createFinanceEntry({
            clubId: p5Club.id,
            eventId: p5Event.id,
            entryType: 'expense',
            sourceOrCategory: 'Printing',
            description: 'Workshop manuals',
            amountMinorUnits: 100025,
            transactionDate: '2026-12-21',
            vendorOrRecipient: 'Campus Print Shop',
            createdBy: leader.id,
            createdByName: leader.name,
          });
        });

        const clubFinance = await dbRequestContext.run({userId: leader.id, globalRole: 'user'}, () =>
          adapter.getFinanceSummary({clubId: p5Club.id}),
        );
        expect(clubFinance.totalIncomeMinorUnits).toBe(250050);
        expect(clubFinance.totalExpensesMinorUnits).toBe(100025);
        expect(clubFinance.netBalanceMinorUnits).toBe(150025);

        // Structured post-event report + Super Admin review history persistence
        const report = await dbRequestContext.run({userId: leader.id, globalRole: 'user'}, () =>
          adapter.upsertEventReport({
            eventId: p5Event.id,
            eventTitle: p5Event.title,
            clubId: p5Club.id,
            clubName: p5Club.name,
            submittedBy: leader.id,
            submittedByName: leader.name,
            actorRole: 'Club President',
            outcomeSummary: 'All participants completed the P5 robotics integration lab.',
            objectives: 'Verify real PostgreSQL ticket release & attendance flow.',
            actualEventDate: '2026-12-30',
            participationSummary: '1 of 1 confirmed attendees verified via QR.',
            outcomes: 'Zero duplicate scans and clean reconciliation.',
            highlights: 'Smooth hardware gate workflow.',
            challenges: 'None reported',
            feedbackObservations: 'Well received.',
            actualAttendance: 1,
            registeredTotal: 1,
            completionStatus: 'completed',
            status: 'submitted',
          }),
        );
        expect(report.status).toBe('submitted');

        const reviewed = await dbRequestContext.run({userId: '', globalRole: 'super_admin'}, () =>
          adapter.reviewEventReport(
            report.id,
            {id: leader.id, name: 'Test Reviewer'},
            {status: 'approved', reviewNotes: 'Verified live Postgres persistence'},
          ),
        );
        expect(reviewed.status).toBe('approved');
        expect(reviewed.history?.length ?? 0).toBeGreaterThanOrEqual(2);
      },
      30000,
    );
  },
);

function sw1AuthOrId(id: string): string {
  return id;
}
