/* Career Ops India — art layer.
   Paper Shaders (dithered forms) + textmode.js (real ASCII, WebGL2).
   Both are vendored, pinned and loaded as plain scripts so the page still
   works from a static host or file://. */

(function () {
  "use strict";

  var P = window.PaperShaders;
  var TM = window.textmode;
  var REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var INK = "#141715";
  var ORANGE = "#f36b2b";
  var GREEN = "#1f7a4d";
  var DUST = "#a9b1ab";

  function $(id) {
    return document.getElementById(id);
  }

  function webgl2() {
    try {
      return !!document.createElement("canvas").getContext("webgl2");
    } catch (e) {
      return false;
    }
  }

  if (!webgl2() || !P || !TM) {
    document.documentElement.classList.add("no-webgl");
    return;
  }

  /* ------------------------------------------------------------------ */
  /* Paper Shaders                                                      */
  /* ------------------------------------------------------------------ */

  /* The dithering shader draws a sphere whose diameter is
     min(width, height) * u_scale (fit: contain). */
  function dither(host, o) {
    if (!host) return null;
    var uniforms = {
      u_colorBack: P.getShaderColorFromString(o.back || "rgba(0,0,0,0)"),
      u_colorFront: P.getShaderColorFromString(o.front || ORANGE),
      u_shape: P.DitheringShapes[o.shape || "sphere"],
      u_type: P.DitheringTypes[o.type || "4x4"],
      u_pxSize: o.size == null ? 2 : o.size,
      u_scale: o.scale == null ? 0.5 : o.scale,
      u_rotation: o.rotation || 0,
      u_offsetX: o.offsetX || 0,
      u_offsetY: o.offsetY || 0,
      u_fit: o.fit == null ? 1 : o.fit,
      u_originX: 0.5,
      u_originY: 0.5,
      u_worldWidth: 0,
      u_worldHeight: 0,
    };
    return new P.ShaderMount(
      host,
      P.ditheringFragmentShader,
      uniforms,
      {},
      REDUCE ? 0 : o.speed == null ? 0.5 : o.speed
    );
  }

  /* ------------------------------------------------------------------ */
  /* textmode.js                                                        */
  /* ------------------------------------------------------------------ */

  function ascii(canvas, fontSize, factory) {
    if (!canvas) return null;

    /* textmode has no pixel-ratio setting, so render at 2x and let CSS scale
       the canvas down: glyphs stay crisp on retina screens. */
    var DPR = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

    var t = TM.textmode.create({
      canvas: canvas,
      fontSize: fontSize * DPR,
      frameRate: 60,
      loadingScreen: { transition: "none" },
    });

    var ptr = { x: 0, y: 0, active: false, down: false };
    var scene = null;
    var w = 0;
    var h = 0;
    var ready = false;

    function fit() {
      if (!ready || !t.grid) return;
      var r = canvas.getBoundingClientRect();
      var nw = Math.max(1, Math.round(r.width));
      var nh = Math.max(1, Math.round(r.height));
      if (nw === w && nh === h) return;
      w = nw;
      h = nh;
      t.resizeCanvas(nw * DPR, nh * DPR);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      if (!t.grid) return;
      scene = factory(t, ptr);
    }

    t.setup(function () {
      ready = true;
      fit();
      if (REDUCE) t.noLoop();
    });

    t.draw(function () {
      if (!scene) return;
      t.background("rgba(0,0,0,0)");
      t.cellColor("rgba(0,0,0,0)");
      t.printAlign("left", "top");
      scene.frame(t);
    });

    canvas.addEventListener(
      "pointermove",
      function (e) {
        try {
          var p = t.projectClientToGrid(e.clientX, e.clientY);
          if (isFinite(p.x) && isFinite(p.y)) {
            ptr.x = p.x;
            ptr.y = p.y;
            ptr.active = true;
          }
        } catch (err) {
          /* grid not ready yet */
        }
      },
      { passive: true }
    );
    canvas.addEventListener("pointerleave", function () {
      ptr.active = false;
    }, { passive: true });
    canvas.addEventListener("pointerdown", function () {
      ptr.down = true;
    }, { passive: true });
    window.addEventListener("pointerup", function () {
      ptr.down = false;
    }, { passive: true });

    if (window.IntersectionObserver) {
      new IntersectionObserver(
        function (entries) {
          if (REDUCE) return;
          if (entries[0].isIntersecting) t.loop();
          else t.noLoop();
        },
        { threshold: 0.02 }
      ).observe(canvas);
    }

    if (window.ResizeObserver) new ResizeObserver(fit).observe(canvas);
    else window.addEventListener("resize", fit);

    return t;
  }

  /* A character buffer, flushed as one print per row per colour. */
  function Buffer(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.ch = new Array(cols * rows);
    this.co = new Uint8Array(cols * rows);
    for (var i = 0; i < this.ch.length; i++) this.ch[i] = " ";
  }

  Buffer.prototype.clear = function () {
    for (var i = 0; i < this.ch.length; i++) {
      this.ch[i] = " ";
      this.co[i] = 0;
    }
  };

  Buffer.prototype.set = function (x, y, ch, co) {
    x = Math.round(x) + Math.floor(this.cols / 2);
    y = Math.round(y) + Math.floor(this.rows / 2);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    var i = y * this.cols + x;
    this.ch[i] = ch;
    this.co[i] = co;
  };

  Buffer.prototype.flush = function (t, colors, from, to) {
    var cols = this.cols;
    var rows = this.rows;
    var x0 = -Math.floor(cols / 2);
    var y0 = -Math.floor(rows / 2);
    var lo = from == null ? 0 : Math.max(0, from);
    var hi = to == null ? cols : Math.min(cols, to);
    /* Print runs of one colour, never a full row of spaces: a later colour
       pass would otherwise erase the glyphs an earlier pass drew. */
    for (var y = 0; y < rows; y++) {
      var x = lo;
      while (x < hi) {
        var c = this.co[y * cols + x];
        if (c === 0) {
          x++;
          continue;
        }
        var start = x;
        var text = "";
        while (x < hi && this.co[y * cols + x] === c) {
          text += this.ch[y * cols + x];
          x++;
        }
        t.charColor(colors[c]);
        t.print(text, x0 + start, y0 + y);
      }
    }
  };

  function label(t, text, x, y, color) {
    t.charColor(color || INK);
    t.print(text, Math.round(x), Math.round(y));
  }

  function centre(text, cols) {
    return -Math.floor(cols / 2) + Math.floor((cols - text.length) / 2);
  }

  /* ------------------------------------------------------------------ */
  /* Hero: a dithered core inside an ASCII halo                         */
  /* ------------------------------------------------------------------ */

  function heroScene(t, ptr, scale) {
    var cols = t.grid.cols;
    var rows = t.grid.rows;
    var buf = new Buffer(cols, rows);
    var min = Math.min(cols, rows);
    var orbR = (min * scale) / 2;
    var parts = [];
    var dust = [];
    var i;

    function add(hx, hy, ch, co) {
      parts.push({ hx: hx, hy: hy, x: hx, y: hy, vx: 0, vy: 0, ch: ch, co: co });
    }

    var seen = {};
    function addOnce(hx, hy, ch, co) {
      var k = Math.round(hx) + "," + Math.round(hy);
      if (seen[k]) return;
      seen[k] = 1;
      add(hx, hy, ch, co);
    }

    /* --- bezel: sampled by angle, so the ring is a true circle --- */
    function ring(radius, dash, chMain, chTick) {
      var steps = Math.ceil(2 * Math.PI * radius * 2.4);
      for (var s = 0; s < steps; s++) {
        var a = (s / steps) * Math.PI * 2;
        if (dash && s % dash !== 0) continue;
        var deg = (s / steps) * 360;
        var tick = Math.abs(deg - Math.round(deg / 30) * 30) < 0.7;
        addOnce(
          Math.round(Math.cos(a) * radius),
          Math.round(Math.sin(a) * radius),
          tick ? chTick : chMain,
          1
        );
      }
    }

    ring(orbR + 1.05, 0, ".", "+");
    ring(orbR + 3.4, 4, ".", "+");

    /* --- twelve radial ticks, longer at the quarters --- */
    for (var k = 0; k < 12; k++) {
      var ta = (k / 12) * Math.PI * 2;
      var long = k % 3 === 0;
      var end = orbR + (long ? 3.0 : 2.6);
      for (var rr = orbR + 1.9; rr <= end; rr += 0.3) {
        addOnce(
          Math.round(Math.cos(ta) * rr),
          Math.round(Math.sin(ta) * rr),
          long ? "+" : "|",
          1
        );
      }
    }

    /* --- four dashed crosshair arms out to the frame edge --- */
    var armX = Math.floor(cols / 2) - 1;
    var armY = Math.floor(rows / 2) - 1;
    var arms = [
      [1, 0, "-", armX],
      [-1, 0, "-", armX],
      [0, 1, "|", armY],
      [0, -1, "|", armY],
    ];
    for (var a2 = 0; a2 < 4; a2++) {
      var arm = arms[a2];
      for (var s = orbR + 4.2; s < arm[3]; s += 2) {
        add(arm[0] * s, arm[1] * s, arm[2], 1);
      }
    }

    /* --- dust: sparse, drifting, repelled by the pointer --- */
    var dustN = Math.round(min * 2.4);
    for (i = 0; i < dustN; i++) {
      var px, py, pd;
      var guard = 0;
      do {
        px = (Math.random() - 0.5) * (cols - 3);
        py = (Math.random() - 0.5) * (rows - 3);
        pd = Math.sqrt(px * px + py * py);
        guard++;
      } while (pd < orbR + 5 && guard < 40);
      if (pd < orbR + 5) continue;
      dust.push({
        hx0: px,
        hy0: py,
        hx: px,
        hy: py,
        x: px,
        y: py,
        vx: 0,
        vy: 0,
        ph: Math.random() * Math.PI * 2,
        ch: Math.random() < 0.22 ? ":" : ".",
      });
    }

    var blips = [];
    for (i = 0; i < 4; i++) {
      blips.push({
        a: (i / 4) * Math.PI * 2 + 0.55,
        r: orbR + 3.4,
        ph: Math.random() * Math.PI * 2,
      });
    }

    var last = 0;

    function frame(t2) {
      var now = performance.now();
      var dt = last ? Math.min(2.2, (now - last) / 16.67) : 1;
      last = now;
      var time = now * 0.001;

      buf.clear();

      var pr = 5.6;
      var pr2 = pr * pr;

      function step(p) {
        if (ptr.active) {
          var dx = p.x - ptr.x;
          var dy = p.y - ptr.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < pr2) {
            var dd = Math.sqrt(d2) || 0.001;
            var f = 1 - dd / pr;
            var push = f * f * 1.7;
            p.vx += (dx / dd) * push * dt;
            p.vy += (dy / dd) * push * dt;
          }
        }
        p.vx += (p.hx - p.x) * 0.06 * dt;
        p.vy += (p.hy - p.y) * 0.06 * dt;
        p.vx *= 0.9;
        p.vy *= 0.9;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      for (i = 0; i < parts.length; i++) {
        var p = parts[i];
        step(p);
        buf.set(p.x, p.y, p.ch, p.co);
      }

      var drift = time * 0.22;
      for (i = 0; i < dust.length; i++) {
        var q = dust[i];
        q.hx = q.hx0 + Math.cos(drift + q.ph) * 1.1;
        q.hy = q.hy0 + Math.sin(drift * 0.8 + q.ph) * 1.1;
        step(q);
        buf.set(q.x, q.y, q.ch, 3);
      }

      /* --- sweep: an orange arc travelling round the inner bezel --- */
      var sweep = time * 0.55;
      var mid = orbR + 1.05;
      for (var k2 = 0; k2 < 30; k2++) {
        var sa = sweep - k2 * 0.019;
        var ch2 = k2 === 0 ? "+" : k2 < 6 ? "o" : ".";
        buf.set(Math.cos(sa) * mid, Math.sin(sa) * mid, ch2, 2);
      }

      for (i = 0; i < blips.length; i++) {
        var b = blips[i];
        var pulse = (Math.sin(time * 1.6 + b.ph) + 1) / 2;
        var ch3 = pulse > 0.78 ? "@" : pulse > 0.5 ? "O" : "o";
        buf.set(Math.cos(b.a) * b.r, Math.sin(b.a) * b.r, ch3, 2);
      }

      buf.flush(t2, [null, INK, ORANGE, DUST]);
    }

    return { frame: frame };
  }

  /* ------------------------------------------------------------------ */
  /* Workflow minis                                                     */
  /* ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ */
  /* Workflow stage                                                     */
  /* ------------------------------------------------------------------ */

  var C_INK = 1;
  var C_ORANGE = 2;
  var C_GREEN = 3;
  var C_DUST = 4;
  var FLOW_COLORS = [null, INK, ORANGE, GREEN, DUST];

  function put(buf, str, x, y, co) {
    for (var i = 0; i < str.length; i++) buf.set(x + i, y, str.charAt(i), co);
  }

  function putR(buf, str, xr, y, co) {
    put(buf, str, xr - str.length + 1, y, co);
  }

  function hline(buf, x, y, w, ch, co) {
    for (var i = 0; i < w; i++) buf.set(x + i, y, ch, co);
  }

  function vline(buf, x, y, h, ch, co) {
    for (var i = 0; i < h; i++) buf.set(x, y + i, ch, co);
  }

  function box(buf, x, y, w, h, co) {
    hline(buf, x, y, w, "-", co);
    hline(buf, x, y + h - 1, w, "-", co);
    vline(buf, x, y, h, "|", co);
    vline(buf, x + w - 1, y, h, "|", co);
    buf.set(x, y, "+", co);
    buf.set(x + w - 1, y, "+", co);
    buf.set(x, y + h - 1, "+", co);
    buf.set(x + w - 1, y + h - 1, "+", co);
  }

  /* A 5x7 pixel face. Hash marks, not blocks: this font has no block glyphs,
     and at 8px a hash reads as a pixel while "@" reads as a blob. */
  var BIG = {
    "0": ["#####", "#...#", "#...#", "#...#", "#...#", "#...#", "#####"],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", "#####"],
    "2": ["#####", "....#", "....#", "#####", "#....", "#....", "#####"],
    "3": ["#####", "....#", "....#", "#####", "....#", "....#", "#####"],
    "4": ["#...#", "#...#", "#...#", "#####", "....#", "....#", "....#"],
    "5": ["#####", "#....", "#....", "#####", "....#", "....#", "#####"],
    "6": ["#####", "#....", "#....", "#####", "#...#", "#...#", "#####"],
    "7": ["#####", "....#", "....#", "....#", "....#", "....#", "....#"],
    "8": ["#####", "#...#", "#...#", "#####", "#...#", "#...#", "#####"],
    "9": ["#####", "#...#", "#...#", "#####", "....#", "....#", "#####"],
    "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
    ",": [".....", ".....", ".....", ".....", ".....", "..#..", ".#..."],
  };

  function bigNum(buf, str, x, y, co) {
    for (var i = 0; i < str.length; i++) {
      var g = BIG[str.charAt(i)];
      if (!g) continue;
      for (var r = 0; r < 7; r++) {
        for (var c = 0; c < 5; c++) {
          if (g[r].charAt(c) === "#") buf.set(x + i * 6 + c, y + r, "#", co);
        }
      }
    }
  }

  function stageFrame(t, usedH) {
    var cols = t.grid.cols;
    var rows = t.grid.rows;
    var W = Math.min(cols - 6, 112);
    var H = Math.min(rows - 6, usedH || 26);
    return {
      cols: cols,
      rows: rows,
      W: W,
      H: H,
      cx: -Math.floor(cols / 2) + Math.floor((cols - W) / 2),
      cy: -Math.floor(rows / 2) + Math.floor((rows - H) / 2),
      compact: W < 72,
    };
  }

  function zones(g) {
    if (g.compact) {
      return { a: g.cx, aw: 0, b: g.cx, bw: g.W, c: g.cx + g.W, cw: 0 };
    }
    var zb = g.cx + Math.round(g.W * 0.36);
    var zc = g.cx + Math.round(g.W * 0.7);
    return {
      a: g.cx,
      aw: Math.round(g.W * 0.3),
      b: zb,
      bw: Math.round(g.W * 0.3),
      c: zc,
      cw: g.cx + g.W - zc,
    };
  }

  /* A dotted hand-off between two zones, with one packet in flight. */
  function arrow(buf, x1, x2, y, p, co) {
    for (var x = x1; x < x2; x++) buf.set(x, y, "-", co);
    buf.set(x2, y, ">", co);
    buf.set(x1 + Math.round((x2 - x1 - 1) * p), y, "o", C_ORANGE);
  }

  /* A segmented meter: reads as a ratio at a glance. */
  function segBar(buf, x, y, filled, total, co) {
    for (var i = 0; i < total; i++) {
      var on = i < filled;
      var x0 = x + i * 3;
      buf.set(x0, y, on ? "#" : ".", on ? co : C_DUST);
      buf.set(x0 + 1, y, on ? "#" : ".", on ? co : C_DUST);
    }
  }

  function sceneDiscover(t) {
    var g = stageFrame(t, 26);
    var z = zones(g);
    var buf = new Buffer(g.cols, g.rows);
    var phase = 0;
    var last = 0;
    var sources = ["naukri", "indeed", "27 ats boards", "3 portals"];

    function draw(b) {
      b.clear();
      var now = performance.now();
      var dt = last ? Math.min(2, (now - last) / 16.67) : 1;
      last = now;
      phase += dt * 0.012;
      var scan = (Math.sin(phase) + 1) / 2;

      if (!g.compact) put(b, "SOURCES", z.a, g.cy, C_DUST);
      put(b, "SCAN", z.b, g.cy, C_DUST);
      if (!g.compact) put(b, "FOUND", z.c, g.cy, C_DUST);

      if (!g.compact) {
        for (var i = 0; i < sources.length; i++) {
          var y = g.cy + 2 + i * 2;
          put(b, sources[i], z.a, y, C_INK);
          var on = Math.floor(phase * 1.6 + i) % 5 !== 0;
          put(b, on ? "o" : ".", z.a + z.aw - 2, y, on ? C_GREEN : C_DUST);
        }
        hline(b, z.a, g.cy + 10, z.aw - 2, "-", C_DUST);
        put(b, "your session", z.a, g.cy + 12, C_DUST);
        put(b, "no login shared", z.a, g.cy + 14, C_INK);
        arrow(b, z.a + z.aw, z.b - 2, g.cy + 5, (phase * 0.4) % 1, C_DUST);
      }

      var gw = z.bw - 1;
      var gh = g.compact ? Math.min(g.H - 6, 20) : Math.min(g.H - 2, 24);
      var sc = scan * (gw - 1);
      for (var r = 0; r < gh; r++) {
        for (var c = 0; c < gw; c++) {
          var base = (r * 7 + c * 5) % 17 < 4;
          if (Math.abs(c - sc) < 1.1) b.set(z.b + c, g.cy + 2 + r, "o", C_ORANGE);
          else if (c < sc) {
            if (base) b.set(z.b + c, g.cy + 2 + r, "+", C_INK);
          } else if (base) b.set(z.b + c, g.cy + 2 + r, ".", C_DUST);
        }
      }

      if (!g.compact) {
        arrow(b, z.b + z.bw, z.c - 2, g.cy + 5, (phase * 0.4 + 0.5) % 1, C_DUST);
        bigNum(b, "1,291", z.c, g.cy + 2, C_ORANGE);
        put(b, "roles found", z.c, g.cy + 10, C_INK);
        hline(b, z.c, g.cy + 12, z.cw - 1, "-", C_DUST);
        put(b, "PORTALS", z.c, g.cy + 14, C_DUST);
        var bars = [
          ["Tesla", 63, 2],
          ["EPAM", 251, 7],
          ["Amazon", 283, 8],
        ];
        for (var p = 0; p < bars.length; p++) {
          var py = g.cy + 16 + p * 2;
          put(b, bars[p][0], z.c, py, C_INK);
          hline(b, z.c + 8, py, bars[p][2], "#", C_ORANGE);
          put(b, String(bars[p][1]), z.c + 18, py, C_DUST);
        }
        hline(b, z.c, g.cy + 22, z.cw - 1, "-", C_DUST);
        put(b, "46s / 30 sources", z.c, g.cy + 24, C_DUST);
      } else {
        put(b, "1,291 roles / 30 sources", g.cx, g.cy + g.H - 1, C_INK);
      }
    }

    return { buf: buf, draw: draw };
  }

  function sceneScore(t) {
    var g = stageFrame(t, 24);
    var z = zones(g);
    var buf = new Buffer(g.cols, g.rows);
    var grow = 0;
    var hold = 0;
    var last = 0;
    var dims = [
      ["role", 92],
      ["skill", 74],
      ["exp", 68],
      ["industry", 81],
      ["city", 90],
      ["own", 55],
      ["comp", 61],
    ];

    function draw(b) {
      b.clear();
      var now = performance.now();
      var dt = last ? Math.min(2, (now - last) / 16.67) : 1;
      last = now;
      if (grow < 1) grow = Math.min(1, grow + dt * 0.009);
      else {
        hold += dt;
        if (hold > 200) {
          hold = 0;
          grow = 0;
        }
      }

      if (!g.compact) {
        box(b, z.a, g.cy, z.aw, 9, C_INK);
        put(b, "DATA ANALYST", z.a + 2, g.cy + 2, C_INK);
        put(b, "Bengaluru / 3 yrs", z.a + 2, g.cy + 4, C_DUST);
        put(b, "18-24 LPA", z.a + 2, g.cy + 6, C_DUST);
        arrow(b, z.a + z.aw, z.b - 2, g.cy + 5, grow, C_DUST);
      }

      put(b, "DIMENSIONS", z.b, g.cy, C_DUST);
      var labelW = 8;
      var barW = Math.max(6, z.bw - labelW - 5);
      var step = 3;
      for (var i = 0; i < dims.length; i++) {
        var y = g.cy + 2 + i * step;
        var v = dims[i][1];
        var fill = Math.round((v / 100) * barW * grow);
        put(b, dims[i][0], z.b, y, C_INK);
        hline(b, z.b + labelW + 1, y, barW, ".", C_DUST);
        hline(b, z.b + labelW + 1, y, fill, "#", i === 0 ? C_ORANGE : C_INK);
        putR(b, String(Math.round(v * grow)), z.b + z.bw - 1, y, C_INK);
      }

      if (!g.compact) {
        arrow(b, z.b + z.bw, z.c - 2, g.cy + 5, grow, C_DUST);
        put(b, "SCORE", z.c, g.cy, C_DUST);
        bigNum(b, "82", z.c, g.cy + 2, C_ORANGE);
        put(b, "/ 100", z.c, g.cy + 10, C_DUST);
        hline(b, z.c, g.cy + 12, z.cw - 1, "-", C_DUST);
        put(b, "strongest", z.c, g.cy + 14, C_DUST);
        put(b, "role fit 92", z.c, g.cy + 16, C_INK);
        put(b, "weakest", z.c, g.cy + 18, C_DUST);
        put(b, "ownership 55", z.c, g.cy + 20, C_INK);
      } else {
        put(b, "82 / 100 - role 92, ownership 55", g.cx, g.cy + g.H - 2, C_INK);
      }
    }

    return { buf: buf, draw: draw };
  }

  function scenePrepare(t) {
    var g = stageFrame(t, 18);
    var z = zones(g);
    var buf = new Buffer(g.cols, g.rows);
    var tick = 0;
    var last = 0;
    var cv = ["Led a team of six", "Built SQL pipeline", "Shipped dbt models"];
    var keys = [
      ["dbt", "+ added"],
      ["airflow", "+ added"],
      ["python", "= kept"],
      ["spark", "- missing"],
      ["sql", "= kept"],
      ["tableau", "- missing"],
      ["excel", "= kept"],
    ];

    function draw(b) {
      b.clear();
      var now = performance.now();
      var dt = last ? Math.min(2, (now - last) / 16.67) : 1;
      last = now;
      tick += dt * 0.018;
      var cursor = Math.floor(tick) % cv.length;

      if (!g.compact) {
        box(b, z.a, g.cy, z.aw, 14, C_INK);
        put(b, "RESUME v3", z.a + 2, g.cy + 2, C_INK);
        hline(b, z.a + 1, g.cy + 3, z.aw - 2, "-", C_DUST);
        for (var i = 0; i < cv.length; i++) {
          put(b, cv[i], z.a + 2, g.cy + 5 + i * 2, i === cursor ? C_ORANGE : C_INK);
        }
        put(b, "every date kept", z.a + 2, g.cy + 11, C_DUST);
        arrow(b, z.a + z.aw, z.b - 2, g.cy + 6, (tick * 0.3) % 1, C_DUST);
      }

      put(b, "KEYWORDS", z.b, g.cy, C_DUST);
      for (var k = 0; k < keys.length; k++) {
        var y = g.cy + 2 + k * 2;
        put(b, keys[k][0], z.b, y, C_INK);
        var st = keys[k][1];
        var co = st.charAt(0) === "+" ? C_GREEN : st.charAt(0) === "-" ? C_ORANGE : C_DUST;
        putR(b, st, z.b + z.bw - 1, y, co);
      }

      if (!g.compact) {
        arrow(b, z.b + z.bw, z.c - 2, g.cy + 4, (tick * 0.3 + 0.5) % 1, C_DUST);
        put(b, "ATS GAP", z.c, g.cy, C_DUST);
        segBar(b, z.c, g.cy + 2, 6, 9, C_ORANGE);
        put(b, "6 of 9 covered", z.c, g.cy + 4, C_INK);
        hline(b, z.c, g.cy + 6, z.cw - 1, "-", C_DUST);
        put(b, "gap report", z.c, g.cy + 8, C_DUST);
        put(b, "no model used", z.c, g.cy + 10, C_INK);
        hline(b, z.c, g.cy + 12, z.cw - 1, "-", C_DUST);
        put(b, "tailoring", z.c, g.cy + 14, C_DUST);
        put(b, "your own key", z.c, g.cy + 16, C_INK);
      } else {
        put(b, "ATS gap 6/9 - no model used", g.cx, g.cy + g.H - 2, C_INK);
      }
    }

    return { buf: buf, draw: draw };
  }

  function sceneApply(t) {
    var g = stageFrame(t, 18);
    var z = zones(g);
    var buf = new Buffer(g.cols, g.rows);
    var blink = 0;
    var last = 0;
    var bank = [
      ["ctc", "18-24 LPA"],
      ["notice", "30 days"],
      ["auth", "citizen"],
      ["links", "github"],
    ];
    var fields = [
      ["role", "analyst"],
      ["resume", "v3.pdf"],
      ["ctc", "18-24 LPA"],
      ["notice", "30 days"],
      ["auth", "citizen"],
      ["links", "github"],
      ["letter", "optional"],
    ];

    function draw(b) {
      b.clear();
      var now = performance.now();
      var dt = last ? Math.min(2, (now - last) / 16.67) : 1;
      last = now;
      blink += dt;
      var active = Math.floor(blink / 55) % fields.length;

      if (!g.compact) {
        box(b, z.a, g.cy, z.aw, 13, C_INK);
        put(b, "ANSWER BANK", z.a + 2, g.cy + 2, C_INK);
        hline(b, z.a + 1, g.cy + 3, z.aw - 2, "-", C_DUST);
        for (var i = 0; i < bank.length; i++) {
          put(b, bank[i][0], z.a + 2, g.cy + 5 + i * 2, C_DUST);
          put(b, bank[i][1], z.a + 12, g.cy + 5 + i * 2, C_INK);
        }
        arrow(b, z.a + z.aw, z.b - 2, g.cy + 6, (blink * 0.01) % 1, C_DUST);
      }

      put(b, "FORM", z.b, g.cy, C_DUST);
      for (var f = 0; f < fields.length; f++) {
        var y = g.cy + 2 + f * 2;
        put(b, fields[f][0], z.b, y, C_INK);
        var val = "[" + fields[f][1] + "]";
        put(b, val, z.b + 8, y, f === active ? C_ORANGE : C_INK);
        if (f === active) put(b, "_", z.b + 8 + val.length, y, C_ORANGE);
      }

      if (!g.compact) {
        arrow(b, z.b + z.bw, z.c - 2, g.cy + 4, (blink * 0.01 + 0.5) % 1, C_DUST);
        put(b, "REVIEW", z.c, g.cy, C_DUST);
        put(b, "+ fields filled", z.c, g.cy + 2, C_GREEN);
        put(b, "+ you checked it", z.c, g.cy + 4, C_GREEN);
        put(b, "+ cap 4/10 today", z.c, g.cy + 6, C_DUST);
        hline(b, z.c, g.cy + 8, z.cw - 1, "-", C_DUST);
        var on = Math.floor(blink / 30) % 2 === 0;
        var bw = Math.min(z.cw - 1, 20);
        var by = g.cy + 10;
        box(b, z.c, by, bw, 3, on ? C_ORANGE : C_INK);
        put(b, "SUBMIT", z.c + Math.floor((bw - 6) / 2), by + 1, on ? C_ORANGE : C_INK);
        put(b, "you press it", z.c, by + 4, C_DUST);
      } else {
        put(b, "auto apply, or you press submit", g.cx, g.cy + g.H - 2, C_INK);
      }
    }

    return { buf: buf, draw: draw };
  }

  function sceneTrack(t) {
    var g = stageFrame(t, 16);
    var z = zones(g);
    var buf = new Buffer(g.cols, g.rows);
    var step = 0;
    var last = 0;
    var stages = [
      ["applied", 4],
      ["screening", 2],
      ["interview", 1],
      ["offer", 0],
    ];
    var log = [
      "09:12 applied analyst",
      "09:20 applied bi dev",
      "09:31 dupe blocked",
      "09:44 applied ops",
      "09:58 cap reached",
      "10:02 next run 09:00",
    ];

    function draw(b) {
      b.clear();
      var now = performance.now();
      var dt = last ? Math.min(2, (now - last) / 16.67) : 1;
      last = now;
      step += dt * 0.006;
      var scroll = Math.floor(step) % log.length;

      if (!g.compact) {
        put(b, "PIPELINE", z.a, g.cy, C_DUST);
        for (var i = 0; i < stages.length; i++) {
          var y = g.cy + 2 + i * 2;
          put(b, stages[i][0], z.a, y, C_INK);
          putR(b, String(stages[i][1]), z.a + 11, y, stages[i][1] ? C_ORANGE : C_DUST);
        }
        arrow(b, z.a + z.aw, z.b - 2, g.cy + 5, (step * 0.2) % 1, C_DUST);
      }

      put(b, "AUDIT LOG", z.b, g.cy, C_DUST);
      for (var k = 0; k < 6; k++) {
        var idx = (scroll + k) % log.length;
        put(b, log[idx], z.b, g.cy + 2 + k * 2, k === 5 ? C_ORANGE : C_INK);
      }

      if (!g.compact) {
        arrow(b, z.b + z.bw, z.c - 2, g.cy + 4, (step * 0.2 + 0.5) % 1, C_DUST);
        put(b, "TODAY", z.c, g.cy, C_DUST);
        segBar(b, z.c, g.cy + 2, 4, 10, C_ORANGE);
        put(b, "4 of 10 applied", z.c, g.cy + 4, C_INK);
        hline(b, z.c, g.cy + 6, z.cw - 1, "-", C_DUST);
        put(b, "dupes 2", z.c, g.cy + 8, C_INK);
        put(b, "local only", z.c, g.cy + 10, C_DUST);
        hline(b, z.c, g.cy + 12, z.cw - 1, "-", C_DUST);
        put(b, "next run 09:00", z.c, g.cy + 14, C_DUST);
      } else {
        put(b, "4/10 today - local audit log", g.cx, g.cy + g.H - 2, C_INK);
      }
    }

    return { buf: buf, draw: draw };
  }

  /* One canvas, five scenes, and a wipe between them. */
  function flowStage(canvas, fontSize) {
    var current = "discover";
    var scenes = null;
    var tm = null;

    ascii(canvas, fontSize, function (t) {
      tm = t;
      scenes = {
        discover: sceneDiscover(tm),
        score: sceneScore(tm),
        prepare: scenePrepare(tm),
        apply: sceneApply(tm),
        track: sceneTrack(tm),
      };

      return {
        frame: function (t2) {
          var cur = scenes[current];
          if (!cur) return;
          cur.draw(cur.buf, t2);
          cur.buf.flush(t2, FLOW_COLORS);
        },
      };
    });

    return {
      select: function (name) {
        if (!scenes || !scenes[name] || name === current) return;
        current = name;
        /* Under reduced motion the loop is stopped after the first frame, so a
           tab change needs one explicit frame to show the new scene. */
        if (REDUCE && tm) tm.redraw();
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Mount                                                              */
  /* ------------------------------------------------------------------ */

  var heroCanvas = $("heroField");
  var heroHost = $("heroShader");
  var HERO_SCALE = 0.66;

  if (heroCanvas && heroHost) {
    var heroMount = dither(heroHost, {
      shape: "sphere",
      type: "4x4",
      size: 2,
      scale: HERO_SCALE,
      speed: 0.45,
      front: ORANGE,
      back: "rgba(0,0,0,0)",
      fit: 1,
    });

    ascii(heroCanvas, 8, function (t, ptr) {
      return heroScene(t, ptr, HERO_SCALE);
    });

    if (heroMount && !REDUCE) {
      var heroFrame = heroCanvas.parentElement;
      heroFrame.addEventListener(
        "pointermove",
        function (e) {
          var r = heroFrame.getBoundingClientRect();
          var nx = (e.clientX - r.left) / r.width - 0.5;
          var ny = (e.clientY - r.top) / r.height - 0.5;
          heroMount.setUniforms({
            u_scale: HERO_SCALE * (1 + Math.abs(nx) * 0.05 + Math.abs(ny) * 0.03),
            u_rotation: nx * 12,
            u_offsetX: nx * 0.025,
            u_offsetY: ny * 0.025,
          });
        },
        { passive: true }
      );
      heroFrame.addEventListener("pointerleave", function () {
        heroMount.setUniforms({
          u_scale: HERO_SCALE,
          u_rotation: 0,
          u_offsetX: 0,
          u_offsetY: 0,
        });
      });
    }
  }

  var closingHost = $("closingShader");
  if (closingHost) {
    dither(closingHost, {
      shape: closingHost.getAttribute("data-shape") || "wave",
      type: "4x4",
      size: 2,
      scale: 1.05,
      speed: 0.3,
      front: ORANGE,
      back: "#111513",
      fit: 2,
    });
  }

  var flowCanvas = $("flowCanvas");
  var flow = flowCanvas ? flowStage(flowCanvas, 9) : null;

  window.CareerOpsArt = { hero: heroCanvas, flow: flow };
})();


