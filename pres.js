// President pages: header callouts, totals by kind of money, linked filters, an annotated timeline with a date brush,
// running totals, the events table, the people list and the detail drawer. Every number shown comes from a dataset or a calculation.
(function () {
  'use strict';
  const T = window.TT;
  const byId = (id) => document.getElementById(id);
  const iso = d3.utcFormat('%Y-%m-%d');
  const states = new Map();
  const laneOf = (e) => (T.isMoney(e) ? e.chart_family : T.ACTIONS);
  const toggle = (set, k) => (set.has(k) ? set.delete(k) : set.add(k));

  function stateFor(page) {
    const pres = page.getAttribute('data-pres');
    if (!states.has(pres)) {
      const info = T.PRES.find((p) => p.name === pres);
      states.set(pres, {
        pres, page, sid: page.id,
        term: (info ? info.term : [T.AS_OF, T.AS_OF]).map(T.parseDate),
        offKinds: new Set(), offTiers: new Set(), range: null, person: null, personName: '',
        sort: 'date', dir: 1, psort: 'events', pdir: -1, open: null, wired: false,
        full: null, margins: { l: 8, r: 40 }, events: [], byId: new Map(), personEvents: new Set(), peopleByEvent: new Map(),
      });
    }
    return states.get(pres);
  }
  const redraw = (st) => drawPresident(st.page);
  const inRange = (st, e) => {
    if (!st.range) return true;
    const d = T.parseDate(e.plot_date);
    return !!d && d >= st.range[0] && d <= st.range[1];
  };
  const passes = (st, e, ignoreRange) =>
    !st.offKinds.has(laneOf(e)) && !st.offTiers.has(e.evidence_tier || '') &&
    (!st.person || st.personEvents.has(e.id)) && (ignoreRange || inRange(st, e));
  const fullDomain = (st, dated) => {
    const ext = d3.extent(dated, (e) => T.parseDate(e.plot_date));
    return [d3.min([st.term[0], ext[0]]), d3.max([st.term[1], ext[1]])];
  };

  // ---------- Hover, focus and click on any mark or row ----------
  const tipLines = (e) => {
    const lines = [{ text: T.dateText(e.date, e.date_precision) + (T.has(e.time_et) ? ' · ' + e.time_et + ' ET' : '') }, { text: e.title, cls: 'tt-tip-title' }];
    if (T.isMoney(e)) {
      lines.push({ value: (String(e.plot_is_upper_bound) === 'true' ? 'Up to ' : '') + T.fmtMoney(e.plot_value), text: T.shortOf(e.chart_family), color: T.colorFor(e.chart_family, e.president) });
      if (T.isSpread(e)) lines.push({ text: 'Amount covers ' + T.periodText(e.covers_start, e.covers_end), cls: 'tt-tip-muted' });
      lines.push({ text: T.isCounted(e) ? 'Added to its running total' : 'Shown, not added to a total', cls: 'tt-tip-muted' });
    } else {
      if (T.has(e.amount_usd)) lines.push({ value: T.amountText(e), text: T.human(e.amount_type), cls: 'tt-tip-line' });
      lines.push({ text: T.shapeFor(e.category).label, cls: 'tt-tip-muted' });
    }
    if (T.has(e.evidence_tier)) lines.push({ text: 'Evidence: ' + e.evidence_tier, cls: 'tt-tip-muted' });
    if (String(e.trader_identified) === 'false') lines.push({ text: 'Trader not identified', cls: 'tt-tip-muted' });
    lines.push({ text: 'Click or press Enter for details and sources', cls: 'tt-tip-muted' });
    return lines;
  };
  function bindMark(node, st, e, tip, lines) {
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', `${T.dateText(e.date, e.date_precision)}: ${e.title}`);
    node.addEventListener('pointerenter', (ev) => { tip.show(ev, lines); T.setHot(st.page, e.id); });
    node.addEventListener('pointermove', (ev) => tip.show(ev, lines));
    node.addEventListener('pointerleave', () => { tip.hide(); T.setHot(st.page, null); });
    node.addEventListener('focus', () => { tip.show(T.centerOf(node), lines); T.setHot(st.page, e.id); });
    node.addEventListener('blur', () => { tip.hide(); T.setHot(st.page, null); });
    node.addEventListener('click', () => openEvent(st, e, node));
    node.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        openEvent(st, e, node);
      }
    });
  }
  function openEvent(st, e, anchor) {
    st.open = e.id;
    renderDrawer(st, e);
    T.openDrawer(byId(st.sid + '-detail'), anchor);
  }
  function renderDrawer(st, e) {
    const drawer = byId(st.sid + '-detail');
    T.eventDrawer(drawer, e, {
      people: st.peopleByEvent.get(e.id) || [],
      onPerson: (r) => {
        st.person = st.pres + '|' + T.normPerson(r.person);
        st.personName = r.person;
        redraw(st);
        showFilters(st);
      },
      onClose: () => {
        st.open = null;
        T.closeDrawer(drawer);
      },
    });
  }

  // ---------- Header: takeaway and callouts ----------
  function setSub(id, nodes) {
    const el = byId(id);
    if (!el) return;
    el.classList.remove('dash-skeleton');
    el.replaceChildren(...nodes.filter(Boolean));
  }
  function drawCallouts(st) {
    const P = st.pres;
    const sid = st.sid;
    const w = { president: P };
    const stats = T.rowsOf('president_stats');
    const r = stats ? stats.find((x) => x.president === P) : null;
    const take = byId(sid + '-takeaway');
    if (r) {
      take.classList.remove('dash-skeleton');
      if (!r.in_office) take.replaceChildren(T.txt('No events in office are on record for this term yet; research may still be running (see Methods for coverage).'));
      else {
        take.replaceChildren(
          T.txt('We found '),
          T.val(T.fmtCount(r.in_office), 'president_stats', 'in_office', w, 'tt-strong'),
          T.txt(` ${T.plural(r.in_office, 'event', 'events')} while in office. `),
          T.val(T.fmtCount(r.counted), 'president_stats', 'counted', w, 'tt-strong'),
          T.txt(` of them ${T.plural(r.counted, 'is an amount', 'are amounts')} that count toward the totals below, in `),
          T.val(T.fmtCount(r.kinds_counted), 'president_stats', 'kinds_counted', w),
          T.txt(` ${T.plural(r.kinds_counted, 'kind', 'kinds')} of money, each added up on its own.`),
        );
      }
      setSub(sid + '-c-office-sub', [T.txt('out of '), T.val(T.fmtCount(r.events), 'president_stats', 'events', w), T.txt(' in all, counting before and after the term · '),
        T.val(T.fmtCount(r.unidentified_trader), 'president_stats', 'unidentified_trader', w), T.txt(' involve traders nobody has identified')]);
      setSub(sid + '-c-outcomes-sub', [T.txt('such as an investigation’s result, a response or a denial, out of all '),
        T.val(T.fmtCount(r.events), 'president_stats', 'events', w), T.txt(' events in any period; click any event to read it')]);
    } else if (stats || T.failed('president_stats')) {
      take.classList.remove('dash-skeleton');
      take.textContent = '';
      ['-c-office-sub', '-c-outcomes-sub'].forEach((x) => setSub(sid + x, []));
    }
    if (T.failed('facet_counts')) setSub(sid + '-c-tier-sub', []);
    if (T.failed('person_network')) setSub(sid + '-c-people-sub', []);
    const facets = T.rowsOf('facet_counts');
    if (facets) {
      const parts = [];
      ['Reported', 'Alleged'].forEach((t) => {
        const row = facets.find((x) => x.president === P && x.facet === 'tier' && x.value === t);
        if (!row) return;
        if (parts.length) parts.push(T.txt(' · '));
        parts.push(T.val(T.fmtCount(row.n), 'facet_counts', 'n', { president: P, facet: 'tier', value: t }), T.txt(' '), T.tierBadge(t));
      });
      const all = stats ? (stats.find((x) => x.president === P) || {}).events : null;
      if (parts.length) parts.unshift(T.txt(T.has(all) ? `Out of all ${T.fmtCount(all)} events in any period. Also ` : 'Also '));
      setSub(sid + '-c-tier-sub', parts);
    }
    const net = T.rowsOf('person_network');
    if (net) {
      const ranked = net.filter((x) => x.president === P).sort((a, b) => b.events - a.events || (a.person < b.person ? -1 : 1));
      const top = ranked[0];
      if (top) {
        const pw = { key: top.key };
        const tied = ranked.filter((x) => x.events === top.events).length - 1;
        setSub(sid + '-c-people-sub', [T.txt(tied ? `Named most often (tied with ${tied} ${T.plural(tied, 'other', 'others')}): ` : 'Named most often: '), T.val(top.person, 'person_network', 'person', pw), T.txt(', in '),
          T.val(T.fmtCount(top.events), 'person_network', 'events', pw), T.txt(` ${T.plural(top.events, 'event', 'events')}. Being named is not an accusation.`)]);
      } else setSub(sid + '-c-people-sub', [T.txt('No person is named in this term’s events yet.')]);
    }
  }

  // ---------- Totals by kind of money, with each kind's key events ----------
  function drawKpis(st) {
    const box = byId(st.sid + '-kpis');
    const totals = T.rowsOf('family_totals');
    if (!totals) {
      if (T.failed('family_totals')) T.failLine(box);
      return;
    }
    box.classList.remove('dash-skeleton');
    box.replaceChildren();
    const keys = T.rowsOf('key_events') || [];
    const mine = totals.filter((r) => r.president === st.pres);
    const kinds = T.sortKinds(mine.map((r) => r.chart_family));
    const play = T.firstPlay(box, kinds.length > 0);
    if (!kinds.length) {
      box.appendChild(T.h('p', 'tt-empty', 'No event in this term meets the rules for a running total yet.'));
      return;
    }
    kinds.forEach((k, i) => {
      const pick = (p) => mine.find((r) => r.chart_family === k && r.period === p);
      const during = pick('during term');
      const tile = T.h('div', 'tt-kpi' + (play ? ' tt-rise-in' : ''));
      if (play) T.delay(tile, (i / Math.max(1, kinds.length)) * 0.5);
      tile.style.borderTopColor = T.colorFor(k, st.pres);
      const lab = T.h('div', 'tt-kpi-label');
      lab.append(T.swatch(T.colorFor(k, st.pres)), T.txt(T.shortOf(k)));
      tile.appendChild(lab);
      if (during) {
        tile.appendChild(T.val(T.fmtMoney(during.total), 'family_totals', 'total', { key: during.key }, 'tt-kpi-val'));
        const sub = T.h('div', 'tt-kpi-sub');
        sub.append(T.txt('from '), T.val(T.fmtCount(during.n), 'family_totals', 'n', { key: during.key }), T.txt(` ${T.plural(during.n, 'amount', 'amounts')} while in office`));
        tile.appendChild(sub);
      } else tile.appendChild(T.h('div', 'tt-kpi-val tt-kpi-none', 'None while in office'));
      [['before term', 'before taking office'], ['after term', 'after leaving office']].forEach(([p, words]) => {
        const r = pick(p);
        if (!r) return;
        const sub = T.h('div', 'tt-kpi-sub tt-muted');
        sub.append(T.txt('Not included: another '), T.val(T.fmtMoney(r.total), 'family_totals', 'total', { key: r.key }), T.txt(` ${words}`));
        tile.appendChild(sub);
      });
      const big = keys.find((r) => r.president === st.pres && r.chart_family === k && r.measure === 'largest_event');
      const day = keys.find((r) => r.president === st.pres && r.chart_family === k && r.measure === 'biggest_day');
      if (big || day) {
        const top = T.h('div', 'tt-kpi-top');
        if (big) {
          const kw = { key: big.key };
          const line = T.h('div');
          const open = T.button('tt-linkbtn', null, () => {
            const e = st.byId.get(big.id);
            if (e) openEvent(st, e, box);
          });
          open.append(T.val(big.title, 'key_events', 'title', kw));
          line.append(T.h('span', 'tt-muted', 'Biggest single amount: '), T.val(T.fmtMoney(big.value), 'key_events', 'value', kw, 'tt-strong'), T.txt(' ('),
            T.val(T.fmtPct(big.share), 'key_events', 'share', kw), T.txt(' of the total), '), open, T.txt(' '));
          const b = T.tierBadge(big.evidence_tier, 'key_events', kw);
          if (b) line.appendChild(b);
          top.appendChild(line);
        }
        if (day && !big) {
          const kw = { key: day.key };
          const line = T.h('div');
          line.append(T.h('span', 'tt-muted', 'Biggest day: '), T.val(T.fmtMoney(day.value), 'key_events', 'value', kw, 'tt-strong'), T.txt(' on '),
            T.val(T.fmtDate(T.parseDate(day.plot_date)), 'key_events', 'plot_date', kw), T.txt(', from '),
            T.val(T.fmtCount(day.events), 'key_events', 'events', kw), T.txt(` ${T.plural(day.events, 'event', 'events')}`));
          top.appendChild(line);
        }
        tile.appendChild(top);
      }
      if (T.ABOUT[k]) tile.appendChild(T.h('div', 'tt-kpi-note', T.ABOUT[k]));
      box.appendChild(tile);
    });
  }

  // ---------- Filter row: kind of money, evidence tier, dates, person ----------
  function chips(st, box, keys, off, make) {
    const sig = keys.join('\u0001');
    if (box.getAttribute('data-sig') !== sig) {
      box.querySelectorAll('.tt-chip').forEach((n) => n.remove());
      keys.forEach((k) => {
        const b = make(k);
        b.setAttribute('data-k', k);
        b.addEventListener('click', () => {
          toggle(off, k);
          redraw(st);
        });
        box.appendChild(b);
      });
      box.setAttribute('data-sig', sig);
    }
    box.querySelectorAll('.tt-chip').forEach((b) => b.setAttribute('aria-pressed', String(!off.has(b.getAttribute('data-k')))));
    box.hidden = !keys.length;
  }
  function showRange(st) {
    const from = byId(st.sid + '-from');
    const to = byId(st.sid + '-to');
    [from, to].forEach((inp, i) => {
      if (!inp) return;
      if (st.full) {
        inp.min = iso(st.full[0]);
        inp.max = iso(st.full[1]);
      }
      if (inp !== document.activeElement) inp.value = st.range ? iso(st.range[i]) : '';
    });
  }
  // On a phone the filters fold behind one button; picking a person opens them, so the "Person" chip that clears it is in view.
  function setFiltersOpen(st, open) {
    const box = byId(st.sid + '-filters');
    const tg = byId(st.sid + '-ftoggle');
    if (!box || !tg) return;
    box.classList.toggle('tt-open', open);
    tg.setAttribute('aria-expanded', String(open));
  }
  function showFilters(st) {
    setFiltersOpen(st, true);
    byId(st.sid + '-filters').scrollIntoView({ block: 'nearest' });
  }
  // The folded button says in words what is filtered.
  function filterState(st, kinds, tiers) {
    const box = byId(st.sid + '-filters');
    const out = byId(st.sid + '-fstate');
    if (!box || !out) return;
    const parts = [];
    const offK = kinds.filter((k) => st.offKinds.has(k)).length;
    const offT = tiers.filter((t) => st.offTiers.has(t)).length;
    if (offK) parts.push(`${kinds.length - offK} of ${kinds.length} kinds`);
    if (offT) parts.push(tiers.filter((t) => !st.offTiers.has(t)).join(' and ') || 'no evidence level');
    if (st.range) parts.push(`${T.fmtDate(st.range[0])} to ${T.fmtDate(st.range[1])}`);
    if (st.person) parts.push(st.personName);
    out.textContent = parts.length ? 'Showing ' + parts.join(' · ') : 'Showing everything';
    box.classList.toggle('tt-active', parts.length > 0);
  }
  function drawFilters(st, events) {
    const kinds = [...T.sortKinds(events.filter(T.isMoney).map((e) => e.chart_family)), ...(events.some((e) => !T.isMoney(e)) ? [T.ACTIONS] : [])];
    chips(st, byId(st.sid + '-f-kind'), kinds, st.offKinds, (k) => {
      const b = T.button('tt-chip');
      b.appendChild(k === T.ACTIONS ? T.keySvg(T.ACTION_SHAPES[T.ACTION_SHAPES.length - 1]) : T.swatch(T.colorFor(k, st.pres)));
      b.appendChild(T.txt(T.shortOf(k)));
      return b;
    });
    const present = [...new Set(events.map((e) => e.evidence_tier).filter(T.has))];
    const tiers = [...T.TIERS.filter((t) => present.includes(t)), ...present.filter((t) => !T.TIERS.includes(t))];
    chips(st, byId(st.sid + '-f-tier'), tiers, st.offTiers, (t) => {
      const b = T.button('tt-chip');
      b.appendChild(T.h('span', T.tierClass(t), t));
      return b;
    });
    const more = byId(st.sid + '-f-more');
    if (!st.wired) {
      st.personChip = T.button('tt-chip tt-picked', '', () => {
        st.person = null;
        redraw(st);
      });
      st.personChip.hidden = true;
      more.appendChild(st.personChip);
      more.appendChild(T.button('tt-btn', 'Clear filters', () => {
        st.offKinds.clear();
        st.offTiers.clear();
        st.range = null;
        st.person = null;
        const s1 = byId(st.sid + '-search');
        const s2 = byId(st.sid + '-people-search');
        if (s1) s1.value = '';
        if (s2) s2.value = '';
        redraw(st);
      }));
      const from = byId(st.sid + '-from');
      const to = byId(st.sid + '-to');
      const apply = () => {
        const ok = (inp) => inp && inp.value && inp.validity.valid;
        const a = ok(from) ? T.parseDate(from.value) : null;
        const b = ok(to) ? T.parseDate(to.value) : null;
        if ((from && from.value && !ok(from)) || (to && to.value && !ok(to))) return;
        if (!a && !b) st.range = null;
        else {
          let r0 = a || st.full[0];
          let r1 = b ? new Date(+b + 864e5 - 1) : st.full[1];
          if (r1 < r0) [r0, r1] = [r1, r0];
          st.range = [r0, r1];
        }
        redraw(st);
      };
      [from, to].forEach((inp) => {
        if (!inp) return;
        inp.addEventListener('change', apply);
        inp.addEventListener('blur', () => showRange(st));
      });
      const tg = byId(st.sid + '-ftoggle');
      if (tg) tg.addEventListener('click', () => setFiltersOpen(st, !byId(st.sid + '-filters').classList.contains('tt-open')));
      st.wired = true;
    }
    st.personChip.hidden = !st.person;
    st.personChip.textContent = st.person ? `Person: ${st.personName} ×` : '';
    st.personChip.setAttribute('aria-label', st.person ? `Clear the person filter (${st.personName})` : 'Clear the person filter');
    showRange(st);
    filterState(st, kinds, tiers);
  }

  // ---------- Timeline: a row per kind of money, a dot per event at its date, bigger dots for bigger amounts ----------
  // Dot area grows with the amount (a square-root scale shared by every row on the page), so readers compare sizes,
  // not heights on a log axis; a size key under the chart gives three reference amounts. Actions sit on the top row.
  function drawTimeline(st, events) {
    const box = byId(st.sid + '-timeline');
    box.classList.remove('dash-skeleton');
    box.replaceChildren();
    const tip = T.tooltip(box);
    const dated = events.filter((e) => T.parseDate(e.plot_date));
    if (!dated.length) {
      box.appendChild(T.h('p', 'tt-empty', 'No dated events are on record for this term yet.'));
      return;
    }
    const all = [...(dated.some((e) => !T.isMoney(e)) ? [T.ACTIONS] : []), ...T.sortKinds(dated.filter(T.isMoney).map((e) => e.chart_family))];
    const lanes = all.filter((k) => !st.offKinds.has(k));
    if (!lanes.length) {
      box.appendChild(T.h('p', 'tt-empty', 'Every kind of money is switched off in the filters above.'));
      return;
    }
    const play = T.firstPlay(box, true);
    const W = Math.max(300, box.clientWidth || 640);
    const narrow = W < 560;
    const dom = st.range || st.full;
    const shown = dated.filter((e) => passes(st, e));
    const svgSel = d3.select(box).append('svg').attr('class', 'tt-svg').attr('width', '100%')
      .attr('role', 'group').attr('aria-label', 'Timeline of this term’s events by kind of money, bigger dots for bigger amounts; the table below lists the same events');
    const svg = svgSel.node();
    const money = dated.filter(T.isMoney);
    const maxV = d3.max(money, (e) => Number(e.plot_value)) || 1;
    const rMax = narrow ? 13 : 17;
    const rOf = d3.scaleSqrt([0, maxV], [0, rMax]);
    const radius = (e) => Math.max(3.5, rOf(Number(e.plot_value)));
    st.sizeKey = { maxV, rMax };
    const labelW = T.measure(svg, 'tt-lane-label', lanes.map(T.shortOf));
    const m = { l: narrow ? 6 : Math.ceil(labelW) + 16, r: narrow ? 8 : 16, t: 26, b: 30 };
    st.margins = { l: m.l, r: m.r };
    const laneH = 2 * rMax + 18;
    const actH = 44;
    const gap = narrow ? 24 : 8;
    // Each kind's largest single in-office amount, from the key_events calculation, labels its row. On a phone the label
    // goes at the right end of the row's name line, or on a line of its own under the name when the two don't fit.
    const keys = T.rowsOf('key_events') || [];
    const largest = new Map();
    lanes.forEach((k) => {
      if (k === T.ACTIONS) return;
      const r = keys.find((q) => q.president === st.pres && q.chart_family === k && q.measure === 'largest_event');
      const e = r && st.byId.get(r.id);
      if (r && e && shown.includes(e)) largest.set(k, { r, e });
    });
    const ownLine = (k) => narrow && largest.has(k) &&
      m.l + T.measure(svg, 'tt-lane-label', [T.shortOf(k)]) + 12 + T.measure(svg, 'tt-anno tt-anno-strong', ['Largest ' + T.fmtMoney(largest.get(k).r.value)]) > W - m.r;
    let yy = m.t;
    const L = lanes.map((k) => {
      const l = { key: k, h: k === T.ACTIONS ? actH : laneH, extra: ownLine(k) ? 15 : 0 };
      l.y0 = yy + (narrow ? 16 + l.extra : 0);
      l.yc = l.y0 + l.h / 2;
      yy = l.y0 + l.h + gap;
      return l;
    });
    const H = yy - gap + m.b + 6;
    svgSel.attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    box.style.minHeight = H + 'px';
    const span = +dom[1] - +dom[0] || 864e5;
    const x = d3.scaleUtc([new Date(+dom[0] - span * 0.02), new Date(+dom[1] + span * 0.02)], [m.l, W - m.r]);
    const tx0 = Math.max(m.l, x(st.term[0]));
    const tx1 = Math.min(W - m.r, x(st.term[1]));
    if (tx1 > tx0) {
      svgSel.append('rect').attr('class', 'tt-term-band').attr('x', tx0).attr('y', m.t - 18).attr('width', tx1 - tx0).attr('height', H - m.t - m.b + 18);
      if (tx1 - tx0 > 64) svgSel.append('text').attr('class', 'tt-term-label').attr('x', tx0 + 6).attr('y', m.t - 6).text('In office');
    }
    L.forEach((l) => {
      svgSel.append('line').attr('class', 'tt-lane-line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', l.yc).attr('y2', l.yc);
      svgSel.append('text').attr('class', 'tt-lane-label').attr('x', narrow ? m.l : m.l - 10).attr('y', narrow ? l.y0 - 5 - l.extra : l.yc)
        .attr('text-anchor', narrow ? 'start' : 'end').attr('dominant-baseline', narrow ? 'auto' : 'middle').text(T.shortOf(l.key));
    });
    const ax = svgSel.append('g').attr('class', 'tt-axis').attr('transform', `translate(0,${H - m.b + 2})`)
      .call(d3.axisBottom(x).ticks(Math.max(2, Math.floor((W - m.l - m.r) / 96))).tickSizeOuter(0));
    ax.attr('font-size', null).attr('font-family', null);
    const frac = (cx) => ((cx - m.l) / Math.max(1, W - m.l - m.r)) * 0.7;
    // Money events: the biggest first, each nudged up or down off the row line where it would cover a dot already placed.
    const placed = new Map(L.map((l) => [l.key, []]));
    shown.filter(T.isMoney).sort((a, b) => Number(b.plot_value) - Number(a.plot_value)).forEach((e) => {
      const l = L.find((q) => q.key === e.chart_family);
      if (!l) return;
      const cx = x(T.parseDate(e.plot_date));
      const r = radius(e);
      const room = l.h / 2 - r - 2;
      const others = placed.get(l.key);
      const fits = (cy) => others.every((o) => Math.hypot(o.cx - cx, o.cy - cy) >= o.r + r - 1.5);
      let cy = l.yc;
      for (const step of [0, -1, 1, -2, 2, -3, 3]) {
        const c = l.yc + step * Math.max(4, r * 0.9);
        if (Math.abs(c - l.yc) > room) continue;
        if (fits(c)) {
          cy = c;
          break;
        }
      }
      others.push({ cx, cy, r });
      const color = T.colorFor(e.chart_family, st.pres);
      const g = svgSel.append('g').attr('class', 'tt-ev').attr('data-ev', e.id);
      // An amount reported for a period: a bar along the time axis from its first day to its last.
      if (T.isSpread(e)) {
        const xa = Math.max(m.l, x(T.parseDate(e.covers_start)));
        const xb = Math.min(W - m.r, x(new Date(+T.parseDate(e.covers_end) + 864e5)));
        if (xb - xa > 1) g.append('line').attr('class', 'tt-span').attr('x1', xa).attr('x2', xb).attr('y1', cy).attr('y2', cy).style('stroke', color);
      }
      const added = T.isCounted(e);
      const dot = g.append('circle').attr('class', 'tt-dot tt-bubble' + (added ? '' : ' tt-bubble-hollow') + (play ? ' tt-pop' : '')).attr('cx', cx).attr('cy', cy).attr('r', r)
        .style('fill', added ? color : 'var(--color-panel)').style('stroke', color);
      T.mark(dot.node(), 'events', 'plot_value', { id: e.id });
      if (play) T.delay(dot.node(), frac(cx));
      bindMark(g.append('circle').attr('class', 'tt-hit').attr('cx', cx).attr('cy', cy).attr('r', Math.max(12, r + 2)).node(), st, e, tip, tipLines(e));
    });
    // Actions and context: one symbol per event, nudged apart when they share a day.
    const al = L.find((q) => q.key === T.ACTIONS);
    if (al) {
      d3.group(shown.filter((e) => !T.isMoney(e)), (e) => e.plot_date).forEach((list) => {
        list.forEach((e, i) => {
          const sh = T.shapeFor(e.category);
          const cx = x(T.parseDate(e.plot_date)) + (i - (list.length - 1) / 2) * 8;
          const cy = al.yc + (list.length > 1 ? ((i % 2) - 0.5) * 12 : 0);
          const g = svgSel.append('g').attr('class', 'tt-ev').attr('data-ev', e.id);
          const p = g.append('path').attr('class', 'tt-act').attr('d', T.symbolPath(sh, 48)).attr('transform', `translate(${cx},${cy}) rotate(${sh.rot})`);
          T.mark(p.node(), 'events', 'plot_date', { id: e.id });
          if (play) {
            p.classed('tt-fade', true);
            T.delay(p.node(), frac(cx));
          }
          bindMark(g.append('circle').attr('class', 'tt-hit').attr('cx', cx).attr('cy', cy).attr('r', 12).node(), st, e, tip, tipLines(e));
        });
      });
    }
    // Labels: each kind's largest single in-office amount (found above, with the rows). On a phone it sits clear of the
    // dots, right-aligned just above its row: on the name line, or on its own line under the name.
    L.forEach((l) => {
      const got = largest.get(l.key);
      if (!got) return;
      const { r: k, e } = got;
      const pos = (placed.get(l.key) || []).find((o) => Math.abs(o.cx - x(T.parseDate(e.plot_date))) < 0.5) || { cx: x(T.parseDate(e.plot_date)), cy: l.yc, r: radius(e) };
      const t = svgSel.append('text').attr('class', 'tt-anno').attr('y', pos.cy).attr('dominant-baseline', 'middle');
      t.append('tspan').text('Largest ');
      const v = t.append('tspan').attr('class', 'tt-anno-strong').text(T.fmtMoney(k.value));
      T.mark(v.node(), 'key_events', 'value', { key: k.key });
      const tw = t.node().getComputedTextLength();
      if (narrow) t.attr('x', W - m.r).attr('y', l.y0 - 5).attr('text-anchor', 'end').attr('dominant-baseline', 'auto');
      else if (pos.cx + pos.r + 6 + tw <= W - m.r) t.attr('x', pos.cx + pos.r + 6).attr('text-anchor', 'start');
      else t.attr('x', Math.max(m.l + tw, pos.cx - pos.r - 6)).attr('text-anchor', 'end');
      if (play) {
        t.classed('tt-fade', true);
        T.delay(t.node(), 0.8);
      }
    });
  }

  // ---------- Date brush: drag across the strip to zoom every view on the page ----------
  function drawBrush(st, events) {
    const box = byId(st.sid + '-brush');
    box.classList.remove('dash-skeleton');
    box.replaceChildren();
    const dated = events.filter((e) => T.parseDate(e.plot_date));
    box.hidden = !dated.length;
    if (!dated.length) return;
    const W = Math.max(300, box.clientWidth || 640);
    const H = 60;
    const m = { l: st.margins.l, r: st.margins.r };
    const x = d3.scaleUtc(st.full, [m.l, W - m.r]);
    const svgSel = d3.select(box).append('svg').attr('class', 'tt-svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H)
      .attr('aria-label', 'Date range selector: drag across the strip to zoom the timeline, running totals and table; the From and To fields above do the same');
    const tx0 = Math.max(m.l, x(st.term[0]));
    const tx1 = Math.min(W - m.r, x(st.term[1]));
    if (tx1 > tx0) svgSel.append('rect').attr('class', 'tt-term-band').attr('x', tx0).attr('y', 4).attr('width', tx1 - tx0).attr('height', 30);
    dated.forEach((e) => {
      const cx = x(T.parseDate(e.plot_date));
      svgSel.append('line').attr('class', 'tt-tickmark').attr('x1', cx).attr('x2', cx).attr('y1', 10).attr('y2', 28)
        .style('stroke', T.isMoney(e) ? T.colorFor(e.chart_family, st.pres) : T.MUTED).style('opacity', passes(st, e, true) ? 0.9 : 0.2);
    });
    const ax = svgSel.append('g').attr('class', 'tt-axis').attr('transform', 'translate(0,36)')
      .call(d3.axisBottom(x).ticks(Math.max(2, Math.floor((W - m.l - m.r) / 110))).tickSizeOuter(0));
    ax.attr('font-size', null).attr('font-family', null);
    const brush = d3.brushX().extent([[m.l, 2], [W - m.r, 36]]).on('end', (ev) => {
      if (!ev.sourceEvent) return;
      if (!ev.selection || ev.selection[1] - ev.selection[0] < 3) st.range = null;
      else st.range = ev.selection.map((px) => x.invert(px));
      redraw(st);
    });
    const g = svgSel.append('g').attr('class', 'tt-brush-g').call(brush);
    g.select('.selection').classed('tt-brush-sel', true);
    g.selectAll('.handle').classed('tt-brush-handle', true);
    if (st.range) g.call(brush.move, [Math.max(m.l, x(st.range[0])), Math.min(W - m.r, x(st.range[1]))]);
  }

  // Three reference dots, sized on the timeline's own scale: about the largest amount, a tenth of it and a hundredth.
  function sizeKey({ maxV, rMax }) {
    const nice = (v) => {
      const p = Math.pow(10, Math.floor(Math.log10(v)));
      return [1, 2, 5, 10].map((q) => q * p).filter((q) => q <= v).pop() || p;
    };
    const vals = [...new Set([nice(maxV / 100), nice(maxV / 10), nice(maxV)])].filter((v) => v > 0);
    const r = d3.scaleSqrt([0, maxV], [0, rMax]);
    const wrap = T.h('span', 'tt-legend-item tt-size-key');
    wrap.appendChild(T.txt('Dot size: '));
    vals.forEach((v) => {
      const rr = Math.max(3.5, r(v));
      const sv = T.s('svg', 'tt-key-svg');
      sv.setAttribute('width', String(Math.ceil(rr * 2 + 4)));
      sv.setAttribute('height', String(Math.ceil(rMax * 2 + 4)));
      sv.setAttribute('aria-hidden', 'true');
      const c = T.s('circle', 'tt-size-dot');
      c.setAttribute('cx', String(rr + 2));
      c.setAttribute('cy', String(rMax + 2));
      c.setAttribute('r', String(rr));
      sv.appendChild(c);
      wrap.append(sv, T.txt(T.fmtMoney(v) + ' '));
    });
    return wrap;
  }

  // ---------- Key: the colors and dots first; every other mark under "More about this chart" ----------
  function drawLegend(st, events) {
    const el = byId(st.sid + '-legend');
    el.replaceChildren();
    if (!events.length) return;
    const row = (parent) => {
      const r = T.h('div', 'tt-legend');
      parent.appendChild(r);
      return r;
    };
    const item = (parent, node, text) => {
      const sp = T.h('span', 'tt-legend-item');
      sp.append(node, T.txt(text));
      parent.appendChild(sp);
    };
    const kinds = T.sortKinds(events.filter(T.isMoney).map((e) => e.chart_family));
    const main = row(el);
    T.GROUPS.forEach((g) => {
      const mine = kinds.filter((k) => g.kinds.has(k));
      if (mine.length) item(main, T.swatch(T.colorFor(mine[0], st.pres)), g.label);
    });
    item(main, T.swatch('var(--color-fg-muted)'), 'Filled dot: counted in the totals');
    item(main, T.swatch('var(--color-fg-muted)', true), 'Hollow dot: shown, not added');
    if (st.sizeKey && st.sizeKey.maxV > 0) main.appendChild(sizeKey(st.sizeKey));
    const more = T.h('details', 'tt-more-key');
    more.open = !!st.moreKey;
    more.addEventListener('toggle', () => (st.moreKey = more.open));
    more.appendChild(T.h('summary', 'tt-more-sum', 'More about this chart'));
    const extra = row(more);
    if (events.some((e) => T.isMoney(e) && T.isSpread(e))) {
      const sk = T.h('span', 'tt-sw-line');
      sk.style.background = 'var(--color-fg-muted)';
      sk.style.opacity = '.45';
      sk.style.width = '18px';
      sk.style.height = '3px';
      item(extra, sk, 'Bar along the dates: an amount reported for a whole period, such as a year');
    }
    T.ACTION_SHAPES.filter((sh) => events.some((e) => !T.isMoney(e) && T.shapeFor(e.category) === sh)).forEach((sh) => item(extra, T.keySvg(sh), sh.label));
    kinds.forEach((k) => item(extra, T.swatch(T.colorFor(k, st.pres)), `${T.shortOf(k)}: ${T.ABOUT[k] || ''}`));
    el.appendChild(more);
  }

  // ---------- Running totals: one small panel per kind of money, each on its own scale ----------
  // A dated amount steps up on its day. An amount reported for a whole period (a year's income, a run of sales)
  // is spread evenly across that period and drawn dashed, because the dates within the period aren't known.
  const DAY = 864e5;
  function drawRunning(st) {
    const box = byId(st.sid + '-running');
    const rows = T.rowsOf('running_totals');
    if (!rows) {
      if (T.failed('running_totals')) T.failLine(box);
      return;
    }
    box.classList.remove('dash-skeleton');
    box.replaceChildren();
    const mine = rows.filter((r) => r.president === st.pres);
    if (!mine.length) {
      box.appendChild(T.h('p', 'tt-empty', 'No event in office meets the rules for a running total yet.'));
      return;
    }
    const kinds = T.sortKinds(mine.map((r) => r.chart_family)).filter((k) => !st.offKinds.has(k));
    if (!kinds.length) {
      box.appendChild(T.h('p', 'tt-empty', 'The kinds of money with running totals are switched off in the filters above.'));
      return;
    }
    const play = T.firstPlay(box, true);
    const totals = T.rowsOf('family_totals') || [];
    const key = T.h('div', 'tt-run-key');
    const keyItem = (dashed, text) => {
      const sp = T.h('span', 'tt-run-key-item');
      const sv = T.s('svg', 'tt-run-key-svg');
      sv.setAttribute('width', '28');
      sv.setAttribute('height', '14');
      sv.setAttribute('aria-hidden', 'true');
      const ln = T.s('path', dashed ? 'tt-run-dash' : 'tt-run-line');
      ln.setAttribute('d', dashed ? 'M2,12L26,2' : 'M2,12L12,12L12,2L26,2');
      ln.style.stroke = 'var(--color-fg-muted)';
      sv.appendChild(ln);
      sp.append(sv, T.txt(text));
      key.appendChild(sp);
    };
    keyItem(false, 'Step: one dated payment, sale or trade');
    keyItem(true, 'Dashed slope: an amount reported for a whole period, or dated only to a month, spread evenly across it');
    box.appendChild(key);
    const grid = T.h('div', 'tt-multiples');
    box.appendChild(grid);
    const dom = st.range ? [d3.max([st.range[0], st.term[0]]), d3.min([st.range[1], st.term[1]])] : st.term;
    // Every panel goes into the grid before any is drawn, so each chart is measured at its own final width.
    const cells = kinds.map((k) => {
      const cell = T.h('div', 'tt-mult');
      const head = T.h('div', 'tt-mult-title');
      head.append(T.swatch(T.colorFor(k, st.pres)), T.txt(T.shortOf(k)));
      cell.appendChild(head);
      const fam = totals.find((r) => r.president === st.pres && r.chart_family === k && r.period === 'during term');
      if (fam) {
        const sub = T.h('div', 'tt-mult-sub');
        sub.append(T.txt('Total in office: '), T.val(T.fmtMoney(fam.total), 'family_totals', 'total', { key: fam.key }, 'tt-strong'), T.txt(' from '),
          T.val(T.fmtCount(fam.n), 'family_totals', 'n', { key: fam.key }), T.txt(` ${T.plural(fam.n, 'entry', 'entries')}`));
        cell.appendChild(sub);
      }
      const cb = T.h('div', 'tt-mult-chart');
      cell.appendChild(cb);
      grid.appendChild(cell);
      return { k, cb };
    });
    cells.forEach(({ k, cb }) => {
      if (!(dom[1] > dom[0])) {
        cb.appendChild(T.h('p', 'tt-empty', 'The selected dates fall outside the term.'));
        return;
      }
      runPanel(cb, st, k, mine.filter((r) => r.chart_family === k), dom, play);
    });
  }
  function runPanel(cb, st, k, pts, dom, play) {
    const W = Math.max(240, cb.clientWidth || 320);
    const H = 216;
    const top = 24;
    const bottom = H - 26;
    // A band at the top of each plot is kept clear of the line, so a label always has somewhere to go.
    const band = 34;
    const svgSel = d3.select(cb).append('svg').attr('class', 'tt-svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H)
      .attr('role', 'group').attr('aria-label', `Running total of ${T.shortOf(k)} while in office`);
    const svg = svgSel.node();
    const color = T.colorFor(k, st.pres);
    const tip = T.tooltip(cb);
    // The view runs to the end of its last day, so an amount whose period ends that day is complete in view.
    const t0 = +dom[0];
    const t1 = +dom[1] + DAY;
    const spans = pts.map((p) => {
      const a = +(T.parseDate(p.covers_start) || T.parseDate(p.plot_date));
      const last = +(T.parseDate(p.covers_end) || a);
      const spread = String(p.spread) === 'true' && last > a;
      return { p, a, b: spread ? last + DAY : a, v: Number(p.value), spread };
    });
    // The total at a moment: dated amounts count from their day, a period's amount in proportion to the time elapsed.
    const at = (t, after) => spans.reduce((sum, q) => {
      if (q.spread) return sum + q.v * Math.max(0, Math.min(1, (t - q.a) / (q.b - q.a)));
      return sum + ((after ? t >= q.a : t > q.a) ? q.v : 0);
    }, 0);
    const ts = [...new Set([t0, t1, ...spans.flatMap((q) => [q.a, q.b]).filter((t) => t > t0 && t < t1)])].sort((a, b) => a - b);
    const bp = ts.map((t) => ({ t, before: at(t, false), after: at(t, true) }));
    const endVal = bp.length ? bp[bp.length - 1].after : 0;
    const midSpread = spans.some((q) => q.spread && q.a < t1 && q.b > t1);
    const done = spans.filter((q) => q.b <= t1).map((q) => q.p);
    const lastDone = done.length ? done.reduce((mx, p) => (Number(p.cumulative) > Number(mx.cumulative) ? p : mx)) : null;
    const endText = (midSpread ? '≈' : '') + T.fmtMoney(endVal);
    const y = d3.scaleLinear([0, (d3.max(bp, (q) => Math.max(q.before, q.after)) || 1) * 1.04], [bottom, top + band]);
    const yt = y.ticks(3);
    const m = { l: Math.ceil(T.measure(svg, 'tt-tick', yt.map(T.fmtMoney))) + 8, r: Math.ceil(T.measure(svg, 'tt-end-label', [endText || '$0'])) + 12 };
    const x = d3.scaleUtc([new Date(t0), new Date(t1)], [m.l, W - m.r]);
    yt.forEach((v) => {
      svgSel.append('line').attr('class', 'tt-grid').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v));
      svgSel.append('text').attr('class', 'tt-tick').attr('x', m.l - 6).attr('y', y(v)).attr('text-anchor', 'end').attr('dominant-baseline', 'middle').text(T.fmtMoney(v));
    });
    svgSel.append('text').attr('class', 'tt-axis-title').attr('x', m.l).attr('y', 11).text('Total so far');
    // Under about three years, ticks every three or six months, each with its year; longer spans tick by year.
    const spanDays = (t1 - t0) / DAY;
    const axis = d3.axisBottom(x).tickSizeOuter(0);
    if (spanDays < 1200) axis.ticks(d3.utcMonth.every(spanDays < 400 ? 3 : 6)).tickFormat((d) => (d.getUTCMonth() === 0 ? d3.utcFormat('%Y')(d) : d3.utcFormat('%b %Y')(d)));
    else axis.ticks(Math.max(2, Math.floor((W - m.l - m.r) / 84)));
    const ax = svgSel.append('g').attr('class', 'tt-axis').attr('transform', `translate(0,${bottom})`).call(axis);
    ax.attr('font-size', null).attr('font-family', null);
    // Flat runs and dated steps are solid; the stretch where a period's amount is being spread is dashed.
    // Points along the drawn line are kept so labels can be placed off it.
    let solid = '';
    let dashed = '';
    const linePts = [];
    const addSeg = (xa, ya, xb, yb) => {
      const n = Math.max(1, Math.ceil(Math.hypot(xb - xa, yb - ya) / 3));
      for (let j = 0; j <= n; j++) linePts.push([xa + ((xb - xa) * j) / n, ya + ((yb - ya) * j) / n]);
    };
    bp.forEach((q, i) => {
      const X = x(new Date(q.t));
      if (i === 0) solid += `M${X},${y(q.before)}`;
      if (Math.abs(q.after - q.before) > 1e-6) {
        solid += `M${X},${y(q.before)}L${X},${y(q.after)}`;
        addSeg(X, y(q.before), X, y(q.after));
      }
      const n = bp[i + 1];
      if (!n) return;
      const X2 = x(new Date(n.t));
      const seg = `M${X},${y(q.after)}L${X2},${y(n.before)}`;
      addSeg(X, y(q.after), X2, y(n.before));
      if (Math.abs(n.before - q.after) < 1e-6) solid += seg;
      else dashed += seg;
    });
    if (dashed) {
      const dp = svgSel.append('path').attr('class', 'tt-run-dash' + (play ? ' tt-fade' : '')).style('stroke', color).attr('d', dashed);
      if (play) T.delay(dp.node(), 0.2);
    }
    const line = svgSel.append('path').attr('class', 'tt-run-line' + (play ? ' tt-draw' : '')).attr('pathLength', 1).style('stroke', color).attr('d', solid);
    if (!play) line.attr('pathLength', null);
    else T.delay(line.node(), 0);
    // One dot where each amount is complete; amounts completing on the same day share a dot.
    const groups = d3.groups(spans.filter((q) => q.b >= t0 && q.b <= t1), (q) => q.b)
      .map(([b, items]) => {
        items.sort((u, v) => v.v - u.v);
        return { b, items, value: d3.sum(items, (q) => q.v), spread: items.some((q) => q.spread) };
      })
      .sort((u, v) => u.b - v.b);
    const whenOf = (q) => T.periodText(q.p.covers_start, q.p.covers_end);
    groups.forEach((g, i) => {
      const lead = g.items[0];
      const cx = x(new Date(g.b));
      const total = at(g.b, true);
      const cy = y(total);
      linePts.push([cx, cy], [cx - 5, cy], [cx + 5, cy], [cx, cy - 5], [cx, cy + 5]);
      const e = st.byId.get(lead.p.id);
      const gEl = svgSel.append('g').attr('class', 'tt-ev').attr('data-ev', lead.p.id);
      if (e && !passes(st, e, true)) gEl.classed('tt-dim', true);
      const dot = gEl.append('circle').attr('class', 'tt-dot' + (play ? ' tt-pop' : '')).attr('cx', cx).attr('cy', cy).attr('r', 4)
        .style('fill', color).style('stroke', 'var(--color-panel)');
      T.mark(dot.node(), 'running_totals', 'value', { id: lead.p.id });
      if (play) T.delay(dot.node(), (i / Math.max(1, groups.length)) * 0.8);
      const when = whenOf(lead);
      const lines = [{ text: when.charAt(0).toUpperCase() + when.slice(1) }];
      g.items.slice(0, 4).forEach((q) => lines.push({ value: '+' + T.fmtMoney(q.v), text: q.p.label, color }));
      if (g.items.length > 4) lines.push({ text: `and ${g.items.length - 4} more`, cls: 'tt-tip-muted' });
      lines.push({ value: T.fmtMoney(total), text: 'total so far', cls: 'tt-tip-line' });
      if (g.spread) lines.push({ text: /^[A-Z][a-z]{2} \d{4}$/.test(when) ? 'Dated only to the month, so it is spread across the month here' : 'Reported for the whole period, so it is spread evenly across it here', cls: 'tt-tip-muted' });
      lines.push({ text: 'Click or press Enter for details and sources', cls: 'tt-tip-muted' });
      const hit = gEl.append('circle').attr('class', 'tt-hit').attr('cx', cx).attr('cy', cy).attr('r', 12).node();
      if (e) bindMark(hit, st, e, tip, lines);
    });
    // Labels say what each rise is and when: every rise in a panel with three or fewer, else the largest.
    // When a panel is too narrow to label a rise without crossing the line, the rises get numbers instead
    // and a short list under the chart says what each number is.
    const pick = groups.length <= 3 ? groups : [groups.slice().sort((u, v) => v.value - u.value)[0]];
    const placed = [];
    const made = [];
    const anchorOf = (g) => {
      const lead = g.items[0];
      if (g.spread) {
        const tm = (Math.max(lead.a, t0) + Math.min(lead.b, t1)) / 2;
        return [x(new Date(tm)), y(at(tm, true))];
      }
      return [x(new Date(g.b)), (y(at(g.b, false)) + y(at(g.b, true))) / 2];
    };
    const amountOf = (g) => (g.items.length === 1 ? g.items[0].v : g.value);
    const nameOf = (g) => (g.items.length === 1 ? ' ' + g.items[0].p.label : ` from ${g.items.length} entries`);
    const oneMonth = (txt) => /^[A-Z][a-z]{2} \d{4}$/.test(txt);
    const whenWords = (g) => {
      const w = whenOf(g.items[0]);
      return (g.spread ? (oneMonth(w) ? 'in ' : 'across ') : 'on ') + w;
    };
    const markAmount = (node, g) => T.mark(node, 'running_totals', g.items.length === 1 ? 'value' : 'group_value', { id: g.items[0].p.id });
    pick.forEach((g) => {
      const t = svgSel.append('text').attr('class', 'tt-anno');
      const l1 = t.append('tspan').attr('x', 0).attr('dy', 0);
      l1.append('tspan').text('+');
      markAmount(l1.append('tspan').attr('class', 'tt-anno-strong').text(T.fmtMoney(amountOf(g))).node(), g);
      l1.append('tspan').text(nameOf(g));
      t.append('tspan').attr('class', 'tt-anno-sub').attr('x', 0).attr('dy', '1.3em').text(whenWords(g));
      const bb = t.node().getBBox();
      const w = bb.width;
      const hgt = bb.height;
      const [ax0, ay0] = anchorOf(g);
      // Try positions across the plot and keep the one that touches the line least, then sits nearest the point.
      const hi = top - 6;
      const lo = bottom - hgt - 2;
      const xMax = W - m.r - w;
      const cost = (lx, ly) => {
        let c = 0;
        for (const [px, py] of linePts) if (px >= lx - 4 && px <= lx + w + 4 && py >= ly - 3 && py <= ly + hgt + 3) c += 1;
        for (const r of placed) if (lx < r.x + r.w + 6 && lx + w + 6 > r.x && ly < r.y + r.h + 2 && ly + hgt + 2 > r.y) c += 1000;
        const dx = Math.max(0, lx - ax0, ax0 - (lx + w));
        const dy = Math.max(0, ly - ay0, ay0 - (ly + hgt));
        return c * 10 + Math.hypot(dx, dy) / 40;
      };
      let best = { lx: m.l + 2, ly: hi, c: Infinity };
      if (xMax >= m.l + 2) {
        for (let lx = m.l + 2; lx <= xMax; lx += 12) {
          for (let ly = hi; ly <= Math.max(hi, lo); ly += 6) {
            const c = cost(lx, ly);
            if (c < best.c) best = { lx, ly, c };
          }
        }
      }
      placed.push({ x: best.lx, y: best.ly, w, h: hgt });
      t.attr('transform', `translate(${best.lx},${best.ly - bb.y})`);
      // A thin leader line when the label sits away from the point it explains.
      const nx = Math.max(best.lx, Math.min(ax0, best.lx + w));
      const ny = Math.max(best.ly, Math.min(ay0, best.ly + hgt));
      const lead = Math.hypot(nx - ax0, ny - ay0) > 14
        ? svgSel.insert('line', 'text').attr('class', 'tt-anno-line').attr('x1', ax0).attr('y1', ay0).attr('x2', nx).attr('y2', ny)
        : null;
      made.push({ g, t, lead, clean: best.c < 10, ax0, ay0 });
    });
    if (made.some((q) => !q.clean)) {
      made.forEach((q) => {
        q.t.remove();
        if (q.lead) q.lead.remove();
      });
      const notes = T.h('ol', 'tt-run-notes');
      made.forEach((q, i) => {
        const n = String(i + 1);
        const bx = Math.max(m.l + 8, Math.min(W - m.r - 8, q.ax0 - 11));
        const by = Math.max(top + 2, q.ay0 - 11);
        svgSel.append('circle').attr('class', 'tt-num-badge').attr('cx', bx).attr('cy', by).attr('r', 7.5);
        svgSel.append('text').attr('class', 'tt-num-badge-text').attr('x', bx).attr('y', by).attr('text-anchor', 'middle').attr('dominant-baseline', 'central').text(n);
        const li = T.h('li', 'tt-run-note');
        li.append(T.h('span', 'tt-run-note-n', n), T.txt('+'), markAmount(T.h('span', 'tt-strong', T.fmtMoney(amountOf(q.g))), q.g), T.txt(nameOf(q.g) + ', ' + whenWords(q.g)));
        notes.appendChild(li);
      });
      cb.appendChild(notes);
    } else if (play) {
      made.forEach((q) => {
        q.t.classed('tt-fade', true);
        T.delay(q.t.node(), 0.85);
      });
    }
    const endLabel = svgSel.append('text').attr('class', 'tt-end-label').attr('x', W - m.r + 6).attr('y', y(endVal)).attr('dominant-baseline', 'middle').text(endText);
    if (!midSpread && lastDone && Math.abs(Number(lastDone.cumulative) - endVal) < 0.5) T.mark(endLabel.node(), 'running_totals', 'cumulative', { id: lastDone.id });
  }

  // ---------- Events table ----------
  // Cells show each column's own value, formatted; an empty value stays blank.
  const COLS = {
    date: { text: (e) => T.dateText(e.date, e.date_precision), sort: (e) => e.date, cls: 'tt-nowrap' },
    title: { text: (e) => e.title, cls: 'tt-wide-col' },
    kind_label: { text: (e) => (T.has(e.chart_family) ? T.shortOf(e.chart_family) : 'Action or context'), sort: (e) => (T.has(e.chart_family) ? T.ORDER.indexOf(e.chart_family) : 99), cls: 'tt-hide-narrow' },
    amount_usd: { text: (e) => T.amountText(e), sort: (e) => (T.has(e.amount_usd) ? Number(e.amount_usd) : -Infinity), cls: 'tt-num', num: true },
    evidence_tier: { badge: true, text: (e) => e.evidence_tier || '', cls: 'tt-nowrap' },
    source_count: { text: (e) => T.fmtCount(e.source_count), sort: (e) => Number(e.source_count) || 0, cls: 'tt-num tt-hide-narrow', num: true },
  };
  function sortTable(table, sortKey, dir) {
    table.querySelectorAll('thead th[data-field]').forEach((th) => {
      th.setAttribute('aria-sort', th.getAttribute('data-field') === sortKey ? (dir > 0 ? 'ascending' : 'descending') : 'none');
    });
  }
  function drawTable(st) {
    const table = byId(st.sid + '-table');
    const search = byId(st.sid + '-search');
    const fields = [...table.querySelectorAll('thead th[data-field]')].map((th) => th.getAttribute('data-field'));
    if (!table.hasAttribute('data-wired')) {
      table.querySelectorAll('thead th[data-field]').forEach((th) => {
        const f = th.getAttribute('data-field');
        th.querySelector('button').addEventListener('click', () => {
          if (st.sort === f) st.dir = -st.dir;
          else {
            st.sort = f;
            st.dir = COLS[f] && COLS[f].num ? -1 : 1;
          }
          drawTable(st);
        });
      });
      search.addEventListener('input', () => drawTable(st));
      table.setAttribute('data-wired', '');
    }
    const q = search.value.trim().toLowerCase();
    const rows = st.events.filter((e) => passes(st, e) && (!q || [e.id, e.title, e.description, e.people, e.chart_family, e.category, e.evidence_tier, e.lane, e.investigation_status, e.dispute].join(' ').toLowerCase().includes(q)));
    const spec = COLS[st.sort] || COLS.date;
    const key = spec.sort || ((e) => String(e[st.sort] || ''));
    rows.sort((a, b) => st.dir * d3.ascending(key(a), key(b)) || d3.ascending(a.id, b.id));
    sortTable(table, st.sort, st.dir);
    const tbody = table.querySelector('tbody');
    tbody.replaceChildren();
    const shown = T.pageRows(table, rows, () => drawTable(st));
    if (!rows.length) {
      const tr = T.h('tr');
      const td = T.h('td', 'tt-td tt-muted', st.events.length ? 'No events match the filters and search.' : 'No events are on record for this term yet.');
      td.colSpan = fields.length;
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    const labels = T.headLabels(table);
    shown.forEach((e) => {
      const tr = T.h('tr', 'tt-row' + (st.open === e.id ? ' tt-row-open' : ''));
      tr.setAttribute('data-key', e.id);
      tr.tabIndex = 0;
      fields.forEach((f) => {
        const c = COLS[f] || { text: (r) => r[f] || '' };
        const td = T.cellTag(T.h('td', 'tt-td ' + (c.cls || '')), f, labels[f]);
        if (c.badge && T.has(e[f])) td.appendChild(T.h('span', T.tierClass(e[f]), e[f]));
        else td.textContent = c.text(e);
        tr.appendChild(td);
      });
      tr.addEventListener('click', () => openEvent(st, e, tr));
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          openEvent(st, e, tr);
        }
      });
      tr.addEventListener('pointerenter', () => T.setHot(st.page, e.id));
      tr.addEventListener('pointerleave', () => T.setHot(st.page, null));
      tbody.appendChild(tr);
    });
  }

  // ---------- People named by sources: a list that filters the page to one person's events ----------
  const PCOLS = {
    person: { sort: (r) => r.person, text: (r) => r.person },
    events: { sort: (r) => r.events, text: (r) => T.fmtCount(r.events), num: true },
    co_people: { sort: (r) => r.co_people, text: (r) => T.fmtCount(r.co_people), num: true },
    counted_events: { sort: (r) => r.counted_events, text: (r) => T.fmtCount(r.counted_events), num: true },
  };
  function drawPeople(st) {
    const table = byId(st.sid + '-people');
    const search = byId(st.sid + '-people-search');
    if (!table) return;
    const net = T.rowsOf('person_network');
    const tbody = table.querySelector('tbody');
    if (!net) {
      if (T.failed('person_network')) T.failTable(table);
      return;
    }
    const fields = [...table.querySelectorAll('thead th[data-field]')].map((th) => th.getAttribute('data-field'));
    if (!table.hasAttribute('data-wired')) {
      table.querySelectorAll('thead th[data-field]').forEach((th) => {
        const f = th.getAttribute('data-field');
        th.querySelector('button').addEventListener('click', () => {
          if (st.psort === f) st.pdir = -st.pdir;
          else {
            st.psort = f;
            st.pdir = PCOLS[f] && PCOLS[f].num ? -1 : 1;
          }
          drawPeople(st);
        });
      });
      search.addEventListener('input', () => drawPeople(st));
      table.setAttribute('data-wired', '');
    }
    const q = search.value.trim().toLowerCase();
    const spec = PCOLS[st.psort] || PCOLS.events;
    const rows = net.filter((r) => r.president === st.pres && (!q || r.person.toLowerCase().includes(q)))
      .sort((a, b) => st.pdir * d3.ascending(spec.sort(a), spec.sort(b)) || d3.ascending(a.person, b.person));
    sortTable(table, st.psort, st.pdir);
    tbody.replaceChildren();
    const shown = T.pageRows(table, rows, () => drawPeople(st));
    if (!rows.length) {
      const tr = T.h('tr');
      const td = T.h('td', 'tt-td tt-muted', net.some((r) => r.president === st.pres) ? 'No people match the search.' : 'No people are named in this term’s events yet.');
      td.colSpan = fields.length;
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    const labels = T.headLabels(table);
    shown.forEach((r) => {
      const tr = T.h('tr', 'tt-row' + (st.person === r.key ? ' tt-row-open' : ''));
      tr.setAttribute('data-key', r.key);
      tr.setAttribute('aria-selected', String(st.person === r.key));
      tr.tabIndex = 0;
      fields.forEach((f) => {
        const c = PCOLS[f] || { text: (x) => x[f] };
        tr.appendChild(T.cellTag(T.h('td', 'tt-td' + (c.num ? ' tt-num' : ''), c.text(r)), f, labels[f]));
      });
      const pick = () => {
        if (st.person === r.key) st.person = null;
        else {
          st.person = r.key;
          st.personName = r.person;
        }
        redraw(st);
        if (st.person) showFilters(st);
        else byId(st.sid + '-filters').scrollIntoView({ block: 'nearest' });
      };
      tr.addEventListener('click', pick);
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          pick();
        }
      });
      tbody.appendChild(tr);
    });
  }

  // ---------- Full Documented Summary: every record of the term written out with its people, outcome and sources ----------
  const PERIODS = [['before term', 'Before taking office'], ['during term', 'In office'], ['after term', 'After leaving office']];
  const periodLabel = (p) => (PERIODS.find((x) => x[0] === p) || [p, p])[1];
  const RULE = {
    [T.F.OFFICIAL]: 'Trades disclosed by officials, members of Congress and allies are shown, not added, in every term.',
    [T.F.PENALTY]: 'Penalties, settlements and judgments are shown, not added, in every term.',
    [T.F.FOREIGN]: 'Foreign-linked deals and project values are context and never added.',
    [T.F.DONOR]: 'Donations by people who later got appointments, aid or clemency are shown, never added.',
  };
  const BLANK_REL = /^(none( documented)?|self|n\/?a|the president|president)$/i;
  const publisherOf = (title) => String(title || '').split(' — ')[0].trim();
  const byDate = (a, b) => d3.ascending(String(a.plot_date || a.date || ''), String(b.plot_date || b.date || '')) || d3.ascending(a.id, b.id);
  const orderedSources = (e) => {
    const list = T.sourcesOf(e);
    if (T.has(e.primary_source)) return [e.primary_source, ...list.filter((u) => u !== e.primary_source)];
    return list;
  };
  const SUM_TABLES = ['-sum-totals', '-sum-register', '-sum-inv', '-sum-pardons', '-sum-people', '-sum-notadded', '-sum-sources'];

  function sumId(st, e) {
    const b = T.button('tt-linkbtn tt-sum-id', null, (ev) => {
      ev.stopPropagation();
      openEvent(st, e, b);
    });
    b.appendChild(T.val(e.id, 'events', 'id', { id: e.id }));
    b.setAttribute('aria-label', `Open the full record ${e.id}: ${e.title}`);
    return b;
  }
  // A record's period needs its own line only when the date shown doesn't already say it (a month or a year shown whole).
  const coversShown = (e) => {
    if (!T.isSpread(e)) return false;
    const d = T.parseDate(e.date);
    if (!d) return true;
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const isoDay = (dt) => dt.toISOString().slice(0, 10);
    const raw = String(e.date).trim();
    const a = String(e.covers_start).slice(0, 10);
    const b = String(e.covers_end).slice(0, 10);
    if (e.date_precision === 'year' || raw.length === 4) return !(a === `${y}-01-01` && b === `${y}-12-31`);
    if (e.date_precision === 'month' || raw.length === 7) return !(a === isoDay(new Date(Date.UTC(y, m, 1))) && b === isoDay(new Date(Date.UTC(y, m + 1, 0))));
    return true;
  };
  function sumDate(e) {
    const w = { id: e.id };
    const box = T.h('div', 'tt-sum-date');
    box.appendChild(T.val(T.dateText(e.date || e.plot_date, e.date_precision), 'events', T.has(e.date) ? 'date' : 'plot_date', w));
    if (coversShown(e)) {
      const sub = T.h('div', 'tt-sum-sub');
      sub.append(T.txt('Covers '), T.val(T.fmtDate(T.parseDate(e.covers_start)), 'events', 'covers_start', w), T.txt(' – '),
        T.val(T.fmtDate(T.parseDate(e.covers_end)), 'events', 'covers_end', w));
      box.appendChild(sub);
    }
    return box;
  }
  function sumTitle(st, e) {
    const box = T.h('div', 'tt-sum-title-cell');
    box.appendChild(sumId(st, e));
    box.appendChild(T.txt(' '));
    box.appendChild(T.val(e.title, 'events', 'title', { id: e.id }));
    return box;
  }
  function sumPeople(st, e) {
    const box = T.h('div', 'tt-sum-people');
    if (String(e.trader_identified) === 'false') box.appendChild(T.h('span', 'tt-badge tt-badge-unknown', 'Trader unidentified'));
    const rows = st.peopleByEvent.get(e.id) || [];
    if (rows.length) {
      const ul = T.h('ul', 'tt-sum-list');
      rows.forEach((r) => {
        const li = T.h('li');
        const pw = { key: r.key };
        li.appendChild(T.val(r.person, 'people', 'person', pw, 'tt-strong'));
        if (T.has(r.role_in_event)) {
          li.appendChild(T.txt(' — '));
          li.appendChild(T.val(r.role_in_event, 'people', 'role_in_event', pw));
        }
        ul.appendChild(li);
      });
      box.appendChild(ul);
    } else if (T.has(e.people)) box.appendChild(T.val(e.people, 'events', 'people', { id: e.id }));
    else if (String(e.trader_identified) !== 'false') box.appendChild(T.h('span', 'tt-muted', 'No person named'));
    return box;
  }
  function sumAmount(e, w) {
    const ranged = T.has(e.amount_low) && T.has(e.amount_high) && Number(e.amount_low) !== Number(e.amount_high);
    const fmt = e.amount_type === 'count' ? T.fmtCount : T.fmtMoney;
    const box = T.h('span', 'tt-sum-amount');
    if (T.has(e.amount_usd)) {
      box.appendChild(T.val(T.amountText(e), 'events', 'amount_usd', w, 'tt-strong'));
      if (ranged) box.append(T.txt(' (range '), T.val(fmt(e.amount_low), 'events', 'amount_low', w), T.txt(' to '), T.val(fmt(e.amount_high), 'events', 'amount_high', w), T.txt(')'));
    } else if (ranged) {
      box.append(T.val(fmt(e.amount_low), 'events', 'amount_low', w, 'tt-strong'), T.txt('–'), T.val(fmt(e.amount_high), 'events', 'amount_high', w, 'tt-strong'));
    } else if (T.has(e.amount_high)) {
      box.append(T.txt('Up to '), T.val(fmt(e.amount_high), 'events', 'amount_high', w, 'tt-strong'));
    } else if (T.has(e.amount_low)) {
      box.append(T.txt('At least '), T.val(fmt(e.amount_low), 'events', 'amount_low', w, 'tt-strong'));
    } else return null;
    if (e.amount_type === 'count') box.appendChild(T.txt(' (a count, not dollars)'));
    return box;
  }
  function sumMoney(e) {
    const w = { id: e.id };
    const box = T.h('div', 'tt-sum-money');
    const kindLine = T.has(e.chart_family) ? T.h('div', 'tt-sum-sub', T.shortOf(e.chart_family)) : null;
    if (T.isCounted(e) && T.has(e.plot_value)) {
      const top = T.h('div');
      if (String(e.plot_is_upper_bound) === 'true') top.appendChild(T.txt('Up to '));
      top.appendChild(T.val(T.fmtMoney(e.plot_value), 'events', 'plot_value', w, 'tt-strong'));
      top.appendChild(T.txt(' added to its running total'));
      box.appendChild(top);
      if (kindLine) box.appendChild(kindLine);
      if (T.has(e.amount_usd) && Number(e.amount_usd) !== Number(e.plot_value)) {
        const d = T.h('div', 'tt-sum-sub');
        d.append(T.txt('Amount on record '), T.val(T.amountText(e), 'events', 'amount_usd', w));
        box.appendChild(d);
      }
      return box;
    }
    const amt = sumAmount(e, w);
    if (amt) {
      box.appendChild(amt);
      box.appendChild(T.h('div', 'tt-sum-sub', 'Shown, not added'));
      if (kindLine) box.appendChild(kindLine);
    } else if (kindLine) {
      box.appendChild(T.h('div', 'tt-sum-sub', 'Shown, not added'));
      box.appendChild(kindLine);
    } else box.appendChild(T.h('span', 'tt-muted', 'No amount'));
    return box;
  }
  function sumLabelled(label, value, field, e) {
    if (!T.has(value)) return null;
    const p = T.h('p', 'tt-sum-p');
    p.appendChild(T.h('span', 'tt-sum-lab', label + ' '));
    p.appendChild(T.val(value, 'events', field, { id: e.id }));
    return p;
  }
  function sumOutcome(e) {
    const box = T.h('div', 'tt-sum-outcome');
    [sumLabelled('Outcome:', e.investigation_status, 'investigation_status', e), sumLabelled('Response:', e.dispute, 'dispute', e)].filter(Boolean).forEach((n) => box.appendChild(n));
    if (!box.childNodes.length) box.appendChild(T.h('span', 'tt-muted', 'None recorded'));
    return box;
  }
  // Every source page as a link: the lead source by its publisher, the rest by site, and a second page from one site as "site, page 2".
  function sumSources(e) {
    const box = T.h('div', 'tt-sum-src');
    const urls = orderedSources(e);
    const perHost = new Map();
    urls.forEach((u, i) => {
      const host = T.hostOf(u);
      const k = (perHost.get(host) || 0) + 1;
      perHost.set(host, k);
      const lead = i === 0 && u === e.primary_source && T.has(e.primary_source_title);
      const a = T.linkTo(u, lead ? publisherOf(e.primary_source_title) : k > 1 ? `${host}, page ${k}` : host);
      if (lead) a.classList.add('tt-strong');
      a.title = u;
      box.appendChild(a);
      if (i < urls.length - 1) box.appendChild(T.txt(' · '));
    });
    if (!urls.length) box.appendChild(T.h('span', 'tt-muted', 'No source'));
    return box;
  }
  // One table row: label each cell for the stacked phone layout; a click outside links and buttons opens the record.
  function sumRow(st, e, cells) {
    const tr = T.h('tr', 'tt-row');
    tr.setAttribute('data-key', e.id);
    tr.tabIndex = 0;
    tr.setAttribute('aria-label', `${e.id}: ${e.title}`);
    cells.forEach(([label, node, cls]) => {
      const td = T.h('td', 'tt-td' + (cls ? ' ' + cls : ''));
      td.setAttribute('data-label', label);
      if (node) td.appendChild(node);
      tr.appendChild(td);
    });
    tr.addEventListener('click', (ev) => {
      if (ev.target.closest('a, button')) return;
      openEvent(st, e, tr);
    });
    tr.addEventListener('keydown', (ev) => {
      if (ev.target !== tr) return;
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        openEvent(st, e, tr);
      }
    });
    tr.addEventListener('pointerenter', () => T.setHot(st.page, e.id));
    tr.addEventListener('pointerleave', () => T.setHot(st.page, null));
    return tr;
  }
  const fillBody = (table, rows, emptyText) => {
    const tbody = table.querySelector('tbody');
    tbody.replaceChildren();
    if (!rows.length) {
      const tr = T.h('tr');
      const td = T.h('td', 'tt-td tt-muted', emptyText);
      td.colSpan = table.querySelectorAll('thead th').length || 1;
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    rows.forEach((r) => tbody.appendChild(r));
  };

  function sumGlance(st) {
    const box = byId(st.sid + '-sum-glance');
    const stats = T.rowsOf('summary_stats');
    if (!stats) {
      if (T.failed('summary_stats')) T.failLine(box);
      return;
    }
    const r = stats.find((x) => x.president === st.pres);
    box.classList.remove('dash-skeleton');
    box.replaceChildren();
    if (!r || !r.records) {
      box.appendChild(T.h('p', 'tt-muted', 'No records are on file for this term yet.'));
      return;
    }
    const w = { president: st.pres };
    const n = (f) => T.val(T.fmtCount(r[f]), 'summary_stats', f, w, 'tt-strong');
    const para = (...parts) => {
      const p = T.h('p');
      parts.filter((x) => x !== null && x !== undefined && x !== false).forEach((x) => p.appendChild(typeof x === 'string' ? T.txt(x) : x));
      box.appendChild(p);
    };
    const when = [r.before ? [n('before'), ' before it'] : null, r.after ? [n('after'), ' after it'] : null].filter(Boolean);
    para(n('records'), ` ${T.plural(r.records, 'record is', 'records are')} on file for this term: `, n('documented'), ' documented, ', n('reported'), ' reported and ', n('alleged'), ' alleged. ',
      n('during'), ` ${T.plural(r.during, 'is', 'are')} dated in office`, ...(when.length ? [', ', ...when[0], ...(when[1] ? [' and ', ...when[1]] : [])] : []), '.');
    para(n('counted'), ` ${T.plural(r.counted, 'record is', 'records are')} added to running totals, across `, n('kinds_counted'), ` ${T.plural(r.kinds_counted, 'kind', 'kinds')} of money; `,
      n('not_added'), ` ${T.plural(r.not_added, 'amount is', 'amounts are')} shown but not added, and `, n('actions'), ` ${T.plural(r.actions, 'record is an action or context', 'records are actions or context')} with no amount.`);
    para(n('investigations'), ` ${T.plural(r.investigations, 'record is an investigation, charge or enforcement action', 'records are investigations, charges or enforcement actions')}, and `, n('pardons'),
      ` ${T.plural(r.pardons, 'concerns a pardon or commutation', 'concern pardons or commutations')}. `, n('with_status'), ` ${T.plural(r.with_status, 'record carries', 'records carry')} an investigation status or outcome, and `,
      n('with_dispute'), ' a response, denial or dispute.');
    para('Sources name ', n('people'), ` ${T.plural(r.people, 'person', 'people')}. `, ...(r.unidentified_trader ? [n('unidentified_trader'), ` ${T.plural(r.unidentified_trader, 'record involves trades', 'records involve trades')} whose trader has not been publicly identified; nobody is linked to them. `] : []),
      n('source_pages'), ` source ${T.plural(r.source_pages, 'page', 'pages')} on `, n('source_sites'), ` ${T.plural(r.source_sites, 'site are', 'sites are')} cited.`);
  }

  function sumTotals(st) {
    const table = byId(st.sid + '-sum-totals');
    const rows = T.rowsOf('family_totals');
    if (!rows) {
      if (T.failed('family_totals')) T.failTable(table);
      return;
    }
    const pr = (p) => PERIODS.findIndex((x) => x[0] === p);
    const mine = rows.filter((r) => r.president === st.pres)
      .sort((a, b) => T.ORDER.indexOf(a.chart_family) - T.ORDER.indexOf(b.chart_family) || pr(a.period) - pr(b.period));
    fillBody(table, mine.map((r) => {
      const w = { key: r.key };
      const tr = T.h('tr');
      tr.setAttribute('data-key', r.key);
      const kind = T.h('span', 'tt-cell-kind');
      kind.append(T.swatch(T.colorFor(r.chart_family, st.pres)), T.val(r.chart_family, 'family_totals', 'chart_family', w));
      const top = T.h('div');
      const ev = st.byId.get(r.top_id);
      if (ev) top.appendChild(sumId(st, ev));
      top.append(T.txt(' '), T.val(r.top_title, 'family_totals', 'top_title', w), T.txt(' · '), T.val(T.fmtMoney(r.top_value), 'family_totals', 'top_value', w, 'tt-strong'));
      [['Kind of money', kind], ['Period', T.val(r.period_label, 'family_totals', 'period_label', w)],
        ['Total', T.val(T.fmtMoney(r.total), 'family_totals', 'total', w, 'tt-strong'), 'tt-num'], ['Records', T.val(T.fmtCount(r.n), 'family_totals', 'n', w), 'tt-num'],
        ['Largest entry', top]].forEach(([label, node, cls]) => {
        const td = T.h('td', 'tt-td' + (cls ? ' ' + cls : ''));
        td.setAttribute('data-label', label);
        td.appendChild(node);
        tr.appendChild(td);
      });
      return tr;
    }), 'No money is counted for this term yet.');
  }

  function sumChips(st, boxId, options, off) {
    const box = byId(boxId);
    if (!box || box.__wired) return;
    options.forEach(([key, label]) => {
      const b = T.button('tt-chip', label, () => {
        toggle(off, key);
        b.setAttribute('aria-pressed', String(!off.has(key)));
        sumRegister(st);
      });
      b.setAttribute('aria-pressed', 'true');
      box.appendChild(b);
    });
    box.__wired = true;
  }
  function sumRegister(st) {
    const table = byId(st.sid + '-sum-register');
    const search = byId(st.sid + '-sum-search');
    const count = byId(st.sid + '-sum-count');
    if (!st.sumOffTiers) {
      st.sumOffTiers = new Set();
      st.sumOffPeriods = new Set();
    }
    sumChips(st, st.sid + '-sum-tiers', T.TIERS.map((t) => [t, t]), st.sumOffTiers);
    sumChips(st, st.sid + '-sum-periods', PERIODS, st.sumOffPeriods);
    if (!search.__wired) {
      search.addEventListener('input', () => sumRegister(st));
      search.__wired = true;
    }
    const q = search.value.trim().toLowerCase();
    const filtered = !!q || st.sumOffTiers.size > 0 || st.sumOffPeriods.size > 0;
    const stats = T.rowsOf('summary_stats');
    const r = stats ? stats.find((x) => x.president === st.pres) : null;
    count.replaceChildren();
    if (r) {
      count.append(T.val(T.fmtCount(r.records), 'summary_stats', 'records', { president: st.pres }), T.txt(` ${T.plural(r.records, 'record', 'records')} in date order`));
      if (filtered) {
        count.appendChild(T.txt('; showing those that match the search and filters. '));
        count.appendChild(T.button('tt-linkbtn', 'Show every record', () => {
          search.value = '';
          st.sumOffTiers.clear();
          st.sumOffPeriods.clear();
          byId(st.sid + '-sum-tiers').querySelectorAll('.tt-chip').forEach((b) => b.setAttribute('aria-pressed', 'true'));
          byId(st.sid + '-sum-periods').querySelectorAll('.tt-chip').forEach((b) => b.setAttribute('aria-pressed', 'true'));
          sumRegister(st);
        }));
      } else count.appendChild(T.txt('.'));
    }
    const text = (e) => [e.id, e.title, e.description, e.people, e.chart_family, e.category, e.evidence_tier, e.investigation_status, e.dispute, e.curation_note, e.all_sources,
      ...(st.peopleByEvent.get(e.id) || []).map((p) => p.person + ' ' + p.role_in_event)].join(' ').toLowerCase();
    const list = st.events.filter((e) => !st.sumOffTiers.has(e.evidence_tier || '') && !st.sumOffPeriods.has(e.period) && (!q || text(e).includes(q))).sort(byDate);
    fillBody(table, T.pageRows(table, list, () => sumRegister(st), 10).map((e) => sumRow(st, e, [
      ['ID', sumId(st, e), 'tt-nowrap'],
      ['Date', sumDate(e), 'tt-sum-col-date'],
      ['Event', T.val(e.title, 'events', 'title', { id: e.id }), 'tt-sum-col-event'],
      ['People named and their documented roles', sumPeople(st, e), 'tt-sum-col-people'],
      ['Evidence', T.tierBadge(e.evidence_tier, 'events', { id: e.id }) || T.h('span', 'tt-muted', 'Not recorded')],
      ['Money and how it counts', sumMoney(e), 'tt-sum-col-money'],
      ['Outcome and response', sumOutcome(e), 'tt-sum-col-outcome'],
      ['Sources', sumSources(e), 'tt-sum-col-src'],
    ])), st.events.length ? 'No records match the search and filters.' : 'No records are on file for this term yet.');
  }

  function sumInvestigations(st) {
    const list = st.events.filter((e) => T.INVESTIGATION.test(e.category || '')).sort(byDate);
    const table = byId(st.sid + '-sum-inv');
    fillBody(table, T.pageRows(table, list, () => sumInvestigations(st)).map((e) => sumRow(st, e, [
      ['Date', sumDate(e), 'tt-sum-col-date'],
      ['Matter', sumTitle(st, e), 'tt-sum-col-event'],
      ['Status or outcome', T.has(e.investigation_status) ? T.val(e.investigation_status, 'events', 'investigation_status', { id: e.id }) : T.h('span', 'tt-muted', 'None recorded'), 'tt-sum-col-outcome'],
      ['Response, denial or dispute', T.has(e.dispute) ? T.val(e.dispute, 'events', 'dispute', { id: e.id }) : T.h('span', 'tt-muted', 'None recorded'), 'tt-sum-col-outcome'],
      ['Evidence', T.tierBadge(e.evidence_tier, 'events', { id: e.id }) || T.h('span', 'tt-muted', 'Not recorded')],
      ['Sources', sumSources(e), 'tt-sum-col-src'],
    ])), 'No investigations, charges or enforcement actions are on record for this term.');
  }

  // Two records of one grant (same date, same recipient named) point at each other rather than reading as two pardons.
  function sumPardons(st) {
    const list = st.events.filter((e) => T.PARDON.test(e.category || '')).sort(byDate);
    const named = (e) => new Set((st.peopleByEvent.get(e.id) || []).map((r) => T.normPerson(r.person)));
    const sets = new Map(list.map((e) => [e.id, named(e)]));
    const sameGrant = (e) => list.filter((o) => o.id !== e.id && String(o.date) === String(e.date) && [...sets.get(e.id)].some((p) => sets.get(o.id).has(p)));
    const matter = (e) => {
      const box = sumTitle(st, e);
      const also = sameGrant(e);
      if (also.length) {
        const d = T.h('div', 'tt-sum-sub tt-sum-also');
        d.appendChild(T.txt('Same grant also recorded as '));
        also.forEach((o, i) => {
          if (i) d.appendChild(T.txt(', '));
          d.appendChild(sumId(st, o));
        });
        box.appendChild(d);
      }
      return box;
    };
    const table = byId(st.sid + '-sum-pardons');
    fillBody(table, T.pageRows(table, list, () => sumPardons(st)).map((e) => sumRow(st, e, [
      ['Date', sumDate(e), 'tt-sum-col-date'],
      ['Pardon or clemency', matter(e), 'tt-sum-col-event'],
      ['People and their ties', sumPeople(st, e), 'tt-sum-col-people'],
      ['Stated reason or response', T.has(e.dispute) ? T.val(e.dispute, 'events', 'dispute', { id: e.id }) : T.h('span', 'tt-muted', 'None recorded'), 'tt-sum-col-outcome'],
      ['Sources', sumSources(e), 'tt-sum-col-src'],
    ])), 'No pardons or commutations are on record for this term.');
  }

  function sumPeopleTable(st) {
    const table = byId(st.sid + '-sum-people');
    const search = byId(st.sid + '-sum-people-search');
    const net = T.rowsOf('person_network');
    if (!net) {
      if (T.failed('person_network')) T.failTable(table);
      return;
    }
    if (!search.__wired) {
      search.addEventListener('input', () => sumPeopleTable(st));
      search.__wired = true;
    }
    const q = search.value.trim().toLowerCase();
    const rowsByPerson = d3.group(st.peopleRows || [], (r) => st.pres + '|' + T.normPerson(r.person));
    const list = net.filter((r) => r.president === st.pres).map((r) => ({ r, rows: (rowsByPerson.get(r.key) || []).slice().sort((a, b) => byDate(st.byId.get(a.event_id) || {}, st.byId.get(b.event_id) || {})) }))
      .filter(({ r, rows }) => !q || [r.person, ...rows.map((x) => x.relationship + ' ' + x.role_in_event + ' ' + x.event_id)].join(' ').toLowerCase().includes(q))
      .sort((a, b) => d3.descending(a.r.events, b.r.events) || d3.ascending(a.r.person, b.r.person));
    fillBody(table, T.pageRows(table, list, () => sumPeopleTable(st)).map(({ r, rows }) => {
      const tr = T.h('tr');
      tr.setAttribute('data-key', r.key);
      const w = { key: r.key };
      // Each relationship once, most often documented first; "Sons" and "President's son" read as "Son" for that check.
      const rel = T.h('div', 'tt-sum-rel');
      const relKey = (v) => v.toLowerCase().replace(/^(the )?(president|trump|biden|obama)['’]s /, '').replace(/s$/, '');
      const groups = new Map();
      rows.forEach((x) => {
        const v = String(x.relationship || '').trim();
        if (!v || BLANK_REL.test(v)) return;
        const k = relKey(v);
        if (!groups.has(k)) groups.set(k, { x, v, n: 0 });
        groups.get(k).n += 1;
      });
      [...groups.values()].sort((a, b) => b.n - a.n).forEach(({ x, v }) => {
        if (rel.childNodes.length) rel.appendChild(T.txt('; '));
        rel.appendChild(T.val(v, 'people', 'relationship', { key: x.key }));
      });
      if (!rel.childNodes.length) rel.appendChild(T.h('span', 'tt-muted', '—'));
      const ul = T.h('ul', 'tt-sum-list');
      rows.forEach((x) => {
        const li = T.h('li');
        const ev = st.byId.get(x.event_id);
        if (ev) li.appendChild(sumId(st, ev));
        else li.appendChild(T.val(x.event_id, 'people', 'event_id', { key: x.key }));
        if (T.has(x.role_in_event)) li.append(T.txt(' — '), T.val(x.role_in_event, 'people', 'role_in_event', { key: x.key }));
        ul.appendChild(li);
      });
      [['Person', T.val(r.person, 'person_network', 'person', w, 'tt-strong')], ['Records', T.val(T.fmtCount(r.events), 'person_network', 'events', w), 'tt-num'],
        ['Relationship', rel, 'tt-sum-col-rel'], ['Records and the role each documents', ul, 'tt-sum-col-outcome']].forEach(([label, node, cls]) => {
        const td = T.h('td', 'tt-td' + (cls ? ' ' + cls : ''));
        td.setAttribute('data-label', label);
        td.appendChild(node);
        tr.appendChild(td);
      });
      return tr;
    }), net.some((r) => r.president === st.pres) ? 'No people match the search.' : 'No people are named in this term’s records yet.');
  }

  function sumNotAdded(st) {
    const rank = (e) => (T.has(e.chart_family) ? T.ORDER.indexOf(e.chart_family) : 99);
    const size = (e) => Number(e.amount_usd || e.amount_high || e.amount_low || e.plot_value || 0);
    const list = st.events.filter(T.shownNotAdded).sort((a, b) => rank(a) - rank(b) || d3.descending(size(a), size(b)) || byDate(a, b));
    const table = byId(st.sid + '-sum-notadded');
    fillBody(table, T.pageRows(table, list, () => sumNotAdded(st)).map((e) => {
      const w = { id: e.id };
      const kind = T.h('span', 'tt-cell-kind');
      if (T.has(e.chart_family)) kind.append(T.swatch(T.colorFor(e.chart_family, st.pres), true), T.txt(T.shortOf(e.chart_family)));
      else kind.appendChild(T.h('span', 'tt-muted', 'No kind of money'));
      const why = T.has(e.curation_note) ? T.val(e.curation_note, 'events', 'curation_note', w) : T.h('span', '', RULE[e.chart_family] || 'Not added to any total; the record gives the details.');
      return sumRow(st, e, [
        ['Kind', kind, 'tt-sum-col-kind'],
        ['Date', sumDate(e), 'tt-sum-col-date'],
        ['Item', sumTitle(st, e), 'tt-sum-col-event'],
        ['Amount', sumAmount(e, w) || T.h('span', 'tt-muted', '—'), 'tt-num'],
        ['Why it is not added', why, 'tt-sum-col-outcome'],
        ['Sources', sumSources(e), 'tt-sum-col-src'],
      ]);
    }), 'Nothing on record for this term is shown without being added.');
  }

  function sumSourcesTable(st) {
    const table = byId(st.sid + '-sum-sources');
    const search = byId(st.sid + '-sum-sources-search');
    const note = byId(st.sid + '-sum-sources-note');
    const idx = T.rowsOf('source_index');
    const stats = T.rowsOf('summary_stats');
    const r = stats ? stats.find((x) => x.president === st.pres) : null;
    if (r) {
      note.classList.remove('dash-skeleton');
      const w = { president: st.pres };
      note.replaceChildren(T.txt('Every page cited by this term’s records: '), T.val(T.fmtCount(r.source_pages), 'summary_stats', 'source_pages', w), T.txt(` ${T.plural(r.source_pages, 'page', 'pages')} on `),
        T.val(T.fmtCount(r.source_sites), 'summary_stats', 'source_sites', w), T.txt(` ${T.plural(r.source_sites, 'site', 'sites')}, with the records that cite each. Each record's lead source comes first in the register above.`));
    } else if (T.failed('summary_stats')) T.failLine(note);
    if (!idx) {
      if (T.failed('source_index')) T.failTable(table);
      return;
    }
    if (!search.__wired) {
      search.addEventListener('input', () => sumSourcesTable(st));
      search.__wired = true;
    }
    const q = search.value.trim().toLowerCase();
    const list = idx.filter((x) => x.president === st.pres && (!q || (x.host + ' ' + x.url).toLowerCase().includes(q)))
      .sort((a, b) => d3.ascending(a.host, b.host) || d3.ascending(a.url, b.url));
    fillBody(table, T.pageRows(table, list, () => sumSourcesTable(st)).map((x) => {
      const tr = T.h('tr');
      tr.setAttribute('data-key', x.key);
      const w = { key: x.key };
      const ids = T.h('div', 'tt-sum-ids');
      String(x.ids || '').split(' ').filter(Boolean).forEach((id, i) => {
        const ev = st.byId.get(id);
        if (i) ids.appendChild(T.txt(' '));
        ids.appendChild(ev ? sumId(st, ev) : T.h('span', '', id));
      });
      const page = T.linkTo(x.url);
      page.title = x.url;
      [['Site', T.val(x.host, 'source_index', 'host', w, 'tt-strong'), 'tt-nowrap'], ['Page', page, 'tt-sum-col-src'],
        ['Records', T.val(T.fmtCount(x.records), 'source_index', 'records', w), 'tt-num'], ['Cited by', ids]].forEach(([label, node, cls]) => {
        const td = T.h('td', 'tt-td' + (cls ? ' ' + cls : ''));
        td.setAttribute('data-label', label);
        td.appendChild(node);
        tr.appendChild(td);
      });
      return tr;
    }), idx.some((x) => x.president === st.pres) ? 'No sources match the search.' : 'No sources are cited for this term yet.');
  }

  // Drawn when its data changes, not on every filter change elsewhere on the page.
  function drawSummary(st) {
    // A switch between phone and wide layouts redraws it too, since phones show long tables a page at a time.
    const deps = [...['events', 'people', 'family_totals', 'summary_stats', 'source_index', 'person_network'].map((id) => T.rowsOf(id)), T.isNarrow(st.page)];
    if (st.sumDeps && deps.every((d, i) => d === st.sumDeps[i])) return;
    st.sumDeps = deps;
    sumGlance(st);
    sumTotals(st);
    if (!T.rowsOf('events')) {
      if (T.failed('events')) SUM_TABLES.slice(1).forEach((t) => T.failTable(byId(st.sid + t)));
      return;
    }
    sumRegister(st);
    sumInvestigations(st);
    sumPardons(st);
    sumPeopleTable(st);
    sumNotAdded(st);
    sumSourcesTable(st);
  }

  // ---------- The whole page ----------
  function drawPresident(page) {
    const st = stateFor(page);
    page.__hot = undefined;
    T.fillMarks(page);
    drawCallouts(st);
    drawKpis(st);
    const all = T.rowsOf('events');
    if (!all) {
      const fail = T.failed('events');
      [st.sid + '-timeline', st.sid + '-brush', st.sid + '-running'].forEach((id) => {
        const b = byId(id);
        if (b && fail) T.failLine(b);
      });
      if (fail) T.failTable(byId(st.sid + '-table'));
      if (T.failed('person_network')) T.failTable(byId(st.sid + '-people'));
      drawSummary(st);
      return;
    }
    const events = all.filter((e) => e.president === st.pres);
    const peopleRows = (T.rowsOf('people') || []).filter((r) => r.president === st.pres);
    st.peopleRows = peopleRows;
    st.events = events;
    st.byId = new Map(events.map((e) => [e.id, e]));
    st.peopleByEvent = d3.group(peopleRows, (r) => r.event_id);
    st.personEvents = new Set(peopleRows.filter((r) => st.pres + '|' + T.normPerson(r.person) === st.person).map((r) => r.event_id));
    const dated = events.filter((e) => T.parseDate(e.plot_date));
    st.full = dated.length ? fullDomain(st, dated) : st.term;
    drawFilters(st, events);
    drawTimeline(st, events);
    drawBrush(st, events);
    drawLegend(st, events);
    drawRunning(st);
    drawTable(st);
    drawPeople(st);
    drawSummary(st);
    if (st.open) {
      const e = st.byId.get(st.open);
      if (e) renderDrawer(st, e);
    }
  }

  T.drawPresident = drawPresident;
})();
