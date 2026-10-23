/*
 * graph.js - hero network illustration + mobile nav toggle.
 * Static graph (seeded, identical every load) with a single random-walk
 * "message" travelling along its edges.
 */

// ---------------------------------------------------------------------------
// CONFIG - tweak the animation here.
// ---------------------------------------------------------------------------
const CONFIG = {
  messageSpeed: 120,        // px per second along an edge
  waitTime: [600, 1400],    // ms pause at each node; number or [min, max]
  messageColor: '#b5646a',  // colour of the message dot, glow, trail and pulse
  messageRadius: 5,         // radius of the message dot in px
  seed: 7,                  // PRNG seed: changes the layout (and the walk)
  showTrail: true,          // short fading trail behind the message
  showPulse: false,          // expanding ring on a node when the message arrives
};

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Mobile navigation toggle
  // -------------------------------------------------------------------------
  function initNav() {
    var header = document.querySelector('.site-header');
    var btn = document.querySelector('.nav-toggle');
    var nav = document.getElementById('site-nav');
    if (!header || !btn) return;

    function setOpen(open) {
      header.classList.toggle('nav-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.addEventListener('click', function () {
      setOpen(!header.classList.contains('nav-open'));
    });
    if (nav) {
      nav.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('a')) setOpen(false);
      });
    }
  }

  // -------------------------------------------------------------------------
  // Palette
  // -------------------------------------------------------------------------
  var DARK = '#3f4a42', SAGE = '#7d9473', LIGHT_SAGE = '#a7b69a',
      OLIVE = '#b7b48a', PALE_OLIVE = '#d9d5b0',
      EDGE = 'rgba(90,110,95,0.35)';

  // Seeded PRNG so the layout is the same on every load.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // -------------------------------------------------------------------------
  // Graph generation (normalized 0..1 coordinates, done once)
  // -------------------------------------------------------------------------
  function buildGraph(seed) {
    var rnd = mulberry32(seed);
    var nodes = [];   // foreground: {x, y, r (fraction of min dimension), color}
    var bg = [];      // blurred depth nodes: {x, y, r, color}
    var colors = [SAGE, SAGE, SAGE, LIGHT_SAGE, LIGHT_SAGE, OLIVE, PALE_OLIVE, DARK];

    // Central node: big and dark.
    nodes.push({ x: 0.5, y: 0.52, r: 0.05, color: DARK });

    // Foreground nodes from a mixture of irregular Gaussian clusters, so the
    // density is uneven and the outline is organic rather than round.
    function gauss() {
      return Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(6.2832 * rnd());
    }
    var clusters = [{ x: 0.5, y: 0.52, sx: 0.13, sy: 0.11, w: 2 }];
    for (var cI = 0; cI < 4; cI++) {
      var ang = rnd() * 6.2832, rad = 0.18 + rnd() * 0.2;
      clusters.push({
        x: 0.5 + Math.cos(ang) * rad, y: 0.5 + Math.sin(ang) * rad * 0.9,
        sx: 0.05 + rnd() * 0.09, sy: 0.05 + rnd() * 0.09, w: 0.6 + rnd(),
      });
    }
    var wSum = clusters.reduce(function (s, cl) { return s + cl.w; }, 0);
    function pickCluster() {
      var t = rnd() * wSum;
      for (var ci = 0; ci < clusters.length; ci++) if ((t -= clusters[ci].w) <= 0) return clusters[ci];
      return clusters[0];
    }

    var target = 55, tries = 0;
    while (nodes.length < target && tries++ < 20000) {
      var cl = pickCluster();
      var x = cl.x + gauss() * cl.sx, y = cl.y + gauss() * cl.sy;
      if (x < 0.04 || x > 0.96 || y < 0.04 || y > 0.96) continue;
      var minD = 0.045 + rnd() * 0.04;   // varied spacing breaks up the lattice look
      var ok = true;
      for (var i = 0; i < nodes.length; i++) {
        var dx = nodes[i].x - x, dy = nodes[i].y - y;
        var lim = i === 0 ? 0.11 : minD;
        if (dx * dx + dy * dy < lim * lim) { ok = false; break; }
      }
      if (!ok) continue;
      var big = rnd() < 0.18;
      nodes.push({
        x: x, y: y,
        r: big ? 0.020 + rnd() * 0.014 : 0.008 + rnd() * 0.009,
        color: colors[Math.floor(rnd() * colors.length)],
      });
    }

    // Background depth nodes: larger, faint, no edges.
    for (var b = 0; b < 26; b++) {
      bg.push({
        x: 0.05 + rnd() * 0.9, y: 0.05 + rnd() * 0.9,
        r: 0.012 + rnd() * 0.022,
        color: [OLIVE, PALE_OLIVE, LIGHT_SAGE, SAGE][Math.floor(rnd() * 4)],
      });
    }

    // Edges: each node links to its 2-4 nearest neighbours (deduped).
    var n = nodes.length, edgeSet = {}, edges = [];
    function addEdge(a, c) {
      if (a === c) return;
      var key = a < c ? a + '-' + c : c + '-' + a;
      if (edgeSet[key]) return;
      edgeSet[key] = true;
      edges.push([a, c]);
    }
    function dist2(a, c) {
      var dx = nodes[a].x - nodes[c].x, dy = nodes[a].y - nodes[c].y;
      return dx * dx + dy * dy;
    }
    for (var a = 0; a < n; a++) {
      var order = [];
      for (var c = 0; c < n; c++) if (c !== a) order.push(c);
      order.sort(function (p, q) { return dist2(a, p) - dist2(a, q); });
      var k = 1 + Math.floor(rnd() * 4);
      for (var j = 0; j < k; j++) if (j === 0 || rnd() > 0.15) addEdge(a, order[j]);
    }
    // A few longer-range links, as in real networks.
    for (var l = 0; l < 7; l++) {
      var la = Math.floor(rnd() * n), lb = Math.floor(rnd() * n);
      if (dist2(la, lb) < 0.35 * 0.35) addEdge(la, lb);
    }
    // The hub gets a few extra spokes so it reads as central.
    var hub = [];
    for (var h = 1; h < n; h++) hub.push(h);
    hub.sort(function (p, q) { return dist2(0, p) - dist2(0, q); });
    for (var s = 0; s < 6; s++) addEdge(0, hub[s]);

    // Ensure connectivity: union-find, then bridge components by closest pair.
    var parent = [];
    for (var u = 0; u < n; u++) parent.push(u);
    function find(v) { while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; } return v; }
    edges.forEach(function (e) { parent[find(e[0])] = find(e[1]); });
    for (;;) {
      var best = null, bd = Infinity;
      for (var p = 0; p < n; p++) for (var q = p + 1; q < n; q++) {
        if (find(p) === find(q)) continue;
        var d = dist2(p, q);
        if (d < bd) { bd = d; best = [p, q]; }
      }
      if (!best) break;
      addEdge(best[0], best[1]);
      parent[find(best[0])] = find(best[1]);
    }

    var adj = nodes.map(function () { return []; });
    edges.forEach(function (e) { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); });
    return { nodes: nodes, bg: bg, edges: edges, adj: adj };
  }

  // -------------------------------------------------------------------------
  // Hero canvas
  // -------------------------------------------------------------------------
  function initHero() {
    var canvas = document.getElementById('hero-graph');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var graph = buildGraph(CONFIG.seed);
    var reduceMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var off = document.createElement('canvas');   // static graph layer
    var octx = off.getContext('2d');
    var W = 0, H = 0, dpr = 1, minDim = 0;
    var px = [], py = [];                         // node positions in CSS px

    // Opacity multiplier toward the canvas edges (matches the mask below).
    function fade(x, y) {
      var dx = (x / W - 0.5) / 0.5, dy = (y / H - 0.5) / 0.5;
      var t = Math.sqrt(dx * dx + dy * dy);
      var f = Math.min(1, Math.max(0, (t - 0.72) / 0.28));
      return 1 - f * f * (3 - 2 * f);
    }

    function drawStatic() {
      var nodes = graph.nodes;
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, W, H);
      px = nodes.map(function (nd) { return nd.x * W; });
      py = nodes.map(function (nd) { return nd.y * H; });

      // Faded depth nodes (soft radial gradients, no blur filter needed).
      graph.bg.forEach(function (b) {
        var x = b.x * W, y = b.y * H, r = b.r * minDim;
        var g = octx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, hexA(b.color, 0.45));
        g.addColorStop(0.6, hexA(b.color, 0.25));
        g.addColorStop(1, hexA(b.color, 0));
        octx.fillStyle = g;
        octx.beginPath(); octx.arc(x, y, r, 0, 6.2832); octx.fill();
      });

      // Edges.
      octx.strokeStyle = EDGE; octx.lineWidth = 1;
      octx.beginPath();
      graph.edges.forEach(function (e) {
        octx.moveTo(px[e[0]], py[e[0]]); octx.lineTo(px[e[1]], py[e[1]]);
      });
      octx.stroke();

      // Foreground nodes.
      nodes.forEach(function (nd, i) {
        octx.globalAlpha = i === 0 ? 0.95 : 0.88;
        octx.fillStyle = nd.color;
        octx.beginPath(); octx.arc(px[i], py[i], nd.r * minDim, 0, 6.2832); octx.fill();
      });
      octx.globalAlpha = 1;

      // Soft elliptical fade toward the edges so it blends into the page.
      octx.save();
      octx.globalCompositeOperation = 'destination-in';
      octx.translate(W / 2, H / 2); octx.scale(W / 2, H / 2);
      var m = octx.createRadialGradient(0, 0, 0, 0, 0, 1);
      for (var i = 0; i <= 10; i++) {
        var t = 0.72 + 0.028 * i, f = (t - 0.72) / 0.28;
        m.addColorStop(Math.min(t, 1), 'rgba(0,0,0,' + (1 - f * f * (3 - 2 * f)).toFixed(3) + ')');
      }
      m.addColorStop(0, 'rgba(0,0,0,1)');
      octx.fillStyle = m; octx.fillRect(-1, -1, 2, 2);
      octx.restore();
    }

    // '#rrggbb' + alpha -> rgba string.
    function hexA(hex, a) {
      var v = parseInt(hex.slice(1), 16);
      return 'rgba(' + (v >> 16) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + a + ')';
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      var w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
      var d = window.devicePixelRatio || 1;
      if (w === W && h === H && d === dpr) return;
      W = w; H = h; dpr = d; minDim = Math.min(W, H);
      canvas.width = off.width = Math.round(W * dpr);
      canvas.height = off.height = Math.round(H * dpr);
      drawStatic();
      draw(performance.now());
    }

    // ---- Random-walk message state ----------------------------------------
    var rnd = mulberry32(CONFIG.seed * 9973 + 1);
    var cur = 0, next = -1, progress = 0, duration = 0;
    var waiting = true, waitLeft = 400;
    var pulses = [];                              // {node, age}
    var PULSE_MS = 900;
    var mx = 0, my = 0;

    function pickWait() {
      var w = CONFIG.waitTime;
      return Array.isArray(w) ? w[0] + rnd() * (w[1] - w[0]) : w;
    }
    function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

    function step(dt) {
      for (var i = pulses.length - 1; i >= 0; i--) {
        pulses[i].age += dt;
        if (pulses[i].age > PULSE_MS) pulses.splice(i, 1);
      }
      if (waiting) {
        waitLeft -= dt;
        if (waitLeft <= 0) {
          var nb = graph.adj[cur];
          next = nb[Math.floor(rnd() * nb.length)];
          var len = Math.hypot(px[next] - px[cur], py[next] - py[cur]);
          duration = Math.max(150, len / CONFIG.messageSpeed * 1000);
          progress = 0; waiting = false;
        }
      } else {
        progress += dt / duration;
        if (progress >= 1) {
          cur = next; next = -1; waiting = true; waitLeft = pickWait();
          if (CONFIG.showPulse) pulses.push({ node: cur, age: 0 });
        }
      }
      if (waiting) { mx = px[cur]; my = py[cur]; }
      else {
        var e = ease(progress);
        mx = px[cur] + (px[next] - px[cur]) * e;
        my = py[cur] + (py[next] - py[cur]) * e;
      }
    }

    function draw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(off, 0, 0);
      if (reduceMotion || !px.length) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var col = CONFIG.messageColor, R = CONFIG.messageRadius;

      // Expanding, fading pulse ring on the arrival node.
      pulses.forEach(function (p) {
        var t = p.age / PULSE_MS, nr = graph.nodes[p.node].r * minDim;
        ctx.strokeStyle = hexA(col, (1 - t) * 0.8 * fade(px[p.node], py[p.node]));
        ctx.lineWidth = 2 * (1 - t) + 0.5;
        ctx.beginPath(); ctx.arc(px[p.node], py[p.node], nr + 2 + t * 22, 0, 6.2832); ctx.stroke();
      });

      var f = fade(mx, my);

      // Short trail behind the dot while travelling.
      if (CONFIG.showTrail && !waiting) {
        var tp = ease(Math.max(0, progress - 0.25));
        var tx = px[cur] + (px[next] - px[cur]) * tp, ty = py[cur] + (py[next] - py[cur]) * tp;
        var lg = ctx.createLinearGradient(tx, ty, mx, my);
        lg.addColorStop(0, hexA(col, 0));
        lg.addColorStop(1, hexA(col, 0.6 * f));
        ctx.strokeStyle = lg; ctx.lineWidth = R * 0.8; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(mx, my); ctx.stroke();
      }

      // Soft glow + dot.
      var gl = ctx.createRadialGradient(mx, my, 0, mx, my, R * 4);
      gl.addColorStop(0, hexA(col, 0.45 * f)); gl.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(mx, my, R * 4, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = Math.max(0.25, f);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(mx, my, R, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ---- Loop, with pause when hidden / offscreen -------------------------
    var rafId = 0, last = 0, visible = true;
    function frame(now) {
      var dt = Math.min(100, now - last); last = now;
      step(dt); draw();
      rafId = requestAnimationFrame(frame);
    }
    function start() {
      if (rafId || reduceMotion || !visible || document.hidden) return;
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    }
    function stop() { if (rafId) cancelAnimationFrame(rafId); rafId = 0; }

    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentElement);
    else window.addEventListener('resize', resize);
    if (reduceMotion) return;

    mx = px[0]; my = py[0];
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        visible ? start() : stop();
      }).observe(canvas);
    }
    start();
  }

  function init() { initNav(); initHero(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
