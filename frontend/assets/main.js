/* ==========================================================================
   Career Ops India — page interactions
   Navigation, reveals, active section, magnetic buttons, copy feedback.
   ========================================================================== */

(function () {
  "use strict";

  var REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var FINE = window.matchMedia("(pointer: fine)").matches;

  /* ------------------------------------------------------------------ */
  /* Mobile menu                                                        */
  /* ------------------------------------------------------------------ */

  function initMenu() {
    var toggle = document.getElementById("navToggle");
    var menu = document.getElementById("mobileMenu");
    if (!toggle || !menu) return;

    function setOpen(open) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      if (open) menu.removeAttribute("hidden");
      else menu.setAttribute("hidden", "");
    }

    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) setOpen(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });

    document.addEventListener("click", function (e) {
      if (
        toggle.getAttribute("aria-expanded") === "true" &&
        !menu.contains(e.target) &&
        !toggle.contains(e.target)
      ) {
        setOpen(false);
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 980) setOpen(false);
    });

    var lastY = window.scrollY;
    window.addEventListener(
      "scroll",
      function () {
        var y = window.scrollY;
        if (
          toggle.getAttribute("aria-expanded") === "true" &&
          Math.abs(y - lastY) > 10
        ) {
          setOpen(false);
        }
        lastY = y;
      },
      { passive: true }
    );
  }

  /* ------------------------------------------------------------------ */
  /* Sticky nav shadow                                                  */
  /* ------------------------------------------------------------------ */

  function initNavShadow() {
    var nav = document.getElementById("nav");
    if (!nav) return;
    var ticking = false;

    function update() {
      nav.classList.toggle("scrolled", window.scrollY > 8);
      ticking = false;
    }

    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true }
    );

    update();
  }

  /* ------------------------------------------------------------------ */
  /* Reveals                                                            */
  /* ------------------------------------------------------------------ */

  function initReveals() {
    var groups = [
      [".hero-strip > div", 70],
      [".section-head", 0, "blur"],
      [".why-copy", 0, "blur"],
      [".timeline li", 55],
      [".flow", 0],
      [".matrix-meta", 0],
      [".matrix-shell", 70],
      [".matrix-foot", 90],
      [".foss-copy", 0],
      [".foss-art", 90],
      [".steps li", 55],
      [".requirements", 90],
      [".agents-grid", 0],
      [".closing-art", 0],
      [".closing-copy", 90],
    ];

    var items = [];

    groups.forEach(function (group) {
      var nodes = document.querySelectorAll(group[0]);
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.classList.contains("reveal") || node.classList.contains("reveal-blur")) continue;
        /* A scroll-linked focus block handles its own children. */
        if (node.closest("[data-focus]")) continue;
        node.classList.add(group[2] === "blur" ? "reveal-blur" : "reveal");
        if (group[1]) node.style.setProperty("--i", String(i));
        items.push(node);
      }
    });

    if (REDUCE || !("IntersectionObserver" in window)) {
      items.forEach(function (n) {
        n.classList.add("in");
      });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
    );

    items.forEach(function (n) {
      io.observe(n);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Why: scroll-driven orbit                                           */
  /* ------------------------------------------------------------------ */

  function initWhyScroll() {
    var scroll = document.querySelector("[data-why-scroll]");
    if (!scroll) return;
    var stage = scroll.querySelector("[data-why-stage]");
    var pin = scroll.querySelector(".why-pin");
    var chips = stage ? stage.querySelectorAll(".src-chip") : [];
    var lines = stage ? stage.querySelectorAll(".why-lines line") : [];
    var core = stage ? stage.querySelector(".src-core") : null;
    var dots = stage ? stage.querySelectorAll(".core-dots i") : [];
    var count = stage ? stage.querySelector("[data-core-count]") : null;
    var legend = document.querySelectorAll("[data-why-step]");
    if (!stage || !chips.length) return;

    var W = 0;
    var H = 0;
    var CX = 0;
    var CY = 0;
    var R = 0;
    var sticky = false;
    var visible = false;
    var lastCount = -1;
    var lastStep = -1;

    for (var d = 0; d < dots.length; d++) {
      dots[d].style.setProperty("--a", String((d / dots.length) * 360));
    }

    function clamp01(v) {
      return v < 0 ? 0 : v > 1 ? 1 : v;
    }

    function ease(t) {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    function measure() {
      var r = stage.getBoundingClientRect();
      W = r.width;
      H = r.height;
      CX = W / 2;
      CY = H / 2;
      R = Math.min(W, H) * 0.33;
      sticky = !REDUCE && window.innerWidth > 980;
    }

    function layout(p) {
      var toRing = ease(clamp01((p - 0.08) / 0.34));
      var spin = clamp01((p - 0.42) / 0.26);
      var landed = 0;

      for (var i = 0; i < chips.length; i++) {
        var chip = chips[i];
        /* Stagger the drop so the seven arrive one after another. */
        var drop = ease(clamp01((p - (0.66 + i * 0.018)) / 0.22));
        var sx = parseFloat(chip.getAttribute("data-x")) * W;
        var sy = parseFloat(chip.getAttribute("data-y")) * H;
        var a0 = (i / chips.length) * Math.PI * 2 - Math.PI / 2;
        var a = a0 + spin * Math.PI * 1.4;
        var rx = CX + Math.cos(a) * R;
        var ry = CY + Math.sin(a) * R;
        var x = sx + (rx - sx) * toRing;
        var y = sy + (ry - sy) * toRing;
        x += (CX - x) * drop;
        y += (CY - y) * drop;
        var sc = 1 - drop * 0.55;
        chip.style.transform =
          "translate(" +
          x.toFixed(1) +
          "px," +
          y.toFixed(1) +
          "px) translate(-50%,-50%) scale(" +
          sc.toFixed(3) +
          ")";
        chip.style.opacity = (1 - drop * 0.9).toFixed(3);

        var line = lines[i];
        if (line) {
          line.setAttribute("x1", x.toFixed(1));
          line.setAttribute("y1", y.toFixed(1));
          line.setAttribute("x2", CX.toFixed(1));
          line.setAttribute("y2", CY.toFixed(1));
          line.style.opacity = ((0.22 + toRing * 0.68) * (1 - drop)).toFixed(3);
        }

        if (dots[i]) dots[i].style.setProperty("--on", drop.toFixed(3));
        if (drop > 0.55) landed++;
      }

      if (count && landed !== lastCount) {
        lastCount = landed;
        count.textContent = landed + " / " + chips.length;
      }
      if (core) core.classList.toggle("is-done", landed === chips.length);

      var step = p < 0.12 ? 0 : p < 0.74 ? 1 : 2;
      if (step !== lastStep) {
        lastStep = step;
        for (var s = 0; s < legend.length; s++) {
          legend[s].classList.toggle("is-on", Number(legend[s].getAttribute("data-why-step")) === step);
        }
      }

      var last = ease(clamp01((p - (0.66 + (chips.length - 1) * 0.018)) / 0.22));
      if (core) core.style.setProperty("--p", last.toFixed(3));
    }

    var ticking = false;

    function update() {
      ticking = false;
      if (!sticky) return;
      var top = scroll.getBoundingClientRect().top + window.scrollY;
      var total = scroll.offsetHeight - pin.offsetHeight;
      var p = total > 0 ? clamp01((window.scrollY - top) / total) : 0;
      layout(p);
    }

    function request() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    /* Below the sticky breakpoint the story plays on its own, once in view,
       then holds on the finished workspace. */
    var loopStart = 0;
    var done = false;
    function autoLoop(now) {
      if (!visible || done) return;
      if (!loopStart) loopStart = now;
      var t = (now - loopStart) / 7000;
      if (t >= 1) {
        layout(1);
        done = true;
        return;
      }
      layout(t);
      requestAnimationFrame(autoLoop);
    }

    measure();
    layout(REDUCE ? 1 : 0);

    if (sticky) {
      window.addEventListener("scroll", request, { passive: true });
    } else if (!REDUCE && "IntersectionObserver" in window) {
      new IntersectionObserver(
        function (entries) {
          var was = visible;
          visible = entries[0].isIntersecting;
          if (visible && !was && !done) {
            loopStart = 0;
            requestAnimationFrame(autoLoop);
          }
        },
        { threshold: 0.25 }
      ).observe(stage);
    }

    window.addEventListener("resize", function () {
      measure();
      if (sticky) update();
      else if (!done) layout(REDUCE ? 1 : 0);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Scroll-linked focus                                                */
  /* ------------------------------------------------------------------ */

  function initFocus() {
    var nodes = document.querySelectorAll("[data-focus]");
    if (!nodes.length) return;

    if (REDUCE) {
      for (var r = 0; r < nodes.length; r++) nodes[r].style.setProperty("--focus", "0");
      return;
    }

    var ticking = false;

    function update() {
      ticking = false;
      var vh = window.innerHeight;
      for (var i = 0; i < nodes.length; i++) {
        var top = nodes[i].getBoundingClientRect().top;
        /* 1 while the block is still low in the viewport, 0 once it is read. */
        var p = (vh * 0.95 - top) / (vh * 0.42);
        p = p < 0 ? 0 : p > 1 ? 1 : p;
        nodes[i].style.setProperty("--focus", (1 - p).toFixed(3));
      }
    }

    function request() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    update();
  }

  /* ------------------------------------------------------------------ */
  /* Reality: cards drop in as the evening advances                     */
  /* ------------------------------------------------------------------ */

  function initReality() {
    var art = document.querySelector("[data-reality]");
    if (!art) return;
    var cards = art.querySelectorAll(".float");
    var list = document.querySelector(".timeline");
    var beats = document.querySelectorAll(".timeline li[data-beat]");
    if (!cards.length) return;

    if (REDUCE) {
      for (var r = 0; r < cards.length; r++) cards[r].style.setProperty("--drop", "1");
      return;
    }

    var ticking = false;
    var lastBeat = -1;

    function update() {
      ticking = false;
      var vh = window.innerHeight;

      /* Cards drop as the art panel enters. */
      var top = art.getBoundingClientRect().top;
      var p = (vh * 0.78 - top) / (vh * 0.5);
      p = p < 0 ? 0 : p > 1 ? 1 : p;

      for (var i = 0; i < cards.length; i++) {
        var t = (p - i * 0.06) / 0.34;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        var e = 1 - Math.pow(1 - t, 3);
        cards[i].style.setProperty("--drop", e.toFixed(3));
      }

      /* Timestamps light up as the list itself is read, which on a phone is
         well before the art panel below it. */
      var ref = list || art;
      var lp = (vh * 0.82 - ref.getBoundingClientRect().top) / (vh * 0.62);
      lp = lp < 0 ? 0 : lp > 1 ? 1 : lp;
      var beat = lp >= 0.98 ? 4 : Math.min(4, Math.floor(lp * 5));
      if (beat !== lastBeat) {
        lastBeat = beat;
        for (var b = 0; b < beats.length; b++) {
          beats[b].classList.toggle("is-on", Number(beats[b].getAttribute("data-beat")) <= beat);
        }
      }
    }

    function request() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    update();
  }

  /* ------------------------------------------------------------------ */
  /* Workflow: rail + stage                                             */
  /* ------------------------------------------------------------------ */

  function initFlow() {
    var flow = document.querySelector("[data-flow]");
    if (!flow) return;

    var tabs = flow.querySelectorAll(".flow-tab");
    var copies = flow.querySelectorAll(".flow-copy");
    var panel = flow.querySelector("#flow-panel");
    var label = flow.querySelector("[data-flow-label]");
    var art = window.CareerOpsArt && window.CareerOpsArt.flow;
    if (!tabs.length || !panel) return;

    var idx = 0;

    function select(i, focus) {
      idx = (i + tabs.length) % tabs.length;
      var step = tabs[idx].getAttribute("data-step");

      for (var k = 0; k < tabs.length; k++) {
        var on = k === idx;
        tabs[k].classList.toggle("is-on", on);
        tabs[k].setAttribute("aria-selected", on ? "true" : "false");
        tabs[k].tabIndex = on ? 0 : -1;
      }

      for (var c = 0; c < copies.length; c++) {
        copies[c].classList.toggle("is-on", copies[c].getAttribute("data-copy") === step);
      }

      panel.setAttribute("aria-labelledby", tabs[idx].id);
      if (label) label.textContent = "STAGE / " + tabs[idx].querySelector(".flow-num").textContent;
      if (art) art.select(step);
      if (focus) tabs[idx].focus();
    }

    for (var i = 0; i < tabs.length; i++) {
      (function (n) {
        tabs[n].addEventListener("click", function () {
          select(n);
        });
        tabs[n].addEventListener("keydown", function (e) {
          var key = e.key;
          if (key === "ArrowRight" || key === "ArrowDown") {
            e.preventDefault();
            select(n + 1, true);
          } else if (key === "ArrowLeft" || key === "ArrowUp") {
            e.preventDefault();
            select(n - 1, true);
          } else if (key === "Home") {
            e.preventDefault();
            select(0, true);
          } else if (key === "End") {
            e.preventDefault();
            select(tabs.length - 1, true);
          }
        });
      })(i);
    }

    select(0);
  }

  /* ------------------------------------------------------------------ */
  /* Active section                                                     */
  /* ------------------------------------------------------------------ */

  function initActiveSection() {
    var ids = ["why", "how", "compare", "open-source", "agents"];
    var sections = ids
      .map(function (id) {
        return document.getElementById(id);
      })
      .filter(Boolean);

    if (!sections.length || !("IntersectionObserver" in window)) return;

    var links = document.querySelectorAll(".nav-links a");

    function setActive(id) {
      for (var i = 0; i < links.length; i++) {
        links[i].classList.toggle(
          "is-active",
          links[i].getAttribute("href") === "#" + id
        );
      }
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-42% 0px -52% 0px", threshold: 0 }
    );

    sections.forEach(function (s) {
      io.observe(s);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Magnetic buttons                                                   */
  /* ------------------------------------------------------------------ */

  function initMagnetic() {
    if (REDUCE || !FINE) return;
    var nodes = document.querySelectorAll("[data-magnetic]");

    for (var i = 0; i < nodes.length; i++) {
      (function (node) {
        var raf = 0;
        var tx = 0;
        var ty = 0;

        function apply() {
          node.style.transform = "translate(" + tx + "px," + ty + "px)";
          raf = 0;
        }

        node.addEventListener("pointermove", function (e) {
          var r = node.getBoundingClientRect();
          var dx = e.clientX - (r.left + r.width / 2);
          var dy = e.clientY - (r.top + r.height / 2);
          tx = Math.max(-4, Math.min(4, dx * 0.08));
          ty = Math.max(-3, Math.min(3, dy * 0.12));
          if (!raf) raf = requestAnimationFrame(apply);
        });

        node.addEventListener("pointerleave", function () {
          tx = 0;
          ty = 0;
          if (!raf) raf = requestAnimationFrame(apply);
        });
      })(nodes[i]);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Copy buttons on code blocks                                        */
  /* ------------------------------------------------------------------ */

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
        resolve();
      } catch (err) {
        reject(err);
      }
      document.body.removeChild(area);
    });
  }

  function initCopy() {
    var blocks = document.querySelectorAll("pre");
    for (var i = 0; i < blocks.length; i++) {
      (function (pre) {
        var code = pre.querySelector("code");
        if (!code) return;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "copy-btn";
        btn.textContent = "Copy";
        btn.setAttribute("aria-label", "Copy this command");
        pre.appendChild(btn);

        btn.addEventListener("click", function () {
          copyText(code.textContent)
            .then(function () {
              btn.textContent = "Copied";
              btn.classList.add("copied");
              setTimeout(function () {
                btn.textContent = "Copy";
                btn.classList.remove("copied");
              }, 1600);
            })
            .catch(function () {
              btn.textContent = "Select";
              setTimeout(function () {
                btn.textContent = "Copy";
              }, 1600);
            });
        });
      })(blocks[i]);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Copy the setup prompt                                              */
  /* ------------------------------------------------------------------ */

  function initPromptCopy() {
    var btn = document.getElementById("copyPrompt");
    var body = document.getElementById("promptText");
    if (!btn || !body) return;

    var label = btn.querySelector(".copy-label");
    var timer = 0;

    function reset() {
      btn.classList.remove("copied");
      if (label) label.textContent = "Copy prompt";
    }

    btn.addEventListener("click", function () {
      var text = body.textContent.trim();
      copyText(text)
        .then(function () {
          btn.classList.add("copied");
          if (label) label.textContent = "Copied";
          clearTimeout(timer);
          timer = setTimeout(reset, 2200);
        })
        .catch(function () {
          if (label) label.textContent = "Select the text";
          clearTimeout(timer);
          timer = setTimeout(reset, 2600);
        });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */

  function init() {
    initMenu();
    initNavShadow();
    initReveals();
    initWhyScroll();
    initFocus();
    initReality();
    initFlow();
    initActiveSection();
    initMagnetic();
    initCopy();
    initPromptCopy();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
