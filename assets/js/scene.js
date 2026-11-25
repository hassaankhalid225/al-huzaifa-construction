/* Al Huzaifa — blueprint villa that builds itself, line by line */
(function(){
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function ease(t){ return t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }

  function build(canvas){
    var mini = canvas.getAttribute('data-scene') === 'mini';
    var renderer = new THREE.WebGLRenderer({canvas:canvas, antialias:true, alpha:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    var scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x071b33, 22, 60);
    var camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    var root = new THREE.Group(); scene.add(root);

    var grid = new THREE.GridHelper(80, 80, 0x3d7fc4, 0x16416f);
    grid.material.transparent = true; grid.material.opacity = .55; root.add(grid);

    var cyan = 0x9cc8f0, amber = 0xf2a900;
    var parts = [];
    function part(w,h,d,x,y,z,o){
      o = o || {};
      var g = new THREE.BoxGeometry(w,h,d); g.translate(0,h/2,0);
      var holder = new THREE.Group(); holder.position.set(x,y,z);
      var solid = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color:o.color||0x2a6db5, transparent:true, opacity:0, depthWrite:false}));
      var lm = new THREE.LineBasicMaterial({color:o.amber?amber:cyan, transparent:true, opacity:0});
      var edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), lm);
      holder.add(solid); holder.add(edges);
      holder.scale.y = 0.001;
      root.add(holder);
      parts.push({h:holder, s:solid, l:lm, op:(o.op==null?.16:o.op)});
    }
    // foundation + plinth
    part(13,.3,9, 0,0,0, {op:.3});
    // ground floor columns
    [[-6,-4.1],[6,-4.1],[-6,4.1],[6,4.1],[-2,-4.1],[2,-4.1],[-2,4.1],[2,4.1]].forEach(function(p){ part(.35,3.2,.35,p[0],.3,p[1],{op:.6}); });
    part(12.2,3.2,8, 0,.3,0, {op:.07});
    // first slab
    part(13.4,.35,9.2, 0,3.5,0, {op:.35});
    // cantilevered first floor
    part(8.5,3.1,9.2, -2.4,3.85,0, {op:.12});
    // glazing bands
    for (var i=0;i<4;i++) part(1.5,2.2,.06, -5.6+i*2.1,4.3,4.62, {op:.4, color:cyan});
    for (var j=0;j<3;j++) part(1.7,2.4,.06, -4.5+j*3,.75,4.06, {op:.35, color:cyan});
    // roof slab + terrace parapet
    part(9.4,.35,10, -2.4,6.95,0, {op:.35});
    part(4.4,.9,.1, 4.3,3.85,4.55, {amber:true, op:0});
    part(.1,.9,9, 6.45,3.85,0, {amber:true, op:0});
    // stair core
    part(2,1.6,2, -5.2,7.3,-2.6, {op:.25});
    // pool and deck
    part(7,.35,3.4, 3.5,0,7.4, {op:.55, color:0x3fa7ff});
    part(9.5,.12,5, 3,0,7.4, {op:.12});
    // boundary wall
    part(26,1.6,.25, 0,0,-9, {op:.1});
    part(.25,1.6,18, -13,0,0, {op:.1});

    // tower crane (always amber lines)
    var crane = new THREE.Group(); crane.position.set(-10,0,-6); root.add(crane);
    var cm = new THREE.LineBasicMaterial({color:amber, transparent:true, opacity:.85});
    function cbox(w,h,d,x,y,z,parent){ var g=new THREE.BoxGeometry(w,h,d); var l=new THREE.LineSegments(new THREE.EdgesGeometry(g),cm); l.position.set(x,y,z); (parent||crane).add(l); return l; }
    for (var k=0;k<8;k++) cbox(.8,2,.8, 0,1+k*2,0);
    var jib = new THREE.Group(); jib.position.y = 16.4; crane.add(jib);
    for (var m=0;m<8;m++) cbox(1.8,.6,.6, 1.2+m*1.8,0,0, jib);
    cbox(3,.6,.6,-2.2,0,0,jib);
    cbox(1.2,1.2,1,-3.3,-.6,0,jib);
    var hookGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(9,0,0), new THREE.Vector3(9,-9,0)]);
    jib.add(new THREE.Line(hookGeo, cm));
    cbox(.6,.6,.6, 9,-9.3,0, jib);

    // survey points
    var ptsGeo = new THREE.BufferGeometry();
    var arr = [];
    for (var p=0;p<160;p++) arr.push((Math.random()-.5)*60, 0.02, (Math.random()-.5)*60);
    ptsGeo.setAttribute('position', new THREE.Float32BufferAttribute(arr,3));
    root.add(new THREE.Points(ptsGeo, new THREE.PointsMaterial({color:cyan, size:.12, transparent:true, opacity:.7})));

    // interaction
    var mx = 0, my = 0, scrollF = 0;
    window.addEventListener('pointermove', function(e){ mx = e.clientX/window.innerWidth-.5; my = e.clientY/window.innerHeight-.5; }, {passive:true});
    window.addEventListener('scroll', function(){ scrollF = Math.min(window.scrollY/window.innerHeight, 1.5); }, {passive:true});

    function size(){
      var w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w/h;
      camera.fov = w < 700 ? 52 : 36;
      if (w > 900 && !mini) camera.setViewOffset(w, h, -w*.2, 0, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    }
    size();
    if (window.ResizeObserver) new ResizeObserver(size).observe(canvas); else window.addEventListener('resize', size);

    var visible = true;
    if (window.IntersectionObserver) new IntersectionObserver(function(en){ visible = en[0].isIntersecting; }).observe(canvas);

    var start = performance.now();
    var stepDelay = mini ? 0 : .14, dur = .8;
    var finished = reduce || mini;
    var lbl = document.querySelector('[data-build-progress]');

    function frame(now){
      requestAnimationFrame(frame);
      if (!visible) return;
      var t = (now - start)/1000;
      var done = 0;
      for (var i=0;i<parts.length;i++){
        var pr = finished ? 1 : Math.min(Math.max((t - .4 - i*stepDelay)/dur, 0), 1);
        var e = ease(pr);
        var P = parts[i];
        P.h.scale.y = Math.max(e, .001);
        P.l.opacity = Math.min(pr*2, 1) * .95;
        P.s.material.opacity = Math.max(pr-.5,0)*2*P.op;
        if (pr >= 1) done++;
      }
      if (lbl) lbl.textContent = Math.round(done/parts.length*100) + '%';
      jib.rotation.y = reduce ? .6 : Math.sin(t*.25)*.9 + .4;
      var ang = (reduce ? .7 : .7 + t*.04) + mx*.35 + scrollF*.8;
      var r = mini ? 32 : 36 - scrollF*5;
      camera.position.set(Math.sin(ang)*r, (mini ? 12 : 12) + my*-3 + scrollF*3, Math.cos(ang)*r);
      camera.lookAt(0, 3.2, 0);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }

  function boot(){
    var canvases = document.querySelectorAll('canvas[data-scene]');
    canvases.forEach(function(c){
      try {
        if (!window.THREE) throw new Error('three missing');
        build(c);
      } catch (err) {
        c.parentElement.classList.add('no-webgl');
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
