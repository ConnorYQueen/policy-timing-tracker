// A small stand-in for the Claude dashboard runtime, so the same page scripts run on any web host.
// It keeps the same contract the page relies on: dash.calc registers a calculation over datasets, dash.data(id) returns
// {status, data}, dash.onData(fn) redraws when data arrives, dash.setLink(name) names a place in the address bar.
(function () {
  'use strict';
  const calcs = new Map();
  const data = new Map();
  const listeners = [];
  const run = (fn) => {
    try { fn(); } catch (err) { console.error(err); }
  };
  window.dash = {
    colors: ['var(--tt-c-biden)', 'var(--tt-c-trump-2)', 'var(--tt-c-biden-2)', 'var(--tt-c-trump)', 'var(--tt-c-obama-2)', 'var(--tt-c-trump1)', 'var(--tt-c-obama)', 'var(--tt-c-muted)'],
    calc(id, def) { calcs.set(id, def); },
    loader() {},
    onData(fn) { listeners.push(fn); },
    data(id) { return data.get(id) || { status: 'loading', data: [] }; },
    params() { return {}; },
    setParams() {},
    resetParams() {},
    refresh() {},
    setLink(name) {
      try { history.replaceState(null, '', '#' + encodeURIComponent(name)); } catch (err) { /* a page opened from a file may refuse this */ }
    },
    // Datasets in: rows keyed by column, as a CSV parses. Each calculation runs once its inputs are ready.
    _load(sets) {
      Object.entries(sets).forEach(([id, rows]) => data.set(id, { status: 'ok', data: rows }));
      let left = [...calcs.keys()];
      for (let pass = 0; pass < 8 && left.length; pass += 1) {
        left = left.filter((id) => {
          const def = calcs.get(id);
          if (!def.inputs.every((i) => data.has(i) && data.get(i).status === 'ok')) return true;
          try {
            data.set(id, { status: 'ok', data: def.fn(...def.inputs.map((i) => data.get(i).data)) });
          } catch (err) {
            console.error('calculation ' + id, err);
            data.set(id, { status: 'error', data: [] });
          }
          return false;
        });
      }
      listeners.forEach(run);
    },
    _fail(ids) {
      ids.forEach((id) => data.set(id, { status: 'error', data: [] }));
      listeners.forEach(run);
    },
  };
})();
