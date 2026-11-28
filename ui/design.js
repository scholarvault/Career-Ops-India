/* Career-Ops India — shared UI helpers.
 *
 * Small on purpose: toasts, reveal-on-enter, number count-up, score rings,
 * async button states and a dismissible menu. No framework, no build step.
 */
(function () {
  "use strict";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- theme: dark by default, light on request ---------------- */

  const THEME_KEY = "co.theme";
  function savedTheme() {
    try { return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark"; } catch { return "dark"; }
  }
  function applyTheme(t) {
    if (t === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
  }
  applyTheme(savedTheme());

  const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  function themeButton() {
    if (document.querySelector(".fx-theme")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "fx-theme";
    const paint = () => {
      const light = savedTheme() === "light";
      b.innerHTML = light ? MOON : SUN;
      b.setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
      b.title = b.getAttribute("aria-label");
    };
    b.addEventListener("click", () => {
      const next = savedTheme() === "light" ? "dark" : "light";
      try { localStorage.setItem(THEME_KEY, next); } catch {}
      /* The swap itself is instant: every element's own colour transition is
         switched off for that one frame. A 320 ms fade on every element used
         to lag on Find, where hundreds of cards each animated their colours.
         Where the browser can, one snapshot cross-fades instead: a single
         composited layer, however long the page. */
      const swap = () => {
        const root = document.documentElement;
        root.classList.add("fx-swapping");
        applyTheme(next);
        paint();
        requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("fx-swapping")));
      };
      if (document.startViewTransition && !reduce) document.startViewTransition(swap);
      else swap();
    });
    paint();
    /* Sit in the header with the other actions; float only on a page without one. */
    document.body.appendChild(b);
    /* A header can be hidden at load (the onboarding intro), so keep trying for a few seconds. */
    let tries = 0;
    const timer = setInterval(() => { if (dockTheme(b) || ++tries > 20) clearInterval(timer); }, 400);
    if (dockTheme(b)) clearInterval(timer);
  }
  function dockTheme(b) {
    const shown = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length > 0);
    const group = shown(".cx-right, .appbar-right, .head-right, header .acts");
    const bar = group || shown("html[data-page='index'] .side, header, .topbar");
    if (!bar) return false;
    b.classList.add("fx-theme--inline");
    bar.appendChild(b);
    if (!group) {
      const gap = bar.getBoundingClientRect().right - b.getBoundingClientRect().right;
      if (gap > 48) b.style.marginLeft = "auto";
    }
    return true;
  }

  /* ---------------- the step bar: one journey, top of every app page ---------------- */

  /* The product is three places (ADR-030, amended). Find: search and pick
     postings. Queue: the picked jobs, a resume for each, then auto apply.
     Results: what was sent and what came back. Setup runs once (index.html,
     its own stepper, no bar); after it, your profile is the avatar's menu and
     Settings → Profile, and Sources sit behind the gear. The browser
     hand-off keeps its own header. */
  const STEPS = [
    { id: "find", label: "Find", href: "workspace.html#jobs" },
    { id: "queue", label: "Queue", href: "console.html#step3" },
    { id: "results", label: "Results", href: "workspace.html#track" },
  ];
  const page = (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "") || "index";
  document.documentElement.dataset.page = page;

  function currentStep() {
    const h = String(location.hash || "").toLowerCase();
    if (page === "index" || page === "onboard" || page === "map") return "you";
    if (page === "settings" || page === "naukri" || page === "browser") return "sources";
    /* "you" has no tab: the avatar shows it */
    if (page === "apply") return "queue";
    if (page === "workspace") return h === "#track" || h === "#improve" ? "results" : "find";
    if (page === "console") {
      const n = Number((h.match(/^#step([1-7])$/) || [])[1] || 0);
      if (n === 1) return "sources";
      if (n === 2) return "find";
      if (n >= 6) return "results";
      return "queue";
    }
    return "";
  }

  function stepBar() {
    if (page === "index" || page === "browser" || document.querySelector(".cx-bar")) return;
    const nav = document.createElement("nav");
    nav.className = "cx-bar";
    nav.setAttribute("aria-label", "Steps");
    const sub = !STEPS.some((s) => s.id === currentStep());
    nav.innerHTML =
      '<div class="cx-lead">' + (sub ? '<button class="cx-back" type="button" aria-label="Back" title="Back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' : "") +
      '<a class="cx-brand" href="workspace.html#jobs"><i class="cx-dot" aria-hidden="true"></i><b>career</b><span>ops india</span></a>'  + '</div>' +
      '<div class="cx-seg"><i class="cx-pill" aria-hidden="true"></i>' +
      STEPS.map((s) => '<a class="cx-step" data-step="' + s.id + '" href="' + s.href + '">' + s.label + (s.id === "queue" ? '<span class="cx-count" id="cxCount" hidden></span>' : "") + "</a>").join("") +
      "</div>" +
      '<div class="cx-right">' +
      '<button class="cx-icon cx-ib" id="cxInbox" type="button" aria-label="Inbox" aria-haspopup="dialog" aria-expanded="false" title="Inbox"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg><span class="cx-ib-n" hidden></span></button>' +
      '<button class="cx-me" id="cxMe" type="button" aria-haspopup="menu" title="You: profile, photo and master resume"><i class="cx-me-av" aria-hidden="true"></i><span class="sr-only">Your profile</span></button>' +
      '<a class="cx-icon cx-gear" href="settings.html" aria-label="Sources and settings" title="Sources and settings"' + (currentStep() === "sources" ? ' aria-current="page"' : "") + '><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></a>' +
      "</div>";
    document.body.prepend(nav);
    document.documentElement.classList.add("cx-on");
    if (sub) {
      nav.classList.add("cx-bar--sub");
      /* back to where you came from in this app, else to Find */
      nav.querySelector(".cx-back").addEventListener("click", () => {
        let same = false;
        try { same = Boolean(document.referrer) && new URL(document.referrer).origin === location.origin && !/\/(index\.html)?(\?|#|$)/.test(new URL(document.referrer).pathname + "#"); } catch {}
        if (same && history.length > 1) history.back();
        else location.href = "workspace.html#jobs";
      });
    }

    const seg = nav.querySelector(".cx-seg");
    const pill = nav.querySelector(".cx-pill");
    const items = [...nav.querySelectorAll(".cx-step")];
    const place = (el, stretch) => {
      if (!el) { pill.style.width = "0"; return; }
      pill.style.left = el.offsetLeft + "px";
      pill.style.width = el.offsetWidth + "px";
      if (stretch && !reduce) {
        pill.classList.add("is-stretch");
        setTimeout(() => pill.classList.remove("is-stretch"), 180);
      }
    };
    const sync = (stretch) => {
      const id = currentStep();
      let on = null;
      for (const a of items) {
        const hit = a.dataset.step === id;
        if (hit) { a.setAttribute("aria-current", "step"); on = a; } else a.removeAttribute("aria-current");
      }
      place(on, stretch);
      if (on && seg.scrollWidth > seg.clientWidth) on.scrollIntoView({ block: "nearest", inline: "center" });
    };
    /* the pill follows the pointer, then settles back on the current step */
    items.forEach((a) => a.addEventListener("pointerenter", () => place(a, true)));
    seg.addEventListener("pointerleave", () => sync(true));
    /* a same-page step (workspace ⇄ track, console steps) switches in place */
    items.forEach((a) => a.addEventListener("click", (e) => {
      const [file, hash] = a.getAttribute("href").split("#");
      if (file.replace(/\.html$/, "") === page && hash) {
        e.preventDefault();
        location.hash = hash;
      }
    }));
    addEventListener("hashchange", () => sync(true));
    addEventListener("co:step", () => sync(true));
    addEventListener("resize", () => sync(false));
    /* first placement jumps; only later moves slide */
    const settle = () => {
      pill.style.transition = "none";
      sync(false);
      void pill.offsetWidth;
      pill.style.transition = "";
    };
    settle();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);

    /* how many jobs are in the queue */
    const countEl = nav.querySelector("#cxCount");
    const paintCount = () => {
      let n = 0;
      try { n = (JSON.parse(localStorage.getItem("co.console.picks") || "[]") || []).length; } catch {}
      countEl.hidden = !n;
      countEl.textContent = String(n);
      sync(false);
    };
    paintCount();
    addEventListener("co:applylist", paintCount);
    addEventListener("storage", (e) => { if (e.key === "co.console.picks") paintCount(); });

    inbox.mount(nav.querySelector("#cxInbox"));
    meMenu(nav.querySelector("#cxMe"));
  }

  /* ---------------- you: the avatar, and every way to change your profile ----------------
     One menu from every page. Edits open the one setup step they belong to
     (index.html#edit-N), never setup from the start. The photo can come from
     the master resume; it is framed in the cropper and stays on this computer. */
  function meMenu(btn) {
    const av = btn.querySelector(".cx-me-av");
    let prof = {}, photo = null;
    const initialsOf = (t) => {
      const w = String(t || "").replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter(Boolean);
      return w.length ? (w[0][0] + (w[1] ? w[1][0] : "")).toUpperCase() : "You";
    };
    const paint = () => {
      const name = (prof.details && (prof.details.name || prof.details.fullName)) || "";
      av.textContent = initialsOf(name || prof.role);
      paintAvatars();
    };
    fetch("/api/profile").then((r) => (r.ok ? r.json() : {})).then((p) => { prof = p || {}; paint(); }).catch(paint);
    fetch("/api/resume/photo").then((r) => (r.status === 200 ? r.blob() : null)).then((b) => { photo = b; }).catch(() => {});
    btn.addEventListener("click", () => {
      const has = Boolean(savedAvatar());
      menu(btn, [
        { label: esc(prof.role || "Set your target role"), note: "Profile: role, city, CTC, notice, answers", href: "settings.html#profile" },
        { label: "Master resume", note: "Replace it or read it again", href: "index.html#edit-3" },
        { label: "Career map", note: "Roles you could move into", href: "map.html" },
        { sep: true },
        ...(photo ? [{ label: "Use the photo from your resume", onClick: () => openCropper(btn, new File([photo], "resume-photo.jpg", { type: "image/jpeg" })) }] : []),
        { label: has ? "Change photo" : "Add a photo", onClick: () => pickPhoto(btn) },
        { sep: true },
        { label: "Sources and settings", href: "settings.html" },
        /* on a phone the theme button leaves the bar; it lives here */
        ...(innerWidth <= 560 ? [{ label: savedTheme() === "light" ? "Dark theme" : "Light theme", onClick: () => document.querySelector(".fx-theme")?.click() }] : []),
      ]);
    });
  }

  /* ---------------- the inbox: one bell for what needs you and what is new ----------------
     "Needs you" (amber) is the apply queue waiting on an OTP, a captcha or an
     answer, read from the server. The rest is news a page provides: Find
     gives postings you marked Ready and deadlines. One place, one badge. */
  const inbox = (() => {
    let btn = null, box = null, need = [], provider = null;
    const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const news = () => { try { return (provider && provider.items()) || []; } catch { return []; } };
    function paint() {
      if (!btn) return;
      const n = need.length + news().length;
      const badge = btn.querySelector(".cx-ib-n");
      badge.hidden = n === 0;
      badge.textContent = n > 9 ? "9+" : String(n);
      btn.classList.toggle("is-need", need.length > 0);
      btn.setAttribute("aria-label", n ? `Inbox, ${n} new` : "Inbox");
      if (box && !box.hidden) render();
    }
    function render() {
      const items = news();
      const row = (it, amber) => `<button class="cx-ib-item${amber ? " is-need" : ""}" type="button" data-id="${esc(it.id)}"><i></i><span><b>${esc(it.title)}</b><small>${esc(it.sub || "")}</small></span></button>`;
      let html = `<div class="cx-ib-h"><b>Inbox</b>${items.length && provider && provider.clear ? '<button class="cx-ib-clear" type="button">Mark all read</button>' : ""}</div>`;
      if (need.length) html += `<div class="cx-ib-sec">Needs you</div>` + need.map((x) => row(x, true)).join("");
      if (items.length) html += `<div class="cx-ib-sec">New</div>` + items.slice(0, 20).map((x) => row(x, false)).join("");
      if (!need.length && !items.length) html += `<div class="cx-ib-empty">Nothing needs you. An OTP, a captcha or a question from auto apply shows up here, and so do postings you marked Ready.</div>`;
      box.innerHTML = html;
      box.querySelectorAll(".cx-ib-item").forEach((el) => el.addEventListener("click", () => {
        const id = el.dataset.id;
        const hit = need.find((x) => x.id === id);
        close();
        if (hit) { location.href = hit.href; return; }
        if (provider && provider.open) provider.open(id);
      }));
      const c = box.querySelector(".cx-ib-clear");
      if (c) c.addEventListener("click", () => { provider.clear(); paint(); close(); });
    }
    function place() {
      const r = btn.getBoundingClientRect();
      box.style.top = Math.round(r.bottom + 8) + "px";
      box.style.right = Math.max(8, Math.round(innerWidth - r.right)) + "px";
    }
    function open() { render(); box.hidden = false; place(); btn.setAttribute("aria-expanded", "true"); }
    function close() { if (!box || box.hidden) return; box.hidden = true; btn.setAttribute("aria-expanded", "false"); }
    async function poll() {
      try {
        const d = await fetch("/api/autoapply/status").then((r) => (r.ok ? r.json() : null));
        const st = d && d.state;
        const next = [];
        if (st && st.ask) next.push({ id: "need-ask", title: "Auto apply needs you", sub: String(st.ask.question || st.ask.label || st.ask.message || "An OTP, a captcha or an answer").slice(0, 120), href: "console.html#step5" });
        else if (st && st.paused) next.push({ id: "need-paused", title: "Auto apply is paused", sub: "Open the queue to carry on.", href: "console.html#step5" });
        need = next;
      } catch {}
      paint();
    }
    return {
      mount(b) {
        btn = b;
        box = document.createElement("div");
        box.className = "cx-ibox";
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-label", "Inbox");
        box.hidden = true;
        document.body.appendChild(box);
        btn.addEventListener("click", (e) => { e.stopPropagation(); box.hidden ? open() : close(); });
        document.addEventListener("click", (e) => { if (!box.hidden && !box.contains(e.target) && !btn.contains(e.target)) close(); });
        addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
        addEventListener("resize", () => { if (!box.hidden) place(); });
        poll();
        setInterval(poll, 20000);
      },
      /** A page's news: { items(): [{id,title,sub}], open(id), clear() } */
      provide(p) { provider = p; paint(); },
      refresh: paint,
    };
  })();

  /* ---------------- the configured AI provider, never a hard-coded name ---------------- */

  let aiState = { on: false, name: "" };
  const aiReady = fetch("/api/settings")
    .then((r) => (r.ok ? r.json() : null))
    .then((st) => {
      const p = st && st.providers && st.providers[st.provider];
      const on = Boolean(st && st.hasKey && st.provider && st.provider !== "none");
      aiState = { on, name: on ? (p && p.label) || st.provider : "", model: st && st.model };
      return aiState;
    })
    .catch(() => aiState);
  /** "OpenRouter", "Sarvam", … or "the AI provider" before it is known or when none is set. */
  function aiName() { return aiState.name || "the AI provider"; }
  /** <span data-ai="{ai} tailors." data-ai-off="Needs an AI key."> */
  function paintAi(root) {
    aiReady.then((ai) => {
      (root || document).querySelectorAll("[data-ai]").forEach((el) => {
        const t = ai.on ? el.dataset.ai.replace("{ai}", ai.name) : el.dataset.aiOff || "";
        if (el.textContent !== t) el.textContent = t;
        el.hidden = !t;
      });
    });
  }

  /* ---------------- toasts ---------------- */

  let wrap = null;
  function toastHost() {
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "toast-wrap";
      wrap.setAttribute("role", "status");
      wrap.setAttribute("aria-live", "polite");
      document.body.appendChild(wrap);
    }
    return wrap;
  }

  /**
   * toast("Saved", { kind: "ok", title: "Resume updated", ms: 4000 })
   * kind: info | ok | bad | warn
   */
  function toast(message, opts) {
    const o = opts || {};
    const kind = o.kind || "info";
    const el = document.createElement("div");
    el.className = "toast toast--" + kind;
    el.innerHTML =
      '<div class="t-body">' +
      (o.title ? '<div class="t-title"></div>' : "") +
      '<div class="t-msg"></div>' +
      "</div>" +
      '<button class="t-x" type="button" aria-label="Dismiss">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
      "</button>";
    if (o.title) el.querySelector(".t-title").textContent = o.title;
    el.querySelector(".t-msg").textContent = message;
    if (o.action && o.action.label) {
      const a = document.createElement(o.action.href ? "a" : "button");
      a.className = "t-action";
      if (o.action.href) a.href = o.action.href;
      else a.type = "button";
      a.textContent = o.action.label;
      a.addEventListener("click", () => {
        if (o.action.onClick) o.action.onClick();
        close();
      });
      el.querySelector(".t-body").appendChild(a);
    }
    toastHost().appendChild(el);
    restack();

    let timer = null;
    const close = () => {
      if (timer) clearTimeout(timer);
      el.classList.add("out");
      const gone = () => { el.remove(); restack(); };
      el.addEventListener("animationend", gone, { once: true });
      setTimeout(gone, 400);
    };
    el.querySelector(".t-x").addEventListener("click", close);
    if (o.ms !== 0) timer = setTimeout(close, o.ms || 4500);
    return { close, el };
  }

  /* Older toasts step back behind the newest; three rims peek out. Hover fans them. */
  function restack() {
    if (!wrap) return;
    const live = [...wrap.querySelectorAll(".toast:not(.out)")];
    live.forEach((t, i) => {
      const k = live.length - 1 - i;
      t.style.setProperty("--k", String(Math.min(k, 3)));
      t.toggleAttribute("data-buried", k > 2);
    });
  }

  /**
   * toastPromise(promise, { loading, success, error })
   * One toast from start to finish: a spinner, then its words change and a
   * check draws (or it shakes on failure).
   */
  function toastPromise(p, labels) {
    const l = labels || {};
    const t = toast(l.loading || "Working…", { kind: "info", ms: 0 });
    t.el.classList.add("toast--busy");
    const msg = t.el.querySelector(".t-msg");
    return Promise.resolve(p).then(
      (v) => {
        t.el.classList.remove("toast--busy");
        t.el.classList.replace("toast--info", "toast--ok");
        msg.textContent = typeof l.success === "function" ? l.success(v) : l.success || "Done";
        setTimeout(t.close, 3200);
        return v;
      },
      (e) => {
        t.el.classList.remove("toast--busy");
        t.el.classList.replace("toast--info", "toast--bad");
        t.el.classList.add("sb-shake");
        msg.textContent = typeof l.error === "function" ? l.error(e) : l.error || (e && e.message) || "Failed";
        setTimeout(t.close, 5200);
        throw e;
      }
    );
  }

  /* ---------------- reveal on enter ---------------- */

  let io = null;
  function reveal(root) {
    const nodes = (root || document).querySelectorAll(".reveal:not(.in)");
    if (!nodes.length) return;
    if (reduce || !("IntersectionObserver" in window)) {
      nodes.forEach((n) => n.classList.add("in"));
      return;
    }
    if (!io) {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              io.unobserve(e.target);
            }
          }
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
      );
    }
    nodes.forEach((n) => io.observe(n));
  }

  /* ---------------- count-up ---------------- */

  function count(el, to, opts) {
    const o = opts || {};
    const decimals = o.decimals == null ? 0 : o.decimals;
    const ms = o.ms || 800;
    const from = Number(o.from || 0);
    if (reduce) {
      el.textContent = to.toFixed(decimals);
      return;
    }
    const t0 = performance.now();
    function frame(t) {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (from + (to - from) * eased).toFixed(decimals);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- score ring ---------------- */

  /**
   * ring(el, 68.1) — el is the .ring container; draws the arc and counts the label.
   * The SVG is built here so every page gets the same geometry.
   */
  function ring(el, value, opts) {
    const o = opts || {};
    const size = o.size || 64;
    const stroke = o.stroke || 6;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    const band = pct >= 75 ? "hi" : pct >= 60 ? "mid" : "lo";

    el.classList.add("ring");
    el.dataset.band = band;
    el.style.width = size + "px";
    el.style.height = size + "px";
    el.innerHTML =
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + " " + size + '" aria-hidden="true">' +
      '<circle class="ring-track" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke-width="' + stroke + '"/>' +
      '<circle class="ring-fill" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke-width="' + stroke + '" ' +
      'stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + c.toFixed(1) + '"/>' +
      "</svg>" +
      '<span class="ring-label" style="font-size:' + Math.round(size * 0.27) + 'px"></span>';

    const fill = el.querySelector(".ring-fill");
    const label = el.querySelector(".ring-label");
    requestAnimationFrame(() => {
      fill.style.strokeDashoffset = (c * (1 - pct / 100)).toFixed(1);
    });
    roll(label, pct, { decimals: 1 });
    el.setAttribute("aria-label", "Match score " + pct.toFixed(1) + " out of 100");
  }

  /* ---------------- number roll ---------------- */

  /**
   * roll(el, 81.4, { decimals: 1, suffix: "%" })
   * Each digit is a column that rolls to its new value; symbols stay still.
   */
  function roll(el, value, opts) {
    const o = opts || {};
    const n = Number(value) || 0;
    const text = (o.prefix || "") + (o.format ? o.format(n) : n.toFixed(o.decimals == null ? 0 : o.decimals)) + (o.suffix || "");
    el.setAttribute("aria-label", text);
    if (reduce) { el.textContent = text; return; }
    const prev = (el.dataset.roll || "").split("");
    el.dataset.roll = text;
    el.classList.add("nr");
    el.innerHTML = "";
    const chars = text.split("");
    const cols = [];
    chars.forEach((c, i) => {
      if (!/\d/.test(c)) {
        const s = document.createElement("span");
        s.className = "nr-sym";
        s.setAttribute("aria-hidden", "true");
        s.textContent = c;
        el.appendChild(s);
        return;
      }
      const from = prev[prev.length - (chars.length - i)];
      const col = document.createElement("span");
      col.className = "nr-col";
      col.setAttribute("aria-hidden", "true");
      const strip = document.createElement("span");
      strip.className = "nr-strip";
      strip.innerHTML = "0123456789".split("").map((d) => "<span>" + d + "</span>").join("");
      strip.style.transform = "translateY(" + -(/\d/.test(from || "") ? Number(from) : 0) * 10 + "%)";
      col.appendChild(strip);
      el.appendChild(col);
      cols.push([strip, Number(c)]);
    });
    void el.offsetWidth;
    requestAnimationFrame(() => cols.forEach(([s, d]) => { s.style.transform = "translateY(" + -d * 10 + "%)"; }));
  }

  /* ---------------- status button ---------------- */

  const CHECK = '<svg class="cx-check" viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  /* Ease a button's width to fit new content, so nothing around it jumps. */
  function morph(btn, html) {
    const from = btn.offsetWidth;
    btn.style.width = "";
    btn.innerHTML = html;
    const to = btn.offsetWidth;
    if (reduce || !from || from === to) return;
    btn.style.width = from + "px";
    void btn.offsetWidth;
    btn.style.width = to + "px";
    clearTimeout(btn._mt);
    btn._mt = setTimeout(() => { btn.style.width = ""; }, 360);
  }

  /**
   * withButton(btn, fn, { loading, success, error })
   * One motion per change: a spinner opens beside the label, a check draws on
   * success, a small shake on failure; the width eases to each label.
   */
  async function withButton(btn, fn, labels) {
    const l = labels || {};
    if (btn.dataset.state === "loading") return;
    const original = btn.innerHTML;
    const label = (t) => '<span class="btn-label">' + esc(t) + "</span>";
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.dataset.state = "loading";
    morph(btn, '<span class="sb-mark"><span class="spinner" aria-hidden="true"></span></span>' + label(l.loading || "Working…"));
    try {
      const out = await fn();
      btn.dataset.state = "success";
      morph(btn, '<span class="sb-mark">' + CHECK + "</span>" + label(l.success || "Done"));
      await new Promise((r) => setTimeout(r, 1100));
      return out;
    } catch (e) {
      btn.dataset.state = "error";
      morph(btn, label(l.error || "Try again"));
      btn.classList.remove("sb-shake"); void btn.offsetWidth; btn.classList.add("sb-shake");
      await new Promise((r) => setTimeout(r, 1300));
      throw e;
    } finally {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.dataset.state = "";
      btn.classList.remove("sb-shake");
      morph(btn, original);
    }
  }

  /* ---------------- progress ---------------- */

  /**
   * const p = progress(el, { label: "Tailoring", doneLabel: "Tailored" });
   * p.set(40); p.set(null) for unknown length; p.set(100) turns green and draws
   * a check; p.error("Stopped at 3 of 10") turns the fill red where it stopped.
   */
  function progress(el, opts) {
    const o = opts || {};
    el.classList.add("cx-prog");
    el.innerHTML =
      '<div class="pg-head"><span class="pg-label"></span><span class="pg-val"></span></div>' +
      '<div class="pg-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></div>';
    const lab = el.querySelector(".pg-label");
    const val = el.querySelector(".pg-val");
    const track = el.querySelector(".pg-track");
    const fill = track.querySelector("i");
    lab.textContent = o.label || "";
    const api = {
      set(v) {
        delete el.dataset.error;
        if (v == null) {
          el.dataset.unknown = "";
          track.removeAttribute("aria-valuenow");
          val.textContent = "";
          return api;
        }
        delete el.dataset.unknown;
        const pct = Math.max(0, Math.min(100, Number(v) || 0));
        fill.style.transform = "scaleX(" + pct / 100 + ")";
        track.setAttribute("aria-valuenow", String(Math.round(pct)));
        if (pct >= 100) {
          el.dataset.done = "";
          lab.textContent = o.doneLabel || o.label || "Done";
          val.innerHTML = CHECK;
        } else {
          delete el.dataset.done;
          lab.textContent = o.label || "";
          roll(val, Math.round(pct), { suffix: "%" });
        }
        return api;
      },
      error(msg) {
        el.dataset.error = "";
        if (msg) lab.textContent = msg;
        return api;
      },
    };
    return api.set(o.value == null ? null : o.value);
  }

  /* ---------------- one-time code ---------------- */

  /**
   * codeState(otpEl, "checking" | "wrong" | "verified" | "")
   * wrong: the row shakes red, then the boxes clear from the right.
   * verified: the boxes melt into one pill with a check.
   */
  function codeState(otp, state) {
    if (!otp) return;
    otp.dataset.code = state || "";
    if (state === "wrong") {
      setTimeout(() => {
        let v = String(otp.value || "");
        const step = () => {
          v = v.slice(0, -1);
          try { otp.value = v; } catch {}
          if (v.length) setTimeout(step, 45);
          else { otp.dataset.code = ""; otp.focus && otp.focus(); }
        };
        if (v.length) step(); else otp.dataset.code = "";
      }, 520);
    }
  }

  /** resendTimer(btn, 30): "Resend in 0:30" counts down, then the button wakes. */
  function resendTimer(btn, seconds) {
    if (!btn) return;
    clearInterval(btn._rt);
    if (!btn.dataset.label) btn.dataset.label = btn.textContent.trim() || "Resend";
    let left = Math.max(0, seconds | 0);
    const paint = () => {
      const t = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
      btn.disabled = left > 0;
      btn.innerHTML = left > 0 ? 'Resend in <span class="nr-host"></span>' : esc(btn.dataset.label);
      const host = btn.querySelector(".nr-host");
      if (host) host.textContent = t;
    };
    paint();
    btn._rt = setInterval(() => {
      left -= 1;
      paint();
      if (left <= 0) clearInterval(btn._rt);
    }, 1000);
  }

  /* ---------------- thinking indicator ---------------- */

  /**
   * const t = thinking(el, "Tailoring 10 resumes"); … t.done("Tailored in");
   * An orbit mark, a light sweeping the label, and seconds that roll up.
   */
  function thinking(el, label) {
    el.classList.add("cx-think");
    el.removeAttribute("data-done");
    el.innerHTML = '<span class="th-mark" aria-hidden="true"><i></i></span><span class="th-label"></span><span class="th-time"></span>';
    const lab = el.querySelector(".th-label");
    const time = el.querySelector(".th-time");
    lab.textContent = label || "Working";
    el.setAttribute("role", "status");
    const t0 = performance.now();
    const fmt = (s) => (s >= 60 ? Math.floor(s / 60) + "m " + String(Math.floor(s % 60)).padStart(2, "0") + "s" : Math.floor(s) + "s");
    time.textContent = "0s";
    const tick = setInterval(() => { time.textContent = fmt((performance.now() - t0) / 1000); }, 1000);
    return {
      done(doneLabel) {
        clearInterval(tick);
        const s = (performance.now() - t0) / 1000;
        el.dataset.done = "";
        el.querySelector(".th-mark").innerHTML = CHECK;
        lab.textContent = doneLabel || "Done in";
        time.textContent = s >= 60 ? fmt(s) : s.toFixed(1) + "s";
      },
      fail(msg) {
        clearInterval(tick);
        el.dataset.done = "bad";
        lab.textContent = msg || "Stopped";
      },
    };
  }

  /* ---------------- menu ---------------- */

  function menu(anchor, items) {
    const existing = document.querySelector(".menu[data-for='" + anchor.id + "']");
    if (existing) {
      existing.remove();
      return;
    }
    document.querySelectorAll(".menu").forEach((m) => m.remove());
    const box = document.createElement("div");
    box.className = "menu";
    box.dataset.for = anchor.id;
    items.forEach((it) => {
      if (it.sep) {
        const s = document.createElement("div");
        s.className = "menu-sep";
        box.appendChild(s);
        return;
      }
      const b = document.createElement(it.href ? "a" : "button");
      b.className = "menu-item";
      if (it.href) b.href = it.href;
      else b.type = "button";
      b.innerHTML =
        (it.icon || "") +
        "<span>" + it.label + (it.note ? "<small>" + it.note + "</small>" : "") + "</span>";
      b.addEventListener("click", () => {
        box.remove();
        if (it.onClick) it.onClick();
      });
      box.appendChild(b);
    });
    const r = anchor.getBoundingClientRect();
    box.style.top = r.bottom + 8 + "px";
    box.style.right = Math.max(12, window.innerWidth - r.right) + "px";
    document.body.appendChild(box);
    const close = (e) => {
      if (!box.contains(e.target) && e.target !== anchor) {
        box.remove();
        document.removeEventListener("click", close);
      }
    };
    setTimeout(() => document.addEventListener("click", close), 0);
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") {
        box.remove();
        document.removeEventListener("keydown", esc);
      }
    });
  }

  /* ---------------- misc ---------------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function ago(iso) {
    if (!iso) return null;
    const then = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T00:00:00Z" : iso).getTime();
    if (!Number.isFinite(then)) return null;
    return Math.round((Date.now() - then) / 86400000);
  }

  /* ---------------- fx: the interaction layer for fx.css ---------------- */

  const SURFACES = ".card, .aside-card, .panel, .glass, [data-spot]";
  const PRESSABLE = ".btn, .btn-primary, .btn-ghost, .chip, .result";
  const MAGNETIC = ".btn--primary, .btn-primary, [data-magnetic]";
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  /* One delegated listener for the whole page, so elements rendered later
     (job cards, ask cards, results) get the effects with no wiring. */
  function fxInit() {
    if (fxInit.done) return;
    fxInit.done = true;
    stepBar();
    themeButton();
    avatarInit();
    artify();
    paintAi();
    /* empty states and avatars rendered later (lists, drawers) get the same treatment */
    let pending = 0;
    new MutationObserver(() => {
      if (pending) return;
      pending = requestAnimationFrame(() => { pending = 0; artify(); avatarInit(); paintAi(); });
    }).observe(document.body, { childList: true, subtree: true });

    document.addEventListener("pointermove", (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      const s = t.closest(SURFACES);
      if (s) {
        const r = s.getBoundingClientRect();
        s.style.setProperty("--mx", e.clientX - r.left + "px");
        s.style.setProperty("--my", e.clientY - r.top + "px");
      }
      if (reduce || !finePointer) return;
      const m = t.closest(MAGNETIC);
      if (m && !m.disabled) {
        const r = m.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        m.style.setProperty("--tx", (dx * 3).toFixed(2) + "px");
        m.style.setProperty("--ty", (dy * 2.5).toFixed(2) + "px");
      }
      const tilt = t.closest("[data-tilt]");
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        tilt.style.transform = `perspective(900px) rotateX(${(-py * 4).toFixed(2)}deg) rotateY(${(px * 5).toFixed(2)}deg)`;
      }
    }, { passive: true });

    document.addEventListener("pointerout", (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      const m = t.closest(MAGNETIC);
      if (m && !m.contains(e.relatedTarget)) {
        m.style.removeProperty("--tx");
        m.style.removeProperty("--ty");
      }
      const tilt = t.closest("[data-tilt]");
      if (tilt && !tilt.contains(e.relatedTarget)) tilt.style.transform = "";
    }, { passive: true });

    document.addEventListener("pointerdown", (e) => {
      if (reduce || e.button !== 0) return;
      const b = e.target instanceof Element ? e.target.closest(PRESSABLE) : null;
      if (!b || b.disabled) return;
      const r = b.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2.2;
      const dot = document.createElement("span");
      dot.className = "fx-ripple";
      dot.setAttribute("aria-hidden", "true");
      dot.style.width = dot.style.height = size + "px";
      dot.style.left = e.clientX - r.left + "px";
      dot.style.top = e.clientY - r.top + "px";
      if (getComputedStyle(b).position === "static") b.style.position = "relative";
      b.style.overflow = "hidden";
      b.appendChild(dot);
      dot.addEventListener("animationend", () => dot.remove());
    }, { passive: true });
  }

  /* A dot-matrix meter: `rows` x `cols` dots, columns lit left to right up to
     `pct`, each with a small pop. The element keeps its own label for
     assistive tech; the dots are decoration. */
  function dotMeter(el, pct, opts) {
    const o = opts || {};
    const cols = o.cols || 30;
    const rows = o.rows || 2;
    const lit = Math.round((Math.max(0, Math.min(100, pct)) / 100) * cols);
    el.classList.add("dotm");
    el.dataset.band = pct >= 75 ? "hi" : "";
    el.setAttribute("aria-hidden", "true");
    el.style.setProperty("--cols", String(cols));
    el.style.setProperty("--rows", String(rows));
    el.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const d = document.createElement("i");
        d.style.setProperty("--h", String(Math.round(16 + (c / Math.max(1, cols - 1)) * 18)));
        if (c < lit) {
          d.className = "on";
          d.style.animationDelay = reduce ? "0ms" : `${(o.delay || 0) + c * 22 + r * 40}ms`;
        }
        frag.appendChild(d);
      }
    }
    el.appendChild(frag);
  }

  /* Children of `root` rise in one after another. */
  function stagger(root, selector) {
    if (!root || reduce) return;
    const items = selector ? root.querySelectorAll(selector) : root.children;
    Array.from(items).forEach((el, i) => {
      el.style.setProperty("--i", String(Math.min(i, 14)));
      el.classList.remove("fx-in");
      void el.offsetWidth;
      el.classList.add("fx-in");
    });
  }

  /* A short burst from (x, y), or from the middle of the screen. */
  function confetti(x, y) {
    if (reduce) return;
    const c = document.createElement("canvas");
    c.className = "fx-confetti";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = innerWidth * dpr;
    c.height = innerHeight * dpr;
    document.body.appendChild(c);
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    const ox = x ?? innerWidth / 2;
    const oy = y ?? innerHeight / 2;
    const colors = ["#f5f5f7", "#a1a1a6", "#6e6e73", "#f36b2b", "#30d158"];
    const bits = Array.from({ length: 130 }, () => {
      const a = Math.random() * Math.PI * 2;
      const v = 4 + Math.random() * 9;
      return {
        x: ox, y: oy,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6,
        w: 5 + Math.random() * 6, h: 3 + Math.random() * 4,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
        c: colors[(Math.random() * colors.length) | 0],
      };
    });
    const t0 = performance.now();
    (function tick(t) {
      const life = (t - t0) / 1600;
      g.clearRect(0, 0, innerWidth, innerHeight);
      for (const b of bits) {
        b.vy += 0.28;
        b.vx *= 0.985;
        b.x += b.vx;
        b.y += b.vy;
        b.r += b.vr;
        g.save();
        g.globalAlpha = Math.max(0, 1 - life);
        g.translate(b.x, b.y);
        g.rotate(b.r);
        g.fillStyle = b.c;
        g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        g.restore();
      }
      if (life < 1) requestAnimationFrame(tick);
      else c.remove();
    })(t0);
  }

  /* ---------------- empty states: an isometric line drawing that draws itself ---------------- */

  /* A prism on the isometric grid: base centre (x, y), half-width w, height h. */
  function prism(x, y, w, h) {
    const q = w / 2;
    const P = (a) => a.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L");
    const W = [x - w, y], S = [x, y + q], E = [x + w, y], N = [x, y - q];
    const up = (p) => [p[0], p[1] - h];
    return (
      '<path class="ea-f ea-l" pathLength="1" d="M' + P([W, S, up(S), up(W)]) + 'Z"/>' +
      '<path class="ea-f ea-r" pathLength="1" d="M' + P([S, E, up(E), up(S)]) + 'Z"/>' +
      '<path class="ea-f ea-t" pathLength="1" d="M' + P([up(N), up(E), up(S), up(W)]) + 'Z"/>'
    );
  }
  const SCENES = {
    inbox: () => prism(80, 76, 28, 12) + '<path class="ea-f ea-r" pathLength="1" d="M80 54 L98 63 L80 72 L62 63Z"/>' + prism(80, 50, 16, 2),
    search: () => prism(70, 80, 16, 16) + prism(70, 62, 12, 2) +
      '<ellipse class="ea-f ea-t" pathLength="1" cx="98" cy="50" rx="12" ry="12"/><path class="ea-s" pathLength="1" d="M106.5 58.5 L117 69"/>',
    offline: () => prism(62, 82, 12, 12) + prism(100, 66, 12, 12) +
      '<path class="ea-s" pathLength="1" d="M74 64 L80 60 M86 56 L92 52"/><path class="ea-s ea-bad" pathLength="1" d="M78 48 L88 58 M88 48 L78 58"/>',
    chart: () => prism(62, 86, 8, 14) + prism(80, 78, 8, 26) + prism(98, 70, 8, 38),
    done: () => prism(80, 74, 24, 6) + '<path class="ea-s ea-ok" pathLength="1" d="M68 56 L77 65 L96 44"/>',
  };
  function emptyArt(kind) {
    const scene = (SCENES[kind] || SCENES.inbox)();
    return '<svg class="ea" viewBox="20 24 120 88" aria-hidden="true">' + prism(80, 84, 50, 5).replace(/ea-f/g, "ea-f ea-tile") + scene + "</svg>";
  }
  function guessKind(text) {
    const t = String(text || "").toLowerCase();
    if (/all set|caught up|nothing left|all done/.test(t)) return "done";
    if (/search|match|filter|no result|widen/.test(t)) return "search";
    if (/connect|offline|reach|could not|key|sign in/.test(t)) return "offline";
    if (/score|posting|map|taxonomy|path|chart/.test(t)) return "chart";
    return "inbox";
  }
  function artify() {
    document.querySelectorAll(".empty-detail .art:not([data-art]), .empty .e-icon:not([data-art])").forEach((slot) => {
      const box = slot.closest(".empty-detail, .empty");
      slot.dataset.art = "";
      slot.innerHTML = emptyArt(guessKind(box && box.textContent));
    });
    document.querySelectorAll(".empty-state:not([data-art]), .empty:not([data-art])").forEach((box) => {
      box.dataset.art = "";
      if (box.querySelector(".e-icon, .art, .ea")) return;
      const slot = document.createElement("div");
      slot.className = "ea-slot";
      slot.innerHTML = emptyArt(guessKind(box.textContent));
      box.prepend(slot);
    });
  }

  /* ---------------- avatar cropper: the avatar grows into the crop ---------------- */

  const AVATAR_KEY = "co.avatar";
  const AVATARS = "#chipAvatar, #whoAv, [data-avatar]";
  function savedAvatar() { try { return localStorage.getItem(AVATAR_KEY) || ""; } catch { return ""; } }
  function paintAvatars() {
    const src = savedAvatar();
    document.querySelectorAll(AVATARS).forEach((el) => {
      el.classList.toggle("has-photo", Boolean(src));
      el.style.backgroundImage = src ? 'url("' + src + '")' : "";
    });
    document.querySelectorAll(".cx-me-av").forEach((el) => {
      el.classList.toggle("has-photo", Boolean(src));
      el.style.backgroundImage = src ? 'url("' + src + '")' : "";
    });
  }
  function avatarInit() {
    paintAvatars();
    document.querySelectorAll(AVATARS).forEach((el) => {
      if (el.dataset.crop) return;
      el.dataset.crop = "";
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.title = "Change your photo. It stays on this computer.";
      const go = (e) => { e.preventDefault(); e.stopPropagation(); pickPhoto(el); };
      el.addEventListener("click", go);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") go(e); });
      el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("is-over"); });
      el.addEventListener("dragleave", () => el.classList.remove("is-over"));
      el.addEventListener("drop", (e) => {
        e.preventDefault(); e.stopPropagation(); el.classList.remove("is-over");
        const f = e.dataTransfer && e.dataTransfer.files[0];
        if (f) openCropper(el, f);
      });
    });
  }
  function pickPhoto(anchor) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.addEventListener("change", () => { if (input.files[0]) openCropper(anchor, input.files[0]); });
    input.click();
  }
  function openCropper(anchor, file) {
    if (!/^image\//.test(file.type)) return toast("Choose a PNG, JPEG or WebP photo.", { kind: "warn" });
    if (file.size > 8 * 1024 * 1024) return toast("That photo is over 8 MB. Pick a smaller one.", { kind: "warn" });
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => mountCropper(anchor, img, url);
    img.onerror = () => toast("That file could not be read as a photo.", { kind: "bad" });
    img.src = url;
  }
  function mountCropper(anchor, img, url) {
    const D = Math.min(300, innerWidth - 64);
    const stage = document.createElement("div");
    stage.className = "ac";
    stage.setAttribute("role", "dialog");
    stage.setAttribute("aria-label", "Frame your photo");
    stage.innerHTML =
      '<div class="ac-view" style="--d:' + D + 'px"><img class="ac-dim" alt="" draggable="false"><div class="ac-hole"><img class="ac-img" alt="Your photo" draggable="false"></div></div>' +
      '<div class="ac-bar">' +
      '<label class="ac-zoom"><span>Zoom</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="Zoom"></label>' +
      '<button class="btn btn--sm" type="button" data-a="rot" aria-label="Rotate a quarter turn">Rotate</button>' +
      (savedAvatar() ? '<button class="btn btn--sm btn--ghost" type="button" data-a="rm">Remove</button>' : "") +
      '<span class="ac-sp"></span>' +
      '<button class="btn btn--sm btn--ghost" type="button" data-a="x">Cancel</button>' +
      '<button class="btn btn--sm btn--primary" type="button" data-a="ok">Save</button>' +
      '</div><p class="ac-note">Drag to frame, scroll or pinch to zoom, R rotates. The photo stays on this computer.</p>';
    document.body.appendChild(stage);
    const view = stage.querySelector(".ac-view");
    const imgs = stage.querySelectorAll("img");
    imgs.forEach((i) => { i.src = url; });
    const zoom = stage.querySelector('input[type="range"]');
    const st = { s: 1, r: 0, x: 0, y: 0 };
    const dims = () => (st.r % 180 ? [img.naturalHeight, img.naturalWidth] : [img.naturalWidth, img.naturalHeight]);
    const base = () => { const [w, h] = dims(); return D / Math.min(w, h); };
    const limit = () => { const [w, h] = dims(); const k = base() * st.s; return [Math.max(0, (w * k - D) / 2), Math.max(0, (h * k - D) / 2)]; };
    const clamp = (soft) => {
      const [mx, my] = limit();
      const c = (v, m) => (Math.abs(v) <= m ? v : soft ? Math.sign(v) * (m + (Math.abs(v) - m) * 0.3) : Math.sign(v) * m);
      st.x = c(st.x, mx); st.y = c(st.y, my);
    };
    const draw = () => {
      const k = base() * st.s;
      const tf = "translate(-50%, -50%) translate(" + st.x + "px," + st.y + "px) rotate(" + st.r + "deg) scale(" + k + ")";
      imgs.forEach((i) => { i.style.transform = tf; i.style.width = img.naturalWidth + "px"; i.style.height = img.naturalHeight + "px"; });
    };
    draw();
    /* grow out of the avatar */
    const a = anchor.getBoundingClientRect();
    const v = view.getBoundingClientRect();
    if (!reduce && a.width) {
      view.style.transition = "none";
      view.style.transform = "translate(" + (a.left + a.width / 2 - (v.left + v.width / 2)) + "px," + (a.top + a.height / 2 - (v.top + v.height / 2)) + "px) scale(" + a.width / v.width + ")";
      void view.offsetWidth;
      view.style.transition = "";
      view.style.transform = "";
    }
    requestAnimationFrame(() => stage.classList.add("on"));

    let drag = null;
    view.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX - st.x, y: e.clientY - st.y };
      view.setPointerCapture(e.pointerId);
      stage.classList.add("is-drag");
    });
    view.addEventListener("pointermove", (e) => {
      if (!drag) return;
      st.x = e.clientX - drag.x; st.y = e.clientY - drag.y;
      clamp(true); draw();
    });
    const release = () => { if (!drag) return; drag = null; stage.classList.remove("is-drag"); clamp(false); draw(); };
    view.addEventListener("pointerup", release);
    view.addEventListener("pointercancel", release);
    const setZoom = (s) => { st.s = Math.max(1, Math.min(4, s)); zoom.value = String(st.s); clamp(false); draw(); };
    view.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(st.s * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
    zoom.addEventListener("input", () => setZoom(Number(zoom.value)));
    const rotate = () => { st.r = (st.r + 90) % 360; clamp(false); draw(); };

    const close = (saved) => {
      document.removeEventListener("keydown", keys, true);
      const a2 = anchor.getBoundingClientRect();
      const v2 = view.getBoundingClientRect();
      stage.classList.remove("on");
      if (!reduce && a2.width) view.style.transform = "translate(" + (a2.left + a2.width / 2 - (v2.left + v2.width / 2)) + "px," + (a2.top + a2.height / 2 - (v2.top + v2.height / 2)) + "px) scale(" + a2.width / v2.width + ")";
      setTimeout(() => { stage.remove(); URL.revokeObjectURL(url); if (saved) paintAvatars(); }, reduce ? 0 : 380);
    };
    const save = async (btn) => {
      await withButton(btn, async () => {
        const out = 512;
        const c = document.createElement("canvas");
        c.width = c.height = out;
        const g = c.getContext("2d");
        const f = out / D;
        g.translate(out / 2 + st.x * f, out / 2 + st.y * f);
        g.rotate((st.r * Math.PI) / 180);
        const k = base() * st.s * f;
        g.scale(k, k);
        g.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        let data = c.toDataURL("image/webp", 0.88);
        if (!/^data:image\/webp/.test(data)) data = c.toDataURL("image/jpeg", 0.88);
        localStorage.setItem(AVATAR_KEY, data);
      }, { loading: "Saving", success: "Saved", error: "Try again" });
      close(true);
    };
    const keys = (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(false); }
      else if (e.key === "Enter") { e.preventDefault(); save(stage.querySelector('[data-a="ok"]')).catch(() => {}); }
      else if (/^Arrow/.test(e.key)) {
        e.preventDefault();
        const d = e.shiftKey ? 20 : 6;
        if (e.key === "ArrowLeft") st.x -= d; if (e.key === "ArrowRight") st.x += d;
        if (e.key === "ArrowUp") st.y -= d; if (e.key === "ArrowDown") st.y += d;
        clamp(false); draw();
      } else if (e.key === "+" || e.key === "=") setZoom(st.s * 1.1);
      else if (e.key === "-") setZoom(st.s / 1.1);
      else if (e.key === "r" || e.key === "R") rotate();
    };
    document.addEventListener("keydown", keys, true);
    stage.addEventListener("click", (e) => {
      const b = e.target.closest("[data-a]");
      if (!b) { if (e.target === stage) close(false); return; }
      const act = b.dataset.a;
      if (act === "x") close(false);
      else if (act === "rot") rotate();
      else if (act === "ok") save(b).catch(() => {});
      else if (act === "rm") { try { localStorage.removeItem(AVATAR_KEY); } catch {} close(true); }
    });
  }

  /* ---------------- setup checklist (Connections) ---------------- */

  /**
   * checklist(el, tasks): the next task is open with its one button; done
   * tasks draw a check and a strike; a ring fills and "2 of 5" rolls.
   * task: { id, title, why, action: { label, href | onClick }, done: bool }
   */
  function checklist(el, tasks, opts) {
    const o = opts || {};
    const total = tasks.length;
    const done = tasks.filter((t) => t.done).length;
    const next = tasks.find((t) => !t.done);
    const R = 15, C = 2 * Math.PI * R;
    el.classList.add("ck");
    el.toggleAttribute("data-all", !next);
    el.innerHTML =
      '<div class="ck-head">' +
      '<svg class="ck-ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="' + R + '" class="ck-track"/><circle cx="18" cy="18" r="' + R + '" class="ck-fill" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '"/>' + (next ? "" : '<path class="ck-done" pathLength="1" d="M12 18.5l4 4 8-9"/>') + "</svg>" +
      '<div class="ck-title"><b>' + esc(next ? o.title || "Get set up" : o.doneTitle || "You’re all set") + '</b><span><span class="ck-n"></span> of ' + total + " done</span></div>" +
      "</div>" +
      '<ol class="ck-list">' +
      tasks.map((t) => {
        const open = next && t.id === next.id;
        const act = t.action ? (t.action.href
          ? '<a class="btn btn--sm' + (open ? " btn--primary" : "") + '" href="' + esc(t.action.href) + '"' + (t.action.external ? ' target="_blank" rel="noopener"' : "") + ">" + esc(t.action.label) + "</a>"
          : '<button class="btn btn--sm' + (open ? " btn--primary" : "") + '" type="button" data-ck="' + esc(t.id) + '">' + esc(t.action.label) + "</button>") : "";
        return '<li class="ck-item" data-done="' + Boolean(t.done) + '"' + (open ? " data-open" : "") + ">" +
          '<span class="ck-mark" aria-hidden="true">' + (t.done ? CHECK : "") + "</span>" +
          '<div class="ck-body"><span class="ck-name">' + esc(t.title) + (t.done ? '<span class="sr-only"> (done)</span>' : "") + "</span>" +
          (t.why ? '<p class="ck-why">' + esc(t.why) + "</p>" : "") + "</div>" +
          (t.done ? (t.note ? '<span class="ck-note">' + esc(t.note) + "</span>" : "") : act) +
          "</li>";
      }).join("") +
      "</ol>";
    roll(el.querySelector(".ck-n"), done);
    requestAnimationFrame(() => { el.querySelector(".ck-fill").style.strokeDashoffset = (C * (1 - done / total)).toFixed(1); });
    el.querySelectorAll("[data-ck]").forEach((b) => b.addEventListener("click", () => {
      const t = tasks.find((x) => x.id === b.dataset.ck);
      if (t && t.action && t.action.onClick) t.action.onClick(b);
    }));
    el.querySelectorAll(".ck-item").forEach((li) => li.addEventListener("click", (e) => {
      if (e.target.closest("a, button")) return;
      el.querySelectorAll(".ck-item[data-open]").forEach((x) => { if (x !== li) x.removeAttribute("data-open"); });
      li.toggleAttribute("data-open");
    }));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fxInit);
  else fxInit();

  window.CO = window.CO || {};
  window.CO.inbox = inbox;
  window.CO.ui = {
    toast, toastPromise, reveal, count, roll, ring, withButton, menu, esc, ago, reduce, stagger, confetti, dotMeter,
    progress, codeState, resendTimer, thinking, emptyArt, checklist, paintAvatars,
    aiName, aiReady, paintAi,
  };
})();
