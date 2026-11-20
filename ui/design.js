/* Career-Ops India — shared UI helpers.
 *
 * Small on purpose: toasts, reveal-on-enter, number count-up, score rings,
 * async button states and a dismissible menu. No framework, no build step.
 */
(function () {
  "use strict";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

    let timer = null;
    const close = () => {
      if (timer) clearTimeout(timer);
      el.classList.add("out");
      el.addEventListener("animationend", () => el.remove(), { once: true });
      setTimeout(() => el.remove(), 400);
    };
    el.querySelector(".t-x").addEventListener("click", close);
    if (o.ms !== 0) timer = setTimeout(close, o.ms || 4500);
    return { close, el };
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
    count(label, pct, { decimals: 1, ms: 900 });
    el.setAttribute("aria-label", "Match score " + pct.toFixed(1) + " out of 100");
  }

  /* ---------------- async button ---------------- */

  /**
   * withButton(btn, fn, { loading, success, error })
   * Runs fn, morphs the button through loading → success/error, then restores.
   */
  async function withButton(btn, fn, labels) {
    const l = labels || {};
    if (btn.dataset.state === "loading") return;
    const original = btn.innerHTML;
    const set = (state, text) => {
      btn.dataset.state = state;
      btn.innerHTML =
        (state === "loading" ? '<span class="spinner" aria-hidden="true"></span>' : "") +
        '<span class="btn-label"></span>';
      btn.querySelector(".btn-label").textContent = text;
    };
    btn.disabled = true;
    set("loading", l.loading || "Working…");
    try {
      const out = await fn();
      set("success", l.success || "Done");
      await new Promise((r) => setTimeout(r, 900));
      return out;
    } catch (e) {
      set("error", l.error || "Failed");
      await new Promise((r) => setTimeout(r, 1100));
      throw e;
    } finally {
      btn.disabled = false;
      btn.dataset.state = "";
      btn.innerHTML = original;
    }
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

  window.CO = window.CO || {};
  window.CO.ui = { toast, reveal, count, ring, withButton, menu, esc, ago, reduce };
})();
