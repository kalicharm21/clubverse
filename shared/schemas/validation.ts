import {z} from 'zod';
import {
  CLUB_CATEGORIES,
  CLUB_ROLES,
  CORE_MEMBER_PERMISSIONS,
  EVENT_CATEGORIES,
  FORM_FIELD_TYPES,
  normalizePermissionInput,
  type CoreMemberPermission,
} from '../constants/permissions.ts';

const permissionArraySchema = z
  .array(z.string())
  .transform((vals, ctx): CoreMemberPermission[] => {
    const out = new Set<CoreMemberPermission>();
    for (const val of vals) {
      const normalized = normalizePermissionInput(val);
      if (!normalized) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unsupported permission: ${val}`,
        });
        return z.NEVER;
      }
      out.add(normalized);
    }
    return [...out];
  });

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
    department: z.string().trim().min(2, 'Department is required').max(80),
    yearOfStudy: z.string().trim().min(1, 'Year of study is required').max(30),
  })
  .strict();

export const patchProfileSchema = updateProfileSchema
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one profile field (name, department, yearOfStudy) must be provided',
  });

export const loginDemoSchema = z.object({
  personaId: z.string().trim().min(1).optional(),
  email: z.string().trim().email('Enter a valid institutional email').optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

export const registerDemoSchema = z.object({
  name: z.string().trim().min(2, 'Full name is required').max(80),
  email: z
    .string()
    .trim()
    .email('Enter a valid institutional email')
    .refine((v) => v.includes('@'), 'Must be an institutional email'),
  department: z.string().trim().min(2, 'Department is required'),
  yearOfStudy: z.string().trim().min(1, 'Year of study is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const instagramUrlInputSchema = z
  .string()
  .trim()
  .max(200)
  .transform((val, ctx): string => {
    if (!val) return '';
    let candidate = val;
    if (candidate.startsWith('@')) {
      candidate = `https://www.instagram.com/${candidate.slice(1)}/`;
    } else if (!/^https?:\/\//i.test(candidate)) {
      if (/^(www\.)?instagram\.com\//i.test(candidate)) {
        candidate = `https://${candidate}`;
      } else if (/^[a-zA-Z0-9._]{1,30}$/.test(candidate)) {
        candidate = `https://www.instagram.com/${candidate}/`;
      } else {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Enter a valid Instagram profile URL (https://www.instagram.com/handle/) or @handle',
        });
        return z.NEVER;
      }
    }
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Instagram URL must use http or https protocol',
        });
        return z.NEVER;
      }
      const host = parsed.hostname.toLowerCase();
      if (host !== 'instagram.com' && host !== 'www.instagram.com') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Only official instagram.com profile URLs are allowed',
        });
        return z.NEVER;
      }
      const cleanPath = parsed.pathname.replace(/^\/+|\/+$/g, '');
      const segments = cleanPath.split('/').filter(Boolean);
      if (segments.length !== 1 || !/^[a-zA-Z0-9._]{1,30}$/.test(segments[0])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Instagram URL must point to a valid club handle (e.g. https://www.instagram.com/clubhandle/)',
        });
        return z.NEVER;
      }
      return `https://www.instagram.com/${segments[0]}/`;
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid Instagram profile URL format',
      });
      return z.NEVER;
    }
  });

const safeOptionalHttpUrlSchema = z
  .string()
  .trim()
  .max(500)
  .transform((val, ctx): string => {
    if (!val) return '';
    if (!/^https?:\/\//i.test(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'URL must start with https:// or http://',
      });
      return z.NEVER;
    }
    try {
      const parsed = new URL(val);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Only http:// and https:// URLs are permitted',
        });
        return z.NEVER;
      }
      return parsed.toString();
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a valid URL',
      });
      return z.NEVER;
    }
  });

export const createClubSchema = z.object({
  name: z.string().trim().min(3, 'Club name must be at least 3 characters').max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain lowercase letters, numbers, and hyphens only')
    .min(3)
    .max(80)
    .optional(),
  category: z.enum(CLUB_CATEGORIES),
  tagline: z.string().trim().min(8, 'Tagline must be at least 8 characters').max(140),
  description: z.string().trim().min(20, 'Description must be at least 20 characters').max(1500),
  meetingSchedule: z.string().trim().min(4).max(120),
  contactEmail: z.string().trim().email('Valid contact email is required'),
  instagramUrl: instagramUrlInputSchema.optional(),
  foundedYear: z.coerce.number().int().min(1950).max(2100).optional(),
  status: z.enum(['active', 'inactive', 'pending_review']).optional(),
});

export const updateClubSchema = z
  .object({
    name: z.string().trim().min(3, 'Club name must be at least 3 characters').max(80),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain lowercase letters, numbers, and hyphens only')
      .min(3)
      .max(80),
    category: z.enum(CLUB_CATEGORIES),
    tagline: z.string().trim().min(8, 'Tagline must be at least 8 characters').max(140),
    description: z.string().trim().min(20, 'Description must be at least 20 characters').max(1500),
    meetingSchedule: z.string().trim().min(4).max(120),
    contactEmail: z.string().trim().email('Valid contact email is required'),
    instagramUrl: instagramUrlInputSchema.optional(),
    logoUrl: z.string().trim().max(500).optional(),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one club field must be provided for update',
  });

export const updateClubStatusSchema = z.object({
  status: z.enum(['active', 'inactive', 'suspended', 'pending_review']),
  reason: z.string().trim().max(300).optional(),
});

export const upsertClubMemberSchema = z
  .object({
    email: z.string().trim().email('Valid institutional email is required').optional(),
    userId: z.string().trim().uuid('Valid user ID is required').optional(),
    role: z.enum(CLUB_ROLES),
    title: z.string().trim().min(2, 'Role title is required').max(60),
    permissions: permissionArraySchema.default([]),
  })
  .refine((data) => Boolean(data.email || data.userId), {
    message: 'Either email or userId must be provided',
  });

export const updateMemberPermissionsSchema = z
  .object({
    role: z.enum(CLUB_ROLES).optional(),
    title: z.string().trim().min(2).max(60).optional(),
    permissions: permissionArraySchema.optional(),
  })
  .refine(
    (data) => data.role !== undefined || data.title !== undefined || data.permissions !== undefined,
    {message: 'At least one membership field must be updated'},
  );

export const createInvitationSchema = z.object({
  email: z.string().trim().email('Enter a valid institutional email address'),
  role: z.enum(CLUB_ROLES).default('core_member'),
  title: z.string().trim().min(2, 'Role title is required').max(60).optional(),
  permissions: permissionArraySchema.default([]),
  replaceExisting: z.boolean().default(false),
});

export const assignLeadershipSchema = z.object({
  email: z.string().trim().email('Enter a valid institutional email address'),
  role: z.enum(['president', 'vice_president']),
  title: z.string().trim().min(2).max(60).optional(),
  replaceExisting: z.boolean().default(false),
  sendInvitation: z.boolean().default(true),
});

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(16, 'Invalid invitation token').max(256),
  name: z.string().trim().min(2).max(80).optional(),
  department: z.string().trim().min(2).max(80).optional(),
  yearOfStudy: z.string().trim().min(1).max(30).optional(),
});

export const eventEligibilityRulesSchema = z
  .object({
    allowedDomains: z.array(z.string().trim().toLowerCase().min(2)).max(10).optional(),
    allowedDepartments: z.array(z.string().trim().min(2)).max(20).optional(),
    allowedYears: z.array(z.string().trim().min(1)).max(10).optional(),
    notes: z.string().trim().max(300).optional(),
  })
  .optional();

export const createEventSchema = z.object({
  title: z.string().trim().min(4, 'Event title must be at least 4 characters').max(120),
  category: z.enum(EVENT_CATEGORIES),
  description: z.string().trim().min(20, 'Description must be at least 20 characters').max(2000),
  venue: z.string().trim().min(3, 'Venue is required').max(120),
  startTime: z.string().trim().min(4, 'Start date/time is required'),
  endTime: z.string().trim().min(4, 'End date/time is required'),
  registrationOpensAt: z.string().trim().optional().nullable(),
  registrationDeadline: z.string().trim().min(4, 'Registration deadline is required'),
  capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1').max(5000),
  isPaid: z.boolean().default(false),
  feeAmount: z.coerce.number().min(0).max(50000).default(0),
  eligibilityRules: eventEligibilityRulesSchema,
});

export const updateEventSchema = createEventSchema.partial();

export const formFieldValidationRulesSchema = z
  .object({
    minLength: z.coerce.number().int().min(0).max(5000).optional(),
    maxLength: z.coerce.number().int().min(1).max(5000).optional(),
    min: z.coerce.number().optional(),
    max: z.coerce.number().optional(),
    pattern: z
      .string()
      .max(200)
      .refine((pattern) => {
        if (!pattern) return true;
        try {
          new RegExp(pattern);
          return true;
        } catch {
          return false;
        }
      }, 'Validation regex pattern is invalid')
      .optional(),
    patternMessage: z.string().max(160).optional(),
  })
  .optional();

export const formFieldSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(2, 'Field label is required').max(100),
  description: z.string().trim().max(240).optional(),
  type: z.enum(FORM_FIELD_TYPES),
  required: z.boolean(),
  placeholder: z.string().max(120).optional(),
  options: z.array(z.string().trim().min(1)).optional(),
  validationRules: formFieldValidationRulesSchema,
});

export const updateRegistrationFormSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  fields: z.array(formFieldSchema).min(1, 'At least one form field is required').max(30),
});

export const submitRegistrationSchema = z.object({
  answers: z.record(
    z.string(),
    z.union([z.string(), z.boolean(), z.number(), z.array(z.string())]),
  ),
});

export const scanAttendanceSchema = z
  .object({
    qrToken: z.string().trim().min(4).max(160).optional(),
    registrationId: z.string().trim().min(2).optional(),
    method: z.enum(['qr_scan', 'manual_override']).default('qr_scan'),
    reason: z.string().trim().max(300).optional(),
  })
  .refine((data) => Boolean(data.qrToken || data.registrationId), {
    message: 'Either qrToken or registrationId must be provided',
  })
  .refine(
    (data) => data.method !== 'manual_override' || (data.reason && data.reason.trim().length >= 5),
    {
      message: 'Manual attendance override requires a reason of at least 5 characters',
      path: ['reason'],
    },
  );

export const manualAttendanceSchema = z.object({
  registrationId: z.string().trim().min(2, 'Valid registrationId is required'),
  reason: z.string().trim().min(5, 'A reason of at least 5 characters is required').max(300),
});

export const releaseTicketsSchema = z.object({
  confirmParticipantCount: z.coerce.number().int().min(0).optional(),
  note: z.string().trim().max(300).optional(),
});

export const revokeTicketSchema = z.object({
  reason: z.string().trim().min(3, 'Revocation reason is required').max(300).optional(),
});

export const submitEventReportSchema = z.object({
  outcomeSummary: z.string().trim().min(20, 'Outcome summary must be at least 20 characters').max(2000),
  objectives: z.string().trim().max(1500).optional().default(''),
  actualEventDate: z.string().trim().max(60).optional(),
  participationSummary: z.string().trim().max(1500).optional().default(''),
  outcomes: z.string().trim().max(1500).optional().default(''),
  highlights: z.string().trim().min(10, 'Highlights must be at least 10 characters').max(1500),
  challenges: z.string().trim().max(1500).default('None reported'),
  feedbackObservations: z.string().trim().max(1500).optional().default(''),
  evidenceUrl: safeOptionalHttpUrlSchema.optional().default(''),
  actualAttendance: z.coerce.number().int().min(0).max(10000),
  completionStatus: z.enum(['completed', 'partial']).default('completed'),
  status: z.enum(['draft', 'submitted']).default('submitted'),
});

export const reviewEventReportSchema = z.object({
  status: z.enum(['under_review', 'changes_requested', 'approved', 'rejected']),
  reviewNotes: z.string().trim().max(1000).default(''),
});

export const financialLineItemSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(['collection', 'expense']),
  label: z.string().trim().min(2, 'Item label is required').max(120),
  category: z.string().trim().min(2, 'Category is required').max(60),
  amount: z.coerce.number().min(0, 'Amount cannot be negative').max(1000000),
  notes: z.string().trim().max(240).optional(),
});

export const submitFinancialReportSchema = z.object({
  lineItems: z.array(financialLineItemSchema).min(1, 'At least one financial line item is required'),
  notes: z.string().trim().max(1000).default(''),
});

export const createFinanceEntrySchema = z
  .object({
    clubId: z.string().trim().min(1).optional(),
    eventId: z.string().trim().min(1).nullable().optional(),
    entryType: z.enum(['income', 'expense']),
    sourceOrCategory: z.string().trim().min(2, 'Source or category is required').max(80),
    description: z.string().trim().min(3, 'Description must be at least 3 characters').max(300),
    amountMinorUnits: z.coerce.number().int().min(0).max(1000000000).optional(),
    amount: z.coerce.number().min(0, 'Amount cannot be negative').max(10000000).optional(),
    transactionDate: z.string().trim().min(4, 'Transaction date is required'),
    vendorOrRecipient: z.string().trim().max(140).optional().default(''),
    receiptUrl: safeOptionalHttpUrlSchema.optional().default(''),
    notes: z.string().trim().max(500).optional().default(''),
  })
  .refine(
    (data) => data.amountMinorUnits !== undefined || data.amount !== undefined,
    {message: 'Either amount or amountMinorUnits must be provided'},
  );

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
  reason: z.string().trim().max(300).optional(),
});

export const updateSystemSettingsSchema = z.object({
  requireClubApproval: z.boolean().optional(),
  allowStudentEventFeedback: z.boolean().optional(),
});

export {CORE_MEMBER_PERMISSIONS};
