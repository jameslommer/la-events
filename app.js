/* ==========================================================================
   LA Events
   Static, dependency-free. Reads events.json and renders it.
   See CLAUDE.md — the three hard rules (cache busting, fail visibly,
   relative paths only) are load-bearing, do not soften them.
   ========================================================================== */

(function () {
  'use strict';

  /* --- Fixed category list (CLAUDE.md). Never derived from the data, so the
     chip row stays stable as events come and go. ------------------------- */
  var CATEGORIES = ['Music', 'Comedy', 'Food', 'Art', 'Film', 'Sports',
                    'Nightlife', 'Community', 'Outdoors', 'Other'];

  var TZ = 'America/Los_Angeles';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    themeToggle: $('theme-toggle'), search: $('search'),
    status: $('status'), statusLabel: $('status-label'), statusSummary: $('status-summary'),
    searchClear: $('search-clear'), chips: $('chips'),
    presets: $('date-presets'), from: $('from'), to: $('to'), dateClear: $('date-clear'),
    filterBadge: $('filter-badge'), chipsWrap: $('chips-wrap'), filters: $('filters'),
    count: $('result-count'), skeleton: $('skeleton'), results: $('results'),
    empty: $('empty'), emptyText: $('empty-text'), clearFilters: $('clear-filters'),
    error: $('error'), errorText: $('error-text'), errorDetail: $('error-detail'),
    retry: $('retry'), main: $('main')
  };

  var state = { cats: [], q: '', from: '', to: '' };

  var PRESETS = [
    { key: 'today',   label: 'Today' },
    { key: 'weekend', label: 'This Weekend' },
    { key: 'next7',   label: 'Next 7 Days' }
  ];
  var data = { events: [], updated: '', summary: '', skipped: 0 };
  var firstRender = true;
  var statusReady = false;

  /* --- Dates ------------------------------------------------------------ */
  /* Everything is reckoned in LA time regardless of the device's clock, so a
     phone in another timezone still sees the same "today" as the listings. */

  function laToday() {
    var s;
    try {
      s = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
    } catch (e) {
      var n = new Date();
      s = n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
    }
    return parseDate(s) || stripTime(new Date());
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function parseDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var p = s.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    if (d.getFullYear() !== +p[0] || d.getMonth() !== +p[1] - 1 || d.getDate() !== +p[2]) {
      return null;                       // rejects 2026-02-31 and friends
    }
    return d;
  }

  function stripTime(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function dayDiff(a, b) { return Math.round((a - b) / 86400000); }

  function fmtDay(d) { return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate(); }
  function fmtShort(d) { return MONTHS[d.getMonth()] + ' ' + d.getDate(); }

  /* The upcoming Fri/Sat/Sun. If today is already one of those, the current
     weekend, trimmed to today onward. */
  function weekendRange(today) {
    var dow = today.getDay();                       // 0 Sun … 6 Sat
    if (dow === 5) return [today, addDays(today, 2)];
    if (dow === 6) return [today, addDays(today, 1)];
    if (dow === 0) return [today, today];
    return [addDays(today, 5 - dow), addDays(today, 7 - dow)];
  }

  function presetRange(key_, today) {
    if (key_ === 'today') return [today, today];
    if (key_ === 'weekend') return weekendRange(today);
    if (key_ === 'next7') return [today, addDays(today, 6)];
    return null;
  }

  /* Derived, never stored: a hand-typed range simply matches no preset, so no
     chip stays lit once the dates are edited by hand. */
  function activePreset() {
    if (!state.from || !state.to) return '';
    var today = laToday();
    for (var i = 0; i < PRESETS.length; i++) {
      var r = presetRange(PRESETS[i].key, today);
      if (key(r[0]) === state.from && key(r[1]) === state.to) return PRESETS[i].key;
    }
    return '';
  }

  /* --- Data ------------------------------------------------------------- */

  function validate(raw) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('events.json should contain an object, got ' +
        (Array.isArray(raw) ? 'an array' : typeof raw) + '.');
    }
    if (!Array.isArray(raw.events)) {
      throw new Error('events.json has no "events" array.');
    }
    var today = laToday();
    var updatedDay = typeof raw.updated === 'string' ? raw.updated.slice(0, 10) : '';
    var out = [], skipped = 0;

    for (var i = 0; i < raw.events.length; i++) {
      var e = raw.events[i];
      if (!e || typeof e !== 'object') { skipped++; continue; }
      var start = parseDate(e.start), end = parseDate(e.end);
      // url is required; an event with no link is not usable (CLAUDE.md).
      if (!start || !e.title || !e.url) { skipped++; continue; }
      if (!end || end < start) end = start;
      if (end < today) continue;                    // past events never appear

      out.push({
        id: String(e.id || e.title + '-' + e.start),
        title: String(e.title),
        category: CATEGORIES.indexOf(e.category) > -1 ? e.category : 'Other',
        start: start,
        end: end,
        multi: key(start) !== key(end),
        ongoing: start < today,
        time: str(e.time), venue: str(e.venue), area: str(e.area),
        price: str(e.price), url: String(e.url), blurb: str(e.blurb),
        isNew: !!updatedDay && str(e.discovered) === updatedDay
      });
    }
    out.sort(function (a, b) {
      return (a.start - b.start) || a.title.localeCompare(b.title);
    });
    return {
      events: out,
      updated: str(raw.updated),
      summary: str(raw.summary),   // written by the task; the site only displays it
      skipped: skipped
    };
  }

  function str(v) { return v === undefined || v === null ? '' : String(v); }

  function load() {
    show('loading');
    // Hard rule 1: cache busting. GitHub Pages and the browser both serve
    // stale data otherwise. Relative path only — no leading slash.
    fetch('events.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status + (res.statusText ? ' ' + res.statusText : ''));
        }
        return res.text();
      })
      .then(function (text) {
        var raw;
        try {
          raw = JSON.parse(text);
        } catch (err) {
          var e = new Error('events.json is not valid JSON. ' + err.message);
          e.kind = 'parse';
          throw e;
        }
        data = validate(raw);
        renderStatus();
        show('loaded');
        render();
      })
      .catch(fail);
  }

  /* Hard rule 2: fail visibly, and say what actually went wrong. */
  function fail(err) {
    var msg, detail = err && err.message ? err.message : String(err);

    if (location.protocol === 'file:') {
      msg = 'The page was opened straight from disk, so the browser blocked ' +
            'reading events.json. Serve the folder over http (for example ' +
            '"python3 -m http.server") and reload.';
    } else if (err && err.kind === 'parse') {
      msg = 'events.json was found but could not be parsed. It is probably ' +
            'truncated or has a stray character — check the last task run.';
    } else if (/^HTTP 404/.test(detail)) {
      msg = 'events.json was not found next to this page. If the task has ' +
            'never run, there is no data file yet.';
    } else if (/^HTTP/.test(detail)) {
      msg = 'The server refused to hand over events.json.';
    } else if (err instanceof TypeError) {
      msg = 'The network request for events.json failed. You may be offline.';
    } else {
      msg = 'Something went wrong while reading events.json.';
    }
    els.errorText.textContent = msg;
    els.errorDetail.textContent = detail;
    show('error');
  }

  function show(what) {
    els.status.hidden = !statusReady || (what !== 'loaded' && what !== 'empty');
    els.skeleton.hidden = what !== 'loading';
    els.results.hidden = what !== 'loaded';
    els.empty.hidden = what !== 'empty';
    els.error.hidden = what !== 'error';
    if (what !== 'loaded' && what !== 'empty') els.count.textContent = '';
  }

  /* --- URL state -------------------------------------------------------- */

  function slug(c) { return c.toLowerCase(); }

  function readURL() {
    var p = new URLSearchParams(location.search);
    var cats = (p.get('cat') || '').split(',').map(function (s) { return s.trim().toLowerCase(); });
    state.cats = CATEGORIES.filter(function (c) { return cats.indexOf(slug(c)) > -1; });
    state.q = p.get('q') || '';
    state.from = parseDate(p.get('from') || '') ? p.get('from') : '';
    state.to = parseDate(p.get('to') || '') ? p.get('to') : '';
    // A back-to-front range in a shared link is corrected, never left to
    // silently match nothing.
    if (state.from && state.to && state.from > state.to) {
      var swap = state.from; state.from = state.to; state.to = swap;
    }
  }

  function writeURL() {
    var p = new URLSearchParams();
    if (state.cats.length) p.set('cat', state.cats.map(slug).join(','));
    if (state.q.trim()) p.set('q', state.q.trim());
    if (state.from) p.set('from', state.from);
    if (state.to) p.set('to', state.to);
    var qs = p.toString().replace(/%2C/g, ',');
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  /* --- Filtering -------------------------------------------------------- */

  function rangeFrom() { return state.from ? parseDate(state.from) : null; }
  function rangeTo() { return state.to ? parseDate(state.to) : null; }

  /* Every filter ANDs with the others. An event is in range when its own
     start..end overlaps the picked from..to at all — a multi-day event that
     merely straddles an edge counts. */
  function filtered() {
    var q = state.q.trim().toLowerCase();
    var from = rangeFrom(), to = rangeTo();

    return data.events.filter(function (e) {
      if (state.cats.length && state.cats.indexOf(e.category) === -1) return false;
      if (from && e.end < from) return false;
      if (to && e.start > to) return false;
      if (q) {
        var hay = (e.title + ' ' + e.venue + ' ' + e.blurb).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  /* The first day shown: today normally, the range start when it is later.
     Past events never surface, whatever range is picked. */
  function floorDay() {
    var today = laToday(), from = rangeFrom();
    return from && from > today ? from : today;
  }

  function dayOf(e, floor) { return e.start < floor ? floor : e.start; }

  /* --- Rendering -------------------------------------------------------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function icon(id, cls) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', cls || 'icon');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  function metaRow(iconId, parts) {
    var li = document.createElement('li');
    li.appendChild(icon(iconId));
    var wrap = el('span');
    parts.forEach(function (p, i) {
      if (i) wrap.appendChild(el('span', 'sep', ' · '));
      wrap.appendChild(el('span', p.cls || '', p.text));
    });
    li.appendChild(wrap);
    return li;
  }

  function dateText(e, today) {
    if (!e.multi) return fmtDay(e.start);
    if (e.ongoing) return 'Now through ' + fmtShort(e.end);
    if (e.start.getMonth() === e.end.getMonth()) {
      return fmtShort(e.start) + ' – ' + e.end.getDate();
    }
    return fmtShort(e.start) + ' – ' + fmtShort(e.end);
  }

  function card(e, today, index) {
    /* The card is an <article>, not an <a>: it carries an expand <button>, and a
       button cannot be nested inside an anchor. The title is the link. */
    var art = el('article', 'card card-enter');
    art.setAttribute('data-cat', e.category);
    art.style.setProperty('--d', Math.min(index, 9) * 24 + 'ms');

    var head = el('div', 'card-head');
    head.appendChild(el('span', 'pill', e.category));
    if (e.isNew) head.appendChild(el('span', 'badge-new', 'New'));
    art.appendChild(head);

    var h = el('h3', 'card-title');
    var link = el('a', 'card-link', e.title);
    link.href = e.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    h.appendChild(link);
    art.appendChild(h);

    if (e.blurb) art.appendChild(el('p', 'card-blurb', e.blurb));

    var meta = el('ul', 'meta');
    var when = [{ text: dateText(e, today), cls: 'strong num' }];
    if (e.time) when.push({ text: e.time, cls: 'num' });
    meta.appendChild(metaRow('i-clock', when));

    var where = [];
    if (e.venue) where.push({ text: e.venue, cls: 'strong' });
    if (e.area) where.push({ text: e.area });
    if (where.length) meta.appendChild(metaRow('i-pin', where));

    if (e.price) meta.appendChild(metaRow('i-ticket', [{ text: e.price, cls: 'num' }]));

    art.appendChild(meta);
    return art;
  }

  /* --- Clamp overflow: the "more" control -------------------------------
     Only rendered when the title or the summary is genuinely cut off, so it
     is measured from the laid-out element rather than guessed from length. */

  function isClipped(node) {
    return !!node && node.scrollHeight - node.clientHeight > 1;
  }

  function moreButton(art) {
    var btn = el('button', 'more', 'More');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();               // never reaches the card/title link
      ev.preventDefault();
      var open = art.classList.toggle('is-expanded');
      btn.textContent = open ? 'Less' : 'More';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    return btn;
  }

  function markClipped(scope) {
    // A zero-width container (hidden tab, not yet laid out) makes everything
    // look clipped. Skip; the width observer re-runs this once it is real.
    if (!scope.clientWidth) return;
    var cards = scope.querySelectorAll('.card');
    for (var i = 0; i < cards.length; i++) {
      var art = cards[i];
      if (art.classList.contains('is-expanded')) continue;   // leave open cards alone
      var clipped = isClipped(art.querySelector('.card-title')) ||
                    isClipped(art.querySelector('.card-blurb'));
      var btn = art.querySelector('.more');
      if (clipped && !btn) art.appendChild(moreButton(art));
      else if (!clipped && btn) btn.remove();
    }
  }

  function dayHeading(d, today, n) {
    var h = el('h2', 'day-head');
    var diff = dayDiff(d, today);
    var rel = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : '';
    if (rel) {
      h.appendChild(el('span', 'day-rel', rel));
      h.appendChild(el('span', 'day-date', fmtDay(d)));
    } else {
      h.appendChild(el('span', 'day-rel', fmtDay(d)));
      if (diff > 0 && diff < 7) h.appendChild(el('span', 'day-date', 'in ' + diff + ' days'));
    }
    h.appendChild(el('span', 'day-count', n + (n === 1 ? ' event' : ' events')));
    return h;
  }

  function render() {
    var today = laToday();
    var list = filtered();

    renderChipCounts();
    els.searchClear.hidden = !state.q;

    if (!data.events.length) {
      els.emptyText.textContent = data.skipped
        ? 'No upcoming events in events.json.'
        : 'There are no upcoming events in events.json right now.';
      els.clearFilters.hidden = true;
      show('empty');
      return;
    }
    if (!list.length) {
      els.emptyText.textContent = describeFilters();
      els.clearFilters.hidden = false;
      show('empty');
      els.count.textContent = '0 of ' + data.events.length + ' events';
      return;
    }

    var frag = document.createDocumentFragment();
    var floor = floorDay();
    var groups = [], byDay = {};
    list.forEach(function (e) {
      var d = dayOf(e, floor);
      var k = key(d);
      if (!byDay[k]) { byDay[k] = { date: d, items: [] }; groups.push(byDay[k]); }
      byDay[k].items.push(e);
    });
    groups.sort(function (a, b) { return a.date - b.date; });

    var i = 0;
    groups.forEach(function (g) {
      var sec = el('section', 'day-group');
      sec.appendChild(dayHeading(g.date, today, g.items.length));
      var grid = el('div', 'grid');
      g.items.forEach(function (e) { grid.appendChild(card(e, today, i++)); });
      sec.appendChild(grid);
      frag.appendChild(sec);
    });

    els.results.replaceChildren(frag);
    markClipped(els.results);
    if (data.skipped) els.results.appendChild(skippedNotice());

    var total = data.events.length;
    els.count.textContent = list.length === total
      ? total + (total === 1 ? ' event' : ' events') + ' across ' + groups.length +
        (groups.length === 1 ? ' day' : ' days')
      : list.length + ' of ' + total + ' events';

    show('loaded');
    firstRender = false;
  }

  function skippedNotice() {
    var p = el('p', 'notice');
    p.appendChild(icon('i-alert'));
    p.appendChild(el('span', '', data.skipped + (data.skipped === 1
      ? ' entry in events.json was skipped because it was missing a title, date, or link.'
      : ' entries in events.json were skipped because they were missing a title, date, or link.')));
    return p;
  }

  function rangeLabel() {
    var f = rangeFrom(), t = rangeTo();
    if (f && t) return key(f) === key(t) ? fmtShort(f) : fmtShort(f) + ' – ' + fmtShort(t);
    if (f) return fmtShort(f) + ' onward';
    if (t) return 'up to ' + fmtShort(t);
    return '';
  }

  function describeFilters() {
    var bits = [];
    if (state.cats.length) bits.push(state.cats.join(', '));
    if (state.q.trim()) bits.push('"' + state.q.trim() + '"');
    var range = rangeLabel();

    // Always name the date range, so it is obvious the range is the reason.
    if (range && bits.length) return 'No events in ' + range + ' match ' + bits.join(' + ') + '.';
    if (range) return 'No events in ' + range + '.';
    return bits.length
      ? 'Nothing upcoming matches ' + bits.join(' + ') + '.'
      : 'Nothing matches the current filters.';
  }

  function renderChips() {
    var frag = document.createDocumentFragment();
    CATEGORIES.forEach(function (c) {
      var b = el('button', 'chip chip-cat');
      b.type = 'button';
      b.setAttribute('data-cat', c);
      b.setAttribute('aria-pressed', 'false');
      b.appendChild(el('span', 'dot'));
      b.appendChild(el('span', '', c));
      b.addEventListener('click', function () {
        var i = state.cats.indexOf(c);
        if (i > -1) state.cats.splice(i, 1); else state.cats.push(c);
        commit();
      });
      frag.appendChild(b);
    });
    els.chips.replaceChildren(frag);
  }

  function renderPresets() {
    var frag = document.createDocumentFragment();
    PRESETS.forEach(function (p) {
      var b = el('button', 'chip chip-preset');
      b.type = 'button';
      b.setAttribute('data-preset', p.key);
      b.setAttribute('aria-pressed', 'false');
      b.textContent = p.label;
      b.addEventListener('click', function () {
        var r = presetRange(p.key, laToday());
        state.from = key(r[0]);
        state.to = key(r[1]);
        syncDateInputs();
        commit();
      });
      frag.appendChild(b);
    });
    els.presets.replaceChildren(frag);
  }

  function syncDateInputs() {
    els.from.value = state.from;
    els.to.value = state.to;
    // Native guard against a back-to-front range in the picker itself.
    els.to.min = state.from || '';
    els.dateClear.disabled = !state.from && !state.to;
    var active = activePreset();
    Array.prototype.forEach.call(els.presets.children, function (b) {
      var on = b.getAttribute('data-preset') === active;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /* Typed input can still invert the range; correct it by pushing the other
     end rather than showing an empty list. */
  function onDateEdit(which) {
    var from = els.from.value, to = els.to.value;
    if (from && to && from > to) {
      if (which === 'from') to = from; else from = to;
    }
    state.from = parseDate(from) ? from : '';
    state.to = parseDate(to) ? to : '';
    syncDateInputs();
    commit();
  }

  /* Survives the chip row hiding on mobile, so a filtered list never looks
     unfiltered. Shown at every width; on desktop it simply corroborates the
     chips, which are always visible there. */
  function renderFilterBadge() {
    var n = state.cats.length;
    var range = rangeLabel();
    els.filterBadge.hidden = !n && !range;
    if (els.filterBadge.hidden) return;

    var parts = [];
    if (n) parts.push(String(n));
    if (range) parts.push(range);
    els.filterBadge.replaceChildren(
      el('span', 'filter-dot'),
      el('span', 'filter-text', parts.join(' · '))
    );

    var spoken = [];
    if (n) spoken.push(n + ' category filter' + (n === 1 ? '' : 's') + ': ' + state.cats.join(', '));
    if (range) spoken.push('dates ' + range);
    els.filterBadge.setAttribute('aria-label', spoken.join('; ') + ' active');
    els.filterBadge.title = spoken.join('; ');
  }

  function renderChipCounts() {
    renderFilterBadge();
    var counts = {};
    data.events.forEach(function (e) { counts[e.category] = (counts[e.category] || 0) + 1; });
    Array.prototype.forEach.call(els.chips.children, function (b) {
      var c = b.getAttribute('data-cat');
      var on = state.cats.indexOf(c) > -1;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('chip-empty', !counts[c] && !on);
      b.title = (counts[c] || 0) + ' upcoming';
    });
  }

  function renderStatus() {
    var label = '', full = '';
    var when = data.updated ? new Date(data.updated) : null;

    if (when && !isNaN(when)) {
      try {
        label = 'Last updated ' + new Intl.DateTimeFormat('en-US', {
          timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric'
        }).format(when);
        full = new Intl.DateTimeFormat('en-US', {
          timeZone: TZ, dateStyle: 'full', timeStyle: 'short'
        }).format(when) + ' (Los Angeles)';
      } catch (e) {
        label = 'Last updated ' + when.toDateString();
        full = when.toString();
      }
    }

    var summary = data.summary.trim();
    els.statusLabel.textContent = label;
    els.statusLabel.title = full;
    els.statusLabel.hidden = !label;
    // No recap this run: show the last-updated line alone, never an empty card.
    els.statusSummary.textContent = summary;
    els.statusSummary.hidden = !summary;
    statusReady = !!(label || summary);
  }

  /* --- Sticky offsets ---------------------------------------------------
     The day headers stick below the header and the controls bar. Those two
     change height with the viewport, so measure rather than hard-code. */

  var stickExpanded = 0, filtersH = 0, animating = false;

  function measureLayout() {
    var header = document.querySelector('.site-header');
    var controls = document.querySelector('.controls');
    if (!header || !controls) return;

    var h = Math.round(header.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--h-header', h + 'px');

    /* Baselines are only meaningful while the filters are open and still.
       Measuring mid-collapse would cache a half-animated height. */
    if (!filtersHidden && !animating && els.filters) {
      els.filters.style.maxHeight = '';                  // measure it unclamped
      filtersH = Math.round(els.filters.getBoundingClientRect().height);
      stickExpanded = h + Math.round(controls.getBoundingClientRect().height);
      applyFiltersHeight();
    }
    applyStick();
  }

  /* Inline, because an inline value beats the class rule and needs no custom
     property indirection. Cleared above the mobile breakpoint so a wider layout
     is never clamped by a phone-sized measurement. */
  function applyFiltersHeight() {
    if (!els.filters) return;
    if (!mqMobile.matches) { els.filters.style.maxHeight = ''; return; }
    els.filters.style.maxHeight = filtersHidden ? '0px' : filtersH + 'px';
  }

  /* One write per toggle. .day-head transitions its own top, so the day headers
     glide with the collapse without any per-frame work here. */
  function applyStick() {
    var v = filtersHidden ? Math.max(stickExpanded - filtersH, 0) : stickExpanded;
    document.documentElement.style.setProperty('--h-stick', v + 'px');
  }

  var measureSticky = measureLayout;   // other call sites still use this name

  /* --- Mobile: auto-hiding filter rows ----------------------------------
     Both the category chips and the date range row hide together. Thresholds
     live here and are documented in CLAUDE.md. Hiding is reluctant (needs
     cumulative downward movement); showing is near-instant. The class goes on
     <html>; the CSS that acts on it is inside a mobile media query, so desktop
     and tablet are untouched even if the class is ever set. */

  var HIDE_AFTER = 14;   // px of cumulative downward scroll before hiding
  var SHOW_AFTER = 8;    // px of cumulative upward scroll before showing again
  var TOP_ZONE = 64;     // always visible within this much of the top
  var BOTTOM_KEEP = 80;  // never hide this close to the end of the document
  var COOLDOWN = 300;    // ms after a flip before another one may happen;
                         // must stay >= --speed-collapse or a flip can land
                         // mid-transition and restart it, which reads as a jerk

  var lastY = 0, downRun = 0, upRun = 0, lastFlip = 0;
  var ticking = false, filtersHidden = false;
  var mqMobile = window.matchMedia('(max-width: 639px)');
  var mqStill = window.matchMedia('(prefers-reduced-motion: reduce)');

  var animTimer = null;

  function setFiltersHidden(hide) {
    if (hide === filtersHidden) return;
    if (!filtersHidden && !animating) measureLayout();   // refresh baselines first
    filtersHidden = hide;
    lastFlip = Date.now();
    downRun = upRun = 0;        // start each state with clean accumulators
    animating = true;
    document.documentElement.classList.toggle('filters-hidden', hide);
    applyFiltersHeight();
    applyStick();                                        // one write, no re-measure
    clearTimeout(animTimer);
    animTimer = setTimeout(function () { animating = false; }, COOLDOWN);
  }

  function onScrollFrame() {
    ticking = false;
    // Reduced motion, or not a phone: the chips simply stay put.
    if (mqStill.matches || !mqMobile.matches) { setFiltersHidden(false); return; }

    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    var dy = y - lastY;
    lastY = y;
    if (dy === 0) return;

    if (y <= TOP_ZONE) { downRun = upRun = 0; setFiltersHidden(false); return; }

    /* No flip while the previous one is still animating — and crucially, do not
       accumulate movement during it either. Collapsing the box shortens the
       document, and the browser's scroll anchoring compensates by moving the
       scroll position, which arrives here as a large phantom delta in the
       opposite direction. Counting it would fire a spurious flip once the
       cooldown lifted. */
    if (Date.now() - lastFlip < COOLDOWN) return;

    /* Accumulate per direction, resetting the other. Momentum scrolling and
       trackpads emit mixed-sign deltas, and reacting to a single stray pixel is
       what made this flicker. */
    if (dy > 0) { downRun += dy; upRun = 0; }
    else { upRun -= dy; downRun = 0; }

    if (upRun >= SHOW_AFTER) { setFiltersHidden(false); return; }
    if (downRun < HIDE_AFTER) return;

    /* Collapsing shortens the document. Doing that at the very bottom makes the
       browser clamp the scroll position, which reads as an upward scroll and
       would oscillate, so leave it alone down there. */
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (y > max - BOTTOM_KEEP) return;

    setFiltersHidden(true);
  }

  function onScroll() {
    if (ticking) return;          // rAF throttle: at most one update per frame
    ticking = true;
    requestAnimationFrame(onScrollFrame);
  }

  function initFilterAutoHide() {
    lastY = window.pageYOffset || 0;
    window.addEventListener('scroll', onScroll, { passive: true });
    var onModeChange = function () {
      downRun = upRun = 0;
      setFiltersHidden(false);      // leaving mobile, or motion turned off
      applyFiltersHeight();         // drop the phone-sized clamp on wider screens
      measureSticky();
    };
    if (mqMobile.addEventListener) {
      mqMobile.addEventListener('change', onModeChange);
      mqStill.addEventListener('change', onModeChange);
    } else if (mqMobile.addListener) {
      mqMobile.addListener(onModeChange);
      mqStill.addListener(onModeChange);
    }
  }

  /* --- Theme ------------------------------------------------------------ */

  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('la-events-theme', t); } catch (e) {}
    els.themeToggle.setAttribute('aria-label',
      t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }

  function currentTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t === 'light' || t === 'dark') return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light';
  }

  /* --- Wiring ----------------------------------------------------------- */

  function commit() {
    writeURL();
    render();
  }

  function init() {
    /* Re-measure on genuine layout changes only. While the filters are
       collapsing the controls box changes size every frame, and re-measuring
       there would both cache junk and thrash layout mid-scroll. */
    var onBoxResize = function () {
      if (animating || filtersHidden) return;
      measureLayout();
    };
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(onBoxResize);
      ro.observe(document.querySelector('.site-header'));
      ro.observe(document.querySelector('.controls'));
    } else {
      window.addEventListener('resize', onBoxResize);
    }

    /* What counts as clipped depends on the laid-out width, which changes with
       the breakpoint, zoom, font size, and simply becoming visible. Re-measure
       on width change only — height changes are our own buttons, and reacting
       to those would loop. */
    var reflow, lastWidth = -1;
    function recheck() {
      var w = els.results.clientWidth;
      if (w === lastWidth) return;
      lastWidth = w;
      clearTimeout(reflow);
      reflow = setTimeout(function () { markClipped(els.results); }, 120);
    }
    if (window.ResizeObserver) new ResizeObserver(recheck).observe(els.results);
    window.addEventListener('resize', recheck);
    // Webfont swap changes line breaks after first paint.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { markClipped(els.results); });
    }

    readURL();
    renderChips();
    renderPresets();
    els.search.value = state.q;
    els.from.min = '';
    syncDateInputs();
    renderChipCounts();
    measureSticky();   // after the chips exist, so the bar is at full height

    els.themeToggle.addEventListener('click', function () {
      setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    });
    els.themeToggle.setAttribute('aria-label',
      currentTheme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');

    els.search.addEventListener('input', function () {
      state.q = els.search.value;
      commit();
    });
    els.searchClear.addEventListener('click', function () {
      state.q = '';
      els.search.value = '';
      els.search.focus();
      commit();
    });
    els.from.addEventListener('change', function () { onDateEdit('from'); });
    els.to.addEventListener('change', function () { onDateEdit('to'); });
    els.dateClear.addEventListener('click', function () {
      state.from = '';
      state.to = '';
      syncDateInputs();
      commit();                      // back to the default: everything from today
    });
    els.clearFilters.addEventListener('click', function () {
      state.cats = [];
      state.q = '';
      state.from = '';
      state.to = '';
      els.search.value = '';
      syncDateInputs();
      commit();
    });
    els.retry.addEventListener('click', load);

    initFilterAutoHide();

    window.addEventListener('popstate', function () {
      readURL();
      els.search.value = state.q;
      syncDateInputs();
      render();
    });

    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
