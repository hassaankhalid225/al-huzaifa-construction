/* Al Huzaifa — 3D blueprint villa (Three.js r128, global THREE)
   - builds itself stage by stage while an articulated tower crane lifts the parts in
   - blueprint <-> built render, drag to orbit
   - on the home page the camera and render mode follow the scroll story (window.AH.storyS, set by main.js)
   - hand-written post pass (glow + vignette + grain) on capable desktops only */
(function () {
  'use strict';
  var AH = window.AH = window.AH || {};
  var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var C = { ink: 0x071b33, cyan: 0x9cc8f0, amber: 0xf2a900, blue: 0x2a6db5, glass: 0x7fb8ea, steel: 0x7fa9d6 };

  /* ---------------- small math / easing toolkit (no GSAP) ---------------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function easeIO(t) { t = clamp(t, 0, 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }
  function wrapPi(a) { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; }
  function lerpAng(a, b, t) { return a + wrapPi(b - a) * t; }

  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  /* ---------------- text sprites for annotations ---------------- */
  function makeLabel(text, o) {
    o = o || {};
    var cvs = document.createElement('canvas'), ctx = cvs.getContext('2d');
    var size = o.size || .62, fs = 40;
    var color = o.color || '#9CC8F0';
    var sp;
    function draw() {
      var font = '500 ' + fs + 'px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
      ctx.font = font;
      var tw = Math.ceil(ctx.measureText(text).width);
      var w = o.bubble ? 84 : tw + 28, h = o.bubble ? 84 : 60;
      cvs.width = w; cvs.height = h;
      ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (o.bubble) {
        ctx.strokeStyle = color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(42, 42, 36, 0, Math.PI * 2); ctx.stroke();
      } else if (o.box) {
        ctx.fillStyle = 'rgba(7,27,51,.82)'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = color; ctx.fillRect(0, 0, 5, h);
      }
      ctx.fillStyle = color;
      ctx.fillText(text, w / 2 + (o.box ? 3 : 0), h / 2 + 2);
      return [w, h];
    }
    var wh = draw();
    var tex = new THREE.CanvasTexture(cvs);
    tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 });
    sp = new THREE.Sprite(mat);
    sp.renderOrder = 10;
    sp.scale.set(size * wh[0] / wh[1], size, 1);
    sp.userData.redraw = function () { var r = draw(); tex.needsUpdate = true; sp.scale.set(size * r[0] / r[1], size, 1); };
    return sp;
  }

  /* ---------------- the villa model ---------------- */
  // stages: 0 setting-out, 1 foundations, 2 GF slab+columns, 3 GF walls/stair/beams, 4 FF slab,
  // 5 FF columns+walls (+scaffold), 6 roof, 7 MEP, 8 glazing, 9 external works, 10 handover (scaffold struck)
  var SOLID = { st: 0xd5cec0, slab: 0xcbc3b4, wall: 0xefe9de, col: 0xc2baab, glass: 0x1b3a5c, mep: 0xb9c3cc, mepx: 0xc5ced6, water: 0x2f93d6, deck: 0x8a7458, bound: 0xd9d2c4 };

  function createModel(lite, clips) {
    var root = new THREE.Group();
    var parts = [], lines = [], labels = [];
    var cache = {};

    function geo(w, h, d) {
      var k = w + '|' + h + '|' + d, g = cache[k];
      if (!g) { g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); g.userData.e = new THREE.EdgesGeometry(g); cache[k] = g; }
      return g;
    }

    function add(o) {
      var kind = o.kind || 'st';
      var g = o.geo || geo(o.w, o.h, o.d);
      var eg = o.geo ? new THREE.EdgesGeometry(o.geo, 25) : g.userData.e;
      var isM = kind === 'mep' || kind === 'mepx';
      var holder = new THREE.Group();
      holder.position.set(o.x, o.y, o.z);
      var em = new THREE.LineBasicMaterial({ color: isM ? C.amber : C.cyan, transparent: true, opacity: 0, clippingPlanes: clips });
      var edges = new THREE.LineSegments(eg, em);
      var fm = new THREE.MeshBasicMaterial({ color: isM ? C.amber : (kind === 'glass' ? C.glass : (kind === 'water' ? 0x3fa7ff : C.blue)), transparent: true, opacity: 0, depthWrite: false, clippingPlanes: clips, side: THREE.DoubleSide });
      var fill = new THREE.Mesh(g, fm);
      var sm = null, solid = null;
      if (kind !== 'mep') {
        var sc = { color: SOLID[kind] || SOLID.st, transparent: true, opacity: 0, clippingPlanes: clips };
        if (lite) sm = new THREE.MeshLambertMaterial(sc);
        else {
          sc.roughness = kind === 'glass' ? .15 : (kind === 'water' ? .1 : .86);
          sc.metalness = kind === 'glass' ? .35 : 0;
          sm = new THREE.MeshStandardMaterial(sc);
        }
        solid = new THREE.Mesh(g, sm);
        solid.castShadow = kind !== 'glass' && kind !== 'water';
        solid.receiveShadow = true;
        solid.visible = false;
        holder.add(solid);
      }
      fill.renderOrder = 1; edges.renderOrder = 2;
      fill.visible = false;
      holder.add(fill); holder.add(edges);
      root.add(holder);
      var p = { h: holder, em: em, fm: fm, sm: sm, fill: fill, edges: edges, solid: solid, kind: kind, stage: o.stage, layer: o.layer || 0,
        grow: o.grow || 'y', op: o.op == null ? .13 : o.op, by: o.y, t0: 0, dur: .7, ph: o.x * .37 + o.z * .21 };
      parts.push(p);
      return p;
    }

    function addLines(arr, o) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      var mo = { color: o.color || C.cyan, transparent: true, opacity: 0, clippingPlanes: o.clip === false ? null : clips };
      var m;
      if (o.dashed) { mo.dashSize = .45; mo.gapSize = .3; m = new THREE.LineDashedMaterial(mo); }
      else m = new THREE.LineBasicMaterial(mo);
      var obj = new THREE.LineSegments(g, m);
      if (o.dashed) obj.computeLineDistances();
      obj.renderOrder = 3;
      root.add(obj);
      var L = { obj: obj, m: m, n: arr.length / 3, kind: o.kind, stage: o.stage, layer: o.layer || 0, t0: 0, dur: o.dur || 1.1 };
      lines.push(L);
      return L;
    }

    function addLabel(text, x, y, z, o) {
      var s = makeLabel(text, o);
      s.position.set(x, y, z);
      s.userData.kind = o.kind; s.userData.stage = o.stage || 0; s.userData.layer = o.layer || 0; s.userData.by = y;
      root.add(s); labels.push(s);
      return s;
    }

    // wall with openings: axis 'x' runs along x at z = fixed; openings [start, end, sill, head]
    function wall(axis, fixed, a0, a1, y0, h, ops, st, glassSt, layer) {
      var t = .2, cur = a0;
      function seg(s, e, yb, hh, kind, stage) {
        if (e - s < .02 || hh < .02) return;
        var c = (s + e) / 2, L = e - s, th = kind === 'glass' ? .06 : t;
        if (axis === 'x') add({ w: L, h: hh, d: th, x: c, y: yb, z: fixed, kind: kind, stage: stage, layer: layer, op: kind === 'glass' ? .25 : .1 });
        else add({ w: th, h: hh, d: L, x: fixed, y: yb, z: c, kind: kind, stage: stage, layer: layer, op: kind === 'glass' ? .25 : .1 });
      }
      (ops || []).forEach(function (op) {
        seg(cur, op[0], y0, h, 'wall', st);
        seg(op[0], op[1], y0, op[2], 'wall', st);
        seg(op[0], op[1], y0 + op[3], h - op[3], 'wall', st);
        seg(op[0], op[1], y0 + op[2], op[3] - op[2], 'glass', glassSt);
        cur = op[1];
      });
      seg(cur, a1, y0, h, 'wall', st);
    }

    var colsX = [-6, -2, 2, 6], colsZ = [-4, 0, 4];
    var GF = .3, FF = 3.7, RF = 7.1, H = 3.1;

    /* stage 0 — setting out: grid axes, dimensions, levels */
    var ax = [];
    colsZ.forEach(function (z) { ax.push(-8.8, .02, z, 8.8, .02, z); });
    colsX.forEach(function (x) { ax.push(x, .02, -6.6, x, .02, 6.6); });
    addLines(ax, { kind: 'site', stage: 0, dashed: true, clip: false, dur: 1.4 });
    var dm = [];
    function dimLine(a, b, ext) { // a,b endpoints; ext: [dx,dz] extension direction
      dm.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      [a, b].forEach(function (p) {
        dm.push(p[0] - ext[0] * 2.4, p[1], p[2] - ext[1] * 2.4, p[0] + ext[0] * .35, p[1], p[2] + ext[1] * .35);
        dm.push(p[0] - .25, p[1], p[2] - .25, p[0] + .25, p[1], p[2] + .25);
      });
    }
    dimLine([-6.5, .02, 7.6], [6.5, .02, 7.6], [0, 1]);
    dimLine([-10.2, .02, -4.5], [-10.2, .02, 4.5], [-1, 0]);
    dm.push(-9.4, GF, 6.4, -9.4, RF, 6.4);
    [GF, FF, RF].forEach(function (y) { dm.push(-9.75, y, 6.4, -9.05, y, 6.4); });
    addLines(dm, { kind: 'site', stage: 0, clip: false, dur: 1.2 });
    ['A', 'B', 'C'].forEach(function (s, i) { addLabel(s, -9.7, .05, colsZ[i], { bubble: true, kind: 'site', size: .8 }); });
    ['1', '2', '3', '4'].forEach(function (s, i) { addLabel(s, colsX[i], .05, -7.4, { bubble: true, kind: 'site', size: .8 }); });
    addLabel('13.00', 0, .4, 8.1, { kind: 'site' });
    addLabel('9.00', -10.9, .4, 0, { kind: 'site' });
    addLabel('±0.00', -10.7, GF + .3, 6.4, { kind: 'level', size: .55 });
    addLabel('+3.40', -10.7, FF + .3, 6.4, { kind: 'level', size: .55 });
    addLabel('+6.80', -10.7, RF + .3, 6.4, { kind: 'level', size: .55 });

    /* stage 1 — foundations */
    colsX.forEach(function (x) { colsZ.forEach(function (z) { add({ w: 1.4, h: .55, d: 1.4, x: x, y: -1, z: z, stage: 1, op: .2 }); }); });
    if (!lite) {
      colsZ.forEach(function (z) { add({ w: 12.4, h: .4, d: .3, x: 0, y: -.45, z: z, stage: 1, grow: 'x' }); });
      colsX.forEach(function (x) { add({ w: .3, h: .4, d: 8.4, x: x, y: -.45, z: 0, stage: 1, grow: 'z' }); });
      var rb = [];
      colsX.forEach(function (x) { colsZ.forEach(function (z) {
        [[-.12, -.12], [.12, -.12], [.12, .12], [-.12, .12]].forEach(function (o) { rb.push(x + o[0], -.5, z + o[1], x + o[0], 1.5, z + o[1]); });
      }); });
      addLines(rb, { kind: 'rebar', stage: 1, color: C.steel });
    }
    // laydown area by the crane
    add({ w: 1.8, h: .3, d: 1, x: -11, y: 0, z: 3.4, kind: 'deck', stage: 1, op: .2 });
    add({ w: 1.8, h: .3, d: 1, x: -11, y: .3, z: 3.4, kind: 'deck', stage: 1, op: .2 });

    /* stage 2 — ground slab + ground floor columns */
    add({ w: 13.4, h: .3, d: 9.4, x: 0, y: 0, z: 0, kind: 'slab', stage: 2, layer: 1, grow: 'x', op: .2 });
    colsX.forEach(function (x) { colsZ.forEach(function (z) { add({ w: .4, h: H, d: .4, x: x, y: GF, z: z, kind: 'col', stage: 2, layer: 1, op: .45 }); }); });

    /* stage 3 — ground floor walls, stair, beams */
    wall('x', -4.5, -6.5, 6.5, GF, H, lite ? [[-1, 1, 1, 2.3]] : [[-1, 1, 1, 2.3], [3, 5, 1, 2.3]], 3, 8, 1);
    wall('z', -6.5, -4.5, 4.5, GF, H, [[-1.5, 1.5, .9, 2.4]], 3, 8, 1);
    wall('z', 6.5, -4.5, 4.5, GF, H, [[-2, 2, 0, 2.6]], 3, 8, 1);
    wall('x', 4.5, -6.5, 6.5, GF, H, [[-5.6, -3.8, 0, 2.6], [-2.6, 5.6, 0, 2.7]], 3, 8, 1);
    if (!lite) {
      colsZ.forEach(function (z) { add({ w: 12.4, h: .5, d: .3, x: 0, y: FF - .8, z: z, stage: 3, layer: 2, grow: 'x' }); });
      colsX.forEach(function (x) { add({ w: .3, h: .5, d: 8.4, x: x, y: FF - .8, z: 0, stage: 3, layer: 2, grow: 'z' }); });
    }
    var nSteps = lite ? 6 : 12, rise = (FF - GF) / nSteps, go = 6 / nSteps;
    for (var s = 0; s < nSteps; s++) add({ w: 1.1, h: rise * (s + 1), d: go, x: -5.1, y: GF, z: 2.5 - go / 2 - s * go, stage: 3, layer: 1, op: .16 });

    /* stage 4 — first floor slab (craned in) */
    add({ w: 14, h: .3, d: 10, x: -.5, y: FF - .3, z: .5, kind: 'slab', stage: 4, layer: 2, grow: 'drop', op: .2 });
    if (!lite) {
      var mesh = [];
      for (var mz = -4.2; mz <= 5.3; mz += .75) mesh.push(-7.3, FF - .15, mz, 6.3, FF - .15, mz);
      for (var mx = -7.2; mx <= 6.4; mx += .75) mesh.push(mx, FF - .15, -4.3, mx, FF - .15, 5.3);
      addLines(mesh, { kind: 'rebar', stage: 4, layer: 2, color: C.steel, dur: .9 });
    }

    /* stage 5 — first floor columns + walls */
    if (!lite) [-6, -2, 2].forEach(function (x) { colsZ.forEach(function (z) { add({ w: .35, h: H, d: .35, x: x, y: FF, z: z, kind: 'col', stage: 5, layer: 3, op: .45 }); }); });
    wall('x', 5.5, -7.5, 3, FF, H, [[-6.8, 2.3, .9, 2.5]], 5, 8, 3);
    wall('x', -4.5, -7.5, 3, FF, H, lite ? [[-4, -1, 1, 2.3]] : [[-4, -1, 1, 2.3], [.5, 2.3, 1, 2.3]], 5, 8, 3);
    wall('z', -7.5, -4.5, 5.5, FF, H, [[-1, 3, 1, 2.4]], 5, 8, 3);
    wall('z', 3, -4.5, 5.5, FF, H, [[0, 4.5, 0, 2.6]], 5, 8, 3);

    /* stage 6 — roof slab, parapets, stair head */
    add({ w: 10.9, h: .3, d: 10.4, x: -2.25, y: RF - .3, z: .5, kind: 'slab', stage: 6, layer: 4, grow: 'drop', op: .2 });
    add({ w: 10.9, h: .7, d: .15, x: -2.25, y: RF, z: 5.63, kind: 'wall', stage: 6, layer: 4 });
    add({ w: 10.9, h: .7, d: .15, x: -2.25, y: RF, z: -4.63, kind: 'wall', stage: 6, layer: 4 });
    add({ w: .15, h: .7, d: 10.4, x: -7.63, y: RF, z: .5, kind: 'wall', stage: 6, layer: 4 });
    add({ w: .15, h: .7, d: 10.4, x: 3.13, y: RF, z: .5, kind: 'wall', stage: 6, layer: 4 });
    add({ w: 3, h: 2.4, d: 2.5, x: -5.7, y: RF, z: -3.05, kind: 'wall', stage: 6, layer: 4, op: .14 });

    /* stage 7 — MEP (amber) */
    add({ w: .22, h: 7.8, d: .22, x: 2.4, y: -.5, z: -3.9, kind: 'mep', stage: 7, layer: 1 });
    add({ w: .2, h: 7.8, d: .2, x: -3.4, y: -.5, z: -4.1, kind: 'mep', stage: 7, layer: 1 });
    add({ w: 10.5, h: .32, d: .6, x: -.25, y: FF - 1.2, z: -1.6, kind: 'mep', stage: 7, layer: 1, grow: 'x' });
    (lite ? [-3.8, 4.2] : [-3.8, .4, 4.2]).forEach(function (x) { add({ w: .4, h: .28, d: 4.4, x: x, y: FF - 1.18, z: .8, kind: 'mep', stage: 7, layer: 1, grow: 'z' }); });
    add({ w: 8.6, h: .3, d: .55, x: -2.4, y: RF - .8, z: -1.6, kind: 'mep', stage: 7, layer: 3, grow: 'x' });
    if (!lite) {
      [-5, -1.2].forEach(function (x) { add({ w: .4, h: .26, d: 4.6, x: x, y: RF - .78, z: 1, kind: 'mep', stage: 7, layer: 3, grow: 'z' }); });
      add({ w: .6, h: .9, d: .15, x: -1.5, y: 1.1, z: -4.25, kind: 'mep', stage: 7, layer: 1 });
      add({ w: .8, h: .6, d: .6, x: 11.6, y: 0, z: -3.9, kind: 'mep', stage: 7 });
      var cd = [-1.5, 2, -4.25, -1.5, FF - .5, -4.25, -1.5, FF - .5, -4.25, -1.5, FF - .5, 3.6, -1.5, FF - .5, 3.6, -5.6, FF - .5, 3.6, -1.5, FF - .5, 0, 5.6, FF - .5, 0];
      addLines(cd, { kind: 'mepl', stage: 7, layer: 1, color: C.amber });
    }
    var tankG = new THREE.CylinderGeometry(.65, .65, 1.3, lite ? 10 : 18, 1); tankG.translate(0, .65, 0);
    add({ geo: tankG, x: -1.4, y: RF, z: -3.2, kind: 'mepx', stage: 7, layer: 5 });
    for (var u = 0; u < (lite ? 2 : 3); u++) add({ w: 1.1, h: .8, d: .75, x: -.2 + u * 1.3 - 2, y: RF, z: 3.6, kind: 'mepx', stage: 7, layer: 5 });
    addLines([2.4, -.35, -3.9, 2.4, -.35, -7.2, 2.4, -.35, -7.2, 9.4, -.35, -7.2, -3.4, -.35, -4.1, -3.4, -.35, -7.2, -3.4, -.35, -7.2, 2.4, -.35, -7.2], { kind: 'mepl', stage: 7, color: C.amber });
    add({ w: 1, h: .6, d: 1, x: 9.4, y: -.6, z: -7.2, kind: 'mep', stage: 7 });

    /* stage 8 — glazing (created by wall()) + terrace balustrade */
    add({ w: 3.5, h: 1, d: .05, x: 4.75, y: FF, z: 5.45, kind: 'glass', stage: 8, layer: 3, op: .25 });
    add({ w: .05, h: 1, d: 10, x: 6.45, y: FF, z: .5, kind: 'glass', stage: 8, layer: 3, op: .25 });

    /* stage 9 — external works */
    add({ w: 3, h: .14, d: 8, x: 9.5, y: 0, z: 1, kind: 'water', stage: 9, op: .45 });
    add({ w: 4.8, h: .08, d: 10.2, x: 9.6, y: 0, z: 1, kind: 'deck', stage: 9, op: .12 });
    add({ w: 25, h: 1.8, d: .2, x: 0, y: 0, z: -10, kind: 'bound', stage: 9, grow: 'x', op: .07 });
    add({ w: .2, h: 1.8, d: 21, x: -12.5, y: 0, z: .5, kind: 'bound', stage: 9, grow: 'z', op: .07 });
    add({ w: .2, h: 1.8, d: 21, x: 12.5, y: 0, z: .5, kind: 'bound', stage: 9, grow: 'z', op: .07 });
    add({ w: 11.5, h: 1.8, d: .2, x: -6.75, y: 0, z: 11, kind: 'bound', stage: 9, grow: 'x', op: .07 });
    add({ w: 9.5, h: 1.8, d: .2, x: 7.75, y: 0, z: 11, kind: 'bound', stage: 9, grow: 'x', op: .07 });

    /* scaffold along the first-floor facades (stage 5 up, struck at handover) */
    var sf = [], lifts = lite ? [0, 4.3, 8.6] : [0, 2.15, 4.3, 6.45, 8.6], step = lite ? 3.9 : 1.95;
    function scafRun(x0, z0, x1, z1, nx, nz) { // run along a facade, outer row offset by (nx,nz)
      var len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / step)), r;
      for (r = 0; r < 2; r++) {
        var ox = nx * r * .8, oz = nz * r * .8;
        for (var i = 0; i <= n; i++) {
          var x = lerp(x0, x1, i / n) + ox, z = lerp(z0, z1, i / n) + oz;
          sf.push(x, 0, z, x, lifts[lifts.length - 1], z);
          if (r === 1) lifts.forEach(function (y) { sf.push(x, y, z, x - nx * .8, y, z - nz * .8); });
          if (r === 1 && i < n && !lite && i % 2 === 0) { var xa = lerp(x0, x1, (i + 1) / n) + ox, za = lerp(z0, z1, (i + 1) / n) + oz; sf.push(x, 0, z, xa, lifts[2], za); }
        }
        lifts.forEach(function (y) { if (y > 0) sf.push(x0 + ox, y, z0 + oz, x1 + ox, y, z1 + oz); });
      }
    }
    scafRun(-8.1, 6.2, 3.6, 6.2, 0, 1);
    if (!lite) scafRun(-8.3, -5.1, -8.3, 6.2, -1, 0);
    var scaf = addLines(sf, { kind: 'scaf', stage: 5, color: C.steel, dur: 1.4 });

    /* section frame (follows the cut plane) */
    var fr = [-10, -1.6, 0, 10, -1.6, 0, 10, -1.6, 0, 10, 10.5, 0, 10, 10.5, 0, -10, 10.5, 0, -10, 10.5, 0, -10, -1.6, 0];
    var frame = addLines(fr, { kind: 'cutframe', stage: 0, color: C.amber, clip: false, dashed: true });
    var secLbl = addLabel('SECTION A–A', -7.4, 11.2, 0, { kind: 'section', box: true, color: '#F2A900', size: .7 });

    /* exploded-view layer tags */
    [[0, 'FOUNDATIONS', -.6], [1, 'GROUND FLOOR', 1.9], [2, 'FIRST FLOOR SLAB', FF - .15], [3, 'FIRST FLOOR', 5.4], [4, 'ROOF', RF + .4], [5, 'ROOF PLANT', RF + 1.3]].forEach(function (l) {
      addLabel(l[1], -10.6, l[2], 4.2, { kind: 'layer', layer: l[0], box: true, size: .58 });
    });

    /* survey points */
    var sp = [];
    for (var q = 0; q < (lite ? 60 : 140); q++) sp.push((Math.random() - .5) * 56, .03, (Math.random() - .5) * 56);
    var pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    var pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: C.cyan, size: .12, transparent: true, opacity: 0 }));
    root.add(pts);

    return { root: root, parts: parts, lines: lines, labels: labels, scaf: scaf, frame: frame, secLbl: secLbl, pts: pts };
  }

  /* ---------------- articulated tower crane ---------------- */
  var CR = { x: -9.5, z: -7.5, H: 15, L: 22, CJ: 6.5 };

  function createCrane(lite) {
    var group = new THREE.Group(); group.position.set(CR.x, 0, CR.z);
    var mat = new THREE.LineBasicMaterial({ color: C.amber, transparent: true, opacity: .9 });
    function segs(arr, m) { var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return new THREE.LineSegments(g, m || mat); }
    function boxPts(P, x0, y0, z0, x1, y1, z1) {
      var c = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      for (var k = 0; k < 4; k++) {
        var a = c[k], b = c[(k + 1) % 4];
        P.push(a[0], y0, a[1], b[0], y0, b[1], a[0], y1, a[1], b[0], y1, b[1], a[0], y0, a[1], a[0], y1, a[1]);
      }
    }
    var P = [], hw = .6, n = lite ? 6 : 10, st = CR.H / n, i, k;
    var cn = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]];
    for (i = 0; i < n; i++) {
      var y0 = i * st, y1 = y0 + st;
      for (k = 0; k < 4; k++) {
        var a = cn[k], b = cn[(k + 1) % 4];
        P.push(a[0], y0, a[1], a[0], y1, a[1]);
        P.push(a[0], y0, a[1], b[0], y0, b[1]);
        if (i % 2) P.push(a[0], y0, a[1], b[0], y1, b[1]); else P.push(b[0], y0, b[1], a[0], y1, a[1]);
      }
    }
    for (k = 0; k < 4; k++) { var e = cn[k], f = cn[(k + 1) % 4]; P.push(e[0], CR.H, e[1], f[0], CR.H, f[1]); }
    boxPts(P, -1.6, 0, -1.6, 1.6, .5, 1.6);
    group.add(segs(P));

    var slew = new THREE.Group(); slew.position.y = CR.H; group.add(slew);
    P = [];
    var jy = .7, jt = 1.8, jz = .5, js = lite ? 2.75 : 1.375, L = CR.L, CJ = CR.CJ;
    boxPts(P, -.9, 0, -.9, .9, jy, .9);
    [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].forEach(function (c) { P.push(c[0], jy, c[1], 0, 4.2, 0); });
    P.push(0, jy, -jz, L, jy, -jz, 0, jy, jz, L, jy, jz, 0, jt, 0, L - 1.2, jt, 0, L, jy, -jz, L - 1.2, jt, 0, L, jy, jz, L - 1.2, jt, 0);
    for (var x = 0, j = 0; x < L - 1.2; x += js, j++) {
      P.push(x, jy, -jz, x, jy, jz);
      var nx = Math.min(x + js, L - 1.2);
      P.push(x, jy, -jz, nx, jt, 0, x, jy, jz, nx, jt, 0);
      P.push(nx, jt, 0, nx, jy, -jz, nx, jt, 0, nx, jy, jz);
    }
    P.push(0, jy, -.7, -CJ, jy, -.7, 0, jy, .7, -CJ, jy, .7);
    for (x = 0; x >= -CJ; x -= 1.3) P.push(x, jy, -.7, x, jy, .7);
    P.push(0, 4.2, 0, L * .62, jt, 0, 0, 4.2, 0, -CJ + .2, jy, -.7, 0, 4.2, 0, -CJ + .2, jy, .7);
    boxPts(P, .9, -.9, .6, 2.1, .5, 1.6);
    slew.add(segs(P));
    var cwMat = new THREE.MeshBasicMaterial({ color: C.amber, transparent: true, opacity: .3, depthWrite: false });
    var cw = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 1.6), cwMat); cw.position.set(-CJ + .9, jy - .2, 0); slew.add(cw);
    var cwe = new THREE.LineSegments(new THREE.EdgesGeometry(cw.geometry), mat); cw.add(cwe);

    var trolley = new THREE.Group(); P = []; boxPts(P, -.45, jy - .35, -.55, .45, jy - .05, .55); trolley.add(segs(P)); slew.add(trolley);
    var cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    var cable = new THREE.LineSegments(cg, mat); cable.frustumCulled = false; slew.add(cable);
    var hook = new THREE.Group(); P = []; boxPts(P, -.28, -.2, -.18, .28, .28, .18); P.push(0, -.2, 0, 0, -.55, 0, 0, -.55, 0, .2, -.72, 0, .2, -.72, 0, .26, -.6, 0);
    hook.add(segs(P)); slew.add(hook);

    var load = new THREE.Group(); slew.add(load); load.visible = false;
    var loadFillMat = new THREE.MeshBasicMaterial({ color: C.amber, transparent: true, opacity: .28, depthWrite: false });
    var loadBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), loadFillMat); load.add(loadBox);
    var loadEdges = new THREE.LineSegments(new THREE.EdgesGeometry(loadBox.geometry), mat); loadBox.add(loadEdges);
    var slingG = new THREE.BufferGeometry(); slingG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24), 3));
    var slings = new THREE.LineSegments(slingG, mat); slings.frustumCulled = false; load.add(slings);
    var curSize = '';
    function setLoad(s) {
      var key = s.join(','); if (key === curSize) return; curSize = key;
      loadBox.scale.set(s[0], s[1], s[2]); loadBox.position.set(0, -1.1 - s[1] / 2, 0);
      var pa = slingG.attributes.position, c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (var q = 0; q < 4; q++) { pa.setXYZ(q * 2, 0, -.7, 0); pa.setXYZ(q * 2 + 1, c[q][0] * s[0] / 2, -1.1, c[q][1] * s[2] / 2); }
      pa.needsUpdate = true;
    }
    setLoad([1.6, .5, 1]);

    function pose(th, r, hy, showLoad, opacity) {
      slew.rotation.y = th;
      trolley.position.x = r;
      var ly = hy - CR.H;
      hook.position.set(r, ly, 0);
      var pa = cg.attributes.position;
      pa.setXYZ(0, r - .12, jy - .2, 0); pa.setXYZ(1, r - .12, ly + .28, 0);
      pa.setXYZ(2, r + .12, jy - .2, 0); pa.setXYZ(3, r + .12, ly + .28, 0);
      pa.needsUpdate = true;
      load.visible = showLoad;
      load.position.set(r, ly, 0);
      mat.opacity = .9 * opacity; cwMat.opacity = .3 * opacity; loadFillMat.opacity = .28 * opacity;
      group.visible = opacity > .01;
    }
    return { group: group, pose: pose, setLoad: setLoad };
  }

  function aim(x, z) { var dx = x - CR.x, dz = z - CR.z; return { th: Math.atan2(-dz, dx), r: clamp(Math.hypot(dx, dz), 2.5, CR.L - 1.2) }; }

  /* ---------------- views (camera + render mode) ---------------- */
  var KEYS = ['az', 'el', 'dist', 'tx', 'ty', 'tz', 'fov', 'explode', 'cut', 'xray', 'built', 'plan', 'annot', 'scaf', 'crane'];
  var DEF = { az: .72, el: .3, dist: 56, tx: 0, ty: 6.6, tz: 0, fov: 34, explode: 0, cut: 0, xray: 0, built: 0, plan: 0, annot: .8, scaf: 0, crane: 1 };
  function V(o) { var r = {}; KEYS.forEach(function (k) { r[k] = o[k] == null ? DEF[k] : o[k]; }); return r; }
  var STORY = [
    V({}),                                                                                           // hero: live build
    V({ az: .02, el: 1.4, dist: 41, ty: 0, tz: .5, plan: 1, annot: 1, crane: .55 }),                  // 1 site visit: plan
    V({ az: -.62, el: .34, dist: 54, ty: 8.6, explode: 1, annot: .9, crane: .5 }),                    // 2 scope: exploded
    V({ az: 0, el: .07, dist: 38, tx: -.5, ty: 4.2, fov: 30, cut: 1, annot: 1, crane: .3 }),          // 3 approvals: section
    V({ az: 2.3, el: .5, dist: 33, tx: -1, ty: 3.6, tz: -.5, xray: 1, scaf: 1, annot: .2, crane: .8 }), // 4 construction: MEP x-ray
    V({ az: .9, el: .3, dist: 44, ty: 4.2, tz: .5, built: 1, annot: 0, crane: 0 })                   // 5 handover: built
  ];
  var MINI = {
    built: V({ az: .85, el: .26, dist: 42, ty: 4.2, built: 1, annot: 0, crane: .5 }),
    explode: V({ az: -.6, el: .36, dist: 56, ty: 10, explode: 1, annot: .8, crane: .5 }),
    blueprint: V({ az: .7, el: .32, dist: 47, ty: 7, annot: .75 }),
    plan: V({ az: .25, el: 1.05, dist: 42, ty: 0, plan: 1, annot: 1, crane: .6 }),
    section: V({ az: 0, el: .1, dist: 38, ty: 4, cut: 1, annot: 1 }),
    xray: V({ az: 2.3, el: .45, dist: 34, ty: 3.6, xray: 1, annot: .2 }),
    partial: V({ az: .78, el: .3, dist: 47, ty: 7, annot: .6 })
  };

  /* ---------------- post pass (hand-written, no EffectComposer) ---------------- */
  function createPost(renderer, w, h) {
    var rt = new THREE.WebGLMultisampleRenderTarget(w, h, { format: THREE.RGBAFormat });
    rt.samples = 4;
    var mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: rt.texture }, uRes: { value: new THREE.Vector2(w, h) }, uTime: { value: 0 }, uGlow: { value: .8 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: [
        'uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime; uniform float uGlow; varying vec2 vUv;',
        'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }',
        'void main(){',
        '  vec4 c = texture2D(tDiffuse, vUv);',
        '  vec2 px = 1.0 / uRes; vec3 g = vec3(0.0);',
        '  for (int i = 0; i < 8; i++) { float a = float(i) * 0.7853982; vec2 o = vec2(cos(a), sin(a));',
        '    g += max(texture2D(tDiffuse, vUv + o * px * 2.5).rgb - 0.42, 0.0) * 0.55;',
        '    g += max(texture2D(tDiffuse, vUv + o * px * 7.0).rgb - 0.42, 0.0) * 0.45; }',
        '  vec3 col = c.rgb + g / 8.0 * uGlow;',
        '  float d = distance(vUv, vec2(0.55, 0.5));',
        '  col *= mix(1.0, 0.7, smoothstep(0.3, 0.95, d));',
        '  col += (hash(vUv * uRes + fract(uTime)) - 0.5) * 0.022;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'].join('\n'),
      depthTest: false, depthWrite: false
    });
    var quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    var ps = new THREE.Scene(); ps.add(quad);
    var pc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return {
      rt: rt, mat: mat,
      size: function (w2, h2) { rt.setSize(w2, h2); mat.uniforms.uRes.value.set(w2, h2); },
      render: function (scene, camera, t, glow) {
        renderer.setRenderTarget(rt); renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        mat.uniforms.uTime.value = t; mat.uniforms.uGlow.value = glow;
        renderer.render(ps, pc);
      }
    };
  }

  /* ---------------- scene instance ---------------- */
  function build(canvas) {
    var mini = canvas.getAttribute('data-scene') === 'mini';
    var view = canvas.getAttribute('data-view') || 'blueprint';
    var stage = canvas.parentElement;
    var small = Math.min(window.innerWidth, (window.screen && screen.width) || 9999) < 760;
    var lite = small;
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: mini, powerPreference: 'high-performance' });
    var gl2 = renderer.capabilities.isWebGL2;
    var usePost = !mini && !small && gl2 && !!THREE.WebGLMultisampleRenderTarget;
    var useShadows = !mini && !small;
    var dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.localClippingEnabled = true;
    renderer.setClearColor(C.ink, mini ? 0 : 1);
    if (useShadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }

    var scene = new THREE.Scene();
    if (!mini) scene.background = new THREE.Color(C.ink);
    scene.fog = new THREE.Fog(C.ink, 46, 120);
    var camera = new THREE.PerspectiveCamera(34, 1, .5, 300);

    var gMinor = new THREE.GridHelper(60, 60, 0x14406b, 0x10345c); gMinor.material.transparent = true; gMinor.material.opacity = .5; scene.add(gMinor);
    var gMajor = new THREE.GridHelper(160, 32, 0x2a6aa8, 0x1d5288); gMajor.material.transparent = true; gMajor.material.opacity = .55; gMajor.position.y = .004; scene.add(gMajor);

    scene.add(new THREE.HemisphereLight(0xe4eefc, 0x1d3550, .8));
    var sun = new THREE.DirectionalLight(0xffefdc, 1.05);
    sun.position.set(16, 26, 14); scene.add(sun); scene.add(sun.target);
    var catcher = null;
    if (useShadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      var sc = sun.shadow.camera; sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 80;
      sun.shadow.bias = -.0006; sun.shadow.normalBias = .02;
      catcher = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0, transparent: true }));
      catcher.rotation.x = -Math.PI / 2; catcher.position.y = .006; catcher.receiveShadow = true; scene.add(catcher);
    }

    var cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 80);
    var planPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 80);
    var M = createModel(lite, [cutPlane, planPlane]);
    scene.add(M.root);
    var K = createCrane(lite);
    scene.add(K.group);

    /* ---- build timeline ---- */
    var ST = mini ? .34 : 1.35;
    var stageStart = [.15];
    for (var k = 1; k <= 10; k++) stageStart[k] = (mini ? .4 : .9) + (k - 1) * ST;
    var byStage = [];
    M.parts.concat(M.lines).forEach(function (it) { (byStage[it.stage] = byStage[it.stage] || []).push(it); });
    var tEnd = 0;
    byStage.forEach(function (list, s) {
      if (!list) return;
      var base = s === 0 ? stageStart[0] : stageStart[s] + ST * .82, spread = (s === 0 ? 1 : ST * .6) * (mini ? .6 : 1);
      list.forEach(function (it, j) {
        it.t0 = base + (list.length > 1 ? j / (list.length - 1) : 0) * spread;
        if (mini) it.dur = it.dur * .6;
        tEnd = Math.max(tEnd, it.t0 + it.dur);
      });
    });
    var strikeT = stageStart[10];
    tEnd = Math.max(tEnd, strikeT + 1.1);
    var cap = view === 'partial' ? stageStart[5] + ST * .95 : Infinity;
    var T = REDUCE ? Math.min(tEnd + 5, cap) : 0;

    var TARGETS = [null, [0, 0, 0], [2, .3, 0], [-2, 3.4, 0], [-.5, 3.7, .5], [-2, 6.8, 2], [-2.25, 7.1, .5], [-.7, 7.9, 3.6], [4.7, 4.7, 4.5], [9.5, .2, 1]];
    var LOADS = [null, [1.6, .5, 1.6], [2.4, .4, .6], [2, .6, 1], [3, .25, 1.6], [2, .6, 1], [3, .25, 1.6], [1.1, .8, .75], [1.6, 1.1, .12], [2, .5, 1]];
    var LAY = aim(-11, 3.4), PARK = { th: aim(2, 2).th + .5, r: 11, hy: 11 };
    function targetPose(s) { var t = TARGETS[s], a = aim(t[0], t[2]); return { th: a.th, r: a.r, hy: t[1] + 1.1 + LOADS[s][1] + .15 }; }
    var crP = { th: 0, r: 0, hy: 0, load: false };
    function cranePose(time, idle) {
      if (idle || mini && view !== 'partial') {
        var w = REDUCE ? 0 : Math.sin(time * .15);
        crP.th = PARK.th + .35 * w; crP.r = PARK.r + 2.5 * (REDUCE ? 0 : Math.sin(time * .09)); crP.hy = PARK.hy; crP.load = false; return crP;
      }
      if (time < stageStart[1]) { crP.th = LAY.th; crP.r = LAY.r; crP.hy = 9; crP.load = false; return crP; }
      if (time >= strikeT) {
        var from = targetPose(9), u = easeIO((time - strikeT) / 1.4), extra = time - strikeT - 1.4;
        var sway = extra > 0 && !REDUCE ? .3 * Math.sin(extra * .2) : 0;
        crP.th = lerpAng(from.th, PARK.th, u) + sway; crP.r = lerp(from.r, PARK.r, u); crP.hy = lerp(from.hy, PARK.hy, u); crP.load = false; return crP;
      }
      var s = Math.min(9, Math.floor((time - stageStart[1]) / ST) + 1), tau = (time - stageStart[s]) / ST;
      var B = targetPose(s), A = s === 1 ? { th: LAY.th, r: LAY.r, hy: 9 } : targetPose(s - 1);
      var pick = .6 + 1.1 + LOADS[s][1] + .1;
      K.setLoad(LOADS[s]);
      if (tau < .3) { var a1 = easeIO(tau / .3); crP.th = lerpAng(A.th, LAY.th, a1); crP.r = lerp(A.r, LAY.r, a1); crP.hy = lerp(A.hy + 1.5, pick, easeIO((tau - .12) / .18)); crP.load = false; }
      else if (tau < .42) { crP.th = LAY.th; crP.r = LAY.r; crP.hy = pick; crP.load = tau > .36; }
      else if (tau < .86) {
        var u2 = (tau - .42) / .44, a2 = easeIO(u2);
        crP.th = lerpAng(LAY.th, B.th, a2); crP.r = lerp(LAY.r, B.r, a2);
        var carry = Math.max(B.hy, 10.5);
        crP.hy = u2 < .5 ? lerp(pick, carry, easeOut(u2 * 2)) : lerp(carry, B.hy, easeIO((u2 - .5) * 2));
        crP.load = true;
      } else { crP.th = B.th; crP.r = B.r; crP.hy = B.hy + (tau > .9 ? easeOut((tau - .9) / .1) * 1.5 : 0); crP.load = tau < .9; }
      return crP;
    }

    /* ---- state ---- */
    var S = V(mini ? (MINI[view] || MINI.blueprint) : STORY[0]);
    var tgt = V({});
    var userBuilt = 0, sSm = 0, sPrev = 0;
    var userAz = 0, userEl = 0, velAz = 0, dragging = false, lx = 0, ly = 0, ptype = 'mouse';
    var mxT = 0, myT = 0, mxS = 0, myS = 0;
    var clock = 0;

    function computeTarget() {
      var src;
      if (mini) src = MINI[view] || MINI.blueprint;
      else {
        var s = REDUCE ? 0 : clamp(+(AH.storyS || 0), 0, STORY.length - 1);
        sSm = REDUCE ? 0 : s;
        var i = Math.min(Math.floor(sSm), STORY.length - 2), f = sstep(.18, .82, sSm - i);
        var A = STORY[i], B = STORY[i + 1];
        KEYS.forEach(function (key) {
          var a = A[key], b = B[key];
          if (key === 'built') { if (i === 0) a = userBuilt; }
          tgt[key] = lerp(a, b, f);
        });
        return;
      }
      KEYS.forEach(function (key) { tgt[key] = src[key]; });
      if (view === 'blueprint' || view === 'partial') tgt.built = userBuilt;
    }

    /* ---- per-frame model update ---- */
    function updateModel(dt) {
      var b = S.built, xr = S.xray, ex = S.explode, gap = 2.4 * ex;
      var parts = M.parts, i, p;
      for (i = 0; i < parts.length; i++) {
        p = parts[i];
        var pr = clamp((T - p.t0) / p.dur, 0, 1);
        var e = easeOut(pr), ap = clamp(pr * 1.8, 0, 1);
        var h = p.h, drop = 0;
        if (p.grow === 'y') h.scale.y = Math.max(e, .001);
        else if (p.grow === 'x') h.scale.x = Math.max(e, .001);
        else if (p.grow === 'z') h.scale.z = Math.max(e, .001);
        else drop = (1 - e) * 3;
        h.position.y = p.by + p.layer * gap + drop;
        var eo, fo, so;
        switch (p.kind) {
          case 'glass': eo = lerp(.85, .35, b) * (1 - .7 * xr); fo = p.op * (1 - b) * (1 - xr); so = .82 * b * (1 - .9 * xr); break;
          case 'mep': eo = Math.max(.88 * (1 - b), xr * (.8 + .2 * Math.sin(clock * 3 + p.ph))); fo = .1 * (1 - b) + .38 * xr; so = 0; break;
          case 'mepx': eo = Math.max(.88 * (1 - b) + .2 * b, xr); fo = .1 * (1 - b) + .3 * xr; so = b * (1 - xr); break;
          case 'water': eo = lerp(.9, .25, b); fo = p.op * (1 - b); so = .92 * b; break;
          default: eo = lerp(.92, .16, b) * (1 - .82 * xr); fo = p.op * (1 - b) * (1 - .85 * xr); so = b * (1 - .9 * xr);
        }
        eo *= ap; fo *= ap; so *= ap;
        p.em.opacity = eo; p.edges.visible = eo > .004;
        p.fm.opacity = fo; p.fill.visible = fo > .004;
        if (p.sm) {
          p.sm.opacity = so; p.solid.visible = so > .004;
          var opaque = so > .985;
          p.sm.transparent = !opaque; p.sm.depthWrite = so > .5;
        }
      }
      var scafIntro = sstep(stageStart[5] + ST * .8, stageStart[5] + ST * 1.8, T) * (1 - sstep(strikeT, strikeT + 1, T));
      var scf = Math.max(scafIntro, S.scaf) * (1 - ex) * (1 - S.plan);
      var annot = S.annot * (mini ? 1 : 1);
      for (i = 0; i < M.lines.length; i++) {
        var L = M.lines[i], lp = clamp((T - L.t0) / L.dur, 0, 1), o;
        if (L.kind === 'scaf') { lp = Math.max(lp, S.scaf); o = scf * .75; }
        else if (L.kind === 'site') o = annot * (1 - .6 * b) * (1 - .5 * ex);
        else if (L.kind === 'rebar') o = .6 * (1 - b) * (1 - .6 * xr);
        else if (L.kind === 'mepl') o = Math.max(.85 * (1 - b), xr);
        else if (L.kind === 'cutframe') { o = S.cut; lp = 1; }
        else o = 1;
        L.m.opacity = o * clamp(lp * 2, 0, 1);
        L.obj.visible = L.m.opacity > .004;
        var cnt = Math.floor(L.n * easeOut(lp) / 2) * 2;
        L.obj.geometry.setDrawRange(0, cnt);
        L.obj.position.y = L.layer * gap;
      }
      var a0 = clamp((T - .15) / 1.2, 0, 1);
      for (i = 0; i < M.labels.length; i++) {
        var sp = M.labels[i], u = sp.userData, lo;
        if (u.kind === 'site') lo = annot * a0 * (1 - .6 * ex) * (1 - .8 * b);
        else if (u.kind === 'level') lo = annot * a0 * (1 - ex) * (1 - .8 * b);
        else if (u.kind === 'layer') { lo = ex * .95; sp.position.y = u.by + u.layer * gap; }
        else lo = S.cut;
        sp.material.opacity = lo; sp.visible = lo > .01;
      }
      M.pts.material.opacity = annot * .7 * a0 * (1 - .7 * b);
      var zc = lerp(30, .6, S.cut);
      cutPlane.constant = S.cut < .002 ? 80 : zc;
      M.frame.obj.position.z = zc; M.secLbl.position.z = zc;
      planPlane.constant = S.plan < .002 ? 80 : lerp(30, 1.6, S.plan);
      if (catcher) catcher.material.opacity = .36 * b;
      var cp = mini ? cranePose(clock, true) : cranePose(T, false);
      if (view === 'partial') {
        K.setLoad([3, .25, 1.6]);
        cp = { th: aim(-2, 2).th + (REDUCE ? 0 : .06 * Math.sin(clock * .7)), r: aim(-2, 2).r, hy: 10.5 + (REDUCE ? 0 : .25 * Math.sin(clock * 1.3)), load: true };
      }
      K.pose(cp.th, cp.r, cp.hy, cp.load, S.crane * (mini && view === 'built' ? .5 : 1));
    }

    /* ---- sizing ---- */
    var W = 1, Hh = 1, post = null;
    function size() {
      W = canvas.clientWidth || 1; Hh = canvas.clientHeight || 1;
      renderer.setPixelRatio(dpr);
      renderer.setSize(W, Hh, false);
      camera.aspect = W / Hh;
      if (usePost) {
        if (!post) { try { post = createPost(renderer, W * dpr, Hh * dpr); } catch (e) { usePost = false; post = null; } }
        if (post) post.size(Math.floor(W * dpr), Math.floor(Hh * dpr));
      }
    }
    size();
    if (window.ResizeObserver) new ResizeObserver(size).observe(canvas); else window.addEventListener('resize', size);

    function applyCamera() {
      var aspect = W / Hh;
      var wide = W > 900;
      var fit = aspect < 1.3 ? 1 + (1.3 - aspect) * (mini ? .6 : .95) : 1;
      var az = S.az + userAz + (REDUCE ? 0 : mxS * .14);
      if (!mini && !REDUCE) az += (1 - clamp(sSm, 0, 1)) * .22 * Math.sin(clock * .12);
      if (mini && !REDUCE) az += Math.sin(clock * .08) * .35;
      var el = clamp(S.el + userEl - (REDUCE ? 0 : myS * .06), .03, 1.47);
      var dist = S.dist * fit, ce = Math.cos(el);
      scene.fog.near = dist * .85; scene.fog.far = dist * 2.4;
      camera.position.set(S.tx + Math.sin(az) * ce * dist, S.ty + Math.sin(el) * dist, S.tz + Math.cos(az) * ce * dist);
      camera.lookAt(S.tx, S.ty, S.tz);
      camera.fov = S.fov;
      var shiftX = wide ? (mini ? .2 : .17) : 0;
      var shiftY = wide ? 0 : (mini ? .2 : lerp(.25, .2, clamp(sSm, 0, 1)));
      if (shiftX || shiftY) camera.setViewOffset(W, Hh, -W * shiftX, Hh * shiftY, W, Hh); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    }

    /* ---- interaction ---- */
    if (!mini) {
      canvas.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        dragging = true; ptype = e.pointerType; lx = e.clientX; ly = e.clientY; velAz = 0;
        canvas.classList.add('is-dragging');
        if (ptype === 'mouse' && canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
        velAz = -dx * .006; userAz += velAz;
        if (ptype === 'mouse') userEl = clamp(userEl + dy * .004, -.25, .7);
        wake();
      });
      var end = function () { dragging = false; canvas.classList.remove('is-dragging'); };
      canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('lostpointercapture', end);
      document.querySelectorAll('[data-render]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          userBuilt = btn.getAttribute('data-render') === 'built' ? 1 : 0;
          document.querySelectorAll('[data-render]').forEach(function (b2) { b2.setAttribute('aria-pressed', String(b2 === btn)); });
          wake();
        });
      });
    }
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      mxT = e.clientX / window.innerWidth - .5; myT = e.clientY / window.innerHeight - .5;
    }, { passive: true });

    /* ---- loop with visibility pausing ---- */
    var visible = true, running = false, last = 0;
    var lbl = mini ? null : document.querySelector('[data-build-progress]');
    var bar = mini ? null : document.querySelector('[data-build-bar]');
    var lastPct = -1, frames = 0, slowAcc = 0, degraded = false;
    if (window.IntersectionObserver) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) wake(); }, { rootMargin: '80px' }).observe(canvas);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) wake(); });
    function wake() { if (!running && visible && !document.hidden) { running = true; last = performance.now(); requestAnimationFrame(frame); } }

    function frame(now) {
      if (!visible || document.hidden) { running = false; return; }
      requestAnimationFrame(frame);
      var dt = Math.min((now - last) / 1000, .05); last = now;
      clock += dt;
      computeTarget();
      var fast = !mini && sSm > .3 ? 7 : 1;
      if (!REDUCE) T = Math.min(T + dt * fast, cap, tEnd + 3600);
      // smooth everything (instant under reduced motion)
      var lam = REDUCE ? 1e3 : 4.2;
      KEYS.forEach(function (key) { S[key] = damp(S[key], tgt[key], lam, dt); });
      if (!dragging) {
        userAz += velAz; velAz *= Math.pow(.02, dt);
        if (Math.abs(sSm - sPrev) > .0005) { userAz = damp(userAz, 0, 3, dt); userEl = damp(userEl, 0, 3, dt); }
      }
      sPrev = sSm;
      mxS = damp(mxS, mxT, 3, dt); myS = damp(myS, myT, 3, dt);
      updateModel(dt);
      applyCamera();
      if (post && usePost) post.render(scene, camera, clock, lerp(.95, .35, S.built));
      else renderer.render(scene, camera);
      if (lbl) {
        var pct = Math.round(100 * clamp((T - .15) / (tEnd - .15), 0, 1));
        if (pct !== lastPct) { lastPct = pct; lbl.textContent = pct + '%'; if (bar) bar.style.setProperty('--p', pct / 100); }
      }
      // adaptive quality: drop post + shadows if the device struggles
      if (!degraded && !mini && frames < 240) {
        frames++;
        if (frames > 40) slowAcc += dt > 1 / 34 ? 1 : 0;
        if (frames === 240 && slowAcc > 90) {
          degraded = true; usePost = false;
          if (useShadows) { renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true; }
          dpr = Math.min(dpr, 1.25); size();
        }
      }
    }
    stage.classList.add('gl-on');
    applyCamera();
    wake();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { M.labels.forEach(function (s) { s.userData.redraw(); }); });
  }

  function boot() {
    var canvases = document.querySelectorAll('canvas[data-scene]');
    if (!canvases.length) return;
    var ok = !!window.THREE && hasWebGL();
    canvases.forEach(function (c) {
      try {
        if (!ok) throw new Error('webgl unavailable');
        build(c);
        document.documentElement.classList.add('gl');
      } catch (err) {
        c.parentElement.classList.add('no-webgl');
        c.style.display = 'none';
        document.documentElement.classList.add('webgl-off');
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
