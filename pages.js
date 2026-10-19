// Tabs, the Compare, Senate and Methods pages, and the redraw loop.
(function () {
  'use strict';
  const T = window.TT;
  const byId = (id) => document.getElementById(id);
  const tabs = [...document.querySelectorAll('.tt-tab[data-page]')];
  const pages = [...document.querySelectorAll('.tt-page')];
  const wrapEl = document.querySelector('.tt-wrap');
  const bar = document.querySelector('.tt-tabs');
  const barBox = bar ? bar.parentElement : null;
  let current = null;

  // On a phone the tabs are one row that scrolls sideways and stays at the top: a fade marks an end with more tabs,
  // the open tab is kept in view, and the bar's height is shared so jumps land below it.
  const tabBarState = () => {
    if (!bar || !barBox) return;
    const max = bar.scrollWidth - bar.clientWidth;
    const x = bar.scrollLeft;
    barBox.setAttribute('data-more', [x > 2 ? 'left' : '', x < max - 2 ? 'right' : ''].filter(Boolean).join(' '));
    if (wrapEl) wrapEl.style.setProperty('--tt-bar-h', barBox.offsetHeight + 'px');
  };
  const keepTabInView = (tab) => {
    if (!bar || !tab || bar.scrollWidth <= bar.clientWidth + 1) return;
    const r = tab.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    if (r.left < b.left + 32 || r.right > b.right - 32) bar.scrollLeft += r.left - b.left - (b.width - r.width) / 2;
  };
  if (bar) bar.addEventListener('scroll', tabBarState, { passive: true });

  function show(id, push) {
    const target = pages.find((p) => p.id === id) || pages[0];
    pages.forEach((p) => (p.hidden = p !== target));
    document.querySelectorAll('.tt-term-switch [data-goto]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-goto') === target.id)));
    tabs.forEach((b) => {
      const on = b.getAttribute('data-page') === target.id || (b.getAttribute('data-also') || '').split(' ').includes(target.id);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on) keepTabInView(b);
    });
    tabBarState();
    current = target.id;
    if (push) dash.setLink(target.id);
    draw();
  }
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => show(b.getAttribute('data-page'), true));
    b.addEventListener('keydown', (ev) => {
      const k = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
      if (!k) return;
      ev.preventDefault();
      const n = tabs[(i + k + tabs.length) % tabs.length];
      n.focus();
      show(n.getAttribute('data-page'), true);
    });
  });
  // A button that opens another page from far down this one starts that page at its top, under the tabs. "Above the
  // top" is measured against whatever box scrolls the page (the window here, a panel inside the dashboard app).
  const scrollTopEdge = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p.getBoundingClientRect().top;
    }
    return 0;
  };
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => {
    show(b.getAttribute('data-goto'), true);
    const page = byId(current);
    if (!page || page.getBoundingClientRect().top >= scrollTopEdge(page)) return;
    // The page's fade-in starts it a little low; finish that first so the scroll lands exactly under the tabs.
    if (page.getAnimations) page.getAnimations().forEach((a) => a.finish());
    page.scrollIntoView({ block: 'start' });
  }));
  // The reading guide starts folded on a phone, so the tabs and the first chart are on the first screen.
  const guide = byId('guide');
  if (guide && T.isNarrow(guide)) guide.open = false;
  // A jump button brings a place on the same page into view and names it in the dashboard's link.
  document.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => {
    const el = byId(b.getAttribute('data-jump'));
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    dash.setLink(el.id);
  }));

  // ---------- Shared table helpers ----------
  function wireSort(table, state, cols, redraw) {
    if (table.hasAttribute('data-wired')) return;
    table.querySelectorAll('thead th[data-field]').forEach((th) => {
      const f = th.getAttribute('data-field');
      const b = th.querySelector('button');
      if (!b) return;
      b.addEventListener('click', () => {
        if (state.sort === f) state.dir = -state.dir;
        else {
          state.sort = f;
          state.dir = cols[f] && cols[f].num ? -1 : 1;
        }
        redraw();
      });
    });
    table.setAttribute('data-wired', '');
  }
  function markSort(table, state) {
    table.querySelectorAll('thead th[data-field]').forEach((th) => {
      th.setAttribute('aria-sort', th.getAttribute('data-field') === state.sort ? (state.dir > 0 ? 'ascending' : 'descending') : 'none');
    });
  }
  const emptyRow = (tbody, cols, text) => {
    const tr = T.h('tr');
    const td = T.h('td', 'tt-td tt-muted', text);
    td.colSpan = cols;
    tr.appendChild(td);
    tbody.appendChild(tr);
  };

  // ---------- Compare: in-office totals, one row per kind of money, a president per dot ----------
  const PRES_SHAPES = ['circle', 'triangle', 'square', 'diamond'];
  const presShape = (name) => {
    const i = T.PRES.findIndex((p) => p.name === name);
    return { sym: PRES_SHAPES[i < 0 ? 0 : i % PRES_SHAPES.length], rot: 0 };
  };
  const presLabel = (name) => (T.PRES.find((p) => p.name === name) || { tab: name }).tab;
  function drawCompareTotals() {
    const box = byId('compare-dots');
    const totals = T.rowsOf('family_totals');
    if (!totals) {
      if (T.failed('family_totals')) T.failLine(box);
      return;
    }
    box.classList.remove('dash-skeleton');
    box.replaceChildren();
    const during = totals.filter((r) => r.period === 'during term');
    const kinds = T.sortKinds(during.map((r) => r.chart_family));
    if (!kinds.length) {
      box.appendChild(T.h('p', 'tt-empty', 'No in-office totals yet.'));
      return;
    }
    const play = T.firstPlay(box, true);
    const W = Math.max(300, box.clientWidth || 640);
    const narrow = W < 560;
    const svgSel = d3.select(box).append('svg').attr('class', 'tt-svg').attr('width', '100%')
      .attr('role', 'group').attr('aria-label', 'In-office totals by kind of money and president, each row on its own scale; the table below lists every value');
    const svg = svgSel.node();
    const labelW = T.measure(svg, 'tt-row-label', kinds.map(T.shortOf));
    const m = { l: narrow ? 8 : Math.ceil(labelW) + 18, r: 16, t: 6, b: 6 };
    const rowH = narrow ? 70 : 54;
    // Rows come in two groups, each under its own heading: money to the family and connected firms, then trades by others.
    const headH = 30;
    const groupOf = (k) => (T.FAMILY.has(k) ? 0 : 1);
    const heads = narrow ? ['Money to the family and connected firms', 'Trades by others just before government news']
      : ['Money to each president’s family and connected firms', 'Trades placed just before government news, mostly by others (not the president’s money)'];
    let yy = m.t;
    let lastGroup = -1;
    const rowTop = kinds.map((k) => {
      if (groupOf(k) !== lastGroup) {
        lastGroup = groupOf(k);
        yy += headH;
      }
      const top = yy;
      yy += rowH;
      return top;
    });
    const H = yy + m.b;
    svgSel.attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    box.style.minHeight = H + 'px';
    lastGroup = -1;
    kinds.forEach((k, i) => {
      if (groupOf(k) === lastGroup) return;
      lastGroup = groupOf(k);
      svgSel.append('text').attr('class', 'tt-group-label').attr('x', 0).attr('y', rowTop[i] - 10).text(heads[lastGroup]);
    });
    const tip = T.tooltip(box);
    kinds.forEach((k, i) => {
      const yc = rowTop[i] + (narrow ? 40 : rowH / 2);
      const rows = during.filter((r) => r.chart_family === k).sort((a, b) => a.total - b.total);
      // Each kind of money has its own scale, from zero to its largest in-office total.
      const x = d3.scaleLinear([0, d3.max(rows, (r) => r.total) || 1], [m.l, W - m.r]);
      svgSel.append('text').attr('class', 'tt-row-label').attr('x', narrow ? m.l : m.l - 12).attr('y', narrow ? yc - 30 : yc)
        .attr('text-anchor', narrow ? 'start' : 'end').attr('dominant-baseline', 'middle').text(T.shortOf(k));
      svgSel.append('line').attr('class', 'tt-axis-line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', yc).attr('y2', yc);
      svgSel.append('line').attr('class', 'tt-axis-line').attr('x1', m.l).attr('x2', m.l).attr('y1', yc - 4).attr('y2', yc + 4);
      const placed = [-Infinity, -Infinity];
      rows.forEach((r, j) => {
        const cx = x(r.total);
        const sh = presShape(r.president);
        const g = svgSel.append('g');
        // The mark sits in its own positioned group: the entry animation scales the path, and a CSS transform on
        // the path itself would replace a translate written on it.
        const p = g.append('g').attr('transform', `translate(${cx},${yc})`).append('path').attr('class', 'tt-net-event' + (play ? ' tt-pop' : ''))
          .attr('d', T.symbolPath(sh, 110)).style('fill', T.presColor(r.president));
        T.mark(p.node(), 'family_totals', 'total', { key: r.key });
        if (play) T.delay(p.node(), (i / kinds.length) * 0.6);
        // A direct label per mark (president and total), above or below; one with no free room is left to the table.
        // A first name alone is ambiguous once a president has two terms; keep the years then.
        const tab = presLabel(r.president);
        const name = (T.PRES.filter((q) => q.tab.split(' ')[0] === tab.split(' ')[0]).length > 1 ? tab : tab.split(' ')[0]) + ' ';
        const money = T.fmtMoney(r.total);
        const lw = T.measure(svg, 'tt-anno', [name + money]);
        const a0 = Math.max(m.l, Math.min(W - m.r - lw, cx - lw / 2));
        const slot = [0, 1].find((q) => placed[q] <= a0 - 6);
        if (slot !== undefined) {
          const t = g.append('text').attr('class', 'tt-anno').attr('x', a0).attr('y', slot ? yc + 19 : yc - 12);
          t.append('tspan').text(name);
          T.mark(t.append('tspan').attr('class', 'tt-anno-strong').text(money).node(), 'family_totals', 'total', { key: r.key });
          placed[slot] = a0 + lw;
        }
        const lines = [{ text: T.shortOf(k) }, { value: money, text: presLabel(r.president), color: T.presColor(r.president) },
          { value: T.fmtCount(r.n), text: T.plural(r.n, 'event added in office', 'events added in office'), cls: 'tt-tip-line' }];
        const hit = g.append('circle').attr('class', 'tt-hit').attr('cx', cx).attr('cy', yc).attr('r', 12).attr('tabindex', 0)
          .attr('aria-label', `${presLabel(r.president)}, ${T.shortOf(k)}: ${money}`).node();
        hit.addEventListener('pointermove', (ev) => tip.show(ev, lines));
        hit.addEventListener('pointerleave', () => tip.hide());
        hit.addEventListener('focus', () => tip.show(T.centerOf(hit), lines));
        hit.addEventListener('blur', () => tip.hide());
      });
    });
    const legend = byId('compare-legend');
    legend.replaceChildren();
    [...new Set(during.map((r) => r.president))].sort((a, b) => T.PRES.findIndex((p) => p.name === a) - T.PRES.findIndex((p) => p.name === b)).forEach((p) => {
      const it = T.h('span', 'tt-legend-item');
      it.append(T.keySvg(presShape(p), T.presColor(p)), T.txt(presLabel(p)));
      legend.appendChild(it);
    });
    const note = T.h('span', 'tt-legend-item', 'Color and shape show the president: two reds for Trump, darker for his first term and brighter for his second, and two blues, lighter for Biden and dark navy for Obama. Each row starts at zero on its own scale.');
    legend.appendChild(note);
  }

  // The table view of the same totals: every kind of money a president has an in-office total for.
  const CMP = { sort: 'kind_label', dir: 1 };
  const CMP_COLS = {
    president: { text: (r) => r.president, sort: (r) => T.PRES.findIndex((p) => p.name === r.president) },
    kind_label: { text: (r) => r.kind_label, sort: (r) => T.ORDER.indexOf(r.chart_family) },
    chart_family: { text: (r) => r.chart_family, sort: (r) => T.ORDER.indexOf(r.chart_family) },
    total: { text: (r) => T.fmtMoney(r.total), sort: (r) => r.total, num: true, cls: 'tt-num' },
    n: { text: (r) => T.fmtCount(r.n), sort: (r) => r.n, num: true, cls: 'tt-num' },
  };
  function drawCompareTable() {
    const table = byId('compare-table');
    const totals = T.rowsOf('family_totals');
    if (!totals) {
      if (T.failed('family_totals')) T.failTable(table);
      return;
    }
    wireSort(table, CMP, CMP_COLS, drawCompareTable);
    const rows = totals.filter((r) => r.period === 'during term');
    const c = CMP_COLS[CMP.sort];
    rows.sort((a, b) => CMP.dir * d3.ascending(c.sort(a), c.sort(b)) || d3.ascending(CMP_COLS.chart_family.sort(a), CMP_COLS.chart_family.sort(b)) || d3.ascending(CMP_COLS.president.sort(a), CMP_COLS.president.sort(b)));
    markSort(table, CMP);
    const tbody = table.querySelector('tbody');
    tbody.replaceChildren();
    const fields = [...table.querySelectorAll('thead th[data-field]')].map((th) => th.getAttribute('data-field'));
    if (!rows.length) return emptyRow(tbody, fields.length, 'No in-office totals yet.');
    const labels = T.headLabels(table);
    rows.forEach((r) => {
      const tr = T.h('tr');
      tr.setAttribute('data-key', r.key);
      fields.forEach((f) => {
        const td = T.cellTag(T.h('td', 'tt-td ' + (CMP_COLS[f].cls || '')), f, labels[f]);
        if (f === 'president') {
          const sp = T.h('span', 'tt-cell-kind');
          sp.append(T.swatch(T.presColor(r.president)), T.txt(CMP_COLS[f].text(r)));
          td.appendChild(sp);
        } else td.textContent = CMP_COLS[f].text(r);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  // ---------- Compare: enforcement actions per fiscal year, presidencies shaded ----------
  const AGENCY_ORDER = ['SEC', 'CFTC', 'DOJ'];
  const fyDate = (fy) => new Date(Date.UTC(fy - 1, 9, 1) + 182 * 864e5);
  function drawEnforcement() {
    const box = byId('enforcement-chart');
    const rows = T.rowsOf('enforcement');
    if (!rows) {
      if (T.failed('enforcement')) T.failLine(box);
      return;
    }
    box.classList.remove('dash-skeleton');
    box.replaceChildren();
    const yoy = T.rowsOf('enforcement_yoy') || [];
    const agencies = [...new Set(rows.filter((r) => T.has(r.fiscal_year) && T.has(r.enforcement_actions)).map((r) => r.agency))]
      .sort((a, b) => (AGENCY_ORDER.indexOf(a) + 99) % 99 - (AGENCY_ORDER.indexOf(b) + 99) % 99 || (a < b ? -1 : 1));
    if (!agencies.length) {
      box.appendChild(T.h('p', 'tt-empty', 'No enforcement counts yet.'));
      return;
    }
    const play = T.firstPlay(box, true);
    const grid = T.h('div', 'tt-multiples');
    box.appendChild(grid);
    const fys = rows.filter((r) => T.has(r.fiscal_year)).map((r) => Number(r.fiscal_year));
    const x0 = new Date(Date.UTC(d3.min(fys) - 1, 9, 1));
    const x1 = new Date(Date.UTC(d3.max(fys), 9, 1));
    // Every panel goes into the grid before any is drawn, so each chart is measured at its own final width.
    const panels = agencies.map((ag) => {
      const cell = T.h('div', 'tt-mult');
      const head = T.h('div', 'tt-mult-title');
      const k = T.h('span', 'tt-sw-line');
      k.style.background = 'var(--color-fg)';
      head.append(k, T.txt(ag === 'DOJ' ? 'Justice Department white-collar prosecutions per year (TRAC, secondary)' : ag === 'SEC' ? 'SEC (stocks) enforcement actions per year' : ag === 'CFTC' ? 'CFTC (commodities and futures) enforcement actions per year' : `${ag} enforcement actions per year`));
      cell.appendChild(head);
      const cb = T.h('div', 'tt-mult-chart');
      cell.appendChild(cb);
      grid.appendChild(cell);
      return { ag, cb };
    });
    panels.forEach(({ ag, cb }) => {
      const pts = rows.filter((r) => r.agency === ag && T.has(r.fiscal_year) && T.has(r.enforcement_actions))
        .map((r) => ({ id: r.id, fy: Number(r.fiscal_year), n: Number(r.enforcement_actions), relief: r.monetary_relief_usd, notes: r.notes, president: r.president }))
        .sort((a, b) => a.fy - b.fy);
      const W = Math.max(260, cb.clientWidth || 340);
      const H = 200;
      // On a phone the two labels move out of the plot into a line of text under it, where they can't cover the line.
      const narrow = W < 420;
      const svgSel = d3.select(cb).append('svg').attr('class', 'tt-svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H)
        .attr('role', 'group').attr('aria-label', `${ag} counts by fiscal year`);
      const svg = svgSel.node();
      const y = d3.scaleLinear([0, d3.max(pts, (p) => p.n) * 1.15], [H - 26, 22]);
      const yt = y.ticks(4);
      const m = { l: Math.ceil(T.measure(svg, 'tt-tick', yt.map(T.fmtCount))) + 8, r: 10 };
      const x = d3.scaleUtc([x0, x1], [m.l, W - m.r]);
      T.ERAS.forEach((e, i) => {
        const a = Math.max(m.l, x(T.parseDate(e.a)));
        const b = Math.min(W - m.r, x(T.parseDate(e.b)));
        if (b <= a) return;
        svgSel.append('rect').attr('class', i % 2 ? 'tt-band tt-band-alt' : 'tt-band').attr('x', a).attr('width', b - a).attr('y', 6).attr('height', H - 32);
        const lbl = svgSel.append('text').attr('class', 'tt-band-label').attr('x', (a + b) / 2).attr('y', 16).attr('text-anchor', 'middle').text(e.name);
        if (lbl.node().getComputedTextLength() > b - a - 4) lbl.remove();
      });
      yt.forEach((t) => {
        svgSel.append('line').attr('class', 'tt-grid').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(t)).attr('y2', y(t));
        svgSel.append('text').attr('class', 'tt-tick').attr('x', m.l - 6).attr('y', y(t)).attr('text-anchor', 'end').attr('dominant-baseline', 'middle').text(T.fmtCount(t));
      });
      const ax = svgSel.append('g').attr('class', 'tt-axis').attr('transform', `translate(0,${H - 26})`).call(d3.axisBottom(x).ticks(W < 420 ? 4 : 8).tickSizeOuter(0));
      ax.attr('font-size', null).attr('font-family', null);
      // Draw consecutive years only; a missing year breaks the line rather than being filled in.
      const line = d3.line().x((p) => x(fyDate(p.fy))).y((p) => y(p.n));
      const segs = [];
      pts.forEach((p, i) => {
        if (!i || p.fy !== pts[i - 1].fy + 1) segs.push([]);
        segs[segs.length - 1].push(p);
      });
      segs.forEach((sg) => {
        const path = svgSel.append('path').attr('class', 'tt-ink-line' + (play ? ' tt-draw' : '')).attr('d', line(sg));
        if (play) {
          path.attr('pathLength', 1);
          T.delay(path.node(), 0);
        }
      });
      const top = yoy.find((r) => r.agency === ag && r.largest_for_agency);
      if (top) {
        const xa = x(fyDate(top.from_fy));
        const xb = x(fyDate(top.to_fy));
        svgSel.append('line').attr('class', 'tt-emph-line').attr('x1', xa).attr('x2', xb).attr('y1', y(top.from_n)).attr('y2', y(top.to_n));
      }
      if (top && !narrow) {
        const xa = x(fyDate(top.from_fy));
        const xb = x(fyDate(top.to_fy));
        const t = svgSel.append('text').attr('class', 'tt-anno').attr('dominant-baseline', 'middle');
        const v = t.append('tspan').attr('class', 'tt-anno-strong').text(T.fmtSignedPct(top.pct));
        T.mark(v.node(), 'enforcement_yoy', 'pct', { key: top.key });
        t.append('tspan').text(' FY');
        T.mark(t.append('tspan').text(String(top.to_fy)).node(), 'enforcement_yoy', 'to_fy', { key: top.key });
        const tw = t.node().getComputedTextLength();
        const ym = Math.min(y(top.from_n), y(top.to_n)) - 12;
        t.attr('y', Math.max(28, ym)).attr('x', Math.max(m.l + tw / 2, Math.min(W - m.r - tw / 2, (xa + xb) / 2))).attr('text-anchor', 'middle');
      }
      const tip = T.tooltip(cb);
      pts.forEach((p, i) => {
        const cx = x(fyDate(p.fy));
        const cy = y(p.n);
        const dot = svgSel.append('circle').attr('class', 'tt-ink-dot' + (play ? ' tt-pop' : '')).attr('cx', cx).attr('cy', cy).attr('r', 4);
        T.mark(dot.node(), 'enforcement', 'enforcement_actions', { id: p.id });
        if (play) T.delay(dot.node(), (i / pts.length) * 0.8);
        const lines = [{ text: `FY${p.fy} (Oct ${p.fy - 1} – Sep ${p.fy}) · ${p.president}` }, { value: T.fmtCount(p.n), text: ag === 'DOJ' ? 'prosecutions' : 'enforcement actions' },
          { text: T.has(p.relief) ? 'Money ordered: ' + T.fmtMoney(p.relief) : 'Money ordered: not reported', cls: 'tt-tip-muted' },
          p.notes ? { text: String(p.notes).slice(0, 220) + (String(p.notes).length > 220 ? '…' : ''), cls: 'tt-tip-muted' } : null];
        const hit = svgSel.append('circle').attr('class', 'tt-hit').attr('cx', cx).attr('cy', cy).attr('r', 12).attr('tabindex', 0)
          .attr('aria-label', `${ag} FY${p.fy}: ${T.fmtCount(p.n)}`).node();
        hit.addEventListener('pointermove', (ev) => tip.show(ev, lines));
        hit.addEventListener('pointerleave', () => tip.hide());
        hit.addEventListener('focus', () => tip.show(T.centerOf(hit), lines));
        hit.addEventListener('blur', () => tip.hide());
      });
      const last = pts[pts.length - 1];
      if (narrow) {
        const lw = { id: last.id };
        const note = T.h('p', 'tt-mult-note');
        note.append(T.txt('Latest: '), T.val(T.fmtCount(last.n), 'enforcement', 'enforcement_actions', lw, 'tt-strong'), T.txt(' in fiscal year '),
          T.val(String(last.fy), 'enforcement', 'fiscal_year', lw), T.txt('.'));
        if (top) {
          const yw = { key: top.key };
          note.append(T.txt(' Biggest change from one year to the next (the thick line): '), T.val(T.fmtSignedPct(top.pct), 'enforcement_yoy', 'pct', yw, 'tt-strong'),
            T.txt(', into fiscal year '), T.val(String(top.to_fy), 'enforcement_yoy', 'to_fy', yw), T.txt('.'));
        }
        cb.parentElement.appendChild(note);
        return;
      }
      const et = svgSel.append('text').attr('class', 'tt-end-label').attr('y', y(last.n) - 10).attr('text-anchor', 'end').attr('x', Math.min(W - m.r, x(fyDate(last.fy)) + 4));
      et.append('tspan').text('FY');
      T.mark(et.append('tspan').text(String(last.fy)).node(), 'enforcement', 'fiscal_year', { id: last.id });
      et.append('tspan').text(': ');
      T.mark(et.append('tspan').text(T.fmtCount(last.n)).node(), 'enforcement', 'enforcement_actions', { id: last.id });
    });
    // Callout: the largest year-over-year change overall, from the enforcement_yoy calculation.
    const call = byId('enforcement-callout');
    const top = yoy.find((r) => r.largest_overall);
    call.classList.remove('dash-skeleton');
    if (top) {
      const w = { key: top.key };
      const parts = [T.txt('The biggest change from one year to the next: '), T.val(top.agency, 'enforcement_yoy', 'agency', w, 'tt-strong'), T.txt(' cases went from '),
        T.val(T.fmtCount(top.from_n), 'enforcement_yoy', 'from_n', w), T.txt(' in fiscal year '), T.val(String(top.from_fy), 'enforcement_yoy', 'from_fy', w), T.txt(' to '),
        T.val(T.fmtCount(top.to_n), 'enforcement_yoy', 'to_n', w), T.txt(' in '), T.val(String(top.to_fy), 'enforcement_yoy', 'to_fy', w),
        T.txt(' ('), T.val(T.fmtSignedPct(top.pct), 'enforcement_yoy', 'pct', w, 'tt-strong'), T.txt(').')];
      parts.push(T.txt(' A fiscal year runs from October to September, so a year can include two presidents, and counting rules changed in some years.'));
      call.replaceChildren(...parts);
    } else call.textContent = '';
  }

  // ---------- Senate and House: the same screen, a page each ----------
  const PARTY = T.PARTY;
  const PARTY_ORDER = ['R', 'D', 'I'];
  // A party chip: a dot in the party's color, then the letter (the data's own value) in text color.
  const partyChip = (p, text) => {
    const sp = T.h('span', 'tt-party tt-party-' + p);
    sp.append(T.h('span', 'tt-party-dot'), T.txt(text === undefined ? p : text));
    return sp;
  };
  const partyRank = (p) => (PARTY_ORDER.indexOf(p) < 0 ? 9 : PARTY_ORDER.indexOf(p));
  const isNone = (r) => /^(no issues|nothing found)/i.test(String(r || ''));
  const CHAMBERS = {
    senate: {
      id: 'senate', ds: 'senate', items: 'senate_items', name: 'senator', one: 'senator', many: 'senators',
      since: 'in_senate_since', sinceLabel: 'In the Senate since', who: 'current senators',
      place: (s) => s.state || '',
    },
    house: {
      id: 'house', ds: 'house', items: 'house_items', name: 'member', one: 'representative', many: 'representatives',
      since: 'in_house_since', sinceLabel: 'In the House since', who: 'Representatives checked',
      takeNote: ' Most were picked because a source had already reported a late filing or an inquiry, so this share is not a rate for the House.',
      place: (s) => (T.has(s.district) ? `${s.state}-${s.district}` : s.state || ''),
    },
  };
  const CH = {
    senate: { sort: 'state', dir: 1, result: null, party: null, open: null, all: false },
    house: { sort: 'state', dir: 1, result: null, party: null, open: null, all: false },
  };
  const valueText = (lo, hi) => (T.has(hi) && Number(hi) > 0 ? `${T.fmtMoney(lo)} to ${T.fmtMoney(hi)}` : '');
  // Trade-value bars start at zero: the darker part runs to the lowest possible total, the lighter part on to the highest.
  // Every chart that uses them says so in words above the bars, with a sample bar in each party's color.
  const tvExplain = () => {
    const p = T.h('p', 'tt-tv-explain');
    const samples = T.h('span', 'tt-tv-samples');
    samples.setAttribute('aria-hidden', 'true');
    ['R', 'D'].forEach((q) => samples.appendChild(T.h('span', 'tt-tv-sample tt-tv-sample-' + q)));
    const words = T.h('span');
    words.append(T.h('span', 'tt-strong', 'Darker part of each bar:'), T.txt(' the lowest the total could be. '),
      T.h('span', 'tt-strong', 'Lighter part:'), T.txt(' how much higher it could be. The real total is somewhere between the end of the darker part and the end of the lighter part.'));
    p.append(samples, words);
    return p;
  };
  // The key above a trade-value chart: party colors, the + mark when any total is partial, then the two shades.
  const tvKey = (box, parties, anyPartial) => {
    parties.forEach((q) => {
      const it = T.h('span', 'tt-legend-item');
      it.append(T.swatch(T.partyColor(q)), T.txt(PARTY[q]));
      box.appendChild(it);
    });
    if (anyPartial) box.appendChild(T.h('span', 'tt-legend-item', '+ only part of the trades could be listed, so the real total is higher'));
    box.appendChild(tvExplain());
  };
  const shadeLine = (s) => ({ text: `Darker part: at least ${T.fmtMoney(s.tv_low)} · lighter part: up to ${T.fmtMoney(s.tv_high)}`, cls: 'tt-tip-muted' });
  const colsFor = (c) => ({
    [c.name]: { text: (s) => s[c.name] },
    party: { text: (s) => s.party, cls: 'tt-nowrap' },
    state: { text: (s) => c.place(s), cls: 'tt-nowrap' },
    trades_individual_stocks: { text: (s) => s.trades_individual_stocks || '', cls: 'tt-hide-narrow' },
    disclosed_transactions: { text: (s) => T.fmtCount(s.disclosed_transactions), sort: (s) => (T.has(s.disclosed_transactions) ? Number(s.disclosed_transactions) : -1), num: true, cls: 'tt-num tt-hide-narrow' },
    tv_high: { text: (s) => valueText(s.tv_low, s.tv_high), sort: (s) => (T.has(s.tv_high) ? Number(s.tv_high) : -1), num: true, cls: 'tt-num tt-nowrap' },
    flagged_trades: { text: (s) => T.fmtCount(s.flagged_trades), sort: (s) => Number(s.flagged_trades) || 0, num: true, cls: 'tt-num' },
    late_filing_violations: { text: (s) => T.fmtCount(s.late_filing_violations), sort: (s) => Number(s.late_filing_violations) || 0, num: true, cls: 'tt-num tt-hide-narrow' },
    investigations_or_complaints: { text: (s) => T.fmtCount(s.investigations_or_complaints), sort: (s) => Number(s.investigations_or_complaints) || 0, num: true, cls: 'tt-num tt-hide-narrow' },
    screen_result: { badge: true, text: (s) => s.screen_result },
  });
  function drawChamberHead(c) {
    const tot = T.rowsOf(c.ds + '_totals');
    if (!tot) return;
    const all = tot.find((r) => r.party === 'All');
    const take = byId(c.id + '-takeaway');
    take.classList.remove('dash-skeleton');
    if (!all) {
      take.textContent = '';
      return;
    }
    const src = c.ds + '_totals';
    const w = { party: 'All' };
    const parts = [T.val(T.fmtCount(all.with_findings), src, 'with_findings', w, 'tt-strong'), T.txt(' of '),
      T.val(T.fmtCount(all.members), src, 'members', w), T.txt(` ${c.who} had at least one finding in our check: `)];
    const bits = tot.filter((r) => r.party !== 'All' && r.members).sort((a, b) => partyRank(a.party) - partyRank(b.party));
    bits.forEach((r, i) => {
      const pw = { party: r.party };
      parts.push(T.val(T.fmtCount(r.with_findings), src, 'with_findings', pw), T.txt(' of '), T.val(T.fmtCount(r.members), src, 'members', pw),
        T.txt(` ${PARTY[r.party] || r.party}${T.plural(r.members, '', 's')}${i < bits.length - 1 ? ', ' : '.'}`));
    });
    if (c.takeNote) parts.push(T.txt(c.takeNote));
    if (Number(all.valued) > 0) {
      parts.push(T.txt(' The trades we could list add up to '), T.val(T.fmtMoney(all.value_low), src, 'value_low', w, 'tt-strong'), T.txt('–'),
        T.val(T.fmtMoney(all.value_high), src, 'value_high', w, 'tt-strong'), T.txt(' across '), T.val(T.fmtCount(all.valued), src, 'valued', w),
        T.txt(` ${c.many}. That is a minimum: for many, trackers showed only their recent trades.`));
    }
    parts.push(T.txt(' A finding is something a source reported, not proof of wrongdoing; each record gives its outcome.'));
    take.replaceChildren(...parts);
    [['-c-flagged', 'flagged_members'], ['-c-late', 'late_members'], ['-c-inq', 'inquiry_members'], ['-c-ties', 'ties_members']].forEach(([id, f]) => {
      const sub = byId(c.id + id + '-sub');
      if (!sub) return;
      sub.replaceChildren(T.txt('by '), T.val(T.fmtCount(all[f]), src, f, w), T.txt(` ${T.plural(all[f], c.one, c.many)}`));
    });
  }
  function drawChamberChart(c) {
    const box = byId(c.id + '-chart');
    const st = CH[c.id];
    const src = c.ds + '_summary';
    const sum = T.rowsOf(src);
    if (!sum) {
      if (T.failed(src)) T.failLine(box);
      return;
    }
    box.classList.remove('dash-skeleton');
    box.replaceChildren();
    const results = [...new Set(sum.map((r) => r.screen_result))].sort((a, b) => (isNone(a) - isNone(b)) || d3.sum(sum.filter((r) => r.screen_result === b), (r) => r.n) - d3.sum(sum.filter((r) => r.screen_result === a), (r) => r.n) || (a < b ? -1 : 1));
    const parties = [...new Set(sum.map((r) => r.party))].sort((a, b) => partyRank(a) - partyRank(b));
    if (!results.length) {
      box.appendChild(T.h('p', 'tt-empty', `No ${c.many} screened yet.`));
      return;
    }
    const play = T.firstPlay(box, true);
    const W = Math.max(300, box.clientWidth || 640);
    const narrow = W < 600;
    const svgSel = d3.select(box).append('svg').attr('class', 'tt-svg').attr('width', '100%')
      .attr('role', 'group').attr('aria-label', `${c.many} by result and party, as a share of each party's members; the table below lists each one`);
    const svg = svgSel.node();
    const pl = (p) => PARTY[p] || p;
    const labelW = T.measure(svg, 'tt-row-label', results);
    const colW = narrow ? W - 16 : (W - labelW - 24) / parties.length;
    const m = { l: narrow ? 8 : Math.ceil(labelW) + 16, t: 22 };
    const barH = 14;
    const rowH = narrow ? 22 + parties.length * (barH + 6) : 28;
    const H = m.t + results.length * rowH + 12;
    svgSel.attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    box.style.minHeight = H + 'px';
    const maxN = d3.max(sum, (r) => r.n) || 1;
    const numW = T.measure(svg, 'tt-bar-label', ['100% (' + T.fmtCount(maxN) + ' of ' + T.fmtCount(d3.max(sum, (r) => r.party_total)) + ')']);
    const barMax = Math.max(40, (narrow ? W - m.l - 8 - 80 : colW - 14) - numW - 8);
    // Bar length is the share of the party's members, so parties of different sizes compare fairly; the label gives the count.
    const x = d3.scaleLinear([0, 1], [0, barMax]);
    const tip = T.tooltip(box);
    if (!narrow) parties.forEach((p, j) => {
      svgSel.append('circle').attr('cx', m.l + j * colW + 5).attr('cy', 8).attr('r', 5).style('fill', T.partyColor(p));
      svgSel.append('text').attr('class', 'tt-lane-label').attr('x', m.l + j * colW + 15).attr('y', 12).text(pl(p));
    });
    results.forEach((res, i) => {
      const y0 = m.t + i * rowH;
      if (narrow) svgSel.append('text').attr('class', 'tt-lane-label').attr('x', m.l).attr('y', y0 + 12).text(res);
      else svgSel.append('text').attr('class', 'tt-row-label').attr('x', m.l - 12).attr('y', y0 + barH / 2 + 2).attr('text-anchor', 'end').attr('dominant-baseline', 'middle').text(res);
      parties.forEach((p, j) => {
        const r = sum.find((q) => q.screen_result === res && q.party === p);
        if (!r) return;
        const bx = narrow ? m.l + 80 : m.l + j * colW;
        const by = narrow ? y0 + 18 + j * (barH + 6) : y0;
        if (narrow) svgSel.append('text').attr('class', 'tt-row-label').attr('x', m.l + 72).attr('y', by + barH / 2).attr('text-anchor', 'end').attr('dominant-baseline', 'middle').text(pl(p));
        const fill = T.partyColor(p);
        const g = svgSel.append('g').attr('class', 'tt-bar-g');
        g.append('rect').attr('class', 'tt-bar-track').attr('x', bx).attr('y', by).attr('width', barMax).attr('height', barH).attr('rx', 4);
        if (r.n) {
          const bar = g.append('rect').attr('class', 'tt-bar' + (play ? ' tt-grow-x' : '')).attr('x', bx).attr('y', by).attr('width', Math.max(2, x(r.share))).attr('height', barH).attr('rx', 4).style('fill', fill);
          T.mark(bar.node(), src, 'share', { key: r.key });
          if (play) T.delay(bar.node(), (i / results.length) * 0.6);
        }
        const lt = g.append('text').attr('class', 'tt-bar-label').attr('x', bx + Math.max(2, x(r.share)) + 6).attr('y', by + barH / 2).attr('dominant-baseline', 'middle');
        T.mark(lt.append('tspan').attr('class', 'tt-strong-label').text(T.fmtPct(r.share)).node(), src, 'share', { key: r.key });
        lt.append('tspan').text(' (');
        T.mark(lt.append('tspan').text(T.fmtCount(r.n)).node(), src, 'n', { key: r.key });
        lt.append('tspan').text(' of ');
        T.mark(lt.append('tspan').text(T.fmtCount(r.party_total)).node(), src, 'party_total', { key: r.key });
        lt.append('tspan').text(')');
        const lines = [{ text: res }, { value: T.fmtCount(r.n), text: `of ${T.fmtCount(r.party_total)} ${pl(p)} ${c.many}`, color: fill }, { value: T.fmtPct(r.share), text: 'of the party', cls: 'tt-tip-line' },
          { text: `Click to show these ${c.many} in the table`, cls: 'tt-tip-muted' }];
        const hit = g.append('rect').attr('class', 'tt-hit').attr('x', bx - 2).attr('y', by - 5).attr('width', barMax + numW + 10).attr('height', barH + 10).attr('tabindex', 0)
          .attr('role', 'button').attr('aria-label', `${res}, ${pl(p)}: ${T.fmtPct(r.share)}, ${T.fmtCount(r.n)} of ${T.fmtCount(r.party_total)}`).node();
        if (st.result === res && st.party === p) g.classed('tt-picked-bar', true);
        const pick = () => {
          const same = st.result === res && st.party === p;
          st.result = same ? null : res;
          st.party = same ? null : p;
          drawChamber(c);
        };
        hit.addEventListener('pointermove', (ev) => tip.show(ev, lines));
        hit.addEventListener('pointerleave', () => tip.hide());
        hit.addEventListener('focus', () => tip.show(T.centerOf(hit), lines));
        hit.addEventListener('blur', () => tip.hide());
        hit.addEventListener('click', pick);
        hit.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            pick();
          }
        });
      });
    });
  }
  // Disclosed trade value per member: a bar from the low end to the high end of the summed value bands, a dot at its middle.
  function drawChamberValues(c) {
    const box = byId(c.id + '-values');
    if (!box) return;
    const rows = T.rowsOf(c.ds);
    if (!rows) {
      if (T.failed(c.ds)) T.failLine(box);
      return;
    }
    box.classList.remove('dash-skeleton');
    box.replaceChildren();
    const st = CH[c.id];
    const valued = rows.filter((s) => Number(s.tv_high) > 0).sort((a, b) => Number(b.tv_high) - Number(a.tv_high) || d3.ascending(a[c.name], b[c.name]));
    if (!valued.length) {
      box.appendChild(T.h('p', 'tt-empty', `No ${c.many} have valued trades on record yet.`));
      return;
    }
    const LIMIT = 20;
    const shown = st.all ? valued : valued.slice(0, LIMIT);
    const play = T.firstPlay(box, true);
    const W = Math.max(300, box.clientWidth || 640);
    const narrow = W < 560;
    const label = (s) => `${s[c.name]} (${s.party}-${c.place(s)})`;
    const partial = (s) => String(s.tv_partial) === 'true';
    const key = T.h('div', 'tt-legend tt-legend-top');
    tvKey(key, ['R', 'D', 'I'].filter((q) => rows.some((s) => s.party === q)), shown.some(partial));
    box.appendChild(key);
    const svgSel = d3.select(box).append('svg').attr('class', 'tt-svg').attr('width', '100%')
      .attr('role', 'group').attr('aria-label', `Value of stocks each ${c.one} reported buying and selling: the darker part of each bar is the lowest possible total, the lighter part runs on to the highest; the table below lists the same values`);
    const svg = svgSel.node();
    const rangeOf = (s) => valueText(s.tv_low, s.tv_high) + (partial(s) ? '+' : '');
    const countOf = (s) => (partial(s) && T.has(s.tv_n) && T.has(s.disclosed_transactions) && Number(s.disclosed_transactions) > Number(s.tv_n)
      ? ` · ${T.fmtCount(s.tv_n)} of ${T.fmtCount(s.disclosed_transactions)} trades counted` : '');
    const byOf = (s) => (T.has(s.trades_by) ? ` · trades by ${s.trades_by}` : '');
    const labelW = narrow ? 0 : T.measure(svg, 'tt-row-label', shown.map(label));
    const valW = T.measure(svg, 'tt-bar-label', shown.map((s) => rangeOf(s) + countOf(s) + byOf(s)));
    // Narrow: name and amount share the line above each bar, so the bars can use the full width.
    const m = { l: narrow ? 8 : Math.ceil(labelW) + 14, r: narrow ? 12 : Math.ceil(valW) + 14, t: 22, b: 8 };
    const rowH = narrow ? 44 : 22;
    const H = m.t + shown.length * rowH + m.b;
    svgSel.attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    box.style.minHeight = H + 'px';
    const x = d3.scaleLinear([0, d3.max(shown, (s) => Number(s.tv_high)) || 1], [m.l, W - m.r]).nice();
    const ticks = x.ticks(narrow ? 3 : 5);
    const tickW = T.measure(svg, 'tt-tick', ticks.map(T.fmtMoney)) + 10;
    let lastX = -Infinity;
    ticks.forEach((t) => {
      svgSel.append('line').attr('class', 'tt-grid').attr('x1', x(t)).attr('x2', x(t)).attr('y1', m.t - 4).attr('y2', H - m.b);
      if (x(t) - lastX < tickW) return;
      lastX = x(t);
      svgSel.append('text').attr('class', 'tt-tick').attr('x', x(t)).attr('y', 12).attr('text-anchor', t === 0 ? 'start' : 'middle').text(T.fmtMoney(t));
    });
    const tip = T.tooltip(box);
    shown.forEach((s, i) => {
      const y0 = m.t + i * rowH + (narrow ? 20 : rowH / 2);
      const w = { [c.name]: s[c.name] };
      const g = svgSel.append('g').attr('class', 'tt-ev');
      if (narrow) g.append('text').attr('class', 'tt-row-label').attr('x', m.l).attr('y', y0 - 12).attr('dominant-baseline', 'middle').text(label(s));
      else g.append('text').attr('class', 'tt-row-label').attr('x', m.l - 10).attr('y', y0).attr('text-anchor', 'end').attr('dominant-baseline', 'middle').text(label(s));
      const lo = Number(s.tv_low) || 0;
      const hi = Number(s.tv_high);
      const pc = T.partyColor(s.party);
      const gg = g.append('g').attr('class', play ? 'tt-grow-x' : '');
      const pale = gg.append('rect').attr('class', 'tt-tv-max').attr('x', x(0)).attr('y', y0 - 6).attr('width', Math.max(4, x(hi) - x(0))).attr('height', 12).attr('rx', 4).style('fill', pc);
      T.mark(pale.node(), c.ds, 'tv_high', w);
      const solid = gg.append('rect').attr('class', 'tt-tv-min').attr('x', x(0)).attr('y', y0 - 6).attr('width', Math.max(3, x(lo) - x(0))).attr('height', 12).attr('rx', 4).style('fill', pc);
      T.mark(solid.node(), c.ds, 'tv_low', w);
      if (play) T.delay(gg.node(), (i / shown.length) * 0.6);
      const t = narrow
        ? g.append('text').attr('class', 'tt-bar-label').attr('x', W - m.r).attr('y', y0 - 12).attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
        : g.append('text').attr('class', 'tt-bar-label').attr('x', Math.max(x(0) + 4, x(hi)) + 8).attr('y', y0).attr('dominant-baseline', 'middle');
      T.mark(t.append('tspan').text(T.fmtMoney(s.tv_low)).node(), c.ds, 'tv_low', w);
      t.append('tspan').text(' to ');
      T.mark(t.append('tspan').text(T.fmtMoney(s.tv_high)).node(), c.ds, 'tv_high', w);
      if (partial(s)) t.append('tspan').text('+');
      if (!narrow && (countOf(s) || byOf(s))) t.append('tspan').attr('class', 'tt-range-more').text(countOf(s) + byOf(s));
      const lines = [{ text: label(s) }, { value: rangeOf(s), text: 'value of stocks bought and sold (not profit)', color: pc }, shadeLine(s),
        T.has(s.trades_by) ? { text: `Trades by ${s.trades_by}`, cls: 'tt-tip-muted' } : null,
        T.has(s.tv_n) ? { value: T.fmtCount(s.tv_n), text: 'trades valued' + (T.has(s.disclosed_transactions) ? ` (${T.fmtCount(s.disclosed_transactions)} on record)` : ''), cls: 'tt-tip-line' } : null,
        partial(s) ? { text: 'Only part of the record could be listed, so the full total is higher', cls: 'tt-tip-muted' } : null,
        T.has(s.tv_coverage) ? { text: s.tv_coverage.length > 260 ? s.tv_coverage.slice(0, 257).replace(/\s+\S*$/, '') + '…' : s.tv_coverage, cls: 'tt-tip-muted' } : null,
        { text: 'Click for the record and sources', cls: 'tt-tip-muted' }];
      const hit = g.append('rect').attr('class', 'tt-hit').attr('x', 0).attr('y', y0 - rowH / 2).attr('width', W).attr('height', rowH).attr('tabindex', 0)
        .attr('role', 'button').attr('aria-label', `${label(s)}: ${rangeOf(s)}`).node();
      const open = () => {
        st.open = s[c.name];
        drawChamber(c);
        T.openDrawer(byId(c.id + '-detail'), hit);
      };
      hit.addEventListener('pointermove', (ev) => tip.show(ev, lines));
      hit.addEventListener('pointerleave', () => tip.hide());
      hit.addEventListener('focus', () => tip.show(T.centerOf(hit), lines));
      hit.addEventListener('blur', () => tip.hide());
      hit.addEventListener('click', open);
      hit.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          open();
        }
      });
    });
    if (valued.length > LIMIT) {
      const more = T.button('tt-btn tt-gap-top', st.all ? `Show the top ${LIMIT}` : `Show all ${valued.length}`, () => {
        st.all = !st.all;
        drawChamberValues(c);
      });
      box.appendChild(more);
    }
  }
  function drawChamber(c) {
    drawChamberHead(c);
    drawChamberChart(c);
    drawChamberValues(c);
    const st = CH[c.id];
    const cols = colsFor(c);
    const rows0 = T.rowsOf(c.ds);
    const items = T.rowsOf(c.items) || [];
    const table = byId(c.id + '-table');
    const search = byId(c.id + '-search');
    if (!rows0) {
      if (T.failed(c.ds)) T.failTable(table);
      return;
    }
    wireSort(table, st, cols, () => drawChamber(c));
    if (!search.hasAttribute('data-wired')) {
      search.addEventListener('input', () => drawChamber(c));
      search.setAttribute('data-wired', '');
    }
    const picked = byId(c.id + '-picked');
    picked.hidden = !st.result;
    picked.textContent = st.result ? `${st.result} · ${PARTY[st.party] || st.party} ×` : '';
    if (!picked.hasAttribute('data-wired')) {
      picked.addEventListener('click', () => {
        st.result = null;
        st.party = null;
        drawChamber(c);
      });
      picked.setAttribute('data-wired', '');
    }
    const q = search.value.trim().toLowerCase();
    const rows = rows0.filter((s) => (!st.result || (s.screen_result === st.result && s.party === st.party)) &&
      (!q || [s[c.name], s.state, s.district, s.party, PARTY[s.party], s.screen_result, s.notes, s.relevant_committees].join(' ').toLowerCase().includes(q)));
    const col = cols[st.sort] || cols.state;
    const key = col.sort || ((s) => String(s[st.sort] || ''));
    rows.sort((a, b) => st.dir * d3.ascending(key(a), key(b)) || d3.ascending(a.state, b.state) || d3.ascending(a[c.name], b[c.name]));
    markSort(table, st);
    const tbody = table.querySelector('tbody');
    tbody.replaceChildren();
    const fields = [...table.querySelectorAll('thead th[data-field]')].map((th) => th.getAttribute('data-field'));
    const shown = T.pageRows(table, rows, () => drawChamber(c));
    if (!rows.length) return emptyRow(tbody, fields.length, `No ${c.many} match.`);
    const labels = T.headLabels(table);
    shown.forEach((s) => {
      const tr = T.h('tr', 'tt-row' + (st.open === s[c.name] ? ' tt-row-open' : ''));
      tr.setAttribute('data-key', s[c.name]);
      if (PARTY[s.party]) tr.setAttribute('data-party', s.party);
      tr.tabIndex = 0;
      fields.forEach((f) => {
        const cc = cols[f] || { text: (x) => x[f] || '' };
        const td = T.cellTag(T.h('td', 'tt-td ' + (cc.cls || '')), f === c.name ? 'name' : f, labels[f]);
        if (cc.badge && T.has(s[f])) td.appendChild(T.h('span', 'tt-badge ' + (isNone(s[f]) ? 'tt-badge-quiet' : 'tt-badge-plain'), s[f]));
        else if (f === 'party' && PARTY[s.party]) td.appendChild(partyChip(s.party));
        else td.textContent = cc.text(s);
        if (f === 'flagged_trades' && !Number(s[f])) td.setAttribute('data-zero', '');
        tr.appendChild(td);
      });
      const open = () => {
        st.open = s[c.name];
        memberDrawer(c, s, items.filter((it) => it[c.name] === s[c.name]));
        T.openDrawer(byId(c.id + '-detail'), tr);
        tbody.querySelectorAll('.tt-row-open').forEach((n) => n.classList.remove('tt-row-open'));
        tr.classList.add('tt-row-open');
      };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          open();
        }
      });
      tbody.appendChild(tr);
    });
    if (st.open) {
      const s = rows0.find((x) => x[c.name] === st.open);
      if (s) memberDrawer(c, s, items.filter((it) => it[c.name] === s[c.name]));
    }
  }
  function memberDrawer(c, s, items) {
    const drawer = byId(c.id + '-detail');
    const st = CH[c.id];
    drawer.replaceChildren();
    const w = { [c.name]: s[c.name] };
    const title = T.h('h4');
    const chip = T.h('span', 'tt-party tt-party-' + s.party);
    chip.append(T.h('span', 'tt-party-dot'), T.val(s.party, c.ds, 'party', w));
    title.append(T.val(s[c.name], c.ds, c.name, w), T.txt(' ('), chip, T.txt('-'), T.val(c.place(s), c.ds, 'state', w), T.txt(`, ${PARTY[s.party] || s.party})`));
    const badge = T.has(s.screen_result) ? T.val(s.screen_result, c.ds, 'screen_result', w, 'tt-badge ' + (isNone(s.screen_result) ? 'tt-badge-quiet' : 'tt-badge-plain')) : null;
    const close = () => {
      st.open = null;
      byId(c.id + '-table').querySelectorAll('.tt-row-open').forEach((n) => n.classList.remove('tt-row-open'));
      T.closeDrawer(drawer);
    };
    T.drawerHead(drawer, title, [badge], close);
    const grid = T.h('div', 'tt-drawer-grid');
    const a = T.h('div');
    const b = T.h('div');
    grid.append(a, b);
    drawer.appendChild(grid);
    if (isNone(s.screen_result)) a.appendChild(T.h('p', 'tt-field tt-field-note', 'Nothing turned up in this light screen. That is not proof of none.'));
    if (T.has(s.rules_met)) T.field(a, 'Why screened', [[s.rules_met, 'rules_met']], c.ds, w);
    T.field(a, c.sinceLabel, [[s[c.since], c.since]], c.ds, w);
    T.field(a, 'Committees', [[s.relevant_committees, 'relevant_committees']], c.ds, w);
    T.field(a, 'Trades individual stocks', [[s.trades_individual_stocks, 'trades_individual_stocks']], c.ds, w);
    T.field(a, 'Disclosed transactions', [[T.has(s.disclosed_transactions) ? T.fmtCount(s.disclosed_transactions) : '', 'disclosed_transactions'], T.has(s.transactions_period) ? ' — ' : '', [s.transactions_period, 'transactions_period']], c.ds, w);
    if (T.has(s.tv_high)) {
      T.field(a, 'Disclosed trade value', [[T.fmtMoney(s.tv_low), 'tv_low'], '–', [T.fmtMoney(s.tv_high), 'tv_high'], ' across ', [T.fmtCount(s.tv_n), 'tv_n'], ' trades valued'], c.ds, w);
      if (T.has(s.tv_coverage)) T.field(a, 'Value coverage', [[s.tv_coverage, 'tv_coverage']], c.ds, w);
    }
    if (T.has(s.flagged_value_high)) T.field(a, 'Flagged trades, value', [[T.fmtMoney(s.flagged_value_low), 'flagged_value_low'], '–', [T.fmtMoney(s.flagged_value_high), 'flagged_value_high']], c.ds, w);
    if (T.has(s.transactions_source)) {
      const p = T.h('p', 'tt-field');
      p.append(T.h('span', 'tt-field-label', 'Transactions source'), T.linkTo(s.transactions_source, T.hostOf(s.transactions_source)));
      a.appendChild(p);
    }
    T.urlsOf(s.tv_sources).slice(0, 4).forEach((u) => {
      const p = T.h('p', 'tt-field');
      p.append(T.h('span', 'tt-field-label', 'Value source'), T.linkTo(u, T.hostOf(u)));
      a.appendChild(p);
    });
    T.field(a, 'Counts in the screen', [[T.fmtCount(s.flagged_trades), 'flagged_trades'], ' flagged trades · ', [T.fmtCount(s.late_filing_violations), 'late_filing_violations'], ' late filings · ',
      [T.fmtCount(s.investigations_or_complaints), 'investigations_or_complaints'], ' inquiries or complaints · ', [T.fmtCount(s.family_business_ties), 'family_business_ties'], ' family or business ties'], c.ds, w);
    T.field(b, 'Stock-ban stance', [[s.stock_ban_stance, 'stock_ban_stance']], c.ds, w);
    T.field(b, 'Notes', [[s.notes, 'notes']], c.ds, w);
    if (items.length) {
      const lab = T.h('p', 'tt-field');
      lab.appendChild(T.h('span', 'tt-field-label', 'Findings, each with its outcome and sources'));
      b.appendChild(lab);
      const ul = T.h('ul', 'tt-items');
      items.forEach((it) => {
        const iw = { [c.name]: it[c.name], description: it.description };
        const li = T.h('li', 'tt-item');
        const head = T.h('div', 'tt-item-head');
        head.appendChild(T.val(it.item_type, c.items, 'item_type', iw, 'tt-strong'));
        if (T.has(it.date)) head.appendChild(T.val(T.dateText(it.date), c.items, 'date', iw, 'tt-muted'));
        const tb = T.tierBadge(it.evidence_tier, c.items, iw);
        if (tb) head.appendChild(tb);
        li.appendChild(head);
        li.appendChild(T.val(it.description, c.items, 'description', iw));
        if (T.has(it.value_high) && Number(it.value_high) > 0) {
          const v = T.h('div');
          v.append(T.h('span', 'tt-field-label', 'Value'), T.val(T.fmtMoney(it.value_low), c.items, 'value_low', iw), T.txt('–'), T.val(T.fmtMoney(it.value_high), c.items, 'value_high', iw));
          li.appendChild(v);
        }
        if (T.has(it.outcome)) {
          const o = T.h('div', 'tt-field-note');
          o.append(T.h('span', 'tt-field-label', 'Outcome'), T.val(it.outcome, c.items, 'outcome', iw));
          li.appendChild(o);
        }
        if (T.has(it.fine_usd) && Number(it.fine_usd) > 0) {
          const f = T.h('div');
          f.append(T.txt('Fine: '), T.val(T.fmtMoney(it.fine_usd), c.items, 'fine_usd', iw));
          li.appendChild(f);
        }
        T.urlsOf(it.sources).forEach((u) => {
          const d = T.h('div');
          d.appendChild(T.linkTo(u));
          li.appendChild(d);
        });
        ul.appendChild(li);
      });
      b.appendChild(ul);
    }
    T.drawerFoot(drawer, close);
  }

  // ---------- Methods: coverage and gaps ----------
  const COV = { sort: 'president', dir: 1 };
  const COV_COLS = { president: {}, lane: {}, status: {}, searched: {}, not_reached: {}, note: {} };
  function drawCoverage() {
    const cov = T.rowsOf('coverage');
    const table = byId('coverage-table');
    if (!cov) {
      if (T.failed('coverage')) T.failTable(table);
      return;
    }
    wireSort(table, COV, COV_COLS, drawCoverage);
    const rank = (p) => {
      const i = ['Trump (2nd term)', 'Trump (1st term)', 'Biden', 'Obama', 'All', 'Senate', 'House'].indexOf(p);
      return i < 0 ? 9 : i;
    };
    const rows = cov.slice().sort((a, b) => COV.dir * (COV.sort === 'president' ? rank(a.president) - rank(b.president) : d3.ascending(a[COV.sort] || '', b[COV.sort] || '')) || d3.ascending(a.key, b.key));
    markSort(table, COV);
    const tbody = table.querySelector('tbody');
    tbody.replaceChildren();
    const fields = [...table.querySelectorAll('thead th[data-field]')].map((th) => th.getAttribute('data-field'));
    const labels = T.headLabels(table);
    rows.forEach((c) => {
      const tr = T.h('tr');
      tr.setAttribute('data-key', c.key);
      fields.forEach((f) => tr.appendChild(T.cellTag(T.h('td', 'tt-td' + (f === 'searched' || f === 'not_reached' ? ' tt-wide-col' : ''), c[f] || ''), f, labels[f])));
      tbody.appendChild(tr);
    });
  }
  function drawMethodsKey() {
    const box = byId('methods-kinds');
    if (!box || box.childElementCount) return;
    const line = (head, items) => {
      const row = T.h('div', 'tt-color-row');
      row.appendChild(T.h('span', 'tt-color-head', head));
      items.forEach(([color, text]) => {
        const it = T.h('span', 'tt-legend-item');
        it.append(T.swatch(color), T.txt(text));
        row.appendChild(it);
      });
      box.appendChild(row);
    };
    T.PRES.forEach((p) => line(p.short, T.GROUPS.map((g) => [T.colorFor([...g.kinds][0], p.id), g.label])));
    line('Senate and House', ['R', 'D', 'I'].map((q) => [T.partyColor(q), T.PARTY[q]]));
  }

  // ---------- Summary: three comparisons, for the presidents, the Senate and the House ----------
  // Presidents: two groups, each a box per kind of money with a bar per president or term. Money to the family and
  // connected firms takes each president's color; trades just before government news, placed by others, take one
  // neutral color, so they never read as the president's own money. Each box has its own scale.
  const CHRONO = ['Obama', 'Trump (1st term)', 'Biden', 'Trump (2nd term)'];
  // Where research did not cover a kind for a term, the box says so rather than "None found" (see Methods, coverage).
  const NOT_SEARCHED = {
    [T.F.AWARDS]: { 'Trump (1st term)': 'Not fully searched', Biden: 'Not fully searched' },
    [T.F.NOTIONAL]: { Obama: 'Not fully searched' },
    [T.F.PREMIUM]: { Obama: 'Not fully searched' },
  };
  const BOX_NOTE = {
    [T.F.AWARDS]: 'Trump’s second term: firms tied to his family (ties to donors were not searched). Obama: firms tied to donors.',
  };
  const SUM_GROUPS = [
    { kinds: T.FAMILY, title: 'Money to each president’s family and connected firms',
      note: 'Payments, investments and government deals that reached the president’s family or firms tied to it, in that president’s color.',
      color: (p) => T.presColor(p.name) },
    { kinds: new Set([T.F.NOTIONAL, T.F.PROFIT, T.F.PREMIUM]), title: 'Trades placed just before government news, while each was in office',
      note: 'Mostly by traders nobody has identified; some by officials or others charged with insider trading. This is not the president’s money, so it is shown in gray.',
      color: () => 'var(--tt-c-trades)' },
  ];
  function drawSummaryPres() {
    const box = byId('sum-pres');
    const totals = T.rowsOf('family_totals');
    if (!totals) {
      if (T.failed('family_totals')) T.failLine(box);
      return;
    }
    box.classList.remove('dash-skeleton');
    box.replaceChildren();
    const during = totals.filter((r) => r.period === 'during term');
    if (!during.length) {
      box.appendChild(T.h('p', 'tt-empty', 'No in-office totals yet.'));
      return;
    }
    const play = T.firstPlay(box, true);
    const pres = CHRONO.map((n) => T.PRES.find((p) => p.name === n)).filter(Boolean);
    const tip = T.tooltip(box);
    // Every box goes into its grid before any is drawn, so each is measured at its own final width.
    const cells = [];
    SUM_GROUPS.forEach((grp) => {
      const kinds = T.sortKinds(during.map((r) => r.chart_family)).filter((k) => grp.kinds.has(k));
      if (!kinds.length) return;
      const sec = T.h('div', 'tt-sum-group');
      sec.appendChild(T.h('h4', 'tt-sum-group-title', grp.title));
      sec.appendChild(T.h('p', 'tt-sum-group-note', grp.note));
      const grid = T.h('div', 'tt-sum-grid');
      sec.appendChild(grid);
      box.appendChild(sec);
      kinds.forEach((k) => {
        const cell = T.h('div', 'tt-sum-box');
        cell.appendChild(T.h('div', 'tt-sum-box-title', T.shortOf(k)));
        cell.appendChild(T.h('div', 'tt-sum-box-note', BOX_NOTE[k] || T.ABOUT[k] || ''));
        const chart = T.h('div', 'tt-sum-box-chart');
        cell.appendChild(chart);
        grid.appendChild(cell);
        cells.push({ k, chart, grp });
      });
    });
    cells.forEach(({ k, chart, grp }, ki) => {
      const rows = pres.map((p) => ({ p, r: during.find((x) => x.chart_family === k && x.president === p.name) }));
      const W = Math.max(220, chart.clientWidth || 280);
      const svgSel = d3.select(chart).append('svg').attr('class', 'tt-svg').attr('width', '100%')
        .attr('role', 'group').attr('aria-label', `${T.shortOf(k)} while in office, by president; the Compare page has the table`);
      const svg = svgSel.node();
      const labelW = Math.ceil(T.measure(svg, 'tt-row-label', rows.map(({ p }) => p.tab))) + 10;
      const missing = (p) => (NOT_SEARCHED[k] && NOT_SEARCHED[k][p.name]) || 'None found';
      const valW = Math.ceil(T.measure(svg, 'tt-bar-label', [...rows.filter((x) => x.r).map((x) => T.fmtMoney(x.r.total)), ...rows.map(({ p }) => missing(p))])) + 8;
      const barH = 16;
      const rowH = 26;
      const H = rows.length * rowH + 4;
      svgSel.attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
      const span = Math.max(30, W - labelW - valW);
      const max = d3.max(rows, (x) => (x.r ? Number(x.r.total) : 0)) || 1;
      const x = d3.scaleLinear([0, max], [0, span]);
      rows.forEach(({ p, r }, i) => {
        const y = i * rowH + 4;
        svgSel.append('text').attr('class', 'tt-row-label').attr('x', labelW - 10).attr('y', y + barH / 2).attr('text-anchor', 'end').attr('dominant-baseline', 'middle').text(p.tab);
        svgSel.append('rect').attr('class', 'tt-bar-track').attr('x', labelW).attr('y', y).attr('width', span).attr('height', barH).attr('rx', 4);
        if (!r) {
          svgSel.append('text').attr('class', 'tt-bar-label tt-none-label').attr('x', labelW + 6).attr('y', y + barH / 2).attr('dominant-baseline', 'middle').text(missing(p));
          return;
        }
        const g = svgSel.append('g').attr('class', 'tt-ev');
        const bw = Math.max(3, x(Number(r.total)));
        const color = grp.color(p);
        const bar = g.append('rect').attr('class', 'tt-bar' + (play ? ' tt-grow-x' : '')).attr('x', labelW).attr('y', y).attr('width', bw).attr('height', barH).attr('rx', 4)
          .style('fill', color);
        T.mark(bar.node(), 'family_totals', 'total', { key: r.key });
        if (play) T.delay(bar.node(), (ki / cells.length) * 0.5 + i * 0.08);
        const t = g.append('text').attr('class', 'tt-bar-label tt-strong-label').attr('x', labelW + bw + 6).attr('y', y + barH / 2).attr('dominant-baseline', 'middle');
        T.mark(t.append('tspan').text(T.fmtMoney(r.total)).node(), 'family_totals', 'total', { key: r.key });
        if (play) {
          t.classed('tt-fade', true);
          T.delay(t.node(), (ki / cells.length) * 0.5 + i * 0.08 + 0.3);
        }
        const lines = [{ text: T.shortOf(k) }, { value: T.fmtMoney(r.total), text: p.tab, color },
          { value: T.fmtCount(r.n), text: T.plural(r.n, 'amount added while in office', 'amounts added while in office'), cls: 'tt-tip-line' },
          grp.kinds.has(T.F.REVENUE) ? null : { text: 'Trades by others, not the president’s money', cls: 'tt-tip-muted' },
          { text: `Click to open ${p.tab}`, cls: 'tt-tip-muted' }];
        const hit = g.append('rect').attr('class', 'tt-hit').attr('x', 0).attr('y', y - 4).attr('width', W).attr('height', rowH).attr('tabindex', 0)
          .attr('role', 'button').attr('aria-label', `${p.tab}, ${T.shortOf(k)}: ${T.fmtMoney(r.total)}. Opens that president's page`).node();
        const go = () => show(p.id, true);
        hit.addEventListener('pointermove', (ev) => tip.show(ev, lines));
        hit.addEventListener('pointerleave', () => tip.hide());
        hit.addEventListener('focus', () => tip.show(T.centerOf(hit), lines));
        hit.addEventListener('blur', () => tip.hide());
        hit.addEventListener('click', go);
        hit.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            go();
          }
        });
      });
    });
    const legend = byId('sum-pres-legend');
    legend.replaceChildren();
    pres.forEach((p) => {
      const it = T.h('span', 'tt-legend-item');
      it.append(T.swatch(T.presColor(p.name)), T.txt(p.tab));
      legend.appendChild(it);
    });
    const tr = T.h('span', 'tt-legend-item');
    tr.append(T.swatch('var(--tt-c-trades)'), T.txt('Trades by others (any term)'));
    legend.appendChild(tr);
    // The two reds and two blues, said in words.
    legend.appendChild(T.h('p', 'tt-tv-explain', 'Lighter and darker shades: Trump’s two terms are both red, darker for his first term (2017–21) and brighter for his second (2025–now). Biden and Obama are both blue, lighter for Biden and dark navy for Obama. Gray marks trades placed just before government news, mostly by others.'));
  }

  // Senate and House: the ten members with the most reported trading, a bar from the low to the high end of their range.
  function drawSummaryTop(c) {
    const box = byId('sum-' + c.id);
    const take = byId('sum-' + c.id + '-take');
    const src = c.ds + '_totals';
    const tot = T.rowsOf(src);
    if (tot) {
      take.classList.remove('dash-skeleton');
      const all = tot.find((r) => r.party === 'All');
      if (all) {
        const w = { party: 'All' };
        const parts = [T.val(T.fmtCount(all.with_findings), src, 'with_findings', w, 'tt-strong'), T.txt(' of '), T.val(T.fmtCount(all.members), src, 'members', w),
          T.txt(` ${c.who} had at least one finding in our check: `)];
        const bits = tot.filter((r) => r.party !== 'All' && r.members).sort((a, b) => partyRank(a.party) - partyRank(b.party));
        bits.forEach((r, i) => {
          const pw = { party: r.party };
          parts.push(partyChip(r.party, ''), T.txt(' '), T.val(T.fmtCount(r.with_findings), src, 'with_findings', pw), T.txt(' of '), T.val(T.fmtCount(r.members), src, 'members', pw),
            T.txt(` ${PARTY[r.party] || r.party}${T.plural(r.members, '', 's')}${i < bits.length - 2 ? ', ' : i === bits.length - 2 ? ' and ' : '.'}`));
        });
        if (c.takeNote) parts.push(T.txt(c.takeNote));
        parts.push(T.txt(' A finding is something a source reported, not proof of wrongdoing.'));
        take.replaceChildren(...parts);
      } else take.textContent = '';
    } else if (T.failed(src)) T.failLine(take);
    const rows = T.rowsOf(c.ds);
    if (!rows) {
      if (T.failed(c.ds)) T.failLine(box);
      return;
    }
    box.classList.remove('dash-skeleton');
    box.replaceChildren();
    const top = rows.filter((s) => Number(s.tv_high) > 0).sort((a, b) => Number(b.tv_high) - Number(a.tv_high) || d3.ascending(a[c.name], b[c.name])).slice(0, 10);
    if (!top.length) {
      box.appendChild(T.h('p', 'tt-empty', `No ${c.many} have valued trades on record yet.`));
      return;
    }
    const play = T.firstPlay(box, true);
    const W = Math.max(300, box.clientWidth || 640);
    const narrow = W < 560;
    const svgSel = d3.select(box).append('svg').attr('class', 'tt-svg').attr('width', '100%')
      .attr('role', 'group').attr('aria-label', `The ten ${c.many} with the most reported trading: the darker part of each bar is the lowest possible total, the lighter part runs on to the highest; the ${c.id === 'senate' ? 'Senate' : 'House'} page lists everyone`);
    const svg = svgSel.node();
    const partial = (s) => String(s.tv_partial) === 'true';
    const label = (s) => `${s[c.name]} (${s.party}-${c.place(s)})`;
    const rangeOf = (s) => valueText(s.tv_low, s.tv_high) + (partial(s) ? '+' : '');
    const countOf = (s) => (partial(s) && T.has(s.tv_n) && T.has(s.disclosed_transactions) && Number(s.disclosed_transactions) > Number(s.tv_n)
      ? ` · ${T.fmtCount(s.tv_n)} of ${T.fmtCount(s.disclosed_transactions)} trades counted` : '');
    const byOf = (s) => (T.has(s.trades_by) ? ` · trades by ${s.trades_by}` : '');
    const labelW = narrow ? 0 : Math.ceil(T.measure(svg, 'tt-row-label', top.map(label))) + 26;
    const valW = Math.ceil(T.measure(svg, 'tt-bar-label', top.map((s) => rangeOf(s) + countOf(s) + byOf(s)))) + 12;
    const m = { l: narrow ? 8 : labelW, r: narrow ? 8 : valW, t: 24, b: 6 };
    const rowH = narrow ? 46 : 26;
    const H = m.t + top.length * rowH + m.b;
    svgSel.attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    box.style.minHeight = H + 'px';
    const x = d3.scaleLinear([0, d3.max(top, (s) => Number(s.tv_high)) || 1], [m.l, W - m.r]).nice();
    const ticks = x.ticks(narrow ? 3 : 4);
    const tickW = T.measure(svg, 'tt-tick', ticks.map(T.fmtMoney)) + 12;
    let lastX = -Infinity;
    ticks.forEach((t) => {
      svgSel.append('line').attr('class', 'tt-grid').attr('x1', x(t)).attr('x2', x(t)).attr('y1', m.t - 6).attr('y2', H - m.b);
      if (x(t) - lastX < tickW) return;
      lastX = x(t);
      svgSel.append('text').attr('class', 'tt-tick').attr('x', x(t)).attr('y', 12).attr('text-anchor', t === 0 ? 'start' : 'middle').text(T.fmtMoney(t));
    });
    const tip = T.tooltip(box);
    top.forEach((s, i) => {
      const y0 = m.t + i * rowH + (narrow ? 26 : rowH / 2);
      const w = { [c.name]: s[c.name] };
      const pc = T.partyColor(s.party);
      const g = svgSel.append('g').attr('class', 'tt-ev');
      if (narrow) {
        g.append('circle').attr('cx', m.l + 5).attr('cy', y0 - 16).attr('r', 5).style('fill', pc);
        g.append('text').attr('class', 'tt-row-label').attr('x', m.l + 15).attr('y', y0 - 16).attr('dominant-baseline', 'middle').text(label(s));
      } else {
        g.append('circle').attr('cx', 8).attr('cy', y0).attr('r', 5).style('fill', pc);
        g.append('text').attr('class', 'tt-row-label').attr('x', 18).attr('y', y0).attr('dominant-baseline', 'middle').text(label(s));
      }
      const lo = Number(s.tv_low) || 0;
      const hi = Number(s.tv_high);
      const gg = g.append('g').attr('class', play ? 'tt-grow-x' : '');
      const pale = gg.append('rect').attr('class', 'tt-tv-max').attr('x', x(0)).attr('y', y0 - 7).attr('width', Math.max(4, x(hi) - x(0))).attr('height', 14).attr('rx', 4).style('fill', pc);
      T.mark(pale.node(), c.ds, 'tv_high', w);
      const solid = gg.append('rect').attr('class', 'tt-tv-min').attr('x', x(0)).attr('y', y0 - 7).attr('width', Math.max(3, x(lo) - x(0))).attr('height', 14).attr('rx', 4).style('fill', pc);
      T.mark(solid.node(), c.ds, 'tv_low', w);
      if (play) T.delay(gg.node(), (i / top.length) * 0.6);
      const t = narrow
        ? g.append('text').attr('class', 'tt-bar-label').attr('x', W - m.r).attr('y', y0 - 16).attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
        : g.append('text').attr('class', 'tt-bar-label').attr('x', Math.max(x(0) + 4, x(hi)) + 6).attr('y', y0).attr('dominant-baseline', 'middle');
      T.mark(t.append('tspan').text(T.fmtMoney(s.tv_low)).node(), c.ds, 'tv_low', w);
      t.append('tspan').text(' to ');
      T.mark(t.append('tspan').text(T.fmtMoney(s.tv_high)).node(), c.ds, 'tv_high', w);
      if (partial(s)) t.append('tspan').text('+');
      if (!narrow && (countOf(s) || byOf(s))) t.append('tspan').attr('class', 'tt-range-more').text(countOf(s) + byOf(s));
      if (play) {
        t.classed('tt-fade', true);
        T.delay(t.node(), (i / top.length) * 0.6 + 0.3);
      }
      const lines = [{ text: label(s) }, { value: rangeOf(s), text: 'value of stocks bought and sold (not profit)', color: pc }, shadeLine(s),
        T.has(s.tv_n) ? { value: T.fmtCount(s.tv_n), text: 'trades with a value on record', cls: 'tt-tip-line' } : null,
        T.has(s.trades_by) ? { text: `Trades by ${s.trades_by}`, cls: 'tt-tip-muted' } : null,
        partial(s) ? { text: 'Only part of the record could be listed, so the full total is higher', cls: 'tt-tip-muted' } : null,
        { text: 'Click for the record and sources', cls: 'tt-tip-muted' }];
      const hit = g.append('rect').attr('class', 'tt-hit').attr('x', 0).attr('y', y0 - rowH / 2 - (narrow ? 10 : 0)).attr('width', W).attr('height', rowH).attr('tabindex', 0)
        .attr('role', 'button').attr('aria-label', `${label(s)}: ${rangeOf(s)}. Opens the record`).node();
      const open = () => {
        const st = CH[c.id];
        st.open = s[c.name];
        show(c.id, true);
        const drawer = byId(c.id + '-detail');
        T.openDrawer(drawer, byId(c.id + '-table'));
        drawer.scrollIntoView({ block: 'nearest' });
      };
      hit.addEventListener('pointermove', (ev) => tip.show(ev, lines));
      hit.addEventListener('pointerleave', () => tip.hide());
      hit.addEventListener('focus', () => tip.show(T.centerOf(hit), lines));
      hit.addEventListener('blur', () => tip.hide());
      hit.addEventListener('click', open);
      hit.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          open();
        }
      });
    });
    const legend = byId('sum-' + c.id + '-legend');
    legend.replaceChildren();
    tvKey(legend, ['R', 'D', 'I'].filter((q) => rows.some((s) => s.party === q)), top.some(partial));
  }

  // ---------- Redraw loop: only the page showing is drawn ----------
  function draw() {
    const page = pages.find((p) => p.id === current);
    if (!page) return;
    if (page.hasAttribute('data-pres')) T.drawPresident(page);
    else if (page.id === 'summary') {
      drawSummaryPres();
      drawSummaryTop(CHAMBERS.senate);
      drawSummaryTop(CHAMBERS.house);
    } else if (page.id === 'compare') {
      T.fillMarks(page);
      drawCompareTotals();
      drawCompareTable();
      drawEnforcement();
    } else if (CHAMBERS[page.id]) {
      T.fillMarks(page);
      drawChamber(CHAMBERS[page.id]);
    } else if (page.id === 'methods') {
      drawMethodsKey();
      drawCoverage();
    }
  }
  let resizeTimer = null;
  let lastW = 0;
  const ro = new ResizeObserver((entries) => {
    tabBarState();
    const w = Math.round(entries[0].contentRect.width);
    if (!lastW) {
      lastW = w;
      return;
    }
    if (Math.abs(w - lastW) < 8) return;
    lastW = w;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(draw, 150);
  });
  ro.observe(document.querySelector('.tt-wrap'));

  dash.onData(draw);
  const named = location.hash.slice(1);
  const target = named && document.getElementById(named);
  const owner = target ? (target.classList.contains('tt-page') ? target : target.closest('.tt-page')) : null;
  show(owner ? owner.id : pages[0].id, false);
  if (target && owner && target !== owner) target.scrollIntoView();
})();
