/**
 * Situational Resume Awareness Engine.
 *
 * Instead of blindly firing AI rewriting on every job (which wastes tokens on
 * mismatches and can water down strong native domain positioning), chooses
 * deterministically between:
 *  - "original"       -> Keep the Master Resume untouched (strong direct match or thin JD)
 *  - "tailored"       -> Tailor cleanly without inventing facts to bridge wording/ATS gaps
 *  - "skip_or_manual" -> Seniority delta or specialized hard-domain barrier too large for auto-apply
 */

import { parseRequiredYears } from "@career-ops/career-scoring";

export type ResumeStrategy = "original" | "tailored" | "skip_or_manual";

export interface SituationalInput {
  title: string;
  company: string;
  jd: string;
  score: number;
  candidateYears?: number;
  candidateText?: string;
  miss?: string[];
  have?: string[];
}

export interface SituationalDecision {
  strategy: ResumeStrategy;
  confidence: "high" | "medium";
  reasons: string[];
  requiredYears?: number;
  domainSignals: string[];
}

const HARD_NICHE_GATES: Array<{ label: string; jobRx: RegExp; resumeMustMatch: RegExp }> = [
  { label: "Pharma/GxP/MSAT regulated validation", jobRx: /\b(msat|gxp|21 cfr|gamp\s*5|pharmaceutical manufacturing|apqr)\b/i, resumeMustMatch: /\b(pharma|gxp|21 cfr|gamp|msat|biotech)\b/i },
  { label: "Maritime / Ocean Freight Operations", jobRx: /\b(ocean freight|shipping lines|maritime logistics|bill of lading)\b/i, resumeMustMatch: /\b(maritime|freight|ocean|shipping)\b/i },
  { label: "Workday HCM Enterprise Configuration", jobRx: /\b(workday hcm|workday configuration)\b/i, resumeMustMatch: /\b(workday)\b/i },
  { label: "Embedded WiFi / RF / IoT Hardware PKI", jobRx: /\b(802\.11|wifi\s*6|wifi\s*7|mTLS|x\.509|rf performance|firmware)\b/i, resumeMustMatch: /\b(firmware|802\.11|rf|mtls|x\.509|embedded)\b/i },
];

/** Evaluates whether to submit original CV, tailor with AI, or skip/review manually. */
export function chooseResumeStrategy(input: SituationalInput): SituationalDecision {
  const title = (input.title || "").trim();
  const jd = (input.jd || "").trim();
  const cvLower = (input.candidateText || "").toLowerCase();
  const candYears = input.candidateYears ?? 0;
  const reqYears = parseRequiredYears(`${title}\n${jd}`);
  const reasons: string[] = [];
  const domainSignals: string[] = [];

  if (/\b(intern|internship|trainee|fresher)\b/i.test(title) && candYears >= 2) {
    reasons.push(`Internship/fresher title ("${title}") for a ${candYears}-year candidate.`);
    return { strategy: "skip_or_manual", confidence: "high", reasons, requiredYears: reqYears, domainSignals };
  }

  if (reqYears !== undefined && candYears > 0 && reqYears - candYears >= 4) {
    reasons.push(`Role asks ${reqYears}+ yrs vs ${candYears} yrs on resume (+${reqYears - candYears} yr gap).`);
    return { strategy: "skip_or_manual", confidence: "high", reasons, requiredYears: reqYears, domainSignals };
  }

  for (const gate of HARD_NICHE_GATES) {
    if (gate.jobRx.test(`${title}\n${jd}`) && (!cvLower || !gate.resumeMustMatch.test(cvLower))) {
      domainSignals.push(gate.label);
    }
  }
  if (domainSignals.length > 0 && input.score < 68) {
    reasons.push(`Specialized non-transferable gate (${domainSignals.join("; ")}) with score ${input.score}.`);
    return { strategy: "skip_or_manual", confidence: "high", reasons, requiredYears: reqYears, domainSignals };
  }

  if (input.score < 48) {
    reasons.push(`Overall match score (${input.score}/100) is below the auto-tailor floor (48).`);
    return { strategy: "skip_or_manual", confidence: "high", reasons, requiredYears: reqYears, domainSignals };
  }

  /* Thin JDs (< 140 chars) give AI almost nothing grounded to tailor against;
     rewriting here risks fluff or generic dilution. Keep original PDF. */
  if (jd.replace(/\s+/g, " ").trim().length < 140) {
    reasons.push("JD snippet is thin (<140 chars) — original Master Resume preserves strongest authentic positioning.");
    return { strategy: "original", confidence: "high", reasons, requiredYears: reqYears, domainSignals };
  }

  /* If score is already strong and matched keywords outnumber gaps without deep niche blockers, original PDF is ready. */
  const haveCount = input.have?.length ?? 0;
  const missCount = input.miss?.length ?? 0;
  /* No have/miss passed means the gaps are unknown, not zero. Treating them
     as zero sent every job from MCP tailor_batch out with the original CV. */
  const gapsKnown = input.have !== undefined || input.miss !== undefined;
  if (input.score >= 74 && domainSignals.length === 0 && gapsKnown && (missCount === 0 || haveCount >= missCount * 2)) {
    reasons.push(`Direct native fit (score ${input.score}, ${haveCount} matched skills, ${missCount} gaps) — keep original Master Resume un-diluted.`);
    return { strategy: "original", confidence: "medium", reasons, requiredYears: reqYears, domainSignals };
  }

  reasons.push(`Strong transferable fit (score ${input.score}) with ATS/vocabulary gaps (${missCount} flagged) — tailor summary & reorder bullets without inventing facts.`);
  return { strategy: "tailored", confidence: "high", reasons, requiredYears: reqYears, domainSignals };
}
