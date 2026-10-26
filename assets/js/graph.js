/*
 * graph.js - hero network illustration + mobile nav toggle.
 * Static graph (seeded, identical every load) with a single random-walk
 * "message" travelling along its edges.
 */

// ---------------------------------------------------------------------------
// CONFIG - tweak the animation here.
// ---------------------------------------------------------------------------
const CONFIG = {
  messageSpeed: 100,        // px per second along an edge
  waitTime: [900, 1000],    // ms pause at each node; number or [min, max]
  messageColor: '#b5646a',  // colour of the message dot, glow, trail and pulse
  messageRadius: 5,         // radius of the message dot in px
  seed: 7,                  // PRNG seed: changes the layout (and the walk)
  nodeCount: 39,            // foreground nodes (including the central hub)
  bgNodeCount: 18,          // faint background depth nodes
  frameAspect: 16 / 16,       // width / height of the graph's frame, centered in the canvas
  showDot: false,           // message dot + glow (off: only the trail is drawn)
  showTrail: true,          // short fading trail behind the message
  showPulse: false,          // expanding ring on a node when the message arrives
  walkSteps: 3,             // edge steps before each wiggly "inferred link" jump to a non-neighbour
  jumpRadius: 0.25,         // max jump distance, in normalized (0..1) graph coordinates
  wiggleAmplitude: 2,       // px, peak sideways offset of the wiggly jump path
  wiggleWavelength: 18,     // px, approximate wavelength of the wiggle
  jumpTrailLength: 0.4,     // trail length (fraction of the path) during a jump
  jumpColor: null,          // colour during a jump; null = same as messageColor
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

    var target = CONFIG.nodeCount, tries = 0;
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
    for (var b = 0; b < CONFIG.bgNodeCount; b++) {
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
    for (var l = 0; l < 5; l++) {
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

    // Two static layers so the message can travel between them:
    // depth nodes + edges below, foreground nodes above.
    var off = document.createElement('canvas');   // depth nodes + edges
    var octx = off.getContext('2d');
    var offNodes = document.createElement('canvas');   // foreground nodes
    var nctx = offNodes.getContext('2d');
    var W = 0, H = 0, dpr = 1, minDim = 0;
    var FX = 0, FY = 0, FW = 0, FH = 0;           // graph frame within the canvas
    var px = [], py = [];                         // node positions in CSS px

    // Opacity multiplier toward the frame edges (matches the mask below).
    function fade(x, y) {
      var dx = ((x - FX) / FW - 0.5) / 0.5, dy = ((y - FY) / FH - 0.5) / 0.5;
      var t = Math.sqrt(dx * dx + dy * dy);
      var f = Math.min(1, Math.max(0, (t - 0.72) / 0.28));
      return 1 - f * f * (3 - 2 * f);
    }

    function drawStatic() {
      var nodes = graph.nodes;
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, W, H);
      px = nodes.map(function (nd) { return FX + nd.x * FW; });
      py = nodes.map(function (nd) { return FY + nd.y * FH; });

      // Faded depth nodes (soft radial gradients, no blur filter needed).
      graph.bg.forEach(function (b) {
        var x = FX + b.x * FW, y = FY + b.y * FH, r = b.r * minDim;
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

      // Foreground nodes (separate layer, drawn above the message).
      nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nctx.clearRect(0, 0, W, H);
      nodes.forEach(function (nd, i) {
        nctx.globalAlpha = i === 0 ? 1.00 : 1.00;
        nctx.fillStyle = nd.color;
        nctx.beginPath(); nctx.arc(px[i], py[i], nd.r * minDim, 0, 6.2832); nctx.fill();
      });
      nctx.globalAlpha = 1;

      applyMask(octx);
      applyMask(nctx);
    }

    // Soft elliptical fade toward the edges so it blends into the page.
    function applyMask(c) {
      c.save();
      c.globalCompositeOperation = 'destination-in';
      c.translate(FX + FW / 2, FY + FH / 2); c.scale(FW / 2, FH / 2);
      var m = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      for (var i = 0; i <= 10; i++) {
        var t = 0.72 + 0.028 * i, f = (t - 0.72) / 0.28;
        m.addColorStop(Math.min(t, 1), 'rgba(0,0,0,' + (1 - f * f * (3 - 2 * f)).toFixed(3) + ')');
      }
      m.addColorStop(0, 'rgba(0,0,0,1)');
      c.fillStyle = m; c.fillRect(-1, -1, 2, 2);
      c.restore();
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
      // Largest landscape frame of the configured aspect that fits the canvas.
      FW = Math.min(W, H * CONFIG.frameAspect); FH = FW / CONFIG.frameAspect;
      FX = (W - FW) / 2; FY = (H - FH) / 2;
      canvas.width = off.width = offNodes.width = Math.round(W * dpr);
      canvas.height = off.height = offNodes.height = Math.round(H * dpr);
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
    var jumping = false, jumpWaves = 1;           // current move is a wiggly jump
    var stepsSinceJump = 0;                       // edge steps taken since the last jump

    function pickWait() {
      var w = CONFIG.waitTime;
      return Array.isArray(w) ? w[0] + rnd() * (w[1] - w[0]) : w;
    }
    function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

    function smooth(t) { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); }

    // Point on the current move at path parameter s in [0,1]: straight line,
    // or (for jumps) a sine wave perpendicular to it, tapered to 0 at both ends.
    function pathPoint(s) {
      var x0 = px[cur], y0 = py[cur], dx = px[next] - x0, dy = py[next] - y0;
      var x = x0 + dx * s, y = y0 + dy * s;
      if (!jumping) return { x: x, y: y };
      var L = Math.hypot(dx, dy) || 1;
      var env = smooth(s / 0.15) * smooth((1 - s) / 0.15);
      var off = CONFIG.wiggleAmplitude * Math.sin(6.2832 * jumpWaves * s) * env;
      return { x: x - dy / L * off, y: y + dx / L * off };
    }

    // Nearby nodes not directly connected to `cur` (candidates for a jump).
    function jumpCandidates() {
      var out = [], nd = graph.nodes, adj = graph.adj[cur], r2 = CONFIG.jumpRadius * CONFIG.jumpRadius;
      for (var i = 0; i < nd.length; i++) {
        if (i === cur || adj.indexOf(i) >= 0) continue;
        var dx = nd[i].x - nd[cur].x, dy = nd[i].y - nd[cur].y;
        if (dx * dx + dy * dy <= r2) out.push(i);
      }
      return out;
    }

    function step(dt) {
      for (var i = pulses.length - 1; i >= 0; i--) {
        pulses[i].age += dt;
        if (pulses[i].age > PULSE_MS) pulses.splice(i, 1);
      }
      if (waiting) {
        waitLeft -= dt;
        if (waitLeft <= 0) {
          var nb = graph.adj[cur], cand = null;
          jumping = false;
          // Fixed cycle: walkSteps edge steps, then one jump. If no jump target
          // is in range, keep walking and try again at the next node.
          if (stepsSinceJump >= CONFIG.walkSteps) {
            cand = jumpCandidates();
            if (!cand.length) cand = null;
          }
          if (cand) {
            next = cand[Math.floor(rnd() * cand.length)];
            jumping = true;
            stepsSinceJump = 0;
          } else {
            next = nb[Math.floor(rnd() * nb.length)];
            stepsSinceJump++;
          }
          var len = Math.hypot(px[next] - px[cur], py[next] - py[cur]);
          if (jumping) {
            jumpWaves = Math.max(1, Math.round(len / CONFIG.wiggleWavelength));
            // Approximate arc length of the wiggly path by sampling it.
            var arc = 0, pp = pathPoint(0);
            for (var k = 1; k <= 40; k++) {
              var qq = pathPoint(k / 40);
              arc += Math.hypot(qq.x - pp.x, qq.y - pp.y); pp = qq;
            }
            len = arc;
          }
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
        var hp = pathPoint(ease(progress));
        mx = hp.x; my = hp.y;
      }
    }

    function draw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(off, 0, 0);
      if (reduceMotion || !px.length) { ctx.drawImage(offNodes, 0, 0); return; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var col = (jumping && !waiting && CONFIG.jumpColor) || CONFIG.messageColor, R = CONFIG.messageRadius;
      var f = fade(mx, my);

      // Short trail behind the dot while travelling.
      if (CONFIG.showTrail && !waiting) {
        var lag = jumping ? CONFIG.jumpTrailLength : 0.25;
        var s0 = ease(Math.max(0, progress - lag)), s1 = ease(progress);
        var tail = pathPoint(s0), tx = tail.x, ty = tail.y;
        var lg = ctx.createLinearGradient(tx, ty, mx, my);
        lg.addColorStop(0, hexA(col, 0));
        lg.addColorStop(1, hexA(col, 0.9 * f));
        ctx.strokeStyle = lg; ctx.lineWidth = R * 0.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty);
        if (jumping) {
          // Follow the wiggle: polyline sampled roughly every 2px of path.
          var ns = Math.max(8, Math.min(60, Math.ceil(Math.hypot(px[next] - px[cur], py[next] - py[cur]) * (s1 - s0) / 2)));
          for (var si = 1; si <= ns; si++) {
            var sp = pathPoint(s0 + (s1 - s0) * si / ns);
            ctx.lineTo(sp.x, sp.y);
          }
        } else ctx.lineTo(mx, my);
        ctx.stroke();
      }

      // Soft glow + dot.
      if (CONFIG.showDot) {
        var gl = ctx.createRadialGradient(mx, my, 0, mx, my, R * 4);
        gl.addColorStop(0, hexA(col, 0.45 * f)); gl.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(mx, my, R * 4, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = Math.max(0.25, f);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(mx, my, R, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Foreground nodes cover the message.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(offNodes, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Expanding, fading pulse ring on the arrival node (outside the node).
      pulses.forEach(function (p) {
        var t = p.age / PULSE_MS, nr = graph.nodes[p.node].r * minDim;
        ctx.strokeStyle = hexA(col, (1 - t) * 0.8 * fade(px[p.node], py[p.node]));
        ctx.lineWidth = 2 * (1 - t) + 0.5;
        ctx.beginPath(); ctx.arc(px[p.node], py[p.node], nr + 2 + t * 22, 0, 6.2832); ctx.stroke();
      });
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
