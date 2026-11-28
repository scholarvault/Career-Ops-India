/**
 * Shared server-side A4 print HTML renderer for tailored resumes.
 * Keeps `POST /api/tailored/save` working from headless MCP batches (`tailor_batch`)
 * as well as browser clients, without duplicating markup contracts.
 */

export interface ResumeContact {
  fullName?: string;
  email?: string;
  phone?: string;
  city?: string;
  links?: { linkedin?: string; github?: string; portfolio?: string };
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanHandle(url?: string): string {
  if (!url) return "";
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}

/** Renders tailored JSON output into standalone print-ready A4 HTML (>= 200 bytes). */
export function renderTailoredResumeHtml(
  tailored: Record<string, any>,
  contact: ResumeContact = {},
  meta: { company?: string; title?: string } = {},
): string {
  const fullName = contact.fullName || tailored.fullName || "Candidate";
  const headline = tailored.headline || meta.title || "Product & Operations";
  const contactParts = [
    contact.city,
    contact.email,
    contact.phone,
    cleanHandle(contact.links?.linkedin),
    cleanHandle(contact.links?.portfolio),
    cleanHandle(contact.links?.github),
  ].filter(Boolean);

  const skillGroups: Array<{ group?: string; items?: string[] }> = Array.isArray(tailored.skills)
    ? tailored.skills.map((s: any) =>
        typeof s === "string" ? { items: [s] } : { group: s?.group, items: Array.isArray(s?.items) ? s.items : [] },
      )
    : [];

  const flatSkills = Array.isArray(tailored.skillsToEmphasize)
    ? tailored.skillsToEmphasize
    : Array.isArray(tailored.highlights)
    ? tailored.highlights
    : [];

  const skillsHtml = skillGroups.length
    ? skillGroups
        .filter((g) => (g.items?.length ?? 0) > 0)
        .map(
          (g) =>
            `<p class="skill-row">${g.group ? `<strong>${esc(g.group)}:</strong> ` : ""}${esc((g.items ?? []).join(", "))}</p>`,
        )
        .join("\n")
    : flatSkills.length
    ? `<p class="skill-row">${esc(flatSkills.join(", "))}</p>`
    : "";

  const experienceList: any[] = Array.isArray(tailored.experience) ? tailored.experience : [];
  const experienceHtml = experienceList
    .map((e) => {
      const bullets: string[] = Array.isArray(e?.lines)
        ? e.lines
        : Array.isArray(e?.bullets)
        ? e.bullets
        : [];
      const where = [e?.company, e?.location].filter(Boolean).join(" · ");
      return `<section class="role">
  <div class="role-head">
    <div><strong>${esc(e?.role || e?.title || "")}</strong>${where ? ` — ${esc(where)}` : ""}</div>
    <span class="dates">${esc(e?.dates || "")}</span>
  </div>
  ${bullets.length ? `<ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
</section>`;
    })
    .join("\n");

  const educationList: any[] = Array.isArray(tailored.education) ? tailored.education : [];
  const educationHtml = educationList
    .map((ed) => {
      if (typeof ed === "string") return `<li>${esc(ed)}</li>`;
      const parts = [ed?.degree, ed?.school || ed?.institution, ed?.dates, ed?.detail].filter(Boolean);
      return `<li>${esc(parts.join(" · "))}</li>`;
    })
    .join("");

  const certs: string[] = Array.isArray(tailored.certifications) ? tailored.certifications.map(String) : [];
  const langs: string[] = Array.isArray(tailored.languages) ? tailored.languages.map(String) : [];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(fullName)} — ${esc(meta.company || headline)}</title>
<style>
  @page { size: A4; margin: 13mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1816; max-width: 790px; margin: 0 auto; padding: 18px 22px; font-size: 13px; line-height: 1.45; }
  h1 { margin: 0; font-size: 21px; letter-spacing: -0.01em; }
  .headline { margin-top: 2px; font-size: 13.5px; font-weight: 600; color: #2b4c3f; }
  .contact { margin-top: 4px; font-size: 11.5px; color: #57534e; font-family: system-ui, -apple-system, sans-serif; }
  h2 { font-family: system-ui, -apple-system, sans-serif; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #44403c; border-bottom: 1px solid #d6d3d1; padding-bottom: 3px; margin: 14px 0 7px; }
  p { margin: 0 0 6px; }
  .role { margin-bottom: 9px; break-inside: avoid; }
  .role-head { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
  .dates { color: #57534e; white-space: nowrap; font-size: 12px; }
  ul { margin: 4px 0 0 18px; padding: 0; }
  li { margin-bottom: 2.5px; }
  .skill-row { font-size: 12.5px; }
</style>
</head>
<body>
  <header>
    <h1>${esc(fullName)}</h1>
    <div class="headline">${esc(headline)}</div>
    ${contactParts.length ? `<div class="contact">${esc(contactParts.join(" · "))}</div>` : ""}
  </header>
  ${tailored.summary ? `<section><h2>Summary</h2><p>${esc(tailored.summary)}</p></section>` : ""}
  ${skillsHtml ? `<section><h2>Skills</h2>${skillsHtml}</section>` : ""}
  ${experienceHtml ? `<section><h2>Experience</h2>${experienceHtml}</section>` : ""}
  ${educationHtml ? `<section><h2>Education</h2><ul>${educationHtml}</ul></section>` : ""}
  ${certs.length ? `<section><h2>Certifications</h2><p>${esc(certs.join(" · "))}</p></section>` : ""}
  ${langs.length ? `<section><h2>Languages</h2><p>${esc(langs.join(" · "))}</p></section>` : ""}
</body>
</html>`;
}
