/* Career-Ops India - shared prototype data.
   One source for the role families, the occupation index and the sample
   postings, so onboarding, the career map and the workspace cannot disagree
   about which role you picked. Load before the page script. */
(function () {
  "use strict";

/* ---------- role families ---------- */

const FAMILIES = {
  product: {
    label: "Product",
    roles: ["Product Manager", "Associate Product Manager", "Senior Product Manager", "Product Owner", "Product Analyst", "Product Operations Manager", "Growth Product Manager"],
    responsibilities: [
      "Owned a product or service roadmap end to end.",
      "Ran customer discovery interviews and synthesised the findings.",
      "Wrote requirements, specs or user stories for an engineering team.",
      "Prioritised a backlog and made trade-off decisions.",
      "Defined success metrics and tracked them after launch.",
      "Analysed funnel, retention or usage data to decide what to build next.",
      "Coordinated engineering, design and marketing to ship a release.",
      "Ran experiments or A/B tests and acted on the result.",
      "Managed a budget, P&L or unit economics for a product line.",
      "Built and maintained a process that other teams depended on.",
      "Presented product decisions to leadership or investors.",
      "Onboarded or trained a team on a new tool or workflow.",
      "Handled escalations and edge cases for a live product.",
      "Researched competitors and wrote a positioning or pricing recommendation.",
      "Worked with vendors or partners to integrate a third-party service."
    ],
    paths: [
      { role: "Associate Product Manager", rel: "Direct", cls: "direct", score: 78, exp: "0–2 yrs", miss: "0→1 launch ownership", jobs: 34 },
      { role: "Product Manager", rel: "Direct", cls: "direct", score: 86, exp: "3–6 yrs", miss: "—", jobs: 61 },
      { role: "Senior Product Manager", rel: "Progression", cls: "prog", score: 61, exp: "6–9 yrs", miss: "5+ yrs PM tenure, multi-team scope", jobs: 22 },
      { role: "Product Owner", rel: "Adjacent", cls: "adj", score: 74, exp: "3–6 yrs", miss: "Agile / Scrum certification", jobs: 48 },
      { role: "Product Analyst", rel: "Adjacent", cls: "adj", score: 71, exp: "2–5 yrs", miss: "SQL depth, dashboarding", jobs: 19 },
      { role: "Product Operations Manager", rel: "Adjacent", cls: "adj", score: 80, exp: "3–6 yrs", miss: "—", jobs: 11 },
      { role: "Growth Product Manager", rel: "Specialisation", cls: "spec", score: 66, exp: "3–6 yrs", miss: "paid acquisition, lifecycle messaging", jobs: 14 },
      { role: "AI Product Manager", rel: "Specialisation", cls: "spec", score: 58, exp: "3–7 yrs", miss: "ML model lifecycle, eval design", jobs: 9 },
      { role: "Technical Product Manager", rel: "Specialisation", cls: "spec", score: 55, exp: "4–8 yrs", miss: "API / platform depth", jobs: 17 },
      { role: "Product Strategy Manager", rel: "Adjacent", cls: "adj", score: 63, exp: "5–9 yrs", miss: "market sizing, board-level writing", jobs: 6 }
    ]
  },

  business: {
    label: "Business",
    roles: ["Business Analyst", "IT Business Analyst", "Business Systems Analyst", "Functional Business Analyst", "Technical Business Analyst", "Business Process Analyst", "Senior Business Analyst", "Functional Consultant"],
    responsibilities: [
      "Gathered requirements from business stakeholders and wrote them up.",
      "Mapped an as-is process and designed the to-be version.",
      "Wrote functional specifications or user stories for a build team.",
      "Ran workshops with stakeholders to agree scope.",
      "Analysed data to size a problem or validate a business case.",
      "Documented a process that other teams followed.",
      "Tested a delivered change against the requirement.",
      "Coordinated between business users and a technical team.",
      "Identified a gap and proposed a fix with a cost estimate.",
      "Managed a change request through approval.",
      "Built a report or dashboard for a business team.",
      "Handled a stakeholder disagreement and reached a decision.",
      "Wrote a business case or a cost-benefit analysis.",
      "Supported a system migration or rollout.",
      "Trained end users on a new process or tool."
    ],
    paths: [
      { role: "Business Analyst", rel: "Direct", cls: "direct", score: 85, exp: "2–5 yrs", miss: "—", jobs: 57 },
      { role: "IT Business Analyst", rel: "Specialisation", cls: "spec", score: 80, exp: "2–5 yrs", miss: "systems integration", jobs: 31 },
      { role: "Business Process Analyst", rel: "Adjacent", cls: "adj", score: 78, exp: "2–5 yrs", miss: "process mining tools", jobs: 18 },
      { role: "Business Systems Analyst", rel: "Adjacent", cls: "adj", score: 76, exp: "2–5 yrs", miss: "ERP configuration", jobs: 22 },
      { role: "Product Analyst", rel: "Adjacent", cls: "adj", score: 72, exp: "2–4 yrs", miss: "product metrics", jobs: 19 },
      { role: "Product Owner", rel: "Adjacent", cls: "adj", score: 71, exp: "3–6 yrs", miss: "Agile / Scrum certification", jobs: 48 },
      { role: "Functional Consultant", rel: "Adjacent", cls: "adj", score: 70, exp: "3–6 yrs", miss: "client delivery", jobs: 26 },
      { role: "Data Analyst", rel: "Adjacent", cls: "adj", score: 68, exp: "1–3 yrs", miss: "SQL depth", jobs: 52 },
      { role: "Business Intelligence Analyst", rel: "Related", cls: "adj", score: 66, exp: "2–4 yrs", miss: "warehouse modelling", jobs: 27 },
      { role: "Senior Business Analyst", rel: "Progression", cls: "prog", score: 62, exp: "5–8 yrs", miss: "5+ yrs BA tenure, team lead", jobs: 14 }
    ]
  },

  data: {
    label: "Data",
    roles: ["Data Analyst", "Data Scientist", "Business Intelligence Analyst", "Analytics Engineer", "ML Engineer"],
    responsibilities: [
      "Wrote SQL against a production database to answer a business question.",
      "Built a dashboard that a team used to make decisions.",
      "Cleaned and joined messy data from multiple sources.",
      "Defined a metric and owned its definition across teams.",
      "Ran a statistical test or experiment and interpreted the result.",
      "Presented findings to a non-technical audience.",
      "Built a model and evaluated it against a baseline.",
      "Automated a recurring report or pipeline.",
      "Investigated a data quality issue and traced it to the source.",
      "Documented a data model or schema for others to use.",
      "Owned a data contract with an upstream team.",
      "Mentored an analyst or reviewed their work.",
      "Set up monitoring or alerting for a pipeline.",
      "Translated a vague question into a measurable analysis.",
      "Worked with product or business to define a cohort."
    ],
    paths: [
      { role: "Data Analyst", rel: "Direct", cls: "direct", score: 84, exp: "1–3 yrs", miss: "—", jobs: 52 },
      { role: "Business Intelligence Analyst", rel: "Adjacent", cls: "adj", score: 78, exp: "2–4 yrs", miss: "warehouse modelling", jobs: 27 },
      { role: "Product Analyst", rel: "Adjacent", cls: "adj", score: 74, exp: "2–4 yrs", miss: "product metrics", jobs: 19 },
      { role: "Analytics Engineer", rel: "Progression", cls: "prog", score: 66, exp: "3–5 yrs", miss: "dbt, orchestration", jobs: 14 },
      { role: "Data Scientist", rel: "Progression", cls: "prog", score: 58, exp: "3–6 yrs", miss: "ML modelling, Python", jobs: 31 },
      { role: "Business Analyst", rel: "Adjacent", cls: "adj", score: 71, exp: "2–4 yrs", miss: "stakeholder workshops", jobs: 23 },
      { role: "Analytics Consultant", rel: "Specialisation", cls: "spec", score: 63, exp: "3–6 yrs", miss: "client delivery", jobs: 8 },
      { role: "ML Engineer", rel: "Specialisation", cls: "spec", score: 45, exp: "4–7 yrs", miss: "production ML, MLOps", jobs: 12 }
    ]
  },

  engineering: {
    label: "Engineering",
    roles: ["Software Engineer", "Backend Engineer", "Frontend Engineer", "Full-Stack Engineer", "Platform Engineer", "DevOps Engineer"],
    responsibilities: [
      "Shipped a feature to production and supported it afterwards.",
      "Wrote tests for code you or your team owned.",
      "Reviewed another engineer's code and gave feedback.",
      "Debugged a production incident and wrote up the cause.",
      "Designed an API or a data contract between services.",
      "Improved build, deploy or CI time.",
      "Refactored a module without changing its behaviour.",
      "Mentored a junior engineer or onboarded a new teammate.",
      "Estimated work and committed to a delivery date.",
      "Documented an architecture decision.",
      "Owned an on-call rotation or an alert.",
      "Migrated a dependency, database or service.",
      "Wrote a runbook another engineer used.",
      "Reduced a cost or a latency number measurably.",
      "Worked directly with a customer to fix their issue."
    ],
    paths: [
      { role: "Software Engineer", rel: "Direct", cls: "direct", score: 85, exp: "1–4 yrs", miss: "—", jobs: 96 },
      { role: "Backend Engineer", rel: "Direct", cls: "direct", score: 82, exp: "2–5 yrs", miss: "—", jobs: 64 },
      { role: "Frontend Engineer", rel: "Direct", cls: "direct", score: 80, exp: "2–5 yrs", miss: "—", jobs: 58 },
      { role: "Full-Stack Engineer", rel: "Adjacent", cls: "adj", score: 78, exp: "2–5 yrs", miss: "—", jobs: 41 },
      { role: "Platform Engineer", rel: "Progression", cls: "prog", score: 64, exp: "4–7 yrs", miss: "infra depth", jobs: 18 },
      { role: "DevOps Engineer", rel: "Adjacent", cls: "adj", score: 61, exp: "3–6 yrs", miss: "Kubernetes, IaC", jobs: 22 },
      { role: "Engineering Manager", rel: "Progression", cls: "prog", score: 48, exp: "6–10 yrs", miss: "people management", jobs: 9 },
      { role: "Solutions Engineer", rel: "Adjacent", cls: "adj", score: 66, exp: "3–6 yrs", miss: "customer-facing demos", jobs: 13 }
    ]
  },

  design: {
    label: "Design",
    roles: ["Product Designer", "UX Designer", "UI Designer", "UX Researcher", "Design Lead"],
    responsibilities: [
      "Ran user interviews and turned them into design decisions.",
      "Produced wireframes or prototypes before build.",
      "Built and maintained a design system or component library.",
      "Tested a design with real users and changed it based on what you saw.",
      "Handed off designs to engineers with specs and states.",
      "Audited an interface for accessibility.",
      "Mapped a user journey and found the drop-off.",
      "Ran a design critique or review.",
      "Wrote interface copy for a flow.",
      "Measured the impact of a design change after launch.",
      "Defined the information architecture for a product area.",
      "Worked inside an existing brand system.",
      "Presented a design decision to stakeholders.",
      "Documented a pattern for other designers to reuse.",
      "Partnered with a PM on discovery."
    ],
    paths: [
      { role: "Product Designer", rel: "Direct", cls: "direct", score: 84, exp: "2–5 yrs", miss: "—", jobs: 37 },
      { role: "UX Designer", rel: "Direct", cls: "direct", score: 82, exp: "2–5 yrs", miss: "—", jobs: 29 },
      { role: "UI Designer", rel: "Adjacent", cls: "adj", score: 76, exp: "1–4 yrs", miss: "visual craft depth", jobs: 21 },
      { role: "UX Researcher", rel: "Adjacent", cls: "adj", score: 70, exp: "2–5 yrs", miss: "research methods", jobs: 11 },
      { role: "Design Lead", rel: "Progression", cls: "prog", score: 55, exp: "6–9 yrs", miss: "team leadership", jobs: 6 },
      { role: "Design Systems Engineer", rel: "Specialisation", cls: "spec", score: 62, exp: "3–6 yrs", miss: "front-end code", jobs: 7 },
      { role: "Service Designer", rel: "Specialisation", cls: "spec", score: 58, exp: "4–7 yrs", miss: "systems mapping", jobs: 4 }
    ]
  },

  marketing: {
    label: "Marketing",
    roles: ["Digital Marketing Manager", "Growth Marketer", "Content Strategist", "Performance Marketing Manager", "Brand Manager"],
    responsibilities: [
      "Ran a paid campaign and reported cost per acquisition.",
      "Wrote copy that shipped to a live audience.",
      "Owned a channel's performance and its budget.",
      "Built a lifecycle or email sequence.",
      "Ran an SEO audit and fixed what it found.",
      "Analysed campaign data and changed the plan.",
      "Coordinated a launch across product, sales and content.",
      "Built a landing page and tested variants.",
      "Managed a content calendar.",
      "Reported on funnel conversion to leadership.",
      "Managed an agency or a freelancer.",
      "Set up tracking and attribution for a campaign.",
      "Grew an audience or a community.",
      "Wrote a positioning or messaging brief.",
      "Ran a webinar, event or partner campaign."
    ],
    paths: [
      { role: "Digital Marketing Manager", rel: "Direct", cls: "direct", score: 83, exp: "2–5 yrs", miss: "—", jobs: 44 },
      { role: "Growth Marketer", rel: "Adjacent", cls: "adj", score: 79, exp: "2–5 yrs", miss: "—", jobs: 26 },
      { role: "Performance Marketing Manager", rel: "Specialisation", cls: "spec", score: 74, exp: "3–6 yrs", miss: "paid media depth", jobs: 18 },
      { role: "Content Strategist", rel: "Adjacent", cls: "adj", score: 72, exp: "2–5 yrs", miss: "editorial depth", jobs: 15 },
      { role: "Brand Manager", rel: "Adjacent", cls: "adj", score: 66, exp: "4–7 yrs", miss: "brand strategy", jobs: 9 },
      { role: "Product Marketing Manager", rel: "Specialisation", cls: "spec", score: 70, exp: "3–6 yrs", miss: "positioning, launches", jobs: 12 },
      { role: "Marketing Analytics Lead", rel: "Progression", cls: "prog", score: 58, exp: "5–8 yrs", miss: "attribution modelling", jobs: 5 }
    ]
  },

  security: {
    label: "Security",
    roles: ["Cybersecurity Analyst", "Security Engineer", "SOC Analyst", "Penetration Tester", "GRC Analyst"],
    responsibilities: [
      "Investigated an alert and wrote up the finding.",
      "Reviewed a system for a known class of vulnerability.",
      "Ran or responded to a penetration test.",
      "Wrote or maintained a security policy or control.",
      "Monitored logs and triaged events.",
      "Handled an incident and documented the timeline.",
      "Reviewed access requests and applied least privilege.",
      "Automated a repetitive security check.",
      "Mapped a control to a compliance framework.",
      "Trained a team on a security practice.",
      "Reviewed a cloud configuration for exposure.",
      "Wrote a detection rule or a playbook.",
      "Coordinated a remediation with engineering.",
      "Reported a risk to leadership in business terms.",
      "Handled a phishing report end to end."
    ],
    paths: [
      { role: "Cybersecurity Analyst", rel: "Direct", cls: "direct", score: 84, exp: "1–4 yrs", miss: "—", jobs: 33 },
      { role: "SOC Analyst", rel: "Direct", cls: "direct", score: 80, exp: "1–3 yrs", miss: "—", jobs: 24 },
      { role: "Security Engineer", rel: "Progression", cls: "prog", score: 66, exp: "3–6 yrs", miss: "engineering depth", jobs: 19 },
      { role: "Penetration Tester", rel: "Specialisation", cls: "spec", score: 60, exp: "3–6 yrs", miss: "offensive tooling", jobs: 8 },
      { role: "GRC Analyst", rel: "Adjacent", cls: "adj", score: 72, exp: "2–5 yrs", miss: "frameworks, audit", jobs: 14 },
      { role: "Cloud Security Engineer", rel: "Specialisation", cls: "spec", score: 58, exp: "4–7 yrs", miss: "cloud IAM", jobs: 11 },
      { role: "Incident Response Lead", rel: "Progression", cls: "prog", score: 52, exp: "6–9 yrs", miss: "command experience", jobs: 4 }
    ]
  }
};

const POPULAR = [
  "Product Manager", "Business Analyst", "Data Analyst", "Software Engineer",
  "Data Scientist", "Cybersecurity Analyst", "Product Designer", "UX Designer",
  "Digital Marketing Manager", "Product Owner", "SOC Analyst", "Growth Marketer"
];

/* ---------- occupation index ----------
   Canonical titles plus the aliases people actually type. This is the
   prototype stand-in for the NCO 2015 / ESCO import: same shape, small
   sample. Adding a title is a data change, not a code change.          */

const OCCUPATIONS = [
  /* business */
  { title: "Business Analyst", family: "business", aliases: ["ba", "business analysis"] },
  { title: "IT Business Analyst", family: "business", aliases: ["it ba"] },
  { title: "Business Systems Analyst", family: "business", aliases: ["bsa", "systems analyst"] },
  { title: "Functional Business Analyst", family: "business", aliases: ["functional ba"] },
  { title: "Technical Business Analyst", family: "business", aliases: ["technical ba"] },
  { title: "Business Process Analyst", family: "business", aliases: ["process analyst", "bpa"] },
  { title: "Senior Business Analyst", family: "business", aliases: ["lead business analyst"] },
  { title: "Business Transformation Analyst", family: "business", aliases: ["transformation analyst"] },
  { title: "Functional Consultant", family: "business", aliases: ["functional consultant"] },
  /* product */
  { title: "Product Manager", family: "product", aliases: ["pm", "product management"] },
  { title: "Associate Product Manager", family: "product", aliases: ["apm"] },
  { title: "Senior Product Manager", family: "product", aliases: ["spm"] },
  { title: "Product Owner", family: "product", aliases: ["po"] },
  { title: "Product Analyst", family: "product", aliases: [] },
  { title: "Product Operations Manager", family: "product", aliases: ["product ops"] },
  { title: "Growth Product Manager", family: "product", aliases: ["growth pm"] },
  { title: "AI Product Manager", family: "product", aliases: ["ai pm"] },
  { title: "Technical Product Manager", family: "product", aliases: ["tpm"] },
  { title: "Product Strategy Manager", family: "product", aliases: [] },
  /* data */
  { title: "Data Analyst", family: "data", aliases: ["da"] },
  { title: "Data Scientist", family: "data", aliases: ["ds"] },
  { title: "Business Intelligence Analyst", family: "data", aliases: ["bi analyst", "bia"] },
  { title: "Analytics Engineer", family: "data", aliases: [] },
  { title: "ML Engineer", family: "data", aliases: ["machine learning engineer"] },
  { title: "Analytics Consultant", family: "data", aliases: [] },
  /* engineering */
  { title: "Software Engineer", family: "engineering", aliases: ["swe", "developer", "programmer"] },
  { title: "Backend Engineer", family: "engineering", aliases: ["backend developer"] },
  { title: "Frontend Engineer", family: "engineering", aliases: ["frontend developer"] },
  { title: "Full-Stack Engineer", family: "engineering", aliases: ["fullstack developer"] },
  { title: "Platform Engineer", family: "engineering", aliases: [] },
  { title: "DevOps Engineer", family: "engineering", aliases: ["devops", "sre"] },
  { title: "Engineering Manager", family: "engineering", aliases: ["em"] },
  { title: "Solutions Engineer", family: "engineering", aliases: ["sales engineer"] },
  /* design */
  { title: "Product Designer", family: "design", aliases: [] },
  { title: "UX Designer", family: "design", aliases: ["ux", "user experience designer"] },
  { title: "UI Designer", family: "design", aliases: ["ui"] },
  { title: "UX Researcher", family: "design", aliases: ["user researcher"] },
  { title: "Design Lead", family: "design", aliases: [] },
  { title: "Design Systems Engineer", family: "design", aliases: [] },
  { title: "Service Designer", family: "design", aliases: [] },
  /* marketing */
  { title: "Digital Marketing Manager", family: "marketing", aliases: ["digital marketing"] },
  { title: "Growth Marketer", family: "marketing", aliases: ["growth marketing"] },
  { title: "Content Strategist", family: "marketing", aliases: ["content strategy"] },
  { title: "Performance Marketing Manager", family: "marketing", aliases: ["performance marketing", "paid media"] },
  { title: "Brand Manager", family: "marketing", aliases: ["branding"] },
  { title: "Product Marketing Manager", family: "marketing", aliases: ["pmm"] },
  { title: "Marketing Analytics Lead", family: "marketing", aliases: [] },
  /* security */
  { title: "Cybersecurity Analyst", family: "security", aliases: ["cyber security analyst", "security analyst"] },
  { title: "Security Engineer", family: "security", aliases: [] },
  { title: "SOC Analyst", family: "security", aliases: ["soc", "security operations analyst"] },
  { title: "Penetration Tester", family: "security", aliases: ["pentester", "ethical hacker"] },
  { title: "GRC Analyst", family: "security", aliases: ["governance risk compliance"] },
  { title: "Cloud Security Engineer", family: "security", aliases: [] },
  { title: "Incident Response Lead", family: "security", aliases: ["ir lead"] }
];

const MATCH_LABEL = { exact: "Exact", alias: "Alias", spec: "Specialisation", rel: "Related" };
const MATCH_CLASS = { exact: "exact", alias: "alias", spec: "spec", rel: "rel" };
const MATCH_RANK = { exact: 0, alias: 1, spec: 2, rel: 3 };

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* Four layers, in order: exact title, alias, specialisation, related.
   Related needs the rarest typed word to appear in the title, so
   "Data Analyst" never pulls in "SOC Analyst" on the word "analyst". */

function wordRe(s) {
  return new RegExp("\\b" + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
}

function searchOccupations(query) {
  const q = (query || "").toLowerCase().trim();
  if (!q) return [];

  const tokens = q.split(/\s+/).filter(Boolean);
  const qRe = wordRe(q);
  const tokenRes = tokens.map((t) => ({ t, re: wordRe(t) }));

  /* document frequency: the rarest word carries the meaning */
  const df = {};
  for (const { t } of tokenRes) {
    df[t] = OCCUPATIONS.filter((o) => wordRe(t).test(o.title)).length;
  }
  const rarest = tokenRes.slice().sort((a, b) => df[a.t] - df[b.t])[0];

  const out = [];

  for (const o of OCCUPATIONS) {
    const t = o.title.toLowerCase();
    let match = null;
    let hits = 0;

    if (t === q) {
      match = "exact"; hits = tokens.length;
    } else if (o.aliases.some((a) => a.toLowerCase() === q)) {
      match = "alias"; hits = tokens.length;
    } else if (qRe.test(o.title)) {
      match = "spec"; hits = tokens.length;
    } else {
      hits = tokenRes.filter(({ re }) => re.test(o.title)).length;
      const distinctive = rarest && rarest.re.test(o.title);
      if (distinctive && hits / tokens.length >= 0.5) match = "rel";
    }

    if (match) out.push({ title: o.title, family: o.family, match, hits });
  }

  out.sort((a, b) =>
    MATCH_RANK[a.match] - MATCH_RANK[b.match] ||
    b.hits - a.hits ||
    a.title.length - b.title.length);

  /* thin result: fill from the same family, labelled Related */
  if (out.length && out.length < 4) {
    const fam = out[0].family;
    for (const o of OCCUPATIONS) {
      if (out.length >= 4) break;
      if (o.family !== fam) continue;
      if (out.some((x) => x.title === o.title)) continue;
      out.push({ title: o.title, family: o.family, match: "rel", hits: 0 });
    }
  }

  return out.slice(0, 6);
}

const GENERIC = {
  label: "General",
  responsibilities: [
    "Owned a process end to end.",
    "Worked with cross-functional teams.",
    "Used data to make decisions.",
    "Improved a workflow or tool.",
    "Handled escalations and edge cases.",
    "Documented and trained others.",
    "Managed a budget or a vendor.",
    "Presented to leadership.",
    "Trained or mentored a colleague.",
    "Fixed a recurring problem at its source.",
    "Coordinated a project across teams.",
    "Wrote a process others followed.",
    "Reported on outcomes to a manager.",
    "Handled a customer or client directly.",
    "Improved a number you were measured on."
  ],
  paths: []
};


  /* ---------- family resolution ---------- */

  function resolveFamily(text) {
    const t = (text || "").toLowerCase().trim();
    if (!t) return null;

    const exact = OCCUPATIONS.find((o) => o.title.toLowerCase() === t);
    if (exact) return exact.family;

    const alias = OCCUPATIONS.find((o) => o.aliases.some((a) => a.toLowerCase() === t));
    if (alias) return alias.family;

    const near = searchOccupations(t)[0];
    return near ? near.family : null;
  }

  const PRODUCT_JOBS = [
    {
      id: "valgenesis-acbc0284",
      title: "Platform Product Manager, AI/ML",
      company: "ValGenesis",
      location: "Chennai, Tamil Nadu",
      workMode: "Office",
      source: "Lever",
      sourceUrl: "https://jobs.lever.co/valgenesis/acbc0284-0bb8-42e4-9fd1-fa3583cb458f",
      datePosted: "2026-04-08",
      firstSeenAt: "2026-11-19",
      score: 76.3,
      relationship: "Specialisation",
      breakdown: [
        { k: "Role fit", got: 21.0, max: 25 },
        { k: "Skills", got: 16.5, max: 25 },
        { k: "Experience", got: 12.0, max: 15 },
        { k: "Industry", got: 7.0, max: 10 },
        { k: "Location", got: 10.0, max: 10 },
        { k: "Ownership", got: 6.8, max: 10 },
        { k: "Compensation", got: 3.0, max: 5 }
      ],
      have: ["Product roadmap", "Customer discovery", "Requirements", "Stakeholder management", "AI/ML exposure"],
      miss: ["Platform / API product depth", "Enterprise validation domain", "Regulated-industry GTM"],
      explain:
        "Strong on the parts you can evidence: you have owned a roadmap end to end, run discovery and written requirements for engineering. The gap is platform depth — this role sells an AI/ML validation platform to regulated manufacturers, so they weight API surface, enterprise integrations and domain credibility. Your AI exposure is real but recent, which is why skills lands at 16.5 of 25 rather than higher.",
      jd: "ValGenesis is the market leader in digital validation lifecycle management for life sciences.\n\nWe are looking for a Platform Product Manager to own the AI/ML platform surface. You will define the roadmap for our model lifecycle, evaluation and validation capabilities, working with ML engineers, regulatory affairs and enterprise customers.\n\nWhat you will do:\n• Own the platform roadmap for AI/ML capabilities end to end\n• Translate regulatory and customer requirements into a shippable specification\n• Define evaluation criteria and success metrics for model performance\n• Partner with engineering on API design and integration contracts\n• Work with GTM on positioning for regulated-industry buyers\n\nWhat we look for:\n• 5+ years in product management, at least 2 on a technical or platform product\n• Experience with ML model lifecycle or data products\n• Comfort with APIs, integrations and enterprise security requirements\n• Prior exposure to life sciences, healthcare or another regulated domain is a strong plus"
    },
    {
      id: "freshworks-apm",
      title: "Associate Product Manager — Freshdesk",
      company: "Freshworks",
      location: "Chennai, Tamil Nadu",
      workMode: "Hybrid",
      source: "Greenhouse",
      sourceUrl: "https://boards.greenhouse.io/freshworks",
      datePosted: "2026-11-12",
      firstSeenAt: "2026-11-19",
      score: 81.4,
      relationship: "Direct",
      breakdown: [
        { k: "Role fit", got: 23.5, max: 25 },
        { k: "Skills", got: 17.0, max: 25 },
        { k: "Experience", got: 15.0, max: 15 },
        { k: "Industry", got: 8.0, max: 10 },
        { k: "Location", got: 10.0, max: 10 },
        { k: "Ownership", got: 4.9, max: 10 },
        { k: "Compensation", got: 3.0, max: 5 }
      ],
      have: ["Product roadmap", "Customer discovery", "Requirements", "Funnel analysis", "SaaS"],
      miss: ["Support-domain depth", "Pricing experimentation"],
      explain:
        "The closest match in the set. Direct title, Chennai, hybrid, and the JD asks for exactly the discovery-to-spec loop you have run. Experience clears the bar with room to spare. The only real gap is support-tooling domain knowledge, which is learnable in the first month.",
      jd: "Freshworks is hiring an Associate Product Manager for Freshdesk, our customer support platform.\n\nYou will own a surface area of the agent experience: triage, routing and the workflows support teams live in all day.\n\nResponsibilities:\n• Run discovery with support agents and admins\n• Write specs and user stories for a pod of 6 engineers\n• Define and track success metrics post-launch\n• Prioritise the backlog against a clear trade-off framework\n\nRequirements:\n• 2–4 years in product, consulting or a founder role\n• Evidence of shipping something end to end\n• Comfort with data — SQL or a BI tool\n• SaaS experience preferred"
    },
    {
      id: "zoho-po",
      title: "Product Owner — Zoho Desk",
      company: "Zoho",
      location: "Chennai, Tamil Nadu",
      workMode: "Office",
      source: "Company careers",
      sourceUrl: "https://careers.zohocorp.com",
      datePosted: null,
      firstSeenAt: "2026-11-18",
      score: 74.8,
      relationship: "Adjacent",
      breakdown: [
        { k: "Role fit", got: 17.0, max: 25 },
        { k: "Skills", got: 18.0, max: 25 },
        { k: "Experience", got: 15.0, max: 15 },
        { k: "Industry", got: 8.0, max: 10 },
        { k: "Location", got: 10.0, max: 10 },
        { k: "Ownership", got: 3.8, max: 10 },
        { k: "Compensation", got: 3.0, max: 5 }
      ],
      have: ["Backlog prioritisation", "Requirements", "Stakeholder management", "SaaS"],
      miss: ["Scrum certification", "Agile ceremony ownership"],
      explain:
        "Product Owner is adjacent, not the same job — it is delivery-facing rather than discovery-facing. Your backlog and requirements work carries most of the score. They will likely ask for a Scrum certification; it is a two-week gap, not a capability gap.",
      jd: "Zoho Desk is looking for a Product Owner to work with our engineering and support teams in Chennai.\n\nYou will own the backlog, write clear user stories and run the agile ceremonies for one product area.\n\nRequirements:\n• 3–6 years as a Product Owner, BA or PM\n• Strong written requirements\n• Experience with Scrum or Kanban\n• CSM or equivalent certification preferred"
    },
    {
      id: "chargebee-spm",
      title: "Senior Product Manager — Billing Platform",
      company: "Chargebee",
      location: "Chennai, Tamil Nadu",
      workMode: "Remote",
      source: "Ashby",
      sourceUrl: "https://jobs.ashbyhq.com/chargebee",
      datePosted: "2026-10-30",
      firstSeenAt: "2026-11-19",
      score: 63.2,
      relationship: "Progression",
      breakdown: [
        { k: "Role fit", got: 16.0, max: 25 },
        { k: "Skills", got: 14.5, max: 25 },
        { k: "Experience", got: 9.0, max: 15 },
        { k: "Industry", got: 7.7, max: 10 },
        { k: "Location", got: 10.0, max: 10 },
        { k: "Ownership", got: 3.0, max: 10 },
        { k: "Compensation", got: 3.0, max: 5 }
      ],
      have: ["Product roadmap", "Requirements", "SaaS", "Metrics"],
      miss: ["6+ years PM tenure", "Billing / payments domain", "Multi-team scope"],
      explain:
        "A genuine stretch. The title is a progression above your current level and the JD asks for six years of PM tenure with multi-team scope. Billing and payments is a deep domain you have not worked in. Worth applying only if you can tell a platform story that survives the first screen.",
      jd: "Chargebee is hiring a Senior Product Manager for our billing platform.\n\nYou will own the subscription and invoicing surface used by thousands of SaaS companies.\n\nRequirements:\n• 6+ years in product management\n• Experience owning a platform or infrastructure product\n• Billing, payments or fintech domain strongly preferred\n• Track record of multi-team delivery"
    },
    {
      id: "kaar-tech-pm",
      title: "Technical Product Manager",
      company: "Kaar Tech",
      location: "Chennai, Tamil Nadu",
      workMode: "Hybrid",
      source: "SmartRecruiters",
      sourceUrl: "https://jobs.smartrecruiters.com/KaarTech",
      datePosted: "2026-11-05",
      firstSeenAt: "2026-11-19",
      score: 68.9,
      relationship: "Specialisation",
      breakdown: [
        { k: "Role fit", got: 16.0, max: 25 },
        { k: "Skills", got: 16.0, max: 25 },
        { k: "Experience", got: 13.5, max: 15 },
        { k: "Industry", got: 6.9, max: 10 },
        { k: "Location", got: 10.0, max: 10 },
        { k: "Ownership", got: 3.5, max: 10 },
        { k: "Compensation", got: 3.0, max: 5 }
      ],
      have: ["Requirements", "API familiarity", "Stakeholder management"],
      miss: ["SAP ecosystem", "Enterprise implementation cycles"],
      explain:
        "Technical PM at an SAP services firm. Your requirements and API familiarity carry it, but the SAP ecosystem is the whole job here and you have no evidence of it. The score is honest about that.",
      jd: "Kaar Tech is hiring a Technical Product Manager for our SAP practice in Chennai.\n\nYou will translate enterprise client requirements into product specifications across our SAP BTP offerings.\n\nRequirements:\n• 4–7 years in a technical product or BA role\n• SAP ecosystem experience required\n• Comfort with APIs and enterprise integration\n• Client-facing delivery experience"
    }
  ];

  const SEEDS = {
    business: [
      { t: "Business Analyst", c: "Freshworks", s: "Greenhouse", m: "Hybrid", loc: "Chennai, Tamil Nadu", d: 6, r: "Direct", sc: 84.2,
        have: ["Requirement gathering", "BRD / FRD", "Stakeholder management", "UAT", "Agile / Scrum"],
        miss: ["Salesforce admin certification", "SQL depth"] },
      { t: "Senior Business Analyst", c: "Zoho", s: "Company careers", m: "Office", loc: "Chennai, Tamil Nadu", d: null, r: "Progression", sc: 77.5,
        have: ["Requirement gathering", "Process mapping", "Stakeholder management", "UAT"],
        miss: ["Team lead experience", "Domain: fintech"] },
      { t: "Business Systems Analyst", c: "Chargebee", s: "Ashby", m: "Remote", loc: "Remote, India", d: 19, r: "Adjacent", sc: 72.8,
        have: ["Requirement gathering", "Workflow automation", "UAT"],
        miss: ["Salesforce configuration", "API integration design"] },
      { t: "Functional Consultant", c: "Kaar Tech", s: "SmartRecruiters", m: "Hybrid", loc: "Chennai, Tamil Nadu", d: 11, r: "Specialisation", sc: 68.4,
        have: ["BRD / FRD", "Stakeholder management", "Process mapping"],
        miss: ["SAP module certification", "Client billing exposure"] },
      { t: "IT Business Analyst", c: "Hexaware", s: "Company careers", m: "Office", loc: "Chennai, Tamil Nadu", d: 34, r: "Direct", sc: 64.1,
        have: ["Requirement gathering", "UAT", "Agile / Scrum"],
        miss: ["ITIL certification", "Production support experience"] }
    ],
    data: [
      { t: "Data Analyst", c: "Swiggy", s: "Greenhouse", m: "Hybrid", loc: "Bengaluru, Karnataka", d: 4, r: "Direct", sc: 82.6,
        have: ["SQL", "Dashboarding", "Stakeholder management", "Experimentation"],
        miss: ["Python for analysis", "Airflow / dbt"] },
      { t: "Senior Data Analyst", c: "PhonePe", s: "Company careers", m: "Office", loc: "Bengaluru, Karnataka", d: 9, r: "Progression", sc: 76.9,
        have: ["SQL", "Dashboarding", "Experimentation"],
        miss: ["Mentoring experience", "Data modelling"] },
      { t: "Product Analyst", c: "Razorpay", s: "Ashby", m: "Remote", loc: "Remote, India", d: 15, r: "Adjacent", sc: 73.2,
        have: ["SQL", "Funnel analysis", "Experimentation"],
        miss: ["Amplitude / Mixpanel depth", "A/B test design at scale"] },
      { t: "Business Intelligence Analyst", c: "Zoho", s: "Lever", m: "Hybrid", loc: "Chennai, Tamil Nadu", d: null, r: "Adjacent", sc: 69.5,
        have: ["Dashboarding", "SQL", "Stakeholder management"],
        miss: ["Power BI certification", "Warehouse modelling"] },
      { t: "Analytics Consultant", c: "Tiger Analytics", s: "SmartRecruiters", m: "Office", loc: "Chennai, Tamil Nadu", d: 28, r: "Specialisation", sc: 65.8,
        have: ["SQL", "Dashboarding", "Stakeholder management"],
        miss: ["Client-facing consulting", "Python"] }
    ],
    engineering: [
      { t: "Software Engineer", c: "Freshworks", s: "Greenhouse", m: "Hybrid", loc: "Chennai, Tamil Nadu", d: 3, r: "Direct", sc: 80.4,
        have: ["TypeScript", "REST APIs", "Testing", "Git"],
        miss: ["Distributed systems", "Kubernetes"] },
      { t: "Backend Engineer", c: "Zerodha", s: "Company careers", m: "Remote", loc: "Remote, India", d: 8, r: "Specialisation", sc: 74.7,
        have: ["REST APIs", "Databases", "Testing"],
        miss: ["Low-latency systems", "Go"] },
      { t: "Full Stack Developer", c: "Chargebee", s: "Ashby", m: "Hybrid", loc: "Chennai, Tamil Nadu", d: 12, r: "Direct", sc: 71.3,
        have: ["TypeScript", "React", "REST APIs"],
        miss: ["Billing domain", "GraphQL"] },
      { t: "Senior Software Engineer", c: "Zoho", s: "Lever", m: "Office", loc: "Chennai, Tamil Nadu", d: 21, r: "Progression", sc: 67.9,
        have: ["TypeScript", "Testing", "Code review"],
        miss: ["System design at scale", "Mentoring"] },
      { t: "Application Support Engineer", c: "Hexaware", s: "SmartRecruiters", m: "Office", loc: "Chennai, Tamil Nadu", d: 40, r: "Adjacent", sc: 61.2,
        have: ["SQL", "Incident handling"],
        miss: ["ITIL certification", "On-call ownership"] }
    ],
    design: [
      { t: "Product Designer", c: "Freshworks", s: "Greenhouse", m: "Hybrid", loc: "Chennai, Tamil Nadu", d: 5, r: "Direct", sc: 81.8,
        have: ["Figma", "User research", "Design systems", "Prototyping"],
        miss: ["Motion design", "Accessibility audit"] },
      { t: "UX Designer", c: "Zoho", s: "Company careers", m: "Office", loc: "Chennai, Tamil Nadu", d: 10, r: "Direct", sc: 75.4,
        have: ["Figma", "User research", "Prototyping"],
        miss: ["Usability testing at scale", "Design ops"] },
      { t: "UI Designer", c: "Chargebee", s: "Ashby", m: "Remote", loc: "Remote, India", d: 17, r: "Adjacent", sc: 70.6,
        have: ["Figma", "Design systems", "Prototyping"],
        miss: ["Illustration", "Brand systems"] },
      { t: "Senior Product Designer", c: "Razorpay", s: "Lever", m: "Hybrid", loc: "Bengaluru, Karnataka", d: null, r: "Progression", sc: 66.3,
        have: ["Figma", "User research", "Design systems"],
        miss: ["0 to 1 product ownership", "Mentoring"] },
      { t: "Design Systems Designer", c: "Kaar Tech", s: "SmartRecruiters", m: "Office", loc: "Chennai, Tamil Nadu", d: 33, r: "Specialisation", sc: 62.7,
        have: ["Design systems", "Figma"],
        miss: ["Design tokens in code", "Storybook"] }
    ],
    marketing: [
      { t: "Digital Marketing Manager", c: "Freshworks", s: "Greenhouse", m: "Hybrid", loc: "Chennai, Tamil Nadu", d: 7, r: "Direct", sc: 79.5,
        have: ["Campaign management", "SEO", "Analytics", "Content"],
        miss: ["Paid budget ownership", "Marketing automation"] },
      { t: "Growth Marketer", c: "Razorpay", s: "Ashby", m: "Remote", loc: "Remote, India", d: 13, r: "Adjacent", sc: 74.1,
        have: ["Campaign management", "Analytics", "Experimentation"],
        miss: ["Lifecycle messaging", "SQL"] },
      { t: "Content Marketing Manager", c: "Zoho", s: "Company careers", m: "Office", loc: "Chennai, Tamil Nadu", d: 18, r: "Direct", sc: 70.8,
        have: ["Content", "SEO", "Analytics"],
        miss: ["Editorial team management", "Video"] },
      { t: "SEO Specialist", c: "Chargebee", s: "Lever", m: "Hybrid", loc: "Chennai, Tamil Nadu", d: null, r: "Specialisation", sc: 66.4,
        have: ["SEO", "Analytics", "Content"],
        miss: ["Technical SEO at scale", "Link building"] },
      { t: "Performance Marketing Lead", c: "Swiggy", s: "SmartRecruiters", m: "Office", loc: "Bengaluru, Karnataka", d: 31, r: "Progression", sc: 63.0,
        have: ["Campaign management", "Analytics"],
        miss: ["Team management", "Large budget ownership"] }
    ],
    security: [
      { t: "Security Analyst", c: "Tata Elxsi", s: "Company careers", m: "Office", loc: "Chennai, Tamil Nadu", d: 6, r: "Direct", sc: 78.9,
        have: ["Incident triage", "SIEM", "Vulnerability assessment", "Reporting"],
        miss: ["Cloud security certification", "Threat hunting"] },
      { t: "SOC Analyst", c: "HCLTech", s: "SmartRecruiters", m: "Office", loc: "Chennai, Tamil Nadu", d: 11, r: "Adjacent", sc: 73.6,
        have: ["SIEM", "Incident triage", "Reporting"],
        miss: ["Splunk certification", "Shift-based on-call"] },
      { t: "Cybersecurity Engineer", c: "Zoho", s: "Lever", m: "Hybrid", loc: "Chennai, Tamil Nadu", d: 16, r: "Specialisation", sc: 69.8,
        have: ["Vulnerability assessment", "SIEM", "Scripting"],
        miss: ["Application security review", "Kubernetes security"] },
      { t: "GRC Analyst", c: "Deloitte India", s: "Company careers", m: "Hybrid", loc: "Chennai, Tamil Nadu", d: null, r: "Adjacent", sc: 65.2,
        have: ["Reporting", "Control documentation"],
        miss: ["ISO 27001 lead auditor", "Client engagement"] },
      { t: "Penetration Tester", c: "Freshworks", s: "Greenhouse", m: "Remote", loc: "Remote, India", d: 27, r: "Specialisation", sc: 61.9,
        have: ["Vulnerability assessment", "Scripting"],
        miss: ["OSCP", "Web app exploitation depth"] }
    ]
  };

  const FAMILY_JD = {
    business: {
      duties: ["Gather requirements from business stakeholders and write them as BRDs and user stories",
               "Run UAT, track defects and see them through to release",
               "Map the current process and propose a measurable improvement"],
      reqs: ["2-5 years as a business analyst", "Strong written documentation",
             "Stakeholder management across business and engineering"]
    },
    data: {
      duties: ["Build and maintain dashboards the business actually uses",
               "Write SQL against production data",
               "Turn an ambiguous question into a measurable analysis"],
      reqs: ["2-5 years in analytics", "Advanced SQL", "One BI tool in depth"]
    },
    engineering: {
      duties: ["Ship features end to end in a small team",
               "Review code and own production quality",
               "Work with product on scope and trade-offs"],
      reqs: ["2-5 years building production software", "One language in depth",
             "Comfort with testing and CI"]
    },
    design: {
      duties: ["Own a product surface from problem to shipped UI",
               "Run usability sessions and act on what you see",
               "Maintain and extend the design system"],
      reqs: ["2-5 years in product design", "Figma in depth", "A portfolio with shipped work"]
    },
    marketing: {
      duties: ["Own a channel end to end and report on it",
               "Run campaigns from brief to measurement",
               "Work with product on positioning"],
      reqs: ["2-5 years in marketing", "Hands-on with one ad platform", "Comfort with analytics"]
    },
    security: {
      duties: ["Monitor, triage and respond to security events",
               "Run assessments and track remediation",
               "Document controls for an audit"],
      reqs: ["2-5 years in security", "One SIEM or EDR in depth", "Clear written reporting"]
    }
  };

  /* ---------- sample postings ----------
     Only the ValGenesis record is real, verified 2026-11-19 against
     api.lever.co/v0/postings/valgenesis. Every other posting is generated
     for the family you picked so the flow can be walked for any role; the
     workspace labels them as sample data. */

  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function breakdownFor(total, seedText) {
    const W = [["Role fit", 25], ["Skills", 25], ["Experience", 15], ["Industry", 10],
               ["Location", 10], ["Ownership", 10], ["Compensation", 5]];
    let st = hash(seedText) || 1;
    const next = () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; };

    const raw = W.map(([k, max]) => {
      const base = (total / 100) * max;
      const jitter = (next() - 0.5) * max * 0.25;
      return { k: k, max: max, got: Math.max(0, Math.min(max, base + jitter)) };
    });

    const sum = raw.reduce((a, r) => a + r.got, 0) || 1;
    const out = raw.map((r) => ({ k: r.k, max: r.max, got: Math.round((r.got * total / sum) * 10) / 10 }));

    const diff = Math.round((total - out.reduce((a, r) => a + r.got, 0)) * 10) / 10;
    const big = out.reduce((a, r) => (r.max > a.max ? r : a), out[0]);
    big.got = Math.round((big.got + diff) * 10) / 10;
    return out;
  }

  function isoDaysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  function slug(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function explainFor(seed) {
    const have = seed.have.slice(0, 3).join(", ").toLowerCase();
    const miss = seed.miss.filter(Boolean);
    const rel = seed.r === "Direct" ? "a direct match" :
                seed.r === "Progression" ? "a step up from your current level" :
                seed.r === "Adjacent" ? "an adjacent role" : "a specialisation of your role";
    return seed.t + " at " + seed.c + " is " + rel + ". The posting's core asks are covered by what you confirmed: " +
      have + ". " +
      (miss.length
        ? "The gap is " + miss.slice(0, 2).join(" and ") + ", which the posting lists as required and your profile does not evidence."
        : "No required skill is missing from your profile.") +
      " The score is deterministic; this paragraph is written from the posting text and your confirmed profile.";
  }

  function jdFor(family, seed) {
    const f = FAMILY_JD[family] || {
      duties: [
        "Own the day-to-day work of a " + seed.t.toLowerCase() + " and report on it",
        "Work with the teams around you to unblock what is stuck",
        "Improve one process you are responsible for and show the result"
      ],
      reqs: [
        "Relevant experience in this role",
        "Clear written and verbal communication",
        "Evidence of owning an outcome end to end"
      ]
    };
    const miss = seed.miss.filter(Boolean);
    return seed.c + " is hiring a " + seed.t + " in " + seed.loc + ".\n\n" +
      "What you will do:\n" + f.duties.map((d) => "\u2022 " + d).join("\n") + "\n\n" +
      "What we look for:\n" + f.reqs.map((r) => "\u2022 " + r).join("\n") +
      (miss.length ? "\n" + miss.map((m) => "\u2022 " + m).join("\n") : "");
  }

  /* A role the taxonomy has never seen still gets a workspace. The postings
     are built from the title the user typed, so nothing silently falls back
     to a different job family. */
  function genericSeeds(role) {
    const r = (role || "your role").trim();
    const lower = r.toLowerCase();
    const variants = [
      { t: r, c: "Freshworks", s: "Greenhouse", m: "Hybrid", loc: "Chennai, Tamil Nadu", d: 5, rel: "Direct", sc: 74.6 },
      { t: "Senior " + r, c: "Zoho", s: "Company careers", m: "Office", loc: "Chennai, Tamil Nadu", d: null, rel: "Progression", sc: 68.9 },
      { t: r + " (Remote)", c: "Razorpay", s: "Ashby", m: "Remote", loc: "Remote, India", d: 14, rel: "Direct", sc: 66.2 },
      { t: "Associate " + r, c: "Chargebee", s: "Lever", m: "Hybrid", loc: "Chennai, Tamil Nadu", d: 23, rel: "Adjacent", sc: 61.4 },
      { t: "Lead " + r, c: "Hexaware", s: "SmartRecruiters", m: "Office", loc: "Chennai, Tamil Nadu", d: 38, rel: "Progression", sc: 57.8 }
    ];

    const have = ["Stakeholder management", "Documentation", "Cross-functional collaboration", "Reporting"];
    const miss = ["Domain depth in " + lower, "Tooling certification"];

    return variants.map((v) => Object.assign({}, v, { have: have, miss: miss }));
  }

  function jobsFor(family, role) {
    const seeds = family === "product" ? null : SEEDS[family];
    if (family === "product") {
      return PRODUCT_JOBS.map((j) => Object.assign({}, j));
    }

    const list = seeds || genericSeeds(role);

    return list.map((seed) => {
      const id = slug(seed.c + "-" + seed.t);
      return {
        id: id,
        title: seed.t,
        company: seed.c,
        location: seed.loc,
        workMode: seed.m,
        source: seed.s,
        sourceUrl: "#",
        datePosted: seed.d === null ? null : isoDaysAgo(seed.d),
        firstSeenAt: isoDaysAgo(0),
        score: seed.sc,
        relationship: seed.rel || seed.r,
        breakdown: breakdownFor(seed.sc, id),
        have: seed.have.slice(),
        miss: seed.miss.slice(),
        explain: explainFor(Object.assign({}, seed, { r: seed.rel || seed.r })),
        jd: jdFor(family, seed)
      };
    });
  }

  window.CO = {
    FAMILIES: FAMILIES,
    POPULAR: POPULAR,
    OCCUPATIONS: OCCUPATIONS,
    MATCH_LABEL: MATCH_LABEL,
    MATCH_CLASS: MATCH_CLASS,
    searchOccupations: searchOccupations,
    resolveFamily: resolveFamily,
    escapeHtml: escapeHtml,
    GENERIC: GENERIC,
    jobsFor: jobsFor
  };
})();
