(function () {
  'use strict';
  document.documentElement.classList.add('js');

  // Mobile navigation
  var toggle = document.querySelector('.nav-toggle');
  var links = document.getElementById('site-nav');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    links.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') { links.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && links.classList.contains('open')) { links.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); }
    });
  }

  // Reveal on scroll
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  } else { items.forEach(function (el) { el.classList.add('in'); }); }

  // Pre-select service from ?service=
  var params = new URLSearchParams(location.search);
  var svc = params.get('service');
  var sel = document.querySelector('select[name="interest"]');
  if (svc && sel) { for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].value === svc) { sel.selectedIndex = i; break; } } }

  // Forms
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var PHONE = /^[+()\d\s\-.]{7,20}$/;
  document.querySelectorAll('form[data-kform]').forEach(function (form) {
    var status = form.querySelector('.form-status');
    var btn = form.querySelector('button[type="submit"]');

    function fieldOf(el) { return el.closest('.field'); }
    function check(el) {
      var v = (el.value || '').trim(), msg = '';
      if (el.required && !v) msg = 'This field is required.';
      else if (el.type === 'email' && v && !EMAIL.test(v)) msg = 'Enter a valid email address.';
      else if (el.type === 'tel' && v && !PHONE.test(v)) msg = 'Enter a valid telephone number, e.g. +256 7XX XXX XXX.';
      else if (el.name === 'message' && v && v.length < 10) msg = 'Please add a little more detail (at least 10 characters).';
      var f = fieldOf(el);
      if (f) { f.classList.toggle('invalid', !!msg); var e = f.querySelector('.err'); if (e) e.textContent = msg; }
      el.setAttribute('aria-invalid', msg ? 'true' : 'false');
      return !msg;
    }
    form.querySelectorAll('input,select,textarea').forEach(function (el) {
      el.addEventListener('blur', function () { if (el.type !== 'hidden' && !el.classList.contains('hp-input')) check(el); });
      el.addEventListener('input', function () { if (fieldOf(el) && fieldOf(el).classList.contains('invalid')) check(el); });
    });

    function show(kind, html) { status.className = 'form-status show ' + kind; status.innerHTML = html; status.focus(); }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true, first = null;
      form.querySelectorAll('input:not(.hp-input),select,textarea').forEach(function (el) {
        if (el.type === 'checkbox') return;
        if (!check(el)) { ok = false; if (!first) first = el; }
      });
      var consent = form.querySelector('input[name="consent"]');
      if (consent && !consent.checked) { ok = false; var cf = fieldOf(consent); cf.classList.add('invalid'); cf.querySelector('.err').textContent = 'Please confirm to continue.'; if (!first) first = consent; }
      else if (consent) { fieldOf(consent).classList.remove('invalid'); }
      if (!ok) { first && first.focus(); return; }

      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = String(v).trim(); });
      data.form = form.getAttribute('data-kform');
      btn.disabled = true; var label = btn.textContent; btn.textContent = 'Sending…';

      var subject = (data.form === 'property-watch' ? 'Property Watch request' : 'Website enquiry') + ' — ' + data.name;
      var lines = Object.keys(data).filter(function (k) { return ['form', 'website', 'consent'].indexOf(k) < 0 && data[k]; })
        .map(function (k) { return k.replace(/_/g, ' ') + ': ' + data[k]; });
      var mailto = 'mailto:info@kalexibrokerage.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\n'));

      fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok) {
            form.reset();
            show('ok', '<strong>Thank you, ' + esc(data.name) + '.</strong> Your message has been sent to Kalexi Brokerage. We will respond using the contact details you provided.');
          } else { throw new Error('unavailable'); }
        })
        .catch(function () {
          show('warn', '<strong>We could not send this automatically.</strong> Please <a href="' + mailto + '">send it by email</a> — your details are pre-filled — or contact us on +256 708 492 861.');
        })
        .then(function () { btn.disabled = false; btn.textContent = label; });
    });
  });
})();
