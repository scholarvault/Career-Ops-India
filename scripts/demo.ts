/**
 * End-to-end proof of the loop, with no browser and no AI:
 *
 *   discover (Lever) → score → career paths → application plan
 *
 * Run: pnpm demo
 */

import type { Job, Preferences, Profile } from "@career-ops/contracts";
import { discoverLever, inCity } from "@career-ops/job-discovery";
import { scoreJob } from "@career-ops/career-scoring";
import { pathsFor } from "@career-ops/career-taxonomy";
import { planApplication, canSubmit, type DetectedField } from "@career-ops/application-agent";

/* Example persona only. The demo must never carry a real person's details:
   the real profile lives in data/ at runtime and is gitignored. */
const profile: Profile = {
  id: "demo",
  fullName: "Ananya Iyer",
  email: "ananya.iyer@example.com",
  phone: "9000000000",
  location: { city: "Chennai", state: "Tamil Nadu", country: "IN" },
  links: { linkedin: "https://linkedin.com/in/ananya-iyer" },
  headline:
    "Product manager for B2B platforms: discovery, roadmap and launch",
  summary:
    "Six years turning support and operations problems into product. Owned a B2B platform roadmap end to end, ran customer discovery with enterprise teams, and shipped a self-serve onboarding flow that cut activation time in half.",
  experience: [
    {
      company: "Example SaaS",
      title: "Senior Product Manager",
      start: "2022-01",
      end: "present",
      location: "Chennai",
      bullets: [
        "Owned the platform roadmap end to end and shipped the self-serve onboarding flow.",
        "Ran customer discovery with enterprise buyers and synthesised the findings into requirements.",
        "Built and maintained the release process other teams depended on.",
        "Defined success metrics and tracked activation after launch.",
      ],
    },
    {
      company: "Previous employer",
      title: "Product Manager",
      start: "2019-01",
      end: "2021-12",
      location: "Chennai",
      bullets: [
        "Wrote requirements and user stories for a four-engineer squad.",
        "Handled escalations and edge cases for a live support operation.",
      ],
    },
  ],
  education: [
    { institution: "Anna University", degree: "B.E.", field: "Computer Science" },
  ],
  skills: [
    "product strategy", "roadmap", "user research", "analytics", "sql", "figma",
    "agile", "stakeholder management", "go-to-market", "growth", "retention",
    "api", "saas", "b2b", "machine learning", "llm", "genai", "product ops",
    "market research", "competitive analysis", "unit economics",
  ],
  yearsExperience: 6,
  confirmedAt: new Date().toISOString(),
};

const preferences: Preferences = {
  roles: ["Product Manager"],
  cities: ["Chennai"],
  workModes: ["hybrid", "office", "remote"],
  levels: ["mid", "senior"],
  excludeCompanies: [],
};

const responsibilities = [
  "Owned a product or service roadmap end to end.",
  "Ran customer discovery interviews and synthesised the findings.",
  "Wrote requirements, specs or user stories for an engineering team.",
  "Defined success metrics and tracked them after launch.",
  "Built and maintained a process that other teams depended on.",
];

function line(label: string, value: string | number) {
  console.log(`  ${label.padEnd(22)} ${value}`);
}

function bar(n: number, max: number, width = 22): string {
  const filled = Math.round((n / max) * width);
  return "█".repeat(filled) + "·".repeat(width - filled);
}

async function main() {
  console.log("\nCAREER-OPS INDIA — end-to-end demo\n");

  /* 1. Discover */
  const all = await discoverLever({ company: "valgenesis" });
  const chennai = inCity(all, "Chennai");
  console.log(`1. DISCOVERY`);
  line("Lever postings", all.length);
  line("In Chennai / remote", chennai.length);

  const target: Job | undefined =
    chennai.find((j) => j.title.includes("Platform Product Manager")) ?? chennai[0];

  if (!target) {
    console.log("  No Chennai posting found. Stopping.");
    return;
  }

  line("Selected", target.title);
  line("Company", target.company);
  line("Location", target.location);
  line("Posted", target.datePosted ? target.datePosted.slice(0, 10) : "not disclosed");
  line("First seen", target.firstSeenAt.slice(0, 10));
  line("Description", `${target.description.length} chars`);

  /* 2. Score */
  const score = scoreJob({ profile, preferences, job: target, responsibilities });
  console.log(`\n2. SCORE — ${score.total}/100  (${score.relationship})`);
  const b = score.breakdown;
  line("Role fit", `${bar(b.roleFit, 25)} ${b.roleFit}/25`);
  line("Skills", `${bar(b.skills, 25)} ${b.skills}/25`);
  line("Experience", `${bar(b.experience, 15)} ${b.experience}/15`);
  line("Industry", `${bar(b.industry, 10)} ${b.industry}/10`);
  line("Location", `${bar(b.location, 10)} ${b.location}/10`);
  line("Ownership", `${bar(b.ownership, 10)} ${b.ownership}/10`);
  line("Compensation", `${bar(b.compensation, 5)} ${b.compensation}/5`);
  line("Hard filter", score.hardFilter.passed ? "passed" : score.hardFilter.reasons.join("; "));
  if (score.missing.length) line("Missing", score.missing.slice(0, 5).join(", "));

  /* 3. Career paths */
  console.log(`\n3. CAREER PATHS from "${preferences.roles[0]}"`);
  const cvText = `${profile.headline} ${profile.skills.join(" ")} ${profile.experience
    .flatMap((e) => [e.title, ...e.bullets])
    .join(" ")}`.toLowerCase();

  const paths = pathsFor(preferences.roles[0] ?? "", (role) => {
    // Readiness = how much of what this role adds over the anchor the CV already shows.
    if (role.gaps.length === 0) return 1;
    const STOP = new Set(["management", "ownership", "depth", "design", "level", "years", "tenure", "scope"]);
    const covered = role.gaps.filter((gap) => {
      const words = gap.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w));
      if (words.length === 0) return false;
      const hits = words.filter((w) => cvText.includes(w)).length;
      return hits / words.length >= 0.5;
    }).length;
    return 0.4 + 0.6 * (covered / role.gaps.length);
  });
  for (const p of paths.slice(0, 8)) {
    const pct = Math.round(p.readiness * 100);
    console.log(
      `  ${p.role.title.padEnd(30)} ${p.relationship.padEnd(15)} ${String(pct).padStart(3)}%  ${p.gaps[0] ?? ""}`,
    );
  }

  /* 4. Application plan */
  const detected: DetectedField[] = [
    { selector: "#name", label: "Full name", type: "text", required: true },
    { selector: "#email", label: "Email", type: "email", required: true },
    { selector: "#phone", label: "Phone", type: "tel", required: true },
    { selector: "#linkedin", label: "LinkedIn URL", type: "url", required: false },
    { selector: "#resume", label: "Resume/CV", type: "file", required: true },
    { selector: "#current-company", label: "Current company", type: "text", required: false },
    { selector: "#salary", label: "Expected CTC", type: "text", required: true },
    { selector: "#why", label: "Why do you want this role?", type: "textarea", required: true },
  ];

  const plan = planApplication({
    job: target,
    profile,
    resumeVersionId: "cv-v3",
    resumePath: "data/resumes/example-cv.pdf",
    fields: detected,
  });

  console.log(`\n4. APPLICATION PLAN`);
  line("Fields filled", plan.fields.length);
  line("Uploads", plan.uploads.length);
  line("Unanswered", plan.unanswered.length ? plan.unanswered.join(", ") : "none");
  for (const f of plan.fields) {
    console.log(`  ${f.confidence.padEnd(9)} ${f.label.padEnd(20)} ← ${f.source}`);
  }

  const gate = canSubmit(plan, profile);
  console.log(`\n5. SUBMISSION GATE`);
  line("Can submit", gate.ok ? "yes" : `no — ${gate.reason}`);
  line("Requires approval", "yes");

  console.log("\nDone. No network write, no browser, no submission.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
