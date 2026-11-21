/* One resume renderer for the workspace preview and the Apply page print.
   It only prints what the model returned from the master resume. */
(function () {
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* The model has returned {language, level} objects before. Flatten them so
     the page never prints "[object Object]". */
  const langText = (v) => {
    if (v == null) return "";
    if (typeof v === "string") return v.trim();
    if (typeof v === "object") {
      const name = String(v.language ?? v.name ?? v.lang ?? v.value ?? "").trim();
      const level = String(v.level ?? v.proficiency ?? v.fluency ?? "").trim();
      if (name && level) return `${name} — ${level}`;
      return name || level;
    }
    return String(v).trim();
  };
  const skillText = (v) => (typeof v === "string" ? v : langText(v));

  const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /* A single word needs boundaries, or "React" would light up inside
     "Reactive". A phrase is matched as written. */
  const termPattern = (t) => {
    const e = escRe(t);
    return /^[A-Za-z0-9+#.]+$/.test(t)
      ? `(?<![A-Za-z0-9+#])${e}(?![A-Za-z0-9+#])`
      : e;
  };

  /* Bold what a recruiter should see first: the metrics already in the
     resume, and the posting's terms the resume already proves. Bold only, so
     the PDF stays selectable and an ATS reads clean text. */
  function emph(text, terms) {
    const raw = String(text ?? "");
    if (!raw) return "";
    const list = (terms || [])
      .map((t) => String(t || "").trim())
      .filter((t) => t.length >= 2 && !/^\d+$/.test(t))
      .filter((t) => t.length >= 4 || /^[A-Z0-9&+#]{2,4}$/.test(t))
      .sort((a, b) => b.length - a.length)
      .slice(0, 16);

    const patterns = [];
    if (list.length) patterns.push(list.map(termPattern).join("|"));
    patterns.push(
      "(?<![A-Za-z0-9])\\d[\\d,.]*(?:\\+|%|k|K|M)(?![A-Za-z0-9])",
      "(?<![A-Za-z0-9])\\d[\\d,]{2,}(?![A-Za-z0-9])",
      "(?<![A-Za-z0-9])\\d+\\s?(?:years?|months?|weeks?)(?![A-Za-z0-9])"
    );

    const re = new RegExp(`(${patterns.join("|")})`, "gi");
    let out = "";
    let last = 0;
    let m;
    while ((m = re.exec(raw))) {
      if (!m[0]) { re.lastIndex++; continue; }
      out += esc(raw.slice(last, m.index));
      out += `<b class="hl">${esc(m[0])}</b>`;
      last = m.index + m[0].length;
    }
    out += esc(raw.slice(last));
    return out;
  }

  function resumeHtml(job, d, profile) {
    const p = profile || {};
    const name = p.name || "Your name";
    const headline = d.headline || p.headline || "";
    const years = p.years || "";
    const contact = (p.contact || []).filter(Boolean);
    const terms = d.highlights || [];

    const skills = (d.skills || []).map((g) => `
      <div class="skillgroup"><b>${esc(g.group || "Skills")}:</b> ${(g.items || []).map(skillText).filter(Boolean).map((s) => emph(s, terms)).join(", ")}</div>`).join("");

    const jobs = (d.experience || []).map((r) => `
      <div class="job">
        <div class="jh">
          <span><b>${esc(r.role)}</b>${r.company ? ` <span class="co">— ${esc(r.company)}</span>` : ""}</span>
          ${r.dates ? `<span class="when">${esc(r.dates)}</span>` : ""}
        </div>
        ${r.location ? `<div class="loc">${esc(r.location)}</div>` : ""}
        <ul>${r.lines.map((l) => `<li>${emph(l, terms)}</li>`).join("")}</ul>
      </div>`).join("");

    const projects = (d.projects || []).map((x) => `
      <div class="proj"><b>${esc(x.name)}</b>
        ${x.lines.length === 1 ? `<p>${emph(x.lines[0], terms)}</p>` : `<ul>${x.lines.map((l) => `<li>${emph(l, terms)}</li>`).join("")}</ul>`}
      </div>`).join("");

    const education = (d.education || []).map((e) => `
      <div class="edu">
        <div class="jh">
          <span><b>${esc(e.degree || "")}</b>${e.school ? ` <span class="co">— ${esc(e.school)}</span>` : ""}</span>
          ${e.dates ? `<span class="when">${esc(e.dates)}</span>` : ""}
        </div>
        ${e.detail ? `<div class="sub">${emph(e.detail, terms)}</div>` : ""}
      </div>`).join("");

    const certs = (d.certifications || []).length
      ? `<h2>Certifications</h2><ul>${d.certifications.map(skillText).filter(Boolean).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : "";
    const langList = (d.languages || []).map(langText).filter(Boolean);
    const langs = langList.length
      ? `<h2>Languages</h2><p>${langList.map(esc).join(" · ")}</p>` : "";

    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)} — ${esc(job.company || "")}</title>
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        width: 210mm; min-height: 297mm;
        padding: 13mm 15mm 14mm;
        font: 10pt/1.42 "Segoe UI", Arial, sans-serif;
        color: #1c1c1c; background: #fff;
      }
      h1 { margin: 0; font-size: 21pt; line-height: 1.1; letter-spacing: -0.01em; color: #111; }
      .headline { margin: 3px 0 0; font-size: 11.5pt; color: #333; }
      .exp { margin: 2px 0 0; font-size: 9.5pt; color: #555; }
      .exp b { color: #0b3f41; font-weight: 700; }
      .contact { margin: 7px 0 0; font-size: 9pt; color: #444; }
      .contact span + span::before { content: "  ·  "; color: #999; }
      h2 {
        margin: 15px 0 6px; padding-bottom: 3px;
        font-size: 9pt; font-weight: 700; letter-spacing: .09em; text-transform: uppercase;
        color: #0e4749; border-bottom: 1px solid #cfd8dc;
      }
      p { margin: 0 0 6px; }
      ul { margin: 3px 0 0; padding-left: 15px; }
      li { margin: 0 0 2.5px; }
      b.hl { font-weight: 700; color: #0b3f41; }
      .job { margin: 0 0 9px; }
      .job:last-child { margin-bottom: 0; }
      .jh { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
      .jh b { font-size: 10pt; color: #111; }
      .jh .co { color: #444; font-weight: 400; }
      .jh .when { font-size: 9pt; color: #666; white-space: nowrap; }
      .loc { font-size: 8.5pt; color: #777; margin-top: 1px; }
      .skillgroup { margin: 0 0 4px; font-size: 9.5pt; }
      .skillgroup b { color: #222; }
      .proj { margin: 0 0 7px; }
      .proj b { font-size: 10pt; }
      .edu { margin: 0 0 6px; }
      .edu b { font-size: 10pt; }
      .edu .sub { font-size: 9pt; color: #555; }
      @media print { body { width: auto; min-height: 0; } }
    </style></head><body>
      <h1>${esc(name)}</h1>
      ${headline ? `<div class="headline">${esc(headline)}</div>` : ""}
      ${years ? `<div class="exp">Experience: <b class="hl">${esc(years)}</b></div>` : ""}
      ${contact.length ? `<div class="contact">${contact.map((c) => `<span>${esc(c)}</span>`).join("")}</div>` : ""}
      ${d.summary ? `<h2>Professional Summary</h2><p>${emph(d.summary, terms)}</p>` : ""}
      ${skills ? `<h2>Skills</h2>${skills}` : ""}
      ${jobs ? `<h2>Work Experience</h2>${jobs}` : ""}
      ${projects ? `<h2>Projects</h2>${projects}` : ""}
      ${education ? `<h2>Education</h2>${education}` : ""}
      ${certs}
      ${langs}
    </body></html>`;
  }

  window.CO = window.CO || {};
  window.CO.resumeHtml = resumeHtml;
})();
