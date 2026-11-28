import type { ApplicationPlan, Job, Profile } from "@career-ops/contracts";

/**
 * The agent builds a plan; it never submits.
 *
 * A plan is a list of (selector, value) pairs plus the files to upload and the
 * questions it could not answer. The user reviews it, and submission is a
 * separate step gated by an approval token.
 */

export type DetectedField = {
  selector: string;
  label: string;
  name?: string;
  type: "text" | "email" | "tel" | "url" | "textarea" | "select" | "file" | "checkbox" | "radio";
  required: boolean;
  options?: string[];
};

export type PlanInput = {
  job: Job;
  profile: Profile;
  resumeVersionId: string;
  resumePath: string;
  fields: DetectedField[];
  /** Set by an auto-apply run the user already approved. Defaults to false. */
  autoSubmit?: boolean;
};

type Answer = { value: string; confidence: "exact" | "inferred"; source: string };

const current = (p: Profile) => p.experience[0];

function answerFor(field: DetectedField, p: Profile): Answer | undefined {
  const l = `${field.label} ${field.name ?? ""}`.toLowerCase();

  if (field.type === "email" || /\be-?mail\b/.test(l)) {
    return p.email ? { value: p.email, confidence: "exact", source: "profile.email" } : undefined;
  }
  if (field.type === "tel" || /\b(phone|mobile|contact number)\b/.test(l)) {
    return p.phone ? { value: p.phone, confidence: "exact", source: "profile.phone" } : undefined;
  }
  if (/\b(full name|your name|name)\b/.test(l) && !/company|file/.test(l)) {
    return p.fullName ? { value: p.fullName, confidence: "exact", source: "profile.fullName" } : undefined;
  }
  if (/\blinkedin\b/.test(l)) {
    return p.links.linkedin
      ? { value: p.links.linkedin, confidence: "exact", source: "profile.links.linkedin" }
      : undefined;
  }
  if (/\bgithub\b/.test(l)) {
    return p.links.github
      ? { value: p.links.github, confidence: "exact", source: "profile.links.github" }
      : undefined;
  }
  if (/\b(portfolio|website|personal site)\b/.test(l)) {
    return p.links.portfolio
      ? { value: p.links.portfolio, confidence: "exact", source: "profile.links.portfolio" }
      : undefined;
  }
  if (field.type !== "radio" && /\b(city|current location|location|where are you based)\b/.test(l) && !/\b(onsite|willing|able to|relocat|commute|preferred location|dropdown|filter)\b/.test(l)) {
    return p.location.city
      ? { value: p.location.city, confidence: "exact", source: "profile.location.city" }
      : undefined;
  }
  if (/\b(current|present) (company|employer)\b/.test(l)) {
    const c = current(p);
    return c ? { value: c.company, confidence: "inferred", source: "profile.experience[0].company" } : undefined;
  }
  if (/\b(current|present) (title|role|designation)\b/.test(l)) {
    const c = current(p);
    return c ? { value: c.title, confidence: "inferred", source: "profile.experience[0].title" } : undefined;
  }
  if (/\b(years|total experience|experience)\b/.test(l) && p.yearsExperience !== undefined) {
    return { value: String(p.yearsExperience), confidence: "inferred", source: "profile.yearsExperience" };
  }
  if (/\b(salary|compensation|ctc|expected)\b/.test(l)) {
    // Never guessed. The user answers this one.
    return undefined;
  }
  return undefined;
}

export function planApplication(input: PlanInput): ApplicationPlan {
  const { job, profile, resumeVersionId, resumePath, fields } = input;

  const planned: ApplicationPlan["fields"] = [];
  const unanswered: string[] = [];
  const uploads: ApplicationPlan["uploads"] = [];

  for (const field of fields) {
    if (field.type === "file") {
      if (/resume|cv/i.test(`${field.label} ${field.name ?? ""}`)) {
        uploads.push({ selector: field.selector, path: resumePath });
      } else {
        unanswered.push(field.label);
      }
      continue;
    }

    const answer = answerFor(field, profile);
    if (answer) {
      planned.push({
        selector: field.selector,
        label: field.label,
        value: answer.value,
        confidence: answer.confidence,
        source: answer.source,
      });
    } else if (field.required) {
      unanswered.push(field.label);
    }
  }

  return {
    jobId: job.id,
    profileId: profile.id,
    resumeVersionId,
    fields: planned,
    uploads,
    unanswered,
    requiresApproval: !input.autoSubmit,
  };
}

/** A plan is only submittable when the profile is confirmed and nothing is unanswered. */
export function canSubmit(plan: ApplicationPlan, profile: Profile): { ok: boolean; reason?: string } {
  if (!profile.confirmedAt) return { ok: false, reason: "Profile is not confirmed." };
  if (plan.unanswered.length > 0) {
    return { ok: false, reason: `Unanswered required fields: ${plan.unanswered.join(", ")}` };
  }
  if (plan.uploads.length === 0) return { ok: false, reason: "No resume attached." };
  return { ok: true };
}
