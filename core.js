// Policy timing & conflicts tracker (v2): constants, formatting, marks, calculations, tooltip and drawer helpers.
(function () {
  'use strict';

  // ---------- Kinds of money, in one fixed order (the order of rows, tiles and keys on every page) ----------
  const F = {
    REVENUE: "Revenue to the President's family",
    INFLOW: 'Money into family ventures from outside payers',
    AWARDS: 'Federal awards & loans to family- or donor-linked firms',
    NOTIONAL: 'Trade size placed before announcements (notional)',
    PROFIT: 'Reported profits on well-timed trades',
    OFFICIAL: 'Disclosed trades by the President, officials & allies',
    PREMIUM: 'Options premium paid before announcements',
    PENALTY: 'Penalties & settlements',
    FOREIGN: 'Foreign-linked deals & gifts (context)',
    DONOR: 'Money raised by donors who got appointments or aid',
  };
  const ACTIONS = 'Actions & context';
  const ORDER = [F.REVENUE, F.INFLOW, F.AWARDS, F.NOTIONAL, F.PROFIT, F.PREMIUM, F.OFFICIAL, F.PENALTY, F.FOREIGN, F.DONOR];
  // Three color groups on each president's page: money to the family and connected firms in the president's color,
  // trades in one neutral color on every page (they were placed by others, or are officials' own disclosed trades),
  // and everything shown only as background in light gray.
  const FAMILY = new Set([F.REVENUE, F.INFLOW, F.AWARDS]);
  const TRADES = new Set([F.NOTIONAL, F.PROFIT, F.PREMIUM, F.OFFICIAL]);
  const CONTEXT = new Set([F.PENALTY, F.FOREIGN, F.DONOR]);
  const GROUPS = [
    { id: 'family', kinds: FAMILY, label: 'Money to the family and connected firms' },
    { id: 'trades', kinds: TRADES, label: 'Trades placed just before government news (mostly by unidentified traders), and officials’ own trades' },
    { id: 'context', kinds: CONTEXT, label: 'Background: fines, foreign deals and donors (never added up)' },
  ];
  const SHORT = {
    [F.REVENUE]: 'Paid to the family',
    [F.INFLOW]: 'Invested in family businesses',
    [F.AWARDS]: 'Government deals for connected firms',
    [F.NOTIONAL]: 'Trades just before announcements',
    [F.PROFIT]: 'Profits from well-timed trades',
    [F.PREMIUM]: 'Options bought just before news',
    [F.OFFICIAL]: 'Officials’ own stock trades',
    [F.PENALTY]: 'Fines and settlements',
    [F.FOREIGN]: 'Foreign deals (background)',
    [F.DONOR]: 'Donors who got jobs or help',
    [ACTIONS]: 'Investigations, pardons and other actions',
  };
  const ABOUT = {
    [F.REVENUE]: 'Money the president or his family received, from filings or news reports.',
    [F.INFLOW]: 'Money that outside buyers and investors put into businesses the family runs.',
    [F.AWARDS]: 'Government contracts, loans or orders for companies tied to the family or to big donors.',
    [F.NOTIONAL]: 'How big the trades were that came shortly before market-moving government news. This is the size of the bet, not a profit.',
    [F.PROFIT]: 'Profits reported or charged on trades made just before government news.',
    [F.PREMIUM]: 'Money spent on options (bets that a price will move) shortly before government news.',
    [F.OFFICIAL]: 'Stock trades that officials and allies reported themselves. Shown, never added up.',
    [F.PENALTY]: 'Fines and settlements paid. Shown, never added up.',
    [F.FOREIGN]: 'Deals and gifts involving foreign governments. Shown as background, never added up.',
    [F.DONOR]: 'Money raised by donors who later got government jobs or help. Shown, never added up.',
  };

  // Fixed reference dates: terms in office. The current term runs to the data's as-of date.
  const AS_OF = '2026-10-18';
  const PRES = [
    { id: 'trump', name: 'Trump (2nd term)', tab: 'Trump 2025–now', short: 'Trump, 2nd term', family: 'Trump', party: 'R', term: ['2025-01-20', AS_OF] },
    { id: 'trump1', name: 'Trump (1st term)', tab: 'Trump 2017–21', short: 'Trump, 1st term', family: 'Trump', party: 'R', term: ['2017-01-20', '2021-01-20'] },
    { id: 'biden', name: 'Biden', tab: 'Biden 2021–25', short: 'Biden', family: 'Biden', party: 'D', term: ['2021-01-20', '2025-01-20'] },
    { id: 'obama', name: 'Obama', tab: 'Obama 2009–17', short: 'Obama', family: 'Obama', party: 'D', term: ['2009-01-20', '2017-01-20'] },
  ];
  const TERMS = Object.fromEntries(PRES.map((p) => [p.name, p.term]));
  const ERAS = [
    { name: 'Obama', a: '2009-01-20', b: '2017-01-20' },
    { name: 'Trump I', a: '2017-01-20', b: '2021-01-20' },
    { name: 'Biden', a: '2021-01-20', b: '2025-01-20' },
    { name: 'Trump II', a: '2025-01-20', b: AS_OF },
  ];
  const TIERS = ['Documented', 'Reported', 'Alleged'];
  const ACTION_SHAPES = [
    { test: (c) => /enforcement_action_dropped|penalty_avoided/.test(c), sym: 'triangle', rot: 180, label: 'Case dropped or enforcement eased' },
    { test: (c) => /pardon/.test(c), sym: 'star', rot: 0, label: 'Pardon or clemency' },
    { test: (c) => /investigation_or_charge/.test(c), sym: 'circle', rot: 0, label: 'Investigation, charge or inquiry' },
    { test: (c) => /regulatory_action|government_benefit_to_counterparty/.test(c), sym: 'triangle', rot: 0, label: 'Regulatory or policy benefit to a payer' },
    { test: (c) => /policy_announcement/.test(c), sym: 'square', rot: 0, label: 'Policy announcement' },
    { test: () => true, sym: 'diamond', rot: 0, label: 'Other event or context' },
  ];
  const SYMBOLS = { triangle: d3.symbolTriangle, star: d3.symbolStar, circle: d3.symbolCircle, square: d3.symbolSquare, diamond: d3.symbolDiamond };
  const shapeFor = (category) => ACTION_SHAPES.find((s) => s.test(category || ''));
  const symbolPath = (shape, size) => d3.symbol(SYMBOLS[shape.sym], size)();

  // ---------- Small value helpers ----------
  const has = (v) => v !== '' && v !== null && v !== undefined;
  const num = (v) => (has(v) ? Number(v) : NaN);
  const isCounted = (e) => String(e.in_cumulative) === 'true';
  const kindOf = (e) => (has(e.chart_family) ? e.chart_family : ACTIONS);
  const isMoney = (e) => has(e.chart_family) && has(e.plot_value) && Number(e.plot_value) > 0;
  // Colors are the page's own tokens (style.css sets each one for light and dark): every president has a color for
  // money to the family and connected firms; trades take one neutral color and background kinds light gray, on every page.
  const MUTED = 'var(--tt-c-muted)';
  const pidOf = (who) => {
    const p = PRES.find((q) => q.id === who || q.name === who);
    return p ? p.id : null;
  };
  const colorFor = (kind, who) => {
    const id = pidOf(who);
    if (!id || CONTEXT.has(kind)) return MUTED;
    if (FAMILY.has(kind)) return `var(--tt-c-${id})`;
    if (TRADES.has(kind)) return 'var(--tt-c-trades)';
    return MUTED;
  };
  const groupOf = (kind) => GROUPS.find((g) => g.kinds.has(kind)) || GROUPS[2];
  const presColor = (who) => (pidOf(who) ? `var(--tt-c-${pidOf(who)})` : MUTED);
  const PARTY = { R: 'Republican', D: 'Democrat', I: 'Independent' };
  const partyColor = (p) => (PARTY[p] ? `var(--tt-c-${p})` : MUTED);
  const sortKinds = (kinds) => {
    const list = [...new Set(kinds)];
    const rank = (k) => (k === ACTIONS ? 1e6 : ORDER.indexOf(k) < 0 ? 1e5 : ORDER.indexOf(k));
    return list.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  };
  const shortOf = (kind) => SHORT[kind] || kind;
  const normPerson = (s) => String(s || '').replace(/\s+[A-Z]\.(?=\s)/g, ' ').replace(/\s+/g, ' ').trim();

  // ---------- Formatting ----------
  const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  const fmtCount = (v) => (isFinite(num(v)) ? d3.format(',')(num(v)) : '');
  const fmtMoney = (v) => {
    const n = num(v);
    if (!isFinite(n)) return '';
    const a = Math.abs(n);
    return (n < 0 ? '−$' : '$') + (a >= 1e4 ? compact.format(a) : d3.format(',.0f')(a));
  };
  const fmtPct = (v) => (isFinite(num(v)) ? d3.format('.0%')(num(v)) : '');
  const fmtSignedPct = (v) => (isFinite(num(v)) ? d3.format('+.1%')(num(v)) : '');
  const fmtDate = d3.utcFormat('%b %-d, %Y');
  const fmtMonth = d3.utcFormat('%b %Y');
  const parseDate = (s) => {
    if (!has(s)) return null;
    const t = String(s).trim().slice(0, 10);
    if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(t)) return null;
    const iso = t.length === 4 ? t + '-01-01' : t.length === 7 ? t + '-01' : t;
    const d = new Date(iso + 'T00:00:00Z');
    return isNaN(d) ? null : d;
  };
  // A date shown at the precision the data gives it (a year, a month or a day).
  const dateText = (value, precision) => {
    const d = parseDate(value);
    if (!d) return '';
    const raw = String(value).trim();
    if (precision === 'year' || raw.length === 4) return String(d.getUTCFullYear());
    if (precision === 'month' || raw.length === 7) return fmtMonth(d);
    return fmtDate(d);
  };
  // The period an amount covers, in words: "May 24, 2023", "Aug 2025", "all of 2025", "Feb 2021 – Jan 2023".
  const fmtDayMonth = d3.utcFormat('%b %-d');
  const periodText = (start, end) => {
    const a = parseDate(start);
    const b = parseDate(end) || a;
    if (!a) return '';
    if (+b === +a) return fmtDate(a);
    const y0 = a.getUTCFullYear();
    const y1 = b.getUTCFullYear();
    const firstDay = a.getUTCDate() === 1;
    const lastDay = new Date(Date.UTC(y1, b.getUTCMonth() + 1, 0)).getUTCDate() === b.getUTCDate();
    if (firstDay && lastDay && a.getUTCMonth() === 0 && b.getUTCMonth() === 11) return y0 === y1 ? `all of ${y0}` : `${y0}–${y1}`;
    if (firstDay && lastDay) return y0 === y1 && a.getUTCMonth() === b.getUTCMonth() ? fmtMonth(a) : `${fmtMonth(a)} – ${fmtMonth(b)}`;
    return y0 === y1 ? `${fmtDayMonth(a)} – ${fmtDate(b)}` : `${fmtDate(a)} – ${fmtDate(b)}`;
  };
  const isSpread = (e) => has(e.covers_start) && has(e.covers_end) && e.covers_end > e.covers_start;
  const amountText = (e) => {
    if (!has(e.amount_usd)) return '';
    return e.amount_type === 'count' ? fmtCount(e.amount_usd) : fmtMoney(e.amount_usd);
  };
  const plural = (n, one, many) => (Number(n) === 1 ? one : many);
  const human = (s) => String(s || '').replace(/_/g, ' ');
  const fmtBy = (kind, v) => {
    if (kind === 'money') return fmtMoney(v);
    if (kind === 'count') return fmtCount(v);
    if (kind === 'pct') return fmtPct(v);
    if (kind === 'spct') return fmtSignedPct(v);
    if (kind === 'date') return dateText(v);
    return has(v) ? String(v) : '';
  };

  // ---------- Data access and marks ----------
  const statusOf = (id) => (dash.data(id) || {}).status;
  const rowsOf = (id) => {
    const d = dash.data(id) || {};
    return d.status === 'ok' ? (Array.isArray(d.data) ? d.data : []) : null;
  };
  const failed = (id) => {
    const s = statusOf(id);
    return s === 'error' || s === 'connect';
  };
  // data-where values: percent-encode only &, = and % inside a value.
  const enc = (v) => String(v).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');
  const dec = (v) => String(v).replace(/%(25|26|3D)/gi, (m, c) => ({ '25': '%', '26': '&', '3D': '=' })[c.toUpperCase()]);
  const where = (obj) => Object.entries(obj).map(([k, v]) => `${k}=${enc(v)}`).join('&');
  const parseWhere = (s) => String(s || '').split('&').filter(Boolean).map((p) => {
    const i = p.indexOf('=');
    return [p.slice(0, i), dec(p.slice(i + 1))];
  });
  const findRow = (rows, whereText) => {
    const w = parseWhere(whereText);
    return (rows || []).find((r) => w.every(([k, v]) => String(r[k]) === v)) || null;
  };
  const mark = (el, source, field, w) => {
    el.setAttribute('data-source', source);
    if (field) el.setAttribute('data-field', field);
    if (w) el.setAttribute('data-where', where(w));
    return el;
  };

  // ---------- DOM helpers ----------
  const NS = 'http://www.w3.org/2000/svg';
  const h = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  };
  const s = (tag, cls) => {
    const n = document.createElementNS(NS, tag);
    if (cls) n.setAttribute('class', cls);
    return n;
  };
  // A span that shows one marked value.
  const val = (text, source, field, w, cls) => mark(h('span', cls || '', text), source, field, w);
  const txt = (text) => document.createTextNode(text);
  const button = (cls, text, onClick) => {
    const b = h('button', cls, text);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  };
  const swatch = (color, hollow) => {
    const sp = h('span', 'tt-sw');
    if (hollow) {
      sp.style.background = 'transparent';
      sp.style.boxShadow = `inset 0 0 0 2px ${color}`;
    } else sp.style.background = color;
    return sp;
  };
  const tierClass = (tier) => 'tt-badge tt-badge-' + (TIERS.includes(tier) ? tier.toLowerCase() : 'plain');
  const tierBadge = (tier, source, w) => {
    if (!has(tier)) return null;
    const b = h('span', tierClass(tier), tier);
    if (source) mark(b, source, 'evidence_tier', w);
    return b;
  };
  const keySvg = (shape, color) => {
    const svg = s('svg', 'tt-key-svg');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '-7 -7 14 14');
    svg.setAttribute('aria-hidden', 'true');
    const p = s('path', 'tt-act');
    p.setAttribute('d', symbolPath(shape, 40));
    p.setAttribute('transform', `rotate(${shape.rot})`);
    if (color) p.style.fill = color;
    svg.appendChild(p);
    return svg;
  };
  const measure = (svgNode, cls, texts) => {
    const probe = s('text', cls);
    svgNode.appendChild(probe);
    let w = 0;
    texts.forEach((t) => {
      probe.textContent = t;
      w = Math.max(w, probe.getComputedTextLength());
    });
    probe.remove();
    return w;
  };
  const failLine = (box) => {
    box.classList.remove('dash-skeleton');
    box.replaceChildren();
    const d = h('div', 'tt-fail');
    d.appendChild(h('span', 'tt-fail-dot'));
    d.appendChild(txt('Failed to load'));
    box.appendChild(d);
  };
  // A failed table keeps its header and shows the failed-load line in its body.
  const failTable = (table) => {
    const tbody = table && table.querySelector('tbody');
    if (!tbody) return;
    const tr = h('tr');
    const td = h('td', 'tt-td');
    td.colSpan = table.querySelectorAll('thead th').length || 1;
    const d = h('div', 'tt-fail');
    d.appendChild(h('span', 'tt-fail-dot'));
    d.appendChild(txt('Failed to load'));
    td.appendChild(d);
    tr.appendChild(td);
    tbody.replaceChildren(tr);
  };
  const loading = (box) => {
    box.replaceChildren();
    box.classList.add('dash-skeleton');
  };
  // Fill the page's placeholders (elements carrying data-fill) from their marked rows.
  const fillMarks = (root) => {
    root.querySelectorAll('[data-fill]').forEach((el) => {
      const src = el.getAttribute('data-source');
      const rows = rowsOf(src);
      if (rows) {
        const row = findRow(rows, el.getAttribute('data-where'));
        el.classList.remove('dash-skeleton');
        el.textContent = row ? fmtBy(el.getAttribute('data-fill'), row[el.getAttribute('data-field')]) : '';
      } else if (failed(src)) {
        if (el.classList.contains('tt-big')) failLine(el);
        else {
          el.classList.remove('dash-skeleton');
          el.textContent = '';
        }
      } else {
        el.classList.add('dash-skeleton');
        el.textContent = '—';
      }
    });
  };

  // Chart entries take ENTRY times the system's slow step (style.css --tt-dur matches), staggered across the same window.
  const ENTRY = 2.6;
  // Entry motion plays once per chart, timed from its first draw that has rows. A redraw while it is still
  // playing (another source arriving, a filter) rebuilds the marks with the motion resumed where it was, never restarted.
  const started = new Map();
  const durMs = (node) => {
    const v = String(getComputedStyle(node).getPropertyValue('--cds-dur-slow') || '').trim();
    const n = parseFloat(v);
    if (!isFinite(n)) return 450 * ENTRY;
    return (/ms$/.test(v) ? n : n * 1000) * ENTRY;
  };
  const firstPlay = (box, hasRows) => {
    let play = false;
    if (hasRows) {
      const now = performance.now();
      if (!started.has(box.id)) started.set(box.id, now);
      play = now - started.get(box.id) < 2 * durMs(box);
    }
    box.classList.toggle('tt-anim', play);
    box.__t0 = started.get(box.id);
    return play;
  };
  // Every animated mark takes a delay: its stagger, less the time the chart's motion has already run.
  const delay = (node, frac) => {
    const box = node.closest ? node.closest('.tt-anim') : null;
    const elapsed = box && box.__t0 !== undefined ? Math.max(0, performance.now() - box.__t0) : 0;
    node.style.animationDelay = `calc(var(--tt-dur) * ${Math.max(0, Math.min(1, frac)).toFixed(3)} - ${Math.round(elapsed)}ms)`;
    return node;
  };

  // ---------- Tooltip: a popover inside a position:relative box ----------
  const tooltip = (box) => {
    let tip = box.querySelector(':scope > .tt-tip');
    if (!tip) {
      tip = h('div', 'tt-tip');
      tip.hidden = true;
      tip.setAttribute('role', 'status');
      box.appendChild(tip);
    }
    return {
      show(pt, lines) {
        tip.replaceChildren();
        lines.filter(Boolean).forEach((l, i) => {
          const line = typeof l === 'string' ? { text: l } : l;
          const p = h('div', i === 0 ? 'tt-tip-head' : line.cls || 'tt-tip-line');
          if (line.color) {
            const k = h('span', 'tt-sw-line');
            k.style.background = line.color;
            p.appendChild(k);
          }
          if (line.value !== undefined) p.appendChild(h('span', 'tt-tip-value', line.value));
          if (line.text) p.appendChild(txt((line.value !== undefined ? ' ' : '') + line.text));
          tip.appendChild(p);
        });
        tip.hidden = false;
        const r = box.getBoundingClientRect();
        const x = pt.clientX - r.left;
        const y = pt.clientY - r.top;
        const w = tip.offsetWidth;
        const ht = tip.offsetHeight;
        tip.style.left = Math.max(4, Math.min(x + 14, r.width - w - 4)) + 'px';
        tip.style.top = (y + 16 + ht > r.height ? Math.max(4, y - ht - 12) : y + 16) + 'px';
      },
      hide() {
        tip.hidden = true;
      },
    };
  };
  const centerOf = (node) => {
    const r = node.getBoundingClientRect();
    return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  };

  // ---------- Cross-highlight: one hovered event lights up in every view of its page ----------
  const setHot = (page, id) => {
    if (page.__hot === id) return;
    page.__hot = id;
    page.querySelectorAll('.tt-hot').forEach((n) => n.classList.remove('tt-hot'));
    page.querySelectorAll('.tt-has-hot').forEach((n) => n.classList.remove('tt-has-hot'));
    if (!id) return;
    const q = CSS.escape(id);
    page.querySelectorAll(`[data-ev="${q}"]`).forEach((n) => {
      n.classList.add('tt-hot');
      const svg = n.closest('svg');
      if (svg && n.classList.contains('tt-ev')) svg.classList.add('tt-has-hot');
    });
    page.querySelectorAll(`tr[data-key="${q}"]`).forEach((n) => n.classList.add('tt-hot'));
  };

  // ---------- Links ----------
  const urlsOf = (text) => String(text || '').split(' | ').map((u) => u.trim()).filter(Boolean);
  const hostOf = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch (err) {
      return u;
    }
  };
  const linkTo = (u, label) => {
    if (!/^https?:\/\//i.test(u)) return h('span', 'tt-src-link', label || u);
    const a = h('a', 'tt-src-link', label || u.replace(/^https?:\/\/(www\.)?/i, ''));
    a.href = u;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  };

  // ---------- Detail drawer ----------
  const openDrawer = (drawer, anchor) => {
    const card = anchor && anchor.closest ? anchor.closest('.tt-card, .tt-kpis, .tt-page-head') : null;
    if (card && card !== drawer && !drawer.contains(card) && card.nextElementSibling !== drawer) card.after(drawer);
    drawer.__anchor = anchor || null;
    drawer.hidden = false;
    drawer.scrollIntoView({ block: 'nearest' });
    const t = drawer.querySelector('.tt-drawer-title');
    if (t) t.focus({ preventScroll: true });
  };
  // Closing a record hides it and puts the reader back on the dot, row or tile that opened it (the same row again
  // when its table has been redrawn since).
  const closeDrawer = (drawer) => {
    drawer.hidden = true;
    let a = drawer.__anchor;
    drawer.__anchor = null;
    if (a && !a.isConnected && a.getAttribute && a.getAttribute('data-key')) {
      a = (drawer.closest('.tt-page') || document).querySelector(`tr[data-key="${CSS.escape(a.getAttribute('data-key'))}"]`);
    }
    if (!a || !a.isConnected) return;
    if (a.hasAttribute('tabindex') || a.tabIndex >= 0) a.focus({ preventScroll: true });
    a.scrollIntoView({ block: 'nearest' });
  };
  // A second Close at the foot of a long record, shown on phones, so nobody has to scroll back up to leave it.
  const drawerFoot = (drawer, onClose) => {
    const foot = h('div', 'tt-drawer-foot');
    foot.appendChild(button('tt-btn', 'Close this record', onClose));
    drawer.appendChild(foot);
  };

  // ---------- Long lists on a phone ----------
  // On a narrow screen a long table shows its first rows and a button for the next ones, instead of a scroll box
  // inside the scrolling page. Wide screens show every row in a scroll box, as before.
  const ROWS_STEP = 20;
  const isNarrow = (el) => {
    const w = el && el.closest ? el.closest('.tt-wrap') : null;
    return !!w && w.clientWidth > 0 && w.clientWidth <= 640;
  };
  const pageRows = (table, rows, redraw, step) => {
    const by = step || ROWS_STEP;
    const wrap = table.closest('.tt-table-wrap') || table;
    let more = wrap.nextElementSibling && wrap.nextElementSibling.classList.contains('tt-more-rows') ? wrap.nextElementSibling : null;
    table.__redraw = redraw;
    const lim = isNarrow(table) ? table.__lim || by : Infinity;
    if (rows.length <= lim) {
      if (more) more.hidden = true;
      return rows;
    }
    if (!more) {
      more = button('tt-btn tt-more-rows', '', () => {
        table.__lim = (table.__lim || by) + by;
        if (table.__redraw) table.__redraw();
      });
      wrap.after(more);
    }
    const left = rows.length - lim;
    more.hidden = false;
    more.textContent = `Show ${fmtCount(Math.min(by, left))} more (${fmtCount(left)} not shown yet)`;
    return rows.slice(0, lim);
  };
  // Each cell carries its field and its column's name, for the one-block-per-row phone layout.
  const cellTag = (td, field, label) => {
    td.classList.add('tt-f-' + field);
    if (label) td.setAttribute('data-label', label);
    return td;
  };
  const headLabels = (table) => Object.fromEntries([...table.querySelectorAll('thead th[data-field]')].map((th) => [th.getAttribute('data-field'), th.textContent.trim()]));
  // One labelled field: parts are plain strings or [text, field] pairs marked to one row.
  const field = (parent, label, parts, source, w, cls) => {
    const list = parts.filter((p) => p && (typeof p === 'string' ? p : has(p[0])));
    if (!list.some((p) => typeof p !== 'string')) return null;
    const p = h('p', 'tt-field' + (cls ? ' ' + cls : ''));
    if (label) p.appendChild(h('span', 'tt-field-label', label));
    list.forEach((part) => {
      if (typeof part === 'string') p.appendChild(txt(part));
      else p.appendChild(part[1] ? val(String(part[0]), source, part[1], w) : txt(String(part[0])));
    });
    parent.appendChild(p);
    return p;
  };
  const drawerHead = (drawer, titleNode, badges, onClose) => {
    const head = h('div', 'tt-drawer-head');
    const left = h('div');
    titleNode.classList.add('tt-drawer-title');
    titleNode.tabIndex = -1;
    left.appendChild(titleNode);
    const row = h('div', 'tt-drawer-badges');
    badges.filter(Boolean).forEach((b) => row.appendChild(b));
    left.appendChild(row);
    head.appendChild(left);
    head.appendChild(button('tt-btn', 'Close', onClose));
    drawer.appendChild(head);
  };
  const sourcesBlock = (parent, urls, countNode, primary) => {
    if (!urls.length) return;
    const p = h('p', 'tt-field');
    const lab = h('span', 'tt-field-label', 'Sources');
    p.appendChild(lab);
    if (countNode) {
      p.appendChild(countNode);
      p.appendChild(txt(' ' + plural(countNode.textContent, 'source', 'sources') + ', every one listed'));
    }
    parent.appendChild(p);
    const ul = h('ul', 'tt-src-list');
    urls.forEach((u) => {
      const li = h('li', 'tt-src-item');
      li.appendChild(linkTo(u));
      if (primary && u === primary.url && primary.node) {
        li.appendChild(txt(' — lead source: '));
        li.appendChild(primary.node);
      }
      ul.appendChild(li);
    });
    parent.appendChild(ul);
  };

  // The full record of one event, every value marked to its row.
  function eventDrawer(drawer, e, opts) {
    drawer.replaceChildren();
    const w = { id: e.id };
    const title = h('h4');
    title.appendChild(val(e.title, 'events', 'title', w));
    const counted = has(e.chart_family) ? h('span', 'tt-badge tt-badge-plain', isCounted(e) ? 'Added to its running total' : 'Shown, not added') : null;
    const trader = String(e.trader_identified) === 'false'
      ? h('span', 'tt-badge tt-badge-unknown', 'Trader unidentified')
      : String(e.trader_identified) === 'true' ? h('span', 'tt-badge tt-badge-plain', 'Trader named in sources') : null;
    drawerHead(drawer, title, [tierBadge(e.evidence_tier, 'events', w), val(e.id, 'events', 'id', w, 'tt-badge tt-badge-quiet'), counted, trader], opts.onClose);
    const grid = h('div', 'tt-drawer-grid');
    const a = h('div');
    const b = h('div');
    grid.appendChild(a);
    grid.appendChild(b);
    drawer.appendChild(grid);
    field(a, 'Date', [[dateText(e.date, e.date_precision), 'date'], has(e.time_et) ? ' at ' : '', [e.time_et, 'time_et'], has(e.time_et) ? ' ET' : ''], 'events', w);
    if (has(e.plot_date) && e.plot_date !== e.date) field(a, 'Placed on the timeline at', [[fmtDate(parseDate(e.plot_date)), 'plot_date']], 'events', w);
    if (has(e.amount_usd)) {
      const ranged = has(e.amount_low) && has(e.amount_high) && Number(e.amount_low) !== Number(e.amount_high);
      const fmt = e.amount_type === 'count' ? fmtCount : fmtMoney;
      field(a, 'Amount', [
        String(e.plot_is_upper_bound) === 'true' ? 'Up to ' : '',
        [amountText(e), 'amount_usd'],
        ranged ? ' (range ' : '', ranged ? [fmt(e.amount_low), 'amount_low'] : null, ranged ? ' to ' : '', ranged ? [fmt(e.amount_high), 'amount_high'] : null, ranged ? ')' : '',
        has(e.amount_type) ? ' · ' + human(e.amount_type) : '',
      ], 'events', w);
    }
    if (has(e.chart_family)) {
      field(a, 'Kind of money', [[e.chart_family, 'chart_family'], isCounted(e) ? ' — counted in this kind’s total' : ' — shown, not added to any total'], 'events', w);
    }
    field(a, 'What happened', [[e.description, 'description']], 'events', w);
    // People: only those a cited source names, each with the role it documents.
    const ppl = opts.people || [];
    const pp = h('div', 'tt-field');
    pp.appendChild(h('span', 'tt-field-label', 'People named in the sources'));
    if (String(e.trader_identified) === 'false') {
      pp.appendChild(h('p', 'tt-field tt-field-note', 'No trader has been publicly identified for this activity. Anyone listed here is named for a different documented role, not as the trader.'));
    }
    if (ppl.length) {
      const ul = h('ul', 'tt-people-list');
      ppl.forEach((r) => {
        const li = h('li', 'tt-src-item');
        const pw = { key: r.key };
        const name = val(r.person, 'people', 'person', pw);
        if (opts.onPerson) {
          const btn = button('tt-linkbtn', null, () => opts.onPerson(r));
          btn.appendChild(name);
          btn.setAttribute('aria-label', `Show only events naming ${r.person}`);
          li.appendChild(btn);
        } else li.appendChild(name);
        if (has(r.role_in_event)) {
          li.appendChild(txt(' — '));
          li.appendChild(val(r.role_in_event, 'people', 'role_in_event', pw));
        }
        if (has(r.relationship)) {
          li.appendChild(txt('. Relationship: '));
          li.appendChild(val(r.relationship, 'people', 'relationship', pw));
        }
        if (has(r.tie_documented_by)) {
          li.appendChild(txt('. Documented by '));
          li.appendChild(linkTo(r.tie_documented_by, hostOf(r.tie_documented_by)));
        }
        ul.appendChild(li);
      });
      pp.appendChild(ul);
    } else if (has(e.people)) {
      pp.appendChild(val(e.people, 'events', 'people', w));
    } else {
      pp.appendChild(h('p', 'tt-field tt-muted', 'No person is named by a cited source.'));
    }
    a.appendChild(pp);
    field(a, 'Family tie', [[e.linkage, 'linkage']], 'events', w);
    field(b, 'What investigators did, or the outcome', [[e.investigation_status, 'investigation_status']], 'events', w, 'tt-field-note');
    field(b, 'Response, denial or dispute', [[e.dispute, 'dispute']], 'events', w, 'tt-field-note');
    field(b, 'Where the numbers differ', [[e.conflicting_figures, 'conflicting_figures']], 'events', w);
    field(b, 'How it is counted', [[e.curation_note, 'curation_note']], 'events', w);
    field(b, 'Announcement', [[e.announcement, 'announcement'], has(e.announcer) ? ' — ' : '', [e.announcer, 'announcer']], 'events', w);
    field(b, 'Announced', [[dateText(e.announcement_date), 'announcement_date'], has(e.announcement_time_et) ? ' at ' : '', [e.announcement_time_et, 'announcement_time_et'], has(e.announcement_time_et) ? ' ET' : ''], 'events', w);
    if (has(e.lead_time_minutes)) field(b, 'How long before the announcement', [[fmtCount(e.lead_time_minutes), 'lead_time_minutes'], ' ' + plural(e.lead_time_minutes, 'minute', 'minutes') + ' before the announcement'], 'events', w);
    field(b, 'Where it was traded', [[e.market_or_venue, 'market_or_venue']], 'events', w);
    field(b, 'Research area', [[e.lane, 'lane']], 'events', w);
    field(b, 'How to check it yourself', [[e.validation_path, 'validation_path']], 'events', w);
    const primary = has(e.primary_source) ? { url: e.primary_source, node: has(e.primary_source_title) ? val(e.primary_source_title, 'events', 'primary_source_title', w) : null } : null;
    const urls = urlsOf(e.all_sources);
    if (primary && !urls.includes(primary.url)) urls.unshift(primary.url);
    sourcesBlock(b, urls, has(e.source_count) ? val(fmtCount(e.source_count), 'events', 'source_count', w) : null, primary);
    drawerFoot(drawer, opts.onClose);
  }

  // ---------- Calculations (readers see each one, with its formula, in Sources) ----------
  const PERIOD_WORDS = { 'before term': 'Before taking office', 'during term': 'In office', 'after term': 'After leaving office' };
  dash.calc('family_totals', {
    inputs: ['events'],
    title: 'Totals by kind of money',
    description:
      'Adds plot_value for events marked in_cumulative, by president, kind of money and period (before, during or after the term). Kinds of money are never added together. Each row also names its largest single entry: top_id, top_title and top_value, that event’s plot_value; period_label is the period in words and kind_label the kind’s short plain name, as on the charts.',
    fn: (events) => {
      const m = new Map();
      for (const e of events) {
        if (String(e.in_cumulative) !== 'true' || e.plot_value === '' || e.plot_value === null || e.plot_value === undefined) continue;
        const key = e.president + '|' + e.chart_family + '|' + e.period;
        const o = m.get(key) || { key, president: e.president, chart_family: e.chart_family, kind_label: SHORT[e.chart_family] || e.chart_family, period: e.period, period_label: PERIOD_WORDS[e.period] || e.period, total: 0, n: 0, top_id: '', top_title: '', top_value: 0 };
        o.total += Number(e.plot_value);
        o.n += 1;
        if (!o.top_id || Number(e.plot_value) > o.top_value) {
          o.top_id = e.id;
          o.top_title = e.title;
          o.top_value = Number(e.plot_value);
        }
        m.set(key, o);
      }
      return [...m.values()];
    },
  });

  // Each event's kind of money by its short plain name, for the event lists' Kind column.
  dash.calc('event_labels', {
    inputs: ['events'],
    title: 'Plain names for kinds of money',
    description: 'For each event (id): the short plain name of its kind of money (kind_label), as the charts use it; events with no amount read "Action or context".',
    fn: (events) => events.map((e) => ({ id: e.id, kind_label: has(e.chart_family) ? SHORT[e.chart_family] || e.chart_family : 'Action or context' })),
  });

  // ---------- Full Documented Summary: counts and the source index ----------
  const INVESTIGATION = /investigation_or_charge|enforcement_action_dropped|enforcement_capacity|penalty_avoided/;
  const PARDON = /pardon/;
  const amountOn = (e) => has(e.amount_usd) || has(e.amount_low) || has(e.amount_high);
  const shownNotAdded = (e) => String(e.in_cumulative) !== 'true' && (has(e.chart_family) || amountOn(e));
  const hostName = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch (err) {
      return '';
    }
  };
  const sourcesOf = (e) => {
    const list = String(e.all_sources || '').split(' | ').map((u) => u.trim()).filter(Boolean);
    if (has(e.primary_source) && !list.includes(e.primary_source)) list.unshift(e.primary_source);
    return list;
  };
  dash.calc('summary_stats', {
    inputs: ['events', 'people'],
    title: 'Full documented summary: record counts',
    description:
      'For each president, counts of records: all of them (records); by evidence tier (documented, reported, alleged); by period (before, during, after the term); those added to a running total (counted, in_cumulative) and the kinds of money they fall in (kinds_counted); amounts shown but not added (not_added: a kind of money or an amount, not in_cumulative); the rest, actions and context with no amount (actions), so counted, not_added and actions add up to records; investigations, charges and enforcement actions (investigations: category investigation_or_charge, enforcement_action_dropped_or_eased, enforcement_capacity or penalty_avoided); pardons and clemency (pardons: category pardon); records with an investigation status or outcome (with_status) and with a response, denial or dispute (with_dispute); records whose trader is not identified (unidentified_trader); the distinct people sources name, middle initials ignored (people); and the distinct source pages, from all_sources and primary_source (source_pages), and sites they are on (source_sites).',
    fn: (events, people) => {
      const norm = (v) => String(v || '').replace(/\s+[A-Z]\.(?=\s)/g, ' ').replace(/\s+/g, ' ').trim();
      const names = [...new Set(['Trump (2nd term)', 'Trump (1st term)', 'Biden', 'Obama', ...events.map((e) => e.president)])];
      return names.map((p) => {
        const ev = events.filter((e) => e.president === p);
        const counted = ev.filter((e) => String(e.in_cumulative) === 'true' && has(e.plot_value));
        const pages = new Set();
        ev.forEach((e) => sourcesOf(e).forEach((u) => pages.add(u)));
        const sites = new Set([...pages].map(hostName).filter(Boolean));
        return {
          key: p,
          president: p,
          records: ev.length,
          documented: ev.filter((e) => e.evidence_tier === 'Documented').length,
          reported: ev.filter((e) => e.evidence_tier === 'Reported').length,
          alleged: ev.filter((e) => e.evidence_tier === 'Alleged').length,
          before: ev.filter((e) => e.period === 'before term').length,
          during: ev.filter((e) => e.period === 'during term').length,
          after: ev.filter((e) => e.period === 'after term').length,
          counted: counted.length,
          kinds_counted: new Set(counted.map((e) => e.chart_family)).size,
          not_added: ev.filter(shownNotAdded).length,
          actions: ev.filter((e) => !counted.includes(e) && !shownNotAdded(e)).length,
          investigations: ev.filter((e) => INVESTIGATION.test(e.category || '')).length,
          pardons: ev.filter((e) => PARDON.test(e.category || '')).length,
          with_status: ev.filter((e) => has(e.investigation_status)).length,
          with_dispute: ev.filter((e) => has(e.dispute)).length,
          unidentified_trader: ev.filter((e) => String(e.trader_identified) === 'false').length,
          people: new Set(people.filter((r) => r.president === p).map((r) => norm(r.person))).size,
          source_pages: pages.size,
          source_sites: sites.size,
        };
      });
    },
  });
  dash.calc('source_index', {
    inputs: ['events'],
    title: 'Sources cited, by president',
    description:
      'One row per president and source page: every URL in an event’s all_sources, plus its primary_source. host is the site, without www.; records counts how many of that president’s events cite the page, and ids lists them in date order.',
    fn: (events) => {
      const m = new Map();
      const sorted = events.slice().sort((a, b) => (String(a.plot_date) < String(b.plot_date) ? -1 : String(a.plot_date) > String(b.plot_date) ? 1 : a.id < b.id ? -1 : 1));
      for (const e of sorted) {
        for (const u of sourcesOf(e)) {
          const key = e.president + '|' + u;
          if (!m.has(key)) m.set(key, { key, president: e.president, url: u, host: hostName(u), records: 0, ids: [] });
          const o = m.get(key);
          if (!o.ids.includes(e.id)) {
            o.ids.push(e.id);
            o.records += 1;
          }
        }
      }
      return [...m.values()].map((o) => ({ ...o, ids: o.ids.join(' ') }));
    },
  });

  dash.calc('running_totals', {
    inputs: ['events'],
    title: 'Running totals in office',
    description:
      'For each president and kind of money, the in-office events marked in_cumulative, each with the period its amount covers (covers_start to covers_end): one day for a dated event, or the month, year or range a reported amount spans (spread is true). cumulative adds the amounts in the order their periods end, so it is the total of every amount whose period had ended by covers_end; group_value and group_n add up the amounts whose periods end on the same day. The chart spreads an amount for a period evenly across it. Aggregates, project values and context rows are excluded upstream.',
    fn: (events) => {
      const rows = events
        .filter((e) => String(e.in_cumulative) === 'true' && e.plot_value !== '' && e.plot_value !== null && e.plot_value !== undefined && e.period === 'during term')
        .map((e) => {
          const cs = has(e.covers_start) ? e.covers_start : e.plot_date;
          const ce = has(e.covers_end) ? e.covers_end : cs;
          return {
            id: e.id, president: e.president, chart_family: e.chart_family, plot_date: e.plot_date, covers_start: cs, covers_end: ce,
            spread: ce > cs, value: Number(e.plot_value), title: e.title, label: has(e.short_label) ? e.short_label : e.title, evidence_tier: e.evidence_tier,
          };
        })
        .sort((a, b) => (a.covers_end < b.covers_end ? -1 : a.covers_end > b.covers_end ? 1 : a.id < b.id ? -1 : 1));
      const run = new Map();
      const grp = new Map();
      for (const r of rows) {
        const k = r.president + '|' + r.chart_family;
        r.cumulative = (run.get(k) || 0) + r.value;
        run.set(k, r.cumulative);
        const g = grp.get(k + '|' + r.covers_end) || { value: 0, n: 0 };
        g.value += r.value;
        g.n += 1;
        grp.set(k + '|' + r.covers_end, g);
      }
      for (const r of rows) {
        const g = grp.get(r.president + '|' + r.chart_family + '|' + r.covers_end);
        r.group_value = g.value;
        r.group_n = g.n;
      }
      return rows;
    },
  });

  // ---------- Chamber screens (Senate and House): the same two calculations for each ----------
  const chamberCalcs = (ds, title, who) => {
    dash.calc(ds + '_summary', {
      inputs: [ds],
      title: `${title} screen by party`,
      description:
        `Counts ${who} by screen result and party. Every result and party pair is listed, with zero where there is none, beside the party’s number of members screened and the share of them with that result.`,
      fn: (rows) => {
        const results = [...new Set(rows.map((s) => s.screen_result))];
        const parties = [...new Set(rows.map((s) => s.party))];
        const size = new Map();
        for (const s of rows) size.set(s.party, (size.get(s.party) || 0) + 1);
        const m = new Map();
        for (const r of results) {
          for (const p of parties) m.set(r + '|' + p, { key: r + '|' + p, screen_result: r, party: p, n: 0, party_total: size.get(p) || 0, share: 0 });
        }
        for (const s of rows) m.get(s.screen_result + '|' + s.party).n += 1;
        for (const o of m.values()) o.share = o.party_total ? o.n / o.party_total : 0;
        return [...m.values()];
      },
    });
    dash.calc(ds + '_totals', {
      inputs: [ds],
      title: `${title} screen totals`,
      description:
        `For all ${who} and for each party: members screened; members with at least one finding (any screen result other than "Nothing found in our quick check") and with none; the summed counts of flagged trades, late filings, inquiries or complaints, and family or business ties, each with the number of members who have at least one (flagged_members, late_members, inquiry_members, ties_members); and, for members whose disclosed trades could be valued (valued), the sums of the low and high ends of their value ranges (value_low, value_high) and of their flagged trades (flagged_value_low, flagged_value_high). Each count or sum is added only to itself.`,
      fn: (rows) => {
        const parties = [...new Set(['R', 'D', 'I', ...rows.map((s) => s.party)])];
        const none = (s) => /^(no issues|nothing found)/i.test(String(s.screen_result || ''));
        const sum = (list, f) => list.reduce((a, s) => a + (Number(s[f]) || 0), 0);
        const groups = [['All', rows], ...parties.map((p) => [p, rows.filter((s) => s.party === p)])];
        return groups.map(([party, list]) => ({
          key: party,
          party,
          members: list.length,
          with_findings: list.filter((s) => !none(s)).length,
          no_issues: list.filter(none).length,
          flagged_trades: sum(list, 'flagged_trades'),
          flagged_members: list.filter((s) => Number(s.flagged_trades) > 0).length,
          late_filings: sum(list, 'late_filing_violations'),
          late_members: list.filter((s) => Number(s.late_filing_violations) > 0).length,
          inquiries: sum(list, 'investigations_or_complaints'),
          inquiry_members: list.filter((s) => Number(s.investigations_or_complaints) > 0).length,
          family_ties: sum(list, 'family_business_ties'),
          ties_members: list.filter((s) => Number(s.family_business_ties) > 0).length,
          valued: list.filter((s) => Number(s.tv_high) > 0).length,
          value_low: sum(list, 'tv_low'),
          value_high: sum(list, 'tv_high'),
          flagged_value_low: sum(list, 'flagged_value_low'),
          flagged_value_high: sum(list, 'flagged_value_high'),
        }));
      },
    });
  };
  chamberCalcs('senate', 'Senate', 'current senators');
  chamberCalcs('house', 'House', 'screened Representatives');

  dash.calc('president_stats', {
    inputs: ['events', 'people'],
    title: 'Events and people by president',
    description:
      'For each president: events on record (any period), events in office, in-office events added to a running total (in_cumulative) and the number of kinds of money they fall in, events whose trader is not identified (trader_identified false), events with an investigation status (with_status), a dispute (with_dispute) or either one (with_record), and the distinct people sources name (middle initials ignored) with the number of events naming anyone.',
    fn: (events, people) => {
      const norm = (s) => String(s || '').replace(/\s+[A-Z]\.(?=\s)/g, ' ').replace(/\s+/g, ' ').trim();
      const filled = (v) => v !== '' && v !== null && v !== undefined;
      const names = [...new Set(['Trump (2nd term)', 'Trump (1st term)', 'Biden', 'Obama', ...events.map((e) => e.president)])];
      return names.map((p) => {
        const ev = events.filter((e) => e.president === p);
        const office = ev.filter((e) => e.period === 'during term');
        const counted = office.filter((e) => String(e.in_cumulative) === 'true' && filled(e.plot_value));
        const ppl = people.filter((r) => r.president === p);
        return {
          key: p,
          president: p,
          events: ev.length,
          in_office: office.length,
          counted: counted.length,
          kinds_counted: new Set(counted.map((e) => e.chart_family)).size,
          unidentified_trader: ev.filter((e) => String(e.trader_identified) === 'false').length,
          with_status: ev.filter((e) => filled(e.investigation_status)).length,
          with_dispute: ev.filter((e) => filled(e.dispute)).length,
          with_record: ev.filter((e) => filled(e.investigation_status) || filled(e.dispute)).length,
          people: new Set(ppl.map((r) => norm(r.person))).size,
          people_events: new Set(ppl.map((r) => r.event_id)).size,
        };
      });
    },
  });

  dash.calc('facet_counts', {
    inputs: ['events'],
    title: 'Events by evidence tier and kind of money',
    description:
      'Counts each president’s events by evidence tier (Documented, Reported, Alleged; zero where none) and by kind of money (events with no kind of money count as "Actions & context"). These are counts of events, not dollars.',
    fn: (events) => {
      const tiers = ['Documented', 'Reported', 'Alleged'];
      const names = [...new Set(['Trump (2nd term)', 'Trump (1st term)', 'Biden', 'Obama', ...events.map((e) => e.president)])];
      const m = new Map();
      const row = (p, facet, value) => {
        const key = p + '|' + facet + '|' + value;
        if (!m.has(key)) m.set(key, { key, president: p, facet, value, n: 0 });
        return m.get(key);
      };
      for (const p of names) for (const t of tiers) row(p, 'tier', t);
      for (const e of events) {
        row(e.president, 'tier', e.evidence_tier || 'Not recorded').n += 1;
        row(e.president, 'kind', e.chart_family || 'Actions & context').n += 1;
      }
      return [...m.values()];
    },
  });

  dash.calc('key_events', {
    inputs: ['events'],
    title: 'Key events in each running total',
    description:
      'For each president and kind of money, among in-office events added to the running total: the largest single event (measure largest_event) and the day the total rose most, adding up that day’s events of that kind only (measure biggest_day). The biggest day counts only events dated to a single day; an amount reported for a month, a year or a longer period has no single day. share is that amount over the kind’s in-office total; total_after is the total of the amounts whose periods had ended by that day.',
    fn: (events) => {
      const rows = [];
      const by = new Map();
      for (const e of events) {
        if (String(e.in_cumulative) !== 'true' || e.plot_value === '' || e.plot_value === null || e.plot_value === undefined || e.period !== 'during term') continue;
        const k = e.president + '|' + e.chart_family;
        if (!by.has(k)) by.set(k, []);
        by.get(k).push(e);
      }
      const endOf = (e) => (has(e.covers_end) ? e.covers_end : e.plot_date);
      for (const [k, list] of by) {
        const total = list.reduce((a, e) => a + Number(e.plot_value), 0);
        const top = list.slice().sort((a, b) => Number(b.plot_value) - Number(a.plot_value) || (a.plot_date < b.plot_date ? -1 : 1))[0];
        rows.push({
          key: k + '|largest_event', president: top.president, chart_family: top.chart_family, measure: 'largest_event',
          id: top.id, title: top.title, date: top.date, date_precision: top.date_precision, plot_date: top.plot_date,
          covers_start: has(top.covers_start) ? top.covers_start : top.plot_date, covers_end: endOf(top),
          value: Number(top.plot_value), events: 1, share: total ? Number(top.plot_value) / total : 0,
          total_after: list.filter((e) => endOf(e) <= endOf(top)).reduce((a, e) => a + Number(e.plot_value), 0),
          evidence_tier: top.evidence_tier,
        });
        const days = new Map();
        for (const e of list.filter((q) => !isSpread(q))) {
          const d = days.get(e.plot_date) || { plot_date: e.plot_date, value: 0, events: 0, top: e };
          d.value += Number(e.plot_value);
          d.events += 1;
          if (Number(e.plot_value) > Number(d.top.plot_value)) d.top = e;
          days.set(e.plot_date, d);
        }
        const best = [...days.values()].sort((a, b) => b.value - a.value || (a.plot_date < b.plot_date ? -1 : 1))[0];
        if (!best) continue;
        rows.push({
          key: k + '|biggest_day', president: best.top.president, chart_family: best.top.chart_family, measure: 'biggest_day',
          id: best.top.id, title: best.top.title, date: best.top.date, date_precision: best.top.date_precision, plot_date: best.plot_date,
          value: best.value, events: best.events, share: total ? best.value / total : 0,
          total_after: list.filter((e) => endOf(e) <= best.plot_date).reduce((a, e) => a + Number(e.plot_value), 0),
          evidence_tier: best.top.evidence_tier,
        });
      }
      return rows;
    },
  });

  dash.calc('person_network', {
    inputs: ['people', 'events'],
    title: 'People named in each president’s events',
    description:
      'One row per president and person a cited source names (middle initials ignored, so "Donald J. Trump" and "Donald Trump" are one person; the most used spelling is shown). events counts the distinct events naming them; co_people counts the other people named in those events; counted_events counts those added to a running total; unidentified_trader_events counts those whose trader is not identified, where the person is named for another role. rank orders people by events within each president (1 = most).',
    fn: (people, events) => {
      const norm = (s) => String(s || '').replace(/\s+[A-Z]\.(?=\s)/g, ' ').replace(/\s+/g, ' ').trim();
      const byId = new Map(events.map((e) => [e.id, e]));
      const persons = new Map();
      const eventPeople = new Map();
      for (const r of people) {
        const k = r.president + '|' + norm(r.person);
        if (!persons.has(k)) persons.set(k, { key: k, president: r.president, spellings: new Map(), events: new Set() });
        const o = persons.get(k);
        o.spellings.set(r.person, (o.spellings.get(r.person) || 0) + 1);
        o.events.add(r.event_id);
        if (!eventPeople.has(r.event_id)) eventPeople.set(r.event_id, new Set());
        eventPeople.get(r.event_id).add(k);
      }
      const rows = [...persons.values()].map((o) => {
        const co = new Set();
        for (const id of o.events) for (const k of eventPeople.get(id) || []) if (k !== o.key) co.add(k);
        const evs = [...o.events].map((id) => byId.get(id)).filter(Boolean);
        const person = [...o.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || (a[0] < b[0] ? -1 : 1))[0][0];
        return {
          key: o.key, president: o.president, person, events: o.events.size, co_people: co.size,
          counted_events: evs.filter((e) => String(e.in_cumulative) === 'true').length,
          unidentified_trader_events: evs.filter((e) => String(e.trader_identified) === 'false').length,
          rank: 0,
        };
      });
      const byPres = new Map();
      for (const r of rows) {
        if (!byPres.has(r.president)) byPres.set(r.president, []);
        byPres.get(r.president).push(r);
      }
      for (const list of byPres.values()) {
        const levels = [...new Set(list.map((r) => r.events))].sort((a, b) => b - a);
        for (const r of list) r.rank = levels.indexOf(r.events) + 1;
      }
      return rows;
    },
  });

  dash.calc('enforcement_yoy', {
    inputs: ['enforcement'],
    title: 'Year-over-year change in enforcement counts',
    description:
      'For each agency, compares enforcement_actions in back-to-back fiscal years that both have a count (years without one are skipped, not filled). change is the difference and pct the change over the earlier year. largest_for_agency and largest_overall flag the biggest change in size, up or down. Counting methods changed in some years; see each year’s notes.',
    fn: (rows) => {
      const filled = (v) => v !== '' && v !== null && v !== undefined;
      const by = new Map();
      for (const r of rows) {
        if (!filled(r.fiscal_year) || !filled(r.enforcement_actions)) continue;
        if (!by.has(r.agency)) by.set(r.agency, []);
        by.get(r.agency).push({ fy: Number(r.fiscal_year), n: Number(r.enforcement_actions), period: r.period, president: r.president });
      }
      const out = [];
      for (const [agency, list] of by) {
        list.sort((a, b) => a.fy - b.fy);
        for (let i = 1; i < list.length; i++) {
          const a = list[i - 1];
          const b = list[i];
          if (b.fy !== a.fy + 1 || !a.n) continue;
          out.push({
            key: agency + '|' + b.fy, agency, from_fy: a.fy, to_fy: b.fy, from_n: a.n, to_n: b.n,
            change: b.n - a.n, pct: (b.n - a.n) / a.n, from_period: a.period, to_period: b.period,
            from_president: a.president, to_president: b.president, largest_for_agency: false, largest_overall: false,
          });
        }
      }
      const biggest = (list) => list.reduce((best, r) => (!best || Math.abs(r.pct) > Math.abs(best.pct) ? r : best), null);
      for (const agency of new Set(out.map((r) => r.agency))) {
        const top = biggest(out.filter((r) => r.agency === agency));
        if (top) top.largest_for_agency = true;
      }
      const top = biggest(out);
      if (top) top.largest_overall = true;
      return out;
    },
  });

  window.TT = {
    F, ACTIONS, ORDER, CONTEXT, FAMILY, TRADES, GROUPS, SHORT, ABOUT, AS_OF, PRES, TERMS, ERAS, TIERS, ACTION_SHAPES, shapeFor, symbolPath,
    has, num, isCounted, kindOf, isMoney, colorFor, groupOf, presColor, partyColor, pidOf, PARTY, sortKinds, shortOf, normPerson, MUTED,
    fmtCount, fmtMoney, fmtPct, fmtSignedPct, fmtDate, fmtMonth, parseDate, dateText, periodText, isSpread, amountText, plural, human, fmtBy,
    statusOf, rowsOf, failed, enc, where, parseWhere, findRow, mark,
    NS, h, s, val, txt, button, swatch, tierBadge, tierClass, keySvg, measure, failLine, failTable, loading, fillMarks, firstPlay, delay,
    tooltip, centerOf, setHot, urlsOf, hostOf, linkTo, openDrawer, closeDrawer, drawerFoot, field, drawerHead, sourcesBlock, eventDrawer,
    INVESTIGATION, PARDON, shownNotAdded, sourcesOf, isNarrow, pageRows, cellTag, headLabels,
  };
})();
