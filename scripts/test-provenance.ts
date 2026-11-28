/**
 * Regression test for the "a number belongs to its own job" rule
 * (checkBulletProvenance in server/lib/baseline.ts).
 *
 *   pnpm test:provenance
 *
 * The fixture is invented. It reproduces a real failure: tailoring moved a
 * metric from the second employer's section under the first employer.
 */
import { checkBulletProvenance, resumeBaseline } from "../server/lib/baseline";

const resume = `Asha Example
asha@example.com

EXPERIENCE
Product Lead Northwind Labs
Jan 2024 – Present
- Launched the platform in under 8 months with a team of 5 engineers.
- Grew weekly active users to 3,000+ through onboarding experiments.

Operations Manager Contoso Services
Jun 2019 – Dec 2023
- Ran catalog operations across 100,000+ product records.
- Cut handling time by 20% with a new escalation path.
- Coached a team of 12 FTEs.
`;

const roles = resumeBaseline(resume).roles;
const cases: Array<{ name: string; company: string; line: string; keep: boolean }> = [
  { name: "own metric stays", company: "Northwind Labs", line: "Shipped the platform in under 8 months.", keep: true },
  { name: "own metric, reworded", company: "Contoso Services", line: "Owned data quality for 100,000+ catalog records.", keep: true },
  { name: "metric moved from another role", company: "Northwind Labs", line: "Directed operations across 100,000+ indexed records.", keep: false },
  { name: "percentage moved from another role", company: "Northwind Labs", line: "Drove a 20% efficiency gain.", keep: false },
  { name: "invented metric", company: "Contoso Services", line: "Raised revenue by 45% in two quarters.", keep: false },
  { name: "no metric at all", company: "Northwind Labs", line: "Partnered with design to simplify onboarding.", keep: true },
];

let failed = 0;
if (roles.length < 2) {
  console.log(`FAIL  fixture parsed into ${roles.length} role(s), expected 2`);
  failed++;
}
for (const c of cases) {
  const { kept, dropped } = checkBulletProvenance(resume, roles, [{ role: "", company: c.company, lines: [c.line] }]);
  const wasKept = (kept[0] ?? []).length === 1;
  const ok = wasKept === c.keep;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}${dropped[0] ? `  (${dropped[0].why})` : ""}`);
}
console.log(failed ? `\n${failed} failing` : "\nall passing");
process.exit(failed ? 1 : 0);
