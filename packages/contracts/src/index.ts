import { z } from "zod";

/**
 * The candidate profile is the one structure every engine consumes.
 * Nothing enters it without the user confirming it — `confirmedAt` is the gate.
 */

export const WorkMode = z.enum(["remote", "hybrid", "office"]);
export type WorkMode = z.infer<typeof WorkMode>;

export const Level = z.enum(["entry", "mid", "senior", "leadership"]);
export type Level = z.infer<typeof Level>;

export const ExperienceSchema = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  start: z.string().regex(/^\d{4}(-\d{2})?$/).optional(),
  end: z.union([z.string().regex(/^\d{4}(-\d{2})?$/), z.literal("present")]).optional(),
  location: z.string().optional(),
  bullets: z.array(z.string()).default([]),
});
export type Experience = z.infer<typeof ExperienceSchema>;

export const EducationSchema = z.object({
  institution: z.string().min(1),
  degree: z.string().optional(),
  field: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
});
export type Education = z.infer<typeof EducationSchema>;

export const ProfileSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  location: z.object({
    city: z.string().min(1),
    state: z.string().optional(),
    country: z.literal("IN"),
  }),
  links: z
    .object({
      linkedin: z.string().url().optional(),
      github: z.string().url().optional(),
      portfolio: z.string().url().optional(),
    })
    .default({}),
  headline: z.string().optional(),
  summary: z.string().optional(),
  experience: z.array(ExperienceSchema).default([]),
  education: z.array(EducationSchema).default([]),
  skills: z.array(z.string()).default([]),
  yearsExperience: z.number().min(0).optional(),
  /** Set only after the user has reviewed every field. */
  confirmedAt: z.string().datetime().optional(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const PreferencesSchema = z.object({
  roles: z.array(z.string()).min(1),
  cities: z.array(z.string()).default([]),
  workModes: z.array(WorkMode).default([]),
  levels: z.array(Level).default([]),
  minSalaryLpa: z.number().min(0).optional(),
  excludeCompanies: z.array(z.string()).default([]),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

/**
 * A job always carries where it came from and when we first saw it.
 * `datePosted` is the employer's date, or absent — never invented.
 */
export const JobSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  sourceUrl: z.string().url(),
  applyUrl: z.string().url().optional(),
  company: z.string().min(1),
  title: z.string().min(1),
  location: z.string().default(""),
  country: z.string().default("IN"),
  workMode: WorkMode.optional(),
  description: z.string().default(""),
  datePosted: z.string().datetime().optional(),
  firstSeenAt: z.string().datetime(),
  lastVerifiedAt: z.string().datetime().optional(),
  status: z.enum(["open", "closed", "unknown"]).default("unknown"),
  employmentType: z.string().optional(),
  department: z.string().optional(),
});
export type Job = z.infer<typeof JobSchema>;

export const RoleRelationship = z.enum([
  "core",
  "progression",
  "adjacent",
  "specialisation",
  "separate",
]);
export type RoleRelationship = z.infer<typeof RoleRelationship>;

export const ScoreBreakdownSchema = z.object({
  roleFit: z.number().min(0).max(25),
  skills: z.number().min(0).max(25),
  experience: z.number().min(0).max(15),
  industry: z.number().min(0).max(10),
  location: z.number().min(0).max(10),
  ownership: z.number().min(0).max(10),
  compensation: z.number().min(0).max(5),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const ScoreSchema = z.object({
  total: z.number().min(0).max(100),
  breakdown: ScoreBreakdownSchema,
  hardFilter: z.object({
    passed: z.boolean(),
    reasons: z.array(z.string()),
  }),
  relationship: RoleRelationship,
  missing: z.array(z.string()),
  /** Written by the model after the number is fixed. Never the number itself. */
  explanation: z.string().optional(),
});
export type Score = z.infer<typeof ScoreSchema>;

export const SourcePolicySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  discovery: z.enum(["api", "public-feed", "crawl", "user-session", "none"]),
  submission: z.enum(["agent", "user-directed", "manual", "none"]),
  auth: z.array(z.enum(["google", "linkedin", "password", "otp", "sso"])),
  robotsReviewedAt: z.string(),
  termsReviewedAt: z.string(),
  notes: z.string().default(""),
});
export type SourcePolicy = z.infer<typeof SourcePolicySchema>;

export const ApplicationPlanSchema = z.object({
  jobId: z.string(),
  profileId: z.string(),
  resumeVersionId: z.string(),
  fields: z.array(
    z.object({
      selector: z.string(),
      label: z.string(),
      value: z.string(),
      confidence: z.enum(["exact", "inferred", "missing"]),
      source: z.string(),
    }),
  ),
  uploads: z.array(z.object({ selector: z.string(), path: z.string() })),
  unanswered: z.array(z.string()),
  /** True when a person must press submit; false for an approved auto-apply run. */
  requiresApproval: z.boolean(),
});
export type ApplicationPlan = z.infer<typeof ApplicationPlanSchema>;
