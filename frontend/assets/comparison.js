/* ==========================================================================
   Career Ops India — comparison matrix
   Data checked against public product pages and repositories on 21 Nov 2026.
   ========================================================================== */

(function () {
  "use strict";

  var TOOLS = [
    {
      id: "applycove",
      name: "ApplyCove",
      tag: "Cloud SaaS",
      url: "https://applycove.com/",
    },
    {
      id: "fastapply",
      name: "FastApply",
      tag: "Cloud SaaS",
      url: "https://fastapply.co/in",
    },
    {
      id: "applyai",
      name: "ApplyAI Pro",
      tag: "Chrome extension",
      url: "https://chromewebstore.google.com/detail/applyai-pro-auto-apply-au/hpcbidipkbgffnooddfjgcgpcdbgibpg",
    },
    {
      id: "myjobb",
      name: "myjobb.ai",
      tag: "Cloud SaaS",
      url: "https://myjobb.ai/ai-info",
    },
    {
      id: "scout",
      name: "AgentCo Scout",
      tag: "Web + local CLI",
      url: "https://www.agentco.in/pricing",
    },
    {
      id: "jobauto",
      name: "job-automation",
      tag: "Public repo",
      url: "https://github.com/Nawaz-B-04/job-automation",
    },
    {
      id: "naukriupd",
      name: "naukri_update",
      tag: "Public repo",
      url: "https://github.com/ankitbaghel01/naukri_update",
    },
    {
      id: "noperi",
      name: "NopeRi",
      tag: "Public repo",
      url: "https://github.com/Traverser25/NopeRi",
    },
    {
      id: "co",
      name: "Career Ops India",
      tag: "AGPL-3.0 · ours",
      url: "https://github.com/scholarvault/Career-Ops-India",
      ours: true,
    },
  ];

  var ROWS = [
    {
      id: "model",
      label: "Delivery model",
      sub: "How it runs",
      cells: {
        co: { s: "info", t: "Self-hosted app", n: "Runs from the folder you clone; the app, audit log and browser profile stay local." },
        applycove: { s: "info", t: "Cloud service", n: "Publisher describes scheduled sessions that run on its servers with the laptop closed." },
        fastapply: { s: "info", t: "Cloud service", n: "Publisher says Apply for Me runs on its servers on paid plans." },
        applyai: { s: "info", t: "Chrome extension", n: "Distributed through the Chrome Web Store." },
        myjobb: { s: "info", t: "Cloud service", n: "Hosted matching and auto-apply service." },
        scout: { s: "info", t: "Web + local CLI", n: "Scout Web for discovery; the auto-apply plugin runs on your computer." },
        jobauto: { s: "info", t: "Self-hosted repo", n: "Python + Playwright project run through GitHub Actions." },
        naukriupd: { s: "info", t: "Self-hosted repo", n: "Local Chrome execution using Playwright." },
        noperi: { s: "info", t: "Python client", n: "API client for Naukri; no visible browser automation." },
      },
    },
    {
      id: "india",
      label: "India job portals",
      sub: "Named coverage",
      cells: {
        co: { s: "yes", t: "Naukri, Indeed India", n: "Naukri through its own search and apply endpoints or the browser connector; Indeed India through the browser connector." },
        applycove: { s: "yes", t: "Naukri, LinkedIn", n: "Publisher focuses on Naukri and LinkedIn auto-apply for India." },
        fastapply: { s: "yes", t: "Naukri, LinkedIn, Indeed", n: "Publisher lists 20+ platforms and names these three for India." },
        applyai: { s: "yes", t: "Naukri, LinkedIn, Indeed, Wellfound", n: "As listed on the Chrome Web Store page." },
        myjobb: { s: "yes", t: "Naukri, Foundit, Hirist, IIM Jobs, Instahyre", n: "The features page lists these Indian platforms." },
        scout: { s: "yes", t: "Naukri, iimjobs, Hirist, Instahyre", n: "India-focused plugin coverage named on the publisher's site." },
        jobauto: { s: "yes", t: "Naukri, Internshala, Indeed", n: "Named in the repository README." },
        naukriupd: { s: "yes", t: "Naukri, Wellfound, Indeed", n: "Named in the repository README." },
        noperi: { s: "part", t: "Naukri only", n: "A Naukri-specific API client, not a multi-board service." },
      },
    },
    {
      id: "ats",
      label: "Company ATS coverage",
      sub: "Employer career sites",
      cells: {
        co: { s: "yes", t: "27 boards + portals", n: "Lever, Greenhouse, Ashby and SmartRecruiters boards, plus company portals for Tesla, EPAM, Amazon and NVIDIA. NVIDIA's Workday portal is opt-in via CAREER_OPS_WORKDAY=1." },
        applycove: { s: "unk", t: "Not listed", n: "No employer ATS coverage was found in the public pages reviewed." },
        fastapply: { s: "yes", t: "Workday, Greenhouse +20", n: "Publisher names Workday and Greenhouse among 20+ supported platforms." },
        applyai: { s: "unk", t: "Not listed", n: "The listing names job boards, not employer ATS platforms." },
        myjobb: { s: "yes", t: "Workday, Greenhouse, Ashby, Lever, Oracle, SuccessFactors, iCIMS", n: "The platform page lists these ATS platforms." },
        scout: { s: "part", t: "Greenhouse, Ashby; Lever handed back", n: "Publisher says Lever roles are found, scored and tailored, then handed back rather than submitted." },
        jobauto: { s: "unk", t: "Not listed", n: "README documents three job boards; no employer ATS coverage is described." },
        naukriupd: { s: "unk", t: "Not listed", n: "README documents three job boards; no employer ATS coverage is described." },
        noperi: { s: "unk", t: "Not listed", n: "README describes a Naukri API client." },
      },
    },
    {
      id: "apply",
      label: "Auto-apply vs reviewed",
      sub: "Who presses submit",
      cells: {
        co: { s: "part", t: "Reviewed; Naukri apply", n: "The employer-form filler leaves the form open and never submits. Naukri one-click apply is available and refused at the daily cap." },
        applycove: { s: "yes", t: "Auto-apply", n: "Publisher describes filling forms and submitting applications." },
        fastapply: { s: "yes", t: "Auto-pilot or co-pilot", n: "Co-pilot pauses for review; Auto-pilot can submit from preferences." },
        applyai: { s: "yes", t: "Auto-fill / auto-apply", n: "Publisher claims one-click auto-fill and auto-apply workflows." },
        myjobb: { s: "yes", t: "Auto-apply", n: "Publisher describes auto-apply on Indian portals and company career pages." },
        scout: { s: "yes", t: "Overnight plugin", n: "Publisher describes the plugin applying overnight to Greenhouse and Ashby." },
        jobauto: { s: "yes", t: "Easy Apply automation", n: "README describes Easy Apply / Quick Apply automation." },
        naukriupd: { s: "yes", t: "Dry-run default", n: "Runners fill the application but do not press Send until live mode is enabled." },
        noperi: { s: "yes", t: "One-click apply", n: "README lists one-click apply." },
      },
    },
    {
      id: "otp",
      label: "OTP / MFA handling",
      sub: "Second-factor flow",
      cells: {
        co: { s: "yes", t: "Naukri OTP flow", n: "Naukri login returns needsOtp and a code endpoint verifies it. A captcha or login wall hands control back to the user." },
        applycove: { s: "yes", t: "Pauses for OTP", n: "Publisher states it pauses when Naukri requests an OTP." },
        fastapply: { s: "unk", t: "Not listed", n: "No OTP or MFA handling was found in the public pages reviewed." },
        applyai: { s: "unk", t: "Not listed", n: "No OTP or MFA handling was found in the listing reviewed." },
        myjobb: { s: "unk", t: "Not listed", n: "No OTP or MFA handling was found in the public pages reviewed." },
        scout: { s: "part", t: "CAPTCHA handed back", n: "Publisher says CAPTCHA cases are handed back to the user rather than counted as applied." },
        jobauto: { s: "unk", t: "Not listed", n: "Credentials are configured through GitHub Secrets; OTP handling is not described." },
        naukriupd: { s: "yes", t: "Manual 2-step", n: "README describes a one-time visible sign-in where the user approves two-step verification." },
        noperi: { s: "yes", t: "OTP / MFA login", n: "README lists OTP / MFA login support." },
      },
    },
    {
      id: "live",
      label: "Live session / takeover",
      sub: "Watch and take control",
      cells: {
        co: { s: "yes", t: "Embedded browser", n: "A browser panel streams the page; a control switch makes every connector refuse to drive it until handed back." },
        applycove: { s: "yes", t: "Live view + takeover", n: "Publisher markets live session viewing and the ability to take over and resume." },
        fastapply: { s: "unk", t: "Not listed", n: "Live session viewing was not found in the public pages reviewed." },
        applyai: { s: "na", t: "Runs in your tab", n: "A browser extension operates in the tab the user already controls." },
        myjobb: { s: "unk", t: "Not listed", n: "Live session viewing was not found in the public pages reviewed." },
        scout: { s: "na", t: "Local CLI", n: "The plugin runs on the user's computer." },
        jobauto: { s: "na", t: "Scheduled job", n: "Runs as a scheduled GitHub Actions workflow." },
        naukriupd: { s: "part", t: "Visible Chrome", n: "Runs in a local Chrome window, but no in-app live panel is described." },
        noperi: { s: "na", t: "No browser", n: "API client without visible browser automation." },
      },
    },
    {
      id: "resume",
      label: "Resume tailoring",
      sub: "Rewrite for the role",
      cells: {
        co: { s: "yes", t: "With your AI key", n: "Resume tailoring calls a provider with a key you supply; the ATS keyword gap report runs without a model." },
        applycove: { s: "unk", t: "Not listed", n: "Resume tailoring was not found in the public pages reviewed." },
        fastapply: { s: "unk", t: "Not listed", n: "Resume tailoring was not found in the public pages reviewed." },
        applyai: { s: "unk", t: "Not listed", n: "The listing mentions answering questions from the resume, not rewriting it." },
        myjobb: { s: "yes", t: "Tailoring + ATS export", n: "Publisher lists resume tailoring and ATS-friendly exports." },
        scout: { s: "yes", t: "Paid sessions", n: "Publisher lists resume tailoring sessions at ₹299 each." },
        jobauto: { s: "unk", t: "Not listed", n: "Resume tailoring is not described in the README." },
        naukriupd: { s: "part", t: "Profile refresh", n: "An hourly function refreshes the Naukri profile; resume rewriting is not described." },
        noperi: { s: "part", t: "Profile updates", n: "README lists resume / profile updates." },
      },
    },
    {
      id: "screen",
      label: "Screening answers",
      sub: "CTC, notice, experience",
      cells: {
        co: { s: "yes", t: "Answer bank", n: "Onboarding collects CTC, notice period, authorisation and links; the form filler uses those answers." },
        applycove: { s: "yes", t: "CTC, notice period", n: "Publisher states it answers common screening questions such as expected CTC and notice period." },
        fastapply: { s: "unk", t: "Not listed", n: "Screening-question assistance was not found in the public pages reviewed." },
        applyai: { s: "yes", t: "From your resume", n: "Publisher claims it answers screening questions using the user's resume." },
        myjobb: { s: "unk", t: "Not listed", n: "Screening-question assistance was not found in the public pages reviewed." },
        scout: { s: "unk", t: "Not listed", n: "Screening-question assistance was not found in the public pages reviewed." },
        jobauto: { s: "unk", t: "Not listed", n: "Screening-question assistance is not described in the README." },
        naukriupd: { s: "unk", t: "Not listed", n: "Screening-question assistance is not described in the README." },
        noperi: { s: "yes", t: "Q&A support", n: "README lists question-answer support." },
      },
    },
    {
      id: "dupe",
      label: "Duplicate prevention",
      sub: "Before the next send",
      cells: {
        co: { s: "yes", t: "Audit + check", n: "A duplicate check runs before the next application, backed by the append-only audit log." },
        applycove: { s: "unk", t: "Not listed", n: "Duplicate prevention was not found in the public pages reviewed." },
        fastapply: { s: "unk", t: "Not listed", n: "Duplicate prevention was not found in the public pages reviewed." },
        applyai: { s: "unk", t: "Not listed", n: "Duplicate prevention was not found in the listing reviewed." },
        myjobb: { s: "unk", t: "Not listed", n: "Duplicate prevention was not found in the public pages reviewed." },
        scout: { s: "unk", t: "Not listed", n: "Duplicate prevention was not found in the public pages reviewed." },
        jobauto: { s: "yes", t: "SQLite", n: "README describes SQLite tracking to prevent duplicate applications." },
        naukriupd: { s: "unk", t: "Not listed", n: "Duplicate prevention is not described in the README." },
        noperi: { s: "yes", t: "SQLite / CSV", n: "README lists SQLite / CSV tracking." },
      },
    },
    {
      id: "log",
      label: "Application log",
      sub: "What was sent, where",
      cells: {
        co: { s: "yes", t: "Append-only JSONL", n: "Every send appends one row to data/audit.jsonl; the history cannot be quietly rewritten." },
        applycove: { s: "yes", t: "Logs applications", n: "Publisher states that it logs applications." },
        fastapply: { s: "unk", t: "Not listed", n: "A per-application log was not found in the public pages reviewed." },
        applyai: { s: "unk", t: "Not listed", n: "A per-application log was not found in the listing reviewed." },
        myjobb: { s: "unk", t: "Not listed", n: "A per-application log was not found in the public pages reviewed." },
        scout: { s: "unk", t: "Not listed", n: "A per-application log was not found in the public pages reviewed." },
        jobauto: { s: "yes", t: "SQLite / CSV", n: "README lists SQLite tracking and CSV exports." },
        naukriupd: { s: "unk", t: "Not listed", n: "A per-application log is not described in the README." },
        noperi: { s: "yes", t: "SQLite / CSV", n: "README lists SQLite / CSV tracking." },
      },
    },
    {
      id: "sched",
      label: "Scheduling",
      sub: "Runs without you",
      cells: {
        co: { s: "no", t: "No scheduler", n: "Discovery and applications run on demand; the repository contains no background scheduler." },
        applycove: { s: "yes", t: "Server-side", n: "Publisher describes scheduled sessions that run with the laptop closed." },
        fastapply: { s: "yes", t: "Server-side", n: "Publisher says Apply for Me runs on its servers on paid plans." },
        applyai: { s: "unk", t: "Not listed", n: "Scheduling was not found in the listing reviewed." },
        myjobb: { s: "yes", t: "Daily shortlists", n: "Publisher describes daily job shortlists." },
        scout: { s: "yes", t: "Overnight", n: "Publisher describes the plugin applying overnight." },
        jobauto: { s: "yes", t: "3× daily Actions", n: "README describes scheduled runs three times daily through GitHub Actions." },
        naukriupd: { s: "yes", t: "Hourly refresh", n: "README describes a separate hourly Naukri profile-refresh function." },
        noperi: { s: "yes", t: "Scheduled runs", n: "README lists scheduled runs." },
      },
    },
    {
      id: "exec",
      label: "Execution location",
      sub: "Where the work happens",
      cells: {
        co: { s: "info", t: "Your machine", n: "The app, audit log and browser profile live in the folder you cloned." },
        applycove: { s: "info", t: "Their cloud", n: "Scheduled sessions run on the publisher's servers." },
        fastapply: { s: "info", t: "Their cloud", n: "Apply for Me runs on the publisher's servers." },
        applyai: { s: "info", t: "Your browser", n: "A Chrome extension runs in the user's browser." },
        myjobb: { s: "info", t: "Their cloud", n: "Hosted service." },
        scout: { s: "info", t: "Your machine + web", n: "Web discovery plus a local CLI plugin." },
        jobauto: { s: "info", t: "GitHub Actions", n: "Scheduled workflow on GitHub's runners." },
        naukriupd: { s: "info", t: "Your Chrome", n: "Local Chrome execution using Playwright." },
        noperi: { s: "info", t: "Your machine", n: "Python API client run locally." },
      },
    },
    {
      id: "price",
      label: "Price",
      sub: "Public pricing",
      cells: {
        co: { s: "info", t: "Free; BYO AI key", n: "No subscription or per-application fee for the repository's features. Resume tailoring is paid to your AI provider." },
        applycove: { s: "info", t: "5/day free; ₹349+/mo", n: "Publisher lists a free allowance of five applications per day and paid plans from ₹349/month." },
        fastapply: { s: "info", t: "7-day trial; ₹599+/mo", n: "Publisher lists a seven-day trial with up to five jobs per day and India plans from ₹599/month." },
        applyai: { s: "info", t: "Not established", n: "A public subscription price was not established from the listing reviewed." },
        myjobb: { s: "info", t: "20 free once; ₹499+/mo", n: "Publisher states 20 free applications once per new account, with plans from ₹499/month." },
        scout: { s: "info", t: "Free discovery; ₹599/mo + AI host", n: "Scout Web discovery is free; the CLI plugin is ₹599/month and needs a supported AI host subscription." },
        jobauto: { s: "info", t: "Free; self-hosted", n: "A public repository; GitHub Actions usage depends on the user's account and conditions." },
        naukriupd: { s: "info", t: "Free; self-hosted", n: "A public repository run on the user's machine." },
        noperi: { s: "info", t: "Free; self-hosted", n: "A public repository run on the user's machine." },
      },
    },
    {
      id: "oss",
      label: "Open source",
      sub: "Source and licence",
      cells: {
        co: { s: "yes", t: "AGPL-3.0", n: "Public repository licensed AGPL-3.0-or-later." },
        applycove: { s: "unk", t: "No public repo", n: "No public source repository was found in the pages reviewed." },
        fastapply: { s: "unk", t: "No public repo", n: "No public source repository was found in the pages reviewed." },
        applyai: { s: "unk", t: "No public repo", n: "No public source repository was found in the listing reviewed." },
        myjobb: { s: "unk", t: "No public repo", n: "No public source repository was found in the pages reviewed." },
        scout: { s: "unk", t: "No public repo", n: "No public source repository was found in the pages reviewed." },
        jobauto: { s: "part", t: "Public repo", n: "Public GitHub repository; a licence was not established from the README reviewed." },
        naukriupd: { s: "part", t: "Public repo", n: "Public GitHub repository; a licence was not established from the README reviewed." },
        noperi: { s: "part", t: "Public repo", n: "Public GitHub repository; a licence was not established from the README reviewed." },
      },
    },
  ];

  var SYM = {
    yes: "✓",
    part: "◐",
    unk: "?",
    no: "—",
    na: "N/A",
    info: "·",
  };

  function make(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function build() {
    var table = document.getElementById("matrix");
    if (!table) return;

    var caption = table.querySelector("caption");
    if (caption) {
      caption.textContent =
        "Comparison of Career Ops India with eight public job-search tools across " +
        ROWS.length +
        " capabilities, checked 21 November 2026.";
    }

    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");

    var corner = document.createElement("th");
    corner.scope = "col";
    corner.appendChild(make("span", "th-name", "Capability"));
    corner.appendChild(make("span", "th-tag", ROWS.length + " rows / 9 tools"));
    headRow.appendChild(corner);

    TOOLS.forEach(function (tool) {
      var th = document.createElement("th");
      th.scope = "col";
      if (tool.ours) th.className = "co";
      th.appendChild(make("span", "th-name", tool.name));
      th.appendChild(make("span", "th-tag", tool.tag));
      headRow.appendChild(th);
    });

    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");

    ROWS.forEach(function (row) {
      var tr = document.createElement("tr");

      var th = document.createElement("th");
      th.scope = "row";
      th.appendChild(document.createTextNode(row.label));
      th.appendChild(make("span", "row-sub", row.sub));
      tr.appendChild(th);

      TOOLS.forEach(function (tool) {
        var cell = row.cells[tool.id];
        var td = document.createElement("td");
        if (tool.ours) td.className = "co";
        td.tabIndex = 0;
        td.dataset.tool = tool.id;
        td.dataset.row = row.id;
        td.dataset.note = cell.n;
        td.dataset.url = tool.url;

        var wrap = make("span", "cell");
        var sym = make("b", "sym " + cell.s, SYM[cell.s]);
        sym.setAttribute("aria-hidden", "true");
        wrap.appendChild(sym);
        wrap.appendChild(make("span", null, cell.t));
        td.appendChild(wrap);

        td.setAttribute(
          "aria-label",
          tool.name + ", " + row.label + ": " + cell.t + ". " + cell.n
        );

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);

    wire(table);
  }

  function wire(table) {
    var scroll = document.getElementById("matrixScroll");
    var shell = scroll ? scroll.closest(".matrix-shell") : null;
    var progress = document.getElementById("matrixProgress");
    var detail = document.getElementById("matrixDetail");
    var jump = document.getElementById("matrixJump");
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var hint = detail ? detail.innerHTML : "";

    function showDetail(td) {
      if (!detail) return;
      var tool = null;
      var row = null;
      for (var i = 0; i < TOOLS.length; i++) {
        if (TOOLS[i].id === td.dataset.tool) tool = TOOLS[i];
      }
      for (var j = 0; j < ROWS.length; j++) {
        if (ROWS[j].id === td.dataset.row) row = ROWS[j];
      }
      if (!tool || !row) return;

      detail.textContent = "";

      var line = make("div", "md-tool");
      line.appendChild(make("b", null, tool.name));
      line.appendChild(make("span", null, "/"));
      line.appendChild(make("span", null, row.label));
      detail.appendChild(line);
      detail.appendChild(make("p", null, td.dataset.note));

      var link = make("a", null, "Source ↗");
      link.href = td.dataset.url;
      link.target = "_blank";
      link.rel = "noopener";
      detail.appendChild(link);
    }

    table.addEventListener("mouseover", function (e) {
      var td = e.target.closest("td[data-note]");
      if (td) showDetail(td);
    });

    table.addEventListener("focusin", function (e) {
      var td = e.target.closest("td[data-note]");
      if (td) showDetail(td);
    });

    table.addEventListener("focusout", function (e) {
      if (!table.contains(e.relatedTarget) && detail) {
        detail.innerHTML = hint;
      }
    });

    if (!scroll) return;

    var down = false;
    var startX = 0;
    var startLeft = 0;
    var moved = 0;

    scroll.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      down = true;
      startX = e.clientX;
      startLeft = scroll.scrollLeft;
      moved = 0;
      scroll.classList.add("is-dragging");
      try {
        scroll.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
    });

    scroll.addEventListener("pointermove", function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > moved) moved = Math.abs(dx);
      if (moved > 4) scroll.scrollLeft = startLeft - dx;
    });

    function endDrag(e) {
      if (!down) return;
      down = false;
      scroll.classList.remove("is-dragging");
      try {
        scroll.releasePointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
    }

    scroll.addEventListener("pointerup", endDrag);
    scroll.addEventListener("pointercancel", endDrag);

    scroll.addEventListener(
      "wheel",
      function (e) {
        if (e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          scroll.scrollLeft += e.deltaY;
        }
      },
      { passive: false }
    );

    scroll.addEventListener("keydown", function (e) {
      var step = Math.max(180, scroll.clientWidth * 0.6);
      if (e.key === "ArrowRight") {
        e.preventDefault();
        scroll.scrollLeft += step;
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        scroll.scrollLeft -= step;
      } else if (e.key === "Home") {
        e.preventDefault();
        scroll.scrollLeft = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        scroll.scrollLeft = scroll.scrollWidth;
      }
    });

    function update() {
      var max = scroll.scrollWidth - scroll.clientWidth;
      var ratio = max > 0 ? scroll.scrollLeft / max : 0;
      if (progress) progress.style.width = (ratio * 100).toFixed(2) + "%";
      if (shell) shell.classList.toggle("at-end", ratio > 0.985);
    }

    scroll.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    if (jump) {
      jump.addEventListener("click", function () {
        scroll.scrollTo({
          left: scroll.scrollWidth,
          behavior: reduce ? "auto" : "smooth",
        });
      });
    }

    update();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
