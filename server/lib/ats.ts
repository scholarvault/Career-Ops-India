// ATS keyword gap.
//
// Deterministic on purpose: no model, no key, same answer every time. It reads
// a job description and a resume, pulls the terms an ATS would index, and says
// which ones the resume never mentions.
//
// This is the one thing every paid competitor charges for that costs us
// nothing to run, so it is worth doing properly rather than with a regex.

const STOP = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "than", "so", "as", "at",
  "by", "for", "from", "in", "into", "of", "on", "onto", "to", "with", "within",
  "without", "about", "across", "after", "before", "between", "during", "over",
  "under", "up", "down", "out", "off", "again", "further", "once", "here",
  "there", "when", "where", "why", "how", "all", "any", "both", "each", "few",
  "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "too", "very", "can", "will", "just", "should", "now", "is", "are",
  "was", "were", "be", "been", "being", "have", "has", "had", "do", "does",
  "did", "doing", "would", "could", "ought", "i", "you", "he", "she", "it",
  "we", "they", "them", "his", "her", "its", "our", "their", "this", "that",
  "these", "those", "who", "whom", "which", "what", "also", "etc", "eg", "ie",
  "per", "via", "using", "use", "used", "will", "must", "may", "might", "shall",
  "one", "two", "three", "new", "good", "great", "strong", "ability", "able",
  "work", "working", "role", "job", "team", "teams", "company", "candidate",
  "candidates", "applicant", "applicants", "responsibilities", "requirements",
  "required", "preferred", "plus", "including", "include", "includes", "years",
  "year", "month", "months", "experience", "experienced", "knowledge",
  "understanding", "familiarity", "exposure", "hands", "proven", "demonstrated",
  "excellent", "solid", "deep", "basic", "advanced", "relevant", "related",
  "across", "end", "full", "part", "time", "day", "days", "week", "weeks",
  "location", "locations", "based", "join", "joining", "looking", "seeking",
  "apply", "applications", "opportunity", "opportunities", "benefits", "salary",
  "ctc", "lpa", "perks", "culture", "diversity", "inclusive", "equal",
]);

/** Terms an ATS actually indexes. Multi-word entries are matched as phrases. */
const SKILLS = [
  // languages
  "javascript", "typescript", "python", "java", "kotlin", "swift", "go", "golang",
  "rust", "ruby", "php", "scala", "c++", "c#", "sql", "bash", "shell", "r",
  // web
  "react", "react native", "next.js", "vue", "angular", "svelte", "node.js",
  "express", "nestjs", "django", "flask", "fastapi", "spring boot", "rails",
  "graphql", "rest api", "grpc", "websockets", "html", "css", "tailwind",
  "redux", "webpack", "vite",
  // data
  "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "kafka",
  "rabbitmq", "snowflake", "bigquery", "redshift", "databricks", "spark",
  "hadoop", "airflow", "dbt", "etl", "data warehouse", "data pipeline",
  "pandas", "numpy", "scikit-learn", "tensorflow", "pytorch", "keras",
  "machine learning", "deep learning", "nlp", "computer vision", "llm",
  "generative ai", "prompt engineering", "rag", "fine-tuning",
  // cloud / devops
  "aws", "azure", "gcp", "google cloud", "docker", "kubernetes", "terraform",
  "ansible", "jenkins", "github actions", "gitlab ci", "ci/cd", "helm",
  "prometheus", "grafana", "datadog", "linux", "nginx", "serverless", "lambda",
  // mobile
  "android", "ios", "flutter", "dart", "xcode", "jetpack compose", "swiftui",
  // product / business
  "product management", "roadmap", "stakeholder management", "user research",
  "a/b testing", "analytics", "google analytics", "mixpanel", "amplitude",
  "sql", "excel", "powerpoint", "jira", "confluence", "notion", "figma",
  "agile", "scrum", "kanban", "sprint planning", "backlog grooming",
  "requirement gathering", "brd", "frd", "prd", "user stories", "wireframes",
  "prototyping", "design system", "ux", "ui", "accessibility", "seo",
  "content marketing", "email marketing", "crm", "salesforce", "hubspot",
  "lead generation", "go-to-market", "gtm", "pricing", "forecasting",
  "financial modelling", "p&l", "budgeting", "audit", "taxation", "gst",
  "ifrs", "gaap", "reconciliation", "accounts payable", "accounts receivable",
  "payroll", "compliance", "risk management", "vendor management",
  "supply chain", "procurement", "inventory", "logistics", "operations",
  "customer success", "customer support", "sla", "escalation", "churn",
  "recruitment", "talent acquisition", "onboarding", "performance management",
  "hr operations", "hris", "labour law", "statutory compliance",
  // india-specific
  "naukri", "linkedin recruiter", "hirist", "iimjobs", "instahyre",
  "gst filing", "tds", "epf", "esi", "pf", "form 16", "itr",
  // soft / process
  "communication", "leadership", "mentoring", "documentation", "testing",
  "unit testing", "integration testing", "selenium", "cypress", "playwright",
  "jest", "pytest", "code review", "system design", "microservices",
  "monitoring", "observability", "incident response", "on-call", "sre",
];

const SKILL_SET = new Set(SKILLS);

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^a-z0-9+#./' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every skill phrase that appears in the text, with how often. */
function skillHits(text: string): Map<string, number> {
  const norm = normalise(text);
  const hits = new Map<string, number>();
  for (const skill of SKILL_SET) {
    /* Word-boundary match, but "+" and "." are not word chars, so escape and
       anchor manually. */
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "g");
    const n = (norm.match(re) || []).length;
    if (n) hits.set(skill, n);
  }
  return hits;
}

/** Capitalised or ALL-CAPS runs the vocabulary missed, e.g. "SAP", "IFRS 17". */
function unknownTerms(jd: string, known: Set<string>): string[] {
  const out = new Set<string>();
  const words = jd.match(/\b[A-Z][A-Za-z0-9+#.]{2,}\b/g) || [];
  for (const w of words) {
    const low = w.toLowerCase();
    if (STOP.has(low) || SKILL_SET.has(low)) continue;
    if (known.has(low)) continue;
    if (w.length > 24) continue;
    out.add(low);
  }
  return [...out].slice(0, 40);
}

export type AtsGap = {
  /** 0–100. Share of the JD's indexed terms the resume covers. */
  score: number;
  matched: string[];
  missing: string[];
  /** Terms in the JD that are not in the vocabulary — read these yourself. */
  other: string[];
  jdTerms: number;
  resumeTerms: number;
};

export function keywordGap(resume: string, jd: string): AtsGap {
  const jdHits = skillHits(jd);
  const resumeHits = skillHits(resume);

  const matched: string[] = [];
  const missing: string[] = [];
  let weight = 0;
  let covered = 0;

  for (const [skill, count] of jdHits) {
    /* A term mentioned five times in the JD matters more than one mentioned
       once, but not five times more. */
    const w = 1 + Math.log2(count);
    weight += w;
    if (resumeHits.has(skill)) {
      matched.push(skill);
      covered += w;
    } else {
      missing.push(skill);
    }
  }

  matched.sort();
  missing.sort((a, b) => (jdHits.get(b) || 0) - (jdHits.get(a) || 0) || a.localeCompare(b));

  const score = weight === 0 ? 0 : Math.round((covered / weight) * 100);

  return {
    score,
    matched,
    missing,
    other: unknownTerms(jd, new Set([...jdHits.keys(), ...resumeHits.keys()])),
    jdTerms: jdHits.size,
    resumeTerms: resumeHits.size,
  };
}
