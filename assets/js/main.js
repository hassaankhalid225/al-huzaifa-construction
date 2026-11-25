(function(){
  'use strict';
  var doc = document.documentElement;
  doc.classList.add('js');
  var AH = window.AH = window.AH || {};
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // loader: CSS hides it on its own after ~1.2s; click / key skips it
  var loader = document.querySelector('[data-loader]');
  if (loader) {
    var skip = function(){ loader.classList.add('is-done'); };
    loader.addEventListener('click', skip);
    window.addEventListener('keydown', skip, {once:true});
    loader.addEventListener('animationend', function(e){ if (e.animationName === 'loaderOut') loader.parentNode && loader.parentNode.removeChild(loader); });
  }

  // page transitions: blueprint wipe before internal navigation
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || reduce || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    var url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !/\.html$|\/$/.test(url.pathname)) return;
    if (url.pathname === location.pathname && url.hash) return;
    e.preventDefault();
    try { sessionStorage.setItem('ah-nav', '1'); } catch (err) {}
    var w = document.createElement('div'); w.className = 'wipe'; document.body.appendChild(w);
    setTimeout(function(){ location.href = url.href; }, 400);
  });
  window.addEventListener('pageshow', function(e){
    if (e.persisted) document.querySelectorAll('.wipe').forEach(function(w){ w.remove(); });
  });

  // mobile menu
  var btn = document.querySelector('[data-menu-toggle]');
  var menu = document.querySelector('[data-menu]');
  if (btn && menu) {
    var setMenu = function(open){
      btn.setAttribute('aria-expanded', String(open));
      menu.classList.toggle('is-open', open);
      document.body.classList.toggle('menu-open', open);
    };
    btn.addEventListener('click', function(){
      setMenu(btn.getAttribute('aria-expanded') !== 'true');
    });
    menu.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){ setMenu(false); });
    });
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { setMenu(false); btn.focus(); }
    });
  }
  // header state on scroll
  var header = document.querySelector('[data-header]');
  function onScroll(){ if (header) header.classList.toggle('is-scrolled', window.scrollY > 24); }
  window.addEventListener('scroll', onScroll, {passive:true}); onScroll();
  // year
  document.querySelectorAll('[data-year]').forEach(function(el){ el.textContent = new Date().getFullYear(); });

  // home: scroll story progress (0 = hero, 1..5 = process chapters) for the 3D camera + HUD
  var film = document.querySelector('[data-film]');
  if (film) {
    var anchors = [film.querySelector('.hero')].concat([].slice.call(film.querySelectorAll('[data-chapter]')));
    var chapters = anchors.slice(1);
    var hudNum = film.querySelector('[data-hud-num]'), hudLbl = film.querySelector('[data-hud-label]'), hudBar = film.querySelector('[data-hud-bar]');
    var rail = film.querySelectorAll('.hud-rail li');
    var heroLabel = hudLbl ? hudLbl.textContent : '';
    var active = -1, ticking = false;
    var story = function(){
      ticking = false;
      var mid = window.innerHeight / 2, ys = anchors.map(function(a){ var r = a.getBoundingClientRect(); return r.top + r.height / 2 - mid; });
      var s = 0, n = ys.length;
      if (ys[n - 1] <= 0) s = n - 1;
      else for (var i = 0; i < n - 1; i++) { if (ys[i] <= 0 && ys[i + 1] > 0) { s = i + (-ys[i]) / (ys[i + 1] - ys[i]); break; } }
      AH.storyS = s;
      var k = Math.round(s);
      film.classList.toggle('in-story', s > .55);
      if (hudBar) hudBar.style.setProperty('--p', Math.min(1, s / (n - 1)).toFixed(3));
      if (k !== active) {
        active = k;
        chapters.forEach(function(c, j){ c.classList.toggle('is-active', j + 1 === k); });
        rail.forEach(function(li, j){ li.classList.toggle('on', j + 1 <= k); });
        if (hudNum) hudNum.textContent = (k < 10 ? '0' : '') + k;
        if (hudLbl) hudLbl.textContent = k === 0 ? heroLabel : chapters[k - 1].getAttribute('data-view');
      }
    };
    window.addEventListener('scroll', function(){ if (!ticking) { ticking = true; requestAnimationFrame(story); } }, {passive:true});
    window.addEventListener('resize', story);
    story();
  }

  // drawings that plot themselves when they scroll into view
  var drawables = document.querySelectorAll('.plate, .draw-on');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){ if (en.isIntersecting) { en.target.classList.add('is-drawn'); io.unobserve(en.target); } });
    }, {threshold:.25, rootMargin:'0px 0px -5% 0px'});
    drawables.forEach(function(d){ io.observe(d); });
  } else {
    drawables.forEach(function(d){ d.classList.add('is-drawn'); });
  }

  // plate view toggles (elevation / section etc.)
  document.querySelectorAll('.plate').forEach(function(pl){
    var tabs = pl.querySelectorAll('[data-plate-view]'), lbl = pl.querySelector('[data-view-label]'), draw = pl.querySelector('.draw');
    var setW = function(){ if (draw) pl.style.setProperty('--w', draw.clientWidth + 'px'); };
    setW(); window.addEventListener('resize', setW);
    tabs.forEach(function(t){
      t.addEventListener('click', function(){
        var b = t.getAttribute('data-plate-view') === 'b';
        pl.classList.toggle('show-b', b);
        tabs.forEach(function(o){ o.setAttribute('aria-pressed', String(o === t)); });
        if (lbl) lbl.textContent = t.textContent;
        pl.classList.add('is-drawn');
      });
    });
  });

  // project filters
  var gallery = document.querySelector('[data-gallery]');
  if (gallery) {
    var fbtns = document.querySelectorAll('[data-filter]');
    fbtns.forEach(function(f){
      f.addEventListener('click', function(){
        var cat = f.getAttribute('data-filter');
        fbtns.forEach(function(o){ o.setAttribute('aria-pressed', String(o === f)); });
        gallery.querySelectorAll('.plate').forEach(function(pl){
          var show = cat === 'all' || pl.getAttribute('data-cat') === cat;
          pl.hidden = !show;
          if (show) { pl.classList.toggle('wide', cat === 'all' && pl === gallery.firstElementChild); pl.classList.add('is-drawn'); }
        });
      });
    });
  }

  // services sub-nav: highlight the section in view
  var snav = document.querySelectorAll('.svc-nav a');
  if (snav.length && 'IntersectionObserver' in window) {
    var sio = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if (en.isIntersecting) snav.forEach(function(a){ a.classList.toggle('is-on', a.getAttribute('href') === '#' + en.target.id); });
      });
    }, {rootMargin:'-45% 0px -50% 0px'});
    document.querySelectorAll('.svc[id]').forEach(function(s){ sio.observe(s); });
  }

  // contact form
  var form = document.querySelector('[data-contact-form]');
  if (form) {
    var status = form.querySelector('[data-form-status]');
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var name = form.elements['name'].value.trim();
      var phone = form.elements['phone'].value.trim();
      var msg = form.elements['message'].value.trim();
      var type = form.elements['project'] ? form.elements['project'].value : '';
      var missing = [];
      if (!name) missing.push('your name');
      if (!/^[+0-9 ()-]{7,}$/.test(phone)) missing.push('a phone number we can call');
      if (!msg) missing.push('a short description of the job');
      if (missing.length) {
        status.textContent = 'Please add ' + missing.join(', ') + '.';
        status.className = 'form-status is-error';
        return;
      }
      var text = 'Hello, I am ' + name + ' (' + phone + ').' + (type ? ' Project: ' + type + '.' : '') + ' ' + msg;
      var wa = form.getAttribute('data-whatsapp');
      if (wa) {
        window.open('https://wa.me/' + wa + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
        status.textContent = 'WhatsApp is opening with your message. Press send there to reach us.';
      } else {
        status.textContent = 'Thank you, ' + name + '. We will call you on ' + phone + ' within one working day.';
      }
      status.className = 'form-status is-ok';
      form.reset();
    });
  }
})();
