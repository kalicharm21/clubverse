import dotenv from 'dotenv';
import {eq, sql} from 'drizzle-orm';
import {createDbPool} from './index.ts';
import {
  auditLogs,
  clubs,
  eventForms,
  eventFormVersions,
  events,
  formFields,
  hallOfFameSnapshots,
  systemSettings,
} from './schema.ts';

dotenv.config();

// Deterministic UUIDs so repeated seed runs are strictly idempotent
const SEED_CLUBS = [
  {
    id: '11111111-1111-4111-8111-111111111101',
    name: 'Apex Robotics Lab',
    slug: 'apex-robotics-lab',
    category: 'Robotics & Hardware',
    tagline: 'Autonomous rovers, embedded firmware, and combat robotics engineering.',
    description:
      'Apex Robotics Lab brings together mechanical, electrical, and software students to design autonomous navigation platforms, custom PCBs, and inter-university competition robots.',
    logoUrl: '/src/assets/images/club_robotics_emblem_1795447591960.jpg',
    status: 'active',
    foundedYear: 2018,
    meetingSchedule: 'Wednesdays & Saturdays · 17:30 · Innovation Hangar B2',
    contactEmail: 'robotics@vitbhopal.ac.in',
    instagramUrl: 'https://www.instagram.com/apexroboticslab/',
  },
  {
    id: '11111111-1111-4111-8111-111111111102',
    name: 'Atelier Design Guild',
    slug: 'atelier-design-guild',
    category: 'Design',
    tagline: 'Product design critiques, typography labs, and campus editorial systems.',
    description:
      'Atelier Design Guild fosters multidisciplinary visual craft across UI systems, industrial product prototyping, print publication design, and weekly portfolio critiques.',
    logoUrl: '/src/assets/images/club_design_emblem_1795447591826.jpg',
    status: 'active',
    foundedYear: 2020,
    meetingSchedule: 'Thursdays · 18:00 · Studio Annex 104',
    contactEmail: 'atelier@vitbhopal.ac.in',
    instagramUrl: 'https://www.instagram.com/atelierdesignguild/',
  },
  {
    id: '11111111-1111-4111-8111-111111111103',
    name: 'Resonance Acoustic Society',
    slug: 'resonance-acoustic-society',
    category: 'Music & Arts',
    tagline: 'Live acoustic sessions, studio production, and campus concert engineering.',
    description:
      'Resonance Acoustic Society runs the campus recording booth, hosts unplugged quad evenings, and trains students in live sound mixing and arrangement.',
    logoUrl: '/src/assets/images/club_music_emblem_1795447592008.jpg',
    status: 'active',
    foundedYear: 2016,
    meetingSchedule: 'Fridays · 18:30 · Performing Arts Hall',
    contactEmail: 'resonance@vitbhopal.ac.in',
    instagramUrl: 'https://www.instagram.com/resonanceacoustic/',
  },
  {
    id: '11111111-1111-4111-8111-111111111104',
    name: 'Quantum Computing Circle',
    slug: 'quantum-computing-circle',
    category: 'Technology',
    tagline: 'Systems algorithms, cloud architecture, and open-source engineering.',
    description:
      'A technical guild dedicated to distributed systems, applied algorithms, security CTFs, and mentoring students through production open-source engineering.',
    logoUrl: '',
    status: 'active',
    foundedYear: 2021,
    meetingSchedule: 'Tuesdays · 17:00 · Turing Auditorium 301',
    contactEmail: 'quantum@vitbhopal.ac.in',
  },
  {
    id: '11111111-1111-4111-8111-111111111105',
    name: 'Civic Debate Forum',
    slug: 'civic-debate-forum',
    category: 'Debate & Literary',
    tagline: 'British Parliamentary debate, policy briefs, and public rhetoric.',
    description:
      'Civic Debate Forum prepares varsity parliamentary teams for regional tournaments and hosts campus-wide town halls on technology policy and civic ethics.',
    logoUrl: '',
    status: 'active',
    foundedYear: 2015,
    meetingSchedule: 'Mondays · 18:00 · Humanities Seminar 202',
    contactEmail: 'debate@vitbhopal.ac.in',
  },
  {
    id: '11111111-1111-4111-8111-111111111106',
    name: 'Venture Foundry',
    slug: 'venture-foundry',
    category: 'Entrepreneurship',
    tagline: 'Student founder cohorts, product teardowns, and demo day showcases.',
    description:
      'Venture Foundry connects technical builders and business students with alumni founders for structured 8-week product sprints and customer discovery clinics.',
    logoUrl: '',
    status: 'active',
    foundedYear: 2022,
    meetingSchedule: 'Wednesdays · 19:00 · Incubation Commons',
    contactEmail: 'foundry@vitbhopal.ac.in',
  },
] as const;

const SEED_EVENTS = [
  {
    id: '22222222-2222-4222-8222-222222222101',
    clubId: '11111111-1111-4111-8111-111111111101',
    title: 'Autonomous Rover Buildathon 2026',
    slug: 'autonomous-rover-buildathon-2026',
    category: 'Hackathon',
    description:
      'A 24-hour hardware and ROS2 navigation sprint. Teams receive an aluminum chassis kit, LiDAR sensor module, and bench power to complete an indoor obstacle course.',
    venue: 'Innovation Hangar B2 & Main Atrium',
    startsAt: new Date('2026-12-18T09:00:00.000Z'),
    endsAt: new Date('2026-12-19T12:00:00.000Z'),
    registrationDeadline: new Date('2026-12-16T23:59:00.000Z'),
    capacity: 120,
    isPaid: true,
    feeAmount: '250.00',
    bannerUrl: '/src/assets/images/event_hackathon_banner_1795447592033.jpg',
    status: 'published',
    publishedAt: new Date('2026-11-20T10:00:00.000Z'),
  },
  {
    id: '22222222-2222-4222-8222-222222222102',
    clubId: '11111111-1111-4111-8111-111111111102',
    title: 'Editorial Grid & Design Token Workshop',
    slug: 'editorial-grid-design-token-workshop',
    category: 'Workshop',
    description:
      'Learn systematic typographic scales, contrast ratios, and design token handoff between Figma and Tailwind CSS 4.',
    venue: 'Studio Annex 104',
    startsAt: new Date('2026-12-20T14:00:00.000Z'),
    endsAt: new Date('2026-12-20T17:00:00.000Z'),
    registrationDeadline: new Date('2026-12-19T23:59:00.000Z'),
    capacity: 60,
    isPaid: false,
    feeAmount: '0.00',
    bannerUrl: '/src/assets/images/club_design_emblem_1795447591826.jpg',
    status: 'published',
    publishedAt: new Date('2026-11-21T10:00:00.000Z'),
  },
  {
    id: '22222222-2222-4222-8222-222222222103',
    clubId: '11111111-1111-4111-8111-111111111103',
    title: 'Winter Quad Unplugged Showcase',
    slug: 'winter-quad-unplugged-showcase',
    category: 'Cultural',
    description:
      'An evening of original student acoustic compositions, chamber ensembles, and live multi-track studio recording at the central courtyard.',
    venue: 'University Student Union Amphitheater',
    startsAt: new Date('2026-12-22T18:00:00.000Z'),
    endsAt: new Date('2026-12-22T20:30:00.000Z'),
    registrationDeadline: new Date('2026-12-22T12:00:00.000Z'),
    capacity: 220,
    isPaid: false,
    feeAmount: '0.00',
    bannerUrl: '/src/assets/images/club_music_emblem_1795447592008.jpg',
    status: 'published',
    publishedAt: new Date('2026-11-22T10:00:00.000Z'),
  },
  {
    id: '22222222-2222-4222-8222-222222222104',
    clubId: '11111111-1111-4111-8111-111111111104',
    title: 'Campus Systems Security & CTF Sprint',
    slug: 'campus-systems-security-ctf-sprint',
    category: 'Competition',
    description:
      'Capture-the-flag challenge covering web security, cryptography, and cloud IAM hardening.',
    venue: 'Turing Auditorium 301',
    startsAt: new Date('2026-12-27T10:00:00.000Z'),
    endsAt: new Date('2026-12-27T16:00:00.000Z'),
    registrationDeadline: new Date('2026-12-26T23:59:00.000Z'),
    capacity: 90,
    isPaid: false,
    feeAmount: '0.00',
    bannerUrl: '/src/assets/images/hero_campus_quad_1795447592217.jpg',
    status: 'published',
    publishedAt: new Date('2026-11-22T12:00:00.000Z'),
  },
] as const;

const SEED_FORMS = [
  {
    formId: '33333333-3333-4333-8333-333333333101',
    eventId: '22222222-2222-4222-8222-222222222101',
    fields: [
      {
        fieldKey: 'team_name',
        label: 'Team or Squad Name',
        fieldType: 'text',
        placeholder: 'e.g., MechaVanguard',
        required: true,
        options: [],
        sortOrder: 0,
      },
      {
        fieldKey: 'track',
        label: 'Primary Track',
        fieldType: 'select',
        placeholder: '',
        required: true,
        options: ['Autonomous Navigation', 'Embedded Firmware', 'Mechanical Chassis'],
        sortOrder: 1,
      },
      {
        fieldKey: 'lab_safety',
        label: 'I acknowledge Innovation Hangar ESD & hardware safety guidelines',
        fieldType: 'checkbox',
        placeholder: '',
        required: true,
        options: [],
        sortOrder: 2,
      },
    ],
  },
  {
    formId: '33333333-3333-4333-8333-333333333102',
    eventId: '22222222-2222-4222-8222-222222222102',
    fields: [
      {
        fieldKey: 'experience',
        label: 'Design Systems Experience',
        fieldType: 'select',
        placeholder: '',
        required: true,
        options: ['Beginner', 'Intermediate', 'Advanced'],
        sortOrder: 0,
      },
      {
        fieldKey: 'portfolio_note',
        label: 'What UI challenge would you like reviewed?',
        fieldType: 'textarea',
        placeholder: 'Optional project context',
        required: false,
        options: [],
        sortOrder: 1,
      },
    ],
  },
  {
    formId: '33333333-3333-4333-8333-333333333103',
    eventId: '22222222-2222-4222-8222-222222222103',
    fields: [
      {
        fieldKey: 'attendance_type',
        label: 'Participation Format',
        fieldType: 'select',
        placeholder: '',
        required: true,
        options: ['Audience Pass', 'Acoustic Performer Slot'],
        sortOrder: 0,
      },
    ],
  },
  {
    formId: '33333333-3333-4333-8333-333333333104',
    eventId: '22222222-2222-4222-8222-222222222104',
    fields: [
      {
        fieldKey: 'handle',
        label: 'CTF Handle',
        fieldType: 'text',
        placeholder: 'e.g., cipher_0x42',
        required: true,
        options: [],
        sortOrder: 0,
      },
      {
        fieldKey: 'focus_area',
        label: 'Preferred Category',
        fieldType: 'select',
        placeholder: '',
        required: true,
        options: ['Web Exploitation', 'Cryptography', 'Cloud IAM', 'Reverse Engineering'],
        sortOrder: 1,
      },
    ],
  },
] as const;

async function runSeed() {
  const url =
    process.env.DATABASE_MIGRATION_URL?.trim() || process.env.DATABASE_URL?.trim() || '';
  if (!url) {
    throw new Error('DATABASE_MIGRATION_URL or DATABASE_URL is required to run seed.');
  }

  const {client, db} = createDbPool(url, 2);

  try {
    await db.transaction(async (tx) => {
      // Mark transaction context as privileged system_seed for RLS compliance
      await tx.execute(
        sql`SELECT set_config('app.current_user_id', '', true), set_config('app.current_global_role', 'system_seed', true)`,
      );

      // 1. Institutional system settings (idempotent upsert)
      await tx
        .insert(systemSettings)
        .values({
          key: 'campusverse_config',
          value: {
            maxClubsPerStudent: 2,
            requireClubApproval: true,
            allowStudentEventFeedback: true,
            phaseLabel: 'Phase 5 — Production Tickets, Verification, Reports & Finance',
            persistenceMode: 'postgres',
          },
        })
        .onConflictDoNothing({target: systemSettings.key});

      // 2. Reference clubs catalog (idempotent on id / slug)
      for (const club of SEED_CLUBS) {
        await tx
          .insert(clubs)
          .values({
            id: club.id,
            name: club.name,
            slug: club.slug,
            category: club.category,
            tagline: club.tagline,
            description: club.description,
            logoUrl: club.logoUrl,
            contactEmail: club.contactEmail,
            foundedYear: club.foundedYear,
            meetingSchedule: club.meetingSchedule,
            instagramUrl: 'instagramUrl' in club ? club.instagramUrl : '',
            status: club.status,
            followerCount: 0,
          })
          .onConflictDoNothing({target: clubs.slug});
      }

      // 3. Reference published events + registration forms
      for (const ev of SEED_EVENTS) {
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
            registrationDeadline: ev.registrationDeadline,
            capacity: ev.capacity,
            registeredCount: 0,
            isPaid: ev.isPaid,
            feeAmount: ev.feeAmount,
            bannerUrl: ev.bannerUrl,
            status: ev.status,
            publishedAt: ev.publishedAt,
          })
          .onConflictDoNothing({target: events.id});
      }

      for (const formSpec of SEED_FORMS) {
        await tx
          .insert(eventForms)
          .values({
            id: formSpec.formId,
            eventId: formSpec.eventId,
            version: 1,
            publishedVersion: 1,
            status: 'published',
            title: 'Event Registration Form',
            description: 'Standard participant registration details',
          })
          .onConflictDoNothing({target: eventForms.eventId});

        const existingForm = await tx
          .select()
          .from(eventForms)
          .where(eq(eventForms.eventId, formSpec.eventId))
          .limit(1);

        if (existingForm[0]) {
          for (const field of formSpec.fields) {
            await tx
              .insert(formFields)
              .values({
                formId: existingForm[0].id,
                fieldKey: field.fieldKey,
                label: field.label,
                fieldType: field.fieldType,
                placeholder: field.placeholder || null,
                required: field.required,
                options: [...field.options],
                sortOrder: field.sortOrder,
              })
              .onConflictDoNothing({
                target: [formFields.formId, formFields.fieldKey],
              });
          }

          // Ensure seeded published events have an immutable published v1 snapshot
          await tx
            .insert(eventFormVersions)
            .values({
              formId: existingForm[0].id,
              eventId: formSpec.eventId,
              version: 1,
              title: existingForm[0].title,
              description: existingForm[0].description || '',
              schemaSnapshot: formSpec.fields.map((f) => ({
                id: f.fieldKey,
                label: f.label,
                type: f.fieldType,
                required: f.required,
                placeholder: f.placeholder || undefined,
                options: f.options.length > 0 ? [...f.options] : undefined,
              })),
            })
            .onConflictDoNothing({
              target: [eventFormVersions.eventId, eventFormVersions.version],
            });
        }
      }

      // 4. Initial Hall of Fame snapshot if none recorded yet
      const existingSnapshots = await tx
        .select({id: hallOfFameSnapshots.id})
        .from(hallOfFameSnapshots)
        .limit(1);

      if (existingSnapshots.length === 0) {
        for (let idx = 0; idx < SEED_CLUBS.length; idx++) {
          await tx.insert(hallOfFameSnapshots).values({
            clubId: SEED_CLUBS[idx].id,
            rank: 1,
            followerCount: 0,
          });
        }
      }

      // 5. Idempotent seed audit log check
      const existingSeedAudit = await tx
        .select({id: auditLogs.id})
        .from(auditLogs)
        .where(eq(auditLogs.action, 'PHASE2_REFERENCE_SEED_APPLIED'))
        .limit(1);

      if (existingSeedAudit.length === 0) {
        await tx.insert(auditLogs).values({
          actorName: 'System Seed',
          actorContext: 'Database Bootstrap',
          action: 'PHASE2_REFERENCE_SEED_APPLIED',
          targetType: 'system',
          targetId: 'campusverse_config',
          targetLabel: 'CampusVerse Reference Catalog',
          metadata: {
            seededClubs: SEED_CLUBS.length,
            seededEvents: SEED_EVENTS.length,
            seededForms: SEED_FORMS.length,
          },
        });
      }
    });

    console.log(
      `Seed completed cleanly (idempotent): ${SEED_CLUBS.length} clubs, ${SEED_EVENTS.length} events, ${SEED_FORMS.length} forms, system_settings.`,
    );
  } finally {
    await client.end({timeout: 5});
  }
}

runSeed().catch((err) => {
  console.error('Database seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
