import type { Level, RoleRelationship } from "@career-ops/contracts";

/**
 * The Product family, as a graph rather than a synonym list.
 *
 * `relationship` is measured from the family anchor (Product Manager), so a
 * Senior PM is a progression, a Product Owner is adjacent, and a Business
 * Analyst is a separate track that we explain rather than merge.
 */
export type RoleNode = {
  id: string;
  title: string;
  level: Level;
  relationship: RoleRelationship;
  aliases: string[];
  /** Phrases that indicate this role in a job description. */
  signals: string[];
  /** What a candidate needs that this role adds over the anchor. */
  gaps: string[];
};

export const ANCHOR = "product-manager";

export const ROLES: RoleNode[] = [
  {
    id: "apm",
    title: "Associate Product Manager",
    level: "entry",
    relationship: "core",
    aliases: ["APM", "Junior Product Manager", "Product Manager I", "PM I"],
    signals: ["0-2 years", "associate product manager", "entry level product"],
    gaps: ["0→1 launch ownership"],
  },
  {
    id: "product-manager",
    title: "Product Manager",
    level: "mid",
    relationship: "core",
    aliases: ["PM", "Product Manager II", "Digital Product Manager"],
    signals: ["product roadmap", "product manager", "product lifecycle"],
    gaps: [],
  },
  {
    id: "senior-product-manager",
    title: "Senior Product Manager",
    level: "senior",
    relationship: "progression",
    aliases: ["SPM", "Senior PM", "Product Manager III", "Lead Product Manager"],
    signals: ["5+ years", "senior product manager", "multiple product lines"],
    gaps: ["5+ yrs PM tenure", "multi-team scope"],
  },
  {
    id: "group-product-manager",
    title: "Group Product Manager",
    level: "leadership",
    relationship: "progression",
    aliases: ["GPM", "Director of Product", "Head of Product", "VP Product"],
    signals: ["group product manager", "manage product managers", "product org"],
    gaps: ["people management", "portfolio strategy"],
  },
  {
    id: "product-owner",
    title: "Product Owner",
    level: "mid",
    relationship: "adjacent",
    aliases: ["PO", "Agile Product Owner", "Scrum Product Owner"],
    signals: ["product owner", "sprint backlog", "user stories", "scrum"],
    gaps: ["Agile / Scrum certification"],
  },
  {
    id: "product-analyst",
    title: "Product Analyst",
    level: "mid",
    relationship: "adjacent",
    aliases: ["Product Data Analyst", "Product Insights Analyst"],
    signals: ["product analyst", "product analytics", "sql", "dashboard"],
    gaps: ["SQL depth", "dashboarding"],
  },
  {
    id: "product-ops",
    title: "Product Operations Manager",
    level: "mid",
    relationship: "adjacent",
    aliases: ["Product Ops", "Product Operations", "Product Program Manager"],
    signals: ["product operations", "product ops", "cross-functional process"],
    gaps: [],
  },
  {
    id: "growth-pm",
    title: "Growth Product Manager",
    level: "mid",
    relationship: "specialisation",
    aliases: ["Growth PM", "Product Growth Manager"],
    signals: ["growth product", "acquisition", "activation", "retention", "conversion"],
    gaps: ["paid acquisition", "lifecycle messaging"],
  },
  {
    id: "ai-pm",
    title: "AI Product Manager",
    level: "mid",
    relationship: "specialisation",
    aliases: ["AI PM", "ML Product Manager", "GenAI Product Manager"],
    signals: ["ai product", "machine learning", "llm", "model evaluation"],
    gaps: ["ML model lifecycle", "eval design"],
  },
  {
    id: "technical-pm",
    title: "Technical Product Manager",
    level: "mid",
    relationship: "specialisation",
    aliases: ["TPM", "Platform Product Manager", "API Product Manager"],
    signals: ["technical product", "platform product", "api", "developer experience"],
    gaps: ["API / platform depth"],
  },
  {
    id: "product-strategy",
    title: "Product Strategy Manager",
    level: "senior",
    relationship: "adjacent",
    aliases: ["Product Strategy", "Strategy Manager"],
    signals: ["product strategy", "market sizing", "competitive strategy"],
    gaps: ["market sizing", "board-level writing"],
  },
  {
    id: "business-analyst",
    title: "Business Analyst",
    level: "mid",
    relationship: "separate",
    aliases: ["BA", "Business Systems Analyst"],
    signals: ["business analyst", "requirements gathering", "stakeholder management"],
    gaps: ["product ownership", "roadmap accountability"],
  },
  {
    id: "project-manager",
    title: "Project Manager",
    level: "mid",
    relationship: "separate",
    aliases: ["PM (delivery)", "Delivery Manager", "Program Manager"],
    signals: ["project manager", "delivery", "timeline", "raid log"],
    gaps: ["product discovery", "outcome ownership"],
  },
];

const byId = new Map(ROLES.map((r) => [r.id, r]));

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Resolve a free-text title to a role node. Longest alias wins. */
export function findRole(title: string): RoleNode | undefined {
  const t = normalise(title);
  if (!t) return undefined;

  let best: { node: RoleNode; len: number } | undefined;
  for (const node of ROLES) {
    const names = [node.title, ...node.aliases].map(normalise);
    for (const n of names) {
      if (t === n || t.includes(n)) {
        if (!best || n.length > best.len) best = { node, len: n.length };
      }
    }
  }
  return best?.node;
}

/**
 * Relationship between a target role and a job's role.
 * Symmetric for adjacency; progression only reads upward.
 */
export function relationshipBetween(
  targetId: string,
  jobId: string,
): RoleRelationship {
  if (targetId === jobId) return "core";
  const target = byId.get(targetId);
  const job = byId.get(jobId);
  if (!target || !job) return "separate";
  if (target.relationship === "separate" || job.relationship === "separate") return "separate";

  const order: Level[] = ["entry", "mid", "senior", "leadership"];
  const ti = order.indexOf(target.level);
  const ji = order.indexOf(job.level);

  // Same specialisation or adjacency is symmetric.
  if (job.relationship === "adjacent" || job.relationship === "specialisation") return job.relationship;
  if (target.relationship === "adjacent" || target.relationship === "specialisation") return target.relationship;

  // Both core/progression: direction decides.
  if (ji > ti) return "progression";
  if (ji < ti) return "core";
  return "core";
}

export type CareerPath = {
  role: RoleNode;
  relationship: RoleRelationship;
  /** 0–1, how much of the role the candidate already evidences. */
  readiness: number;
  gaps: string[];
};

/**
 * The Career Path Explorer: every role reachable from the target, ranked by
 * readiness. Readiness is supplied by the scorer; this function only shapes it.
 */
export function pathsFor(
  targetTitle: string,
  readiness: (role: RoleNode) => number,
): CareerPath[] {
  const target = findRole(targetTitle);
  if (!target) return [];

  return ROLES.filter((r) => r.id !== target.id)
    .map((role) => ({
      role,
      relationship: relationshipBetween(target.id, role.id),
      readiness: Math.max(0, Math.min(1, readiness(role))),
      gaps: role.gaps,
    }))
    .sort((a, b) => {
      const rank: Record<RoleRelationship, number> = {
        core: 0,
        progression: 1,
        adjacent: 2,
        specialisation: 3,
        separate: 4,
      };
      return rank[a.relationship] - rank[b.relationship] || b.readiness - a.readiness;
    });
}

/** Weight a role contributes to a match score, by relationship. */
export const RELATIONSHIP_WEIGHT: Record<RoleRelationship, number> = {
  core: 1,
  progression: 0.85,
  adjacent: 0.7,
  specialisation: 0.75,
  separate: 0.35,
};
