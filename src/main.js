import './style.css';
import { GraphEngine } from './graph.js';
import { AnnotationLayer } from './annotation.js';
import { TextLabels } from './textlabels.js';

const graph       = new GraphEngine('plot');
const annotations = new AnnotationLayer('annotation-canvas', graph);
const textLabels  = new TextLabels('text-layer', document.getElementById('plot'));

// ── Tool state ───────────────────────────────────────────────────────────────
let activeTool = 'select';
let pendingTextPos = null;
let currentSketchId = null; // UUID of currently loaded sketch, if any

document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTool = btn.dataset.tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyTool();
  });
});

function applyTool() {
  const penActive = activeTool === 'pen' || activeTool === 'eraser';
  annotations.setActive(penActive);
  annotations.setTool(activeTool);
  const cursor = activeTool === 'text' ? 'text' : activeTool === 'point' ? 'crosshair' : 'default';
  document.getElementById('canvas-container').style.cursor = cursor;
  document.getElementById('plot').style.pointerEvents = penActive ? 'none' : 'all';
}

// ── Annotation canvas events ─────────────────────────────────────────────────
const annotCanvas = annotations.getCanvas();
annotCanvas.addEventListener('pointerdown', e => annotations.onPointerDown(e));
annotCanvas.addEventListener('pointermove', e => annotations.onPointerMove(e));
annotCanvas.addEventListener('pointerup', () => annotations.onPointerUp());

// ── Click handler ─────────────────────────────────────────────────────────────
let _mouseDownPos = null;
document.getElementById('canvas-container').addEventListener('mousedown', e => {
  _mouseDownPos = { x: e.clientX, y: e.clientY };
});

document.getElementById('canvas-container').addEventListener('click', e => {
  if (e.target.closest('.text-label') || e.target.closest('#text-input-popup')) return;

  const wasDrag = _mouseDownPos &&
    Math.hypot(e.clientX - _mouseDownPos.x, e.clientY - _mouseDownPos.y) > 5;
  _mouseDownPos = null;
  if (wasDrag) return;

  const plotRect = document.getElementById('plot').getBoundingClientRect();
  const sx = e.clientX - plotRect.left;
  const sy = e.clientY - plotRect.top;
  const { x, y } = graph.screenToData(sx, sy);

  if (activeTool === 'point') {
    // Snap to nearest curve if close enough, otherwise use exact cursor position
    const snap = graph.snapToCurve(x, y);
    addFunctionRow({ type: 'point', px: _snapFmt(snap.x), py: _snapFmt(snap.y) });
    return;
  }

  if (activeTool === 'select') {
    // In select mode only drop a point when clicking on a curve
    const snap = graph.snapToCurve(x, y);
    if (snap.snapped) addFunctionRow({ type: 'point', px: _snapFmt(snap.x), py: _snapFmt(snap.y) });
    return;
  }

  if (activeTool === 'text') {
    pendingTextPos = { x: sx, y: sy };
    showTextPopup(e.clientX, e.clientY);
  }
});

function _snapFmt(v) { return parseFloat(v.toPrecision(4)).toString(); }

function showTextPopup(cx, cy) {
  const popup = document.getElementById('text-input-popup');
  popup.style.left = Math.min(cx, window.innerWidth - 240) + 'px';
  popup.style.top  = Math.min(cy + 10, window.innerHeight - 120) + 'px';
  popup.classList.remove('hidden');
  const field = document.getElementById('text-input-field');
  field.value = '';
  field.focus();
}

document.getElementById('text-confirm-btn').addEventListener('click', confirmText);
document.getElementById('text-cancel-btn').addEventListener('click', () => {
  document.getElementById('text-input-popup').classList.add('hidden');
  pendingTextPos = null;
});
document.getElementById('text-input-field').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmText(); }
  if (e.key === 'Escape') { document.getElementById('text-cancel-btn').click(); }
});

function confirmText() {
  const text = document.getElementById('text-input-field').value.trim();
  if (text && pendingTextPos) textLabels.addLabel(text, pendingTextPos.x, pendingTextPos.y);
  document.getElementById('text-input-popup').classList.add('hidden');
  pendingTextPos = null;
}

// ── Pen style ────────────────────────────────────────────────────────────────
document.querySelectorAll('.color-swatch').forEach(sw => {
  sw.addEventListener('click', () => {
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
    annotations.penColor = sw.dataset.color;
  });
});

const penSizeInput = document.getElementById('pen-size');
penSizeInput.addEventListener('input', () => {
  annotations.penSize = +penSizeInput.value;
  document.getElementById('pen-size-val').textContent = penSizeInput.value;
});

const penOpacityInput = document.getElementById('pen-opacity');
penOpacityInput.addEventListener('input', () => {
  annotations.penOpacity = +penOpacityInput.value / 100;
  document.getElementById('pen-opacity-val').textContent = penOpacityInput.value;
});

// ── Function rows ─────────────────────────────────────────────────────────────
const fnList = document.getElementById('function-list');
const FN_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e91e63'];
let fnColorIdx = 0;

const TYPES = ['cartesian', 'parametric', 'polar', 'implicit', 'point'];
const TYPE_LABELS = { cartesian: 'y =', parametric: 'param', polar: 'polar', implicit: 'f = 0', point: 'point' };
const TYPE_DEFAULTS = {
  cartesian:  { expr: 'sin(x)' },
  parametric: { xExpr: '', yExpr: '', tMin: null, tMax: null },
  polar:      { expr: 'sin(2 * theta)', tMin: 0, tMax: 6.2832 },
  implicit:   { expr: 'x^2 + y^2 - 9' },
  point:      { px: '0', py: '0', label: '' },
};

function clearFunctionList() {
  fnList.innerHTML = '';
  graph.functions.slice().forEach(f => graph.removeFunction(f.id));
}

function addFunctionRow(initConfig = {}) {
  const color = initConfig.color || FN_COLORS[fnColorIdx++ % FN_COLORS.length];
  const type  = initConfig.type || 'cartesian';
  const fn    = graph.addFunction({ color, ...TYPE_DEFAULTS[type], ...initConfig });

  const row = document.createElement('div');
  row.className = 'fn-row';
  row.dataset.fnId = fn.id;
  renderRowContents(row, fn);
  fnList.appendChild(row);
  return fn;
}

function renderRowContents(row, fn) {
  row.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'fn-row-header';

  const dot = document.createElement('div');
  dot.className = 'fn-color-dot';
  dot.style.background = fn.color;

  const badge = document.createElement('button');
  badge.className = 'fn-type-badge';
  badge.textContent = TYPE_LABELS[fn.type];
  badge.title = 'Click to change equation type';
  badge.addEventListener('click', () => {
    const nextType = TYPES[(TYPES.indexOf(fn.type) + 1) % TYPES.length];
    Object.assign(fn, { type: nextType }, TYPE_DEFAULTS[nextType]);
    graph.updateFunction(fn.id, fn);
    renderRowContents(row, fn);
  });

  const del = document.createElement('button');
  del.className = 'fn-delete';
  del.textContent = '×';
  del.addEventListener('click', () => { graph.removeFunction(fn.id); row.remove(); });

  header.appendChild(dot);
  header.appendChild(badge);

  if (fn.type === 'cartesian') {
    header.appendChild(makeExprInput(fn.expr, v => graph.updateFunction(fn.id, { expr: v }), 'e.g. x^2'));
  } else if (fn.type === 'implicit') {
    const inp = makeExprInput(fn.expr, v => graph.updateFunction(fn.id, { expr: v }), 'e.g. x^2+y^2-9');
    const eq = document.createElement('span');
    eq.className = 'fn-eq0';
    eq.textContent = '=0';
    header.appendChild(inp);
    header.appendChild(eq);
  }

  header.appendChild(del);
  row.appendChild(header);

  if (fn.type === 'point') {
    row.appendChild(makeBody([
      makeCoordRow(fn, () => graph.updateFunction(fn.id, { px: fn.px, py: fn.py })),
    ]));
  } else if (fn.type === 'parametric') {
    row.appendChild(makeBody([
      makeLabeledInput('x(t) =', fn.xExpr, v => graph.updateFunction(fn.id, { xExpr: v }), 'e.g. 2t² + 3t'),
      makeLabeledInput('y(t) =', fn.yExpr, v => graph.updateFunction(fn.id, { yExpr: v }), 't  (default)'),
      makeTRange(fn, 't', (min, max) => graph.updateFunction(fn.id, { tMin: min, tMax: max }), true),
    ]));
  } else if (fn.type === 'polar') {
    row.appendChild(makeBody([
      makeLabeledInput('r(θ) =', fn.expr, v => graph.updateFunction(fn.id, { expr: v }), 'sin(2*theta)'),
      makeTRange(fn, 'θ', (min, max) => graph.updateFunction(fn.id, { tMin: min, tMax: max }), false),
    ]));
  }
}

function makeBody(children) {
  const d = document.createElement('div');
  d.className = 'fn-row-body';
  children.forEach(c => d.appendChild(c));
  return d;
}

function makeExprInput(value, onChange, placeholder = '') {
  const inp = document.createElement('input');
  inp.className = 'fn-input';
  inp.type = 'text';
  inp.value = value;
  inp.spellcheck = false;
  inp.placeholder = placeholder;
  let timer;
  inp.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => onChange(inp.value.trim()), 300);
  });
  return inp;
}

function makeLabeledInput(label, value, onChange, placeholder = '') {
  const row = document.createElement('div');
  row.className = 'fn-labeled-row';
  const lbl = document.createElement('span');
  lbl.className = 'fn-label';
  lbl.textContent = label;
  row.appendChild(lbl);
  row.appendChild(makeExprInput(value, onChange, placeholder));
  return row;
}

function makeTRange(fn, varName, onChange, autoAllowed = false) {
  const row = document.createElement('div');
  row.className = 'fn-labeled-row fn-t-range';

  const lbl = document.createElement('span');
  lbl.className = 'fn-label';
  lbl.textContent = varName + ' ∈';
  row.appendChild(lbl);

  const isAuto = autoAllowed && (fn.tMin === null || fn.tMax === null);

  if (isAuto) {
    // Auto mode: show −∞ … +∞ label + "set" button
    const autoText = document.createElement('span');
    autoText.className = 'fn-t-auto-text';
    autoText.textContent = '−∞ … +∞';

    const setBtn = document.createElement('button');
    setBtn.className = 'fn-t-toggle-btn';
    setBtn.textContent = 'set';
    setBtn.title = 'Set a custom t-range';
    setBtn.addEventListener('click', () => {
      fn.tMin = -10; fn.tMax = 10;
      onChange(fn.tMin, fn.tMax);
      // Re-render just the body to reflect new range inputs
      const body = row.closest('.fn-row-body');
      const parentRow = row.closest('.fn-row');
      const fnObj = graph.functions.find(f => f.id === +parentRow.dataset.fnId);
      if (fnObj) renderRowContents(parentRow, fnObj);
    });

    row.appendChild(autoText);
    row.appendChild(setBtn);
  } else {
    // Custom range mode: show number inputs
    const makeNum = val => {
      const inp = document.createElement('input');
      inp.className = 'fn-range-input';
      inp.type = 'number';
      inp.value = val ?? '';
      inp.step = '0.1';
      return inp;
    };

    const minInp = makeNum(fn.tMin);
    const sep = document.createElement('span');
    sep.className = 'fn-range-sep';
    sep.textContent = '…';
    const maxInp = makeNum(fn.tMax);

    let timer;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const min = parseFloat(minInp.value), max = parseFloat(maxInp.value);
        if (isFinite(min) && isFinite(max) && min < max) {
          fn.tMin = min; fn.tMax = max;
          onChange(min, max);
        }
      }, 400);
    };
    minInp.addEventListener('input', update);
    maxInp.addEventListener('input', update);

    row.appendChild(minInp);
    row.appendChild(sep);
    row.appendChild(maxInp);

    if (autoAllowed) {
      const autoBtn = document.createElement('button');
      autoBtn.className = 'fn-t-toggle-btn';
      autoBtn.textContent = 'auto';
      autoBtn.title = 'Use auto t-range (follows view)';
      autoBtn.addEventListener('click', () => {
        fn.tMin = null; fn.tMax = null;
        onChange(null, null);
        const parentRow = row.closest('.fn-row');
        const fnObj = graph.functions.find(f => f.id === +parentRow.dataset.fnId);
        if (fnObj) renderRowContents(parentRow, fnObj);
      });
      row.appendChild(autoBtn);
    }
  }

  return row;
}

function makeCoordRow(fn, onChange) {
  const row = document.createElement('div');
  row.className = 'fn-labeled-row fn-coord-row';

  const makeCoordInput = (label, key) => {
    const wrap = document.createElement('div');
    wrap.className = 'fn-coord-cell';
    const lbl = document.createElement('span');
    lbl.className = 'fn-label';
    lbl.textContent = label;
    const inp = document.createElement('input');
    inp.className = 'fn-range-input fn-coord-input';
    inp.type = 'text';
    inp.value = fn[key] ?? '0';
    inp.spellcheck = false;
    let timer;
    inp.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { fn[key] = inp.value.trim(); onChange(); }, 300);
    });
    wrap.appendChild(lbl);
    wrap.appendChild(inp);
    return wrap;
  };

  row.appendChild(makeCoordInput('x =', 'px'));
  row.appendChild(makeCoordInput('y =', 'py'));
  return row;
}

// ── Default function ──────────────────────────────────────────────────────────
addFunctionRow({ type: 'cartesian', expr: 'sin(x)' });

document.getElementById('add-fn-btn').addEventListener('click', () => addFunctionRow());

// Replot functions + reproject text labels on pan/zoom.
// Strokes are Plotly traces so they move automatically — no redraw needed.
graph.onRelayout(() => {
  clearTimeout(graph._replotTimer);
  graph._replotTimer = setTimeout(() => {
    graph._replot();
    textLabels.reproject();
    annotations.clearLive();
  }, 80);
});

// ── Sidebar toggle ───────────────────────────────────────────────────────────
const sidebarToggleBtn = document.getElementById('sidebar-toggle');
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const collapsed = sidebar.classList.toggle('collapsed');
  sidebarToggleBtn.textContent = collapsed ? '›' : '‹';
}
sidebarToggleBtn.addEventListener('click', toggleSidebar);

// ── View controls ────────────────────────────────────────────────────────────
document.getElementById('reset-view-btn').addEventListener('click', () => graph.resetView());
document.getElementById('toggle-grid-btn').addEventListener('click', () => graph.toggleGrid());

// ── Serialise / deserialise full sketch state ─────────────────────────────────
function getSketchState() {
  const layout = document.getElementById('plot')._fullLayout;
  return {
    functions: graph.functions.map(f => ({ ...f })),
    strokes:   graph.strokes.map(s => ({ ...s, points: s.points.map(p => ({ ...p })) })),
    labels:    textLabels.getLabels(),
    view: {
      xRange: layout?.xaxis?.range ? [...layout.xaxis.range] : [-10, 10],
      yRange: layout?.yaxis?.range ? [...layout.yaxis.range] : [-10, 10],
    },
  };
}

async function loadSketchState(state) {
  // Functions
  clearFunctionList();
  fnColorIdx = 0;
  (state.functions || []).forEach(fn => addFunctionRow(fn));

  // Strokes — load directly into graph engine (they render as Plotly traces)
  graph.strokes = (state.strokes || []).map(s => ({
    ...s,
    points: s.points.map(p => ({ ...p })),
  }));
  graph._strokeRedoStack = [];

  // Text labels
  textLabels.loadLabels(state.labels || []);

  // View
  if (state.view) {
    const { xRange, yRange } = state.view;
    const Plotly = (await import('plotly.js-dist-min')).default;
    await Plotly.relayout(document.getElementById('plot'), {
      'xaxis.range': xRange,
      'yaxis.range': yRange,
    });
    setTimeout(() => { graph._replot(); annotations.redraw(); }, 100);
  }
}

// ── Save ─────────────────────────────────────────────────────────────────────
document.getElementById('save-btn').addEventListener('click', async () => {
  const btn = document.getElementById('save-btn');
  btn.textContent = 'Saving…';
  btn.disabled = true;

  try {
    const data = getSketchState();
    let id, method;

    if (currentSketchId) {
      // Update the existing sketch so Notion embeds stay current
      const res = await fetch(`/api/sketch/${currentSketchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      if (!res.ok) throw new Error(await res.text());
      id = currentSketchId;
      method = 'updated';
    } else {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      if (!res.ok) throw new Error(await res.text());
      ({ id } = await res.json());
      currentSketchId = id;
      method = 'saved';
    }

    const url = `${window.location.origin}/sketch/${id}`;
    // Update browser URL without reload
    history.replaceState({}, '', `/sketch/${id}`);
    showShareModal(url, method);
  } catch (err) {
    showToast('Save failed: ' + err.message, 4000);
  } finally {
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save &amp; Get Link';
    btn.disabled = false;
  }
});

// ── Share modal ───────────────────────────────────────────────────────────────
function showShareModal(url, method = 'saved') {
  document.getElementById('share-url').value = url;
  document.getElementById('share-modal').classList.remove('hidden');
  document.querySelector('.share-title').textContent = method === 'updated' ? 'Sketch updated!' : 'Sketch saved!';
}

document.getElementById('share-close-btn').addEventListener('click', closeShareModal);
document.getElementById('share-done-btn').addEventListener('click', closeShareModal);
document.getElementById('share-backdrop').addEventListener('click', closeShareModal);

function closeShareModal() {
  document.getElementById('share-modal').classList.add('hidden');
}

document.getElementById('share-copy-btn').addEventListener('click', () => {
  const url = document.getElementById('share-url').value;
  navigator.clipboard.writeText(url).then(() => {
    document.getElementById('share-copy-btn').textContent = 'Copied!';
    setTimeout(() => { document.getElementById('share-copy-btn').textContent = 'Copy'; }, 2000);
  });
});

document.getElementById('share-open-btn').addEventListener('click', () => {
  window.open(document.getElementById('share-url').value, '_blank');
});

// ── Embed code ───────────────────────────────────────────────────────────────
document.getElementById('embed-btn').addEventListener('click', () => {
  const url = currentSketchId
    ? `${window.location.origin}/sketch/${currentSketchId}`
    : window.location.href.split('?')[0];
  const code = `<iframe src="${url}" width="800" height="600" frameborder="0" allow="fullscreen"></iframe>`;
  navigator.clipboard.writeText(code).then(() => showToast('Embed code copied!'));
});

// ── Export PNG ───────────────────────────────────────────────────────────────
document.getElementById('export-btn').addEventListener('click', async () => {
  const url = await graph.exportPNG(document.getElementById('annotation-canvas'));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'geosketch.png';
  a.click();
});

// ── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, duration = 2500) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.add('hidden'), duration);
}

// ── Load sketch from URL on startup ──────────────────────────────────────────
async function tryLoadFromUrl() {
  const match = window.location.pathname.match(/^\/sketch\/([0-9a-f-]{36})$/i);
  if (!match) return;

  const id = match[1];
  try {
    const res = await fetch(`/api/sketch/${id}`);
    if (!res.ok) throw new Error('Sketch not found');
    const { data } = await res.json();
    await loadSketchState(data);
    currentSketchId = id;

    // Show a subtle badge indicating this is a saved sketch
    const badge = document.getElementById('sketch-badge');
    badge.textContent = `Sketch ${id.slice(0, 8)}…`;
    badge.classList.remove('hidden');
  } catch (err) {
    showToast('Could not load sketch: ' + err.message, 4000);
  }
}

// Run after a brief delay so Plotly finishes its first render
setTimeout(tryLoadFromUrl, 500);

// ── Light / dark mode ────────────────────────────────────────────────────────
(function initTheme() {
  const saved = localStorage.getItem('gs-theme') || 'dark';
  applyTheme(saved);
})();

function applyTheme(theme) {
  document.documentElement.classList.toggle('light', theme === 'light');
  graph.setTheme(theme);
  const btn = document.getElementById('theme-toggle');
  btn.textContent = theme === 'light' ? '🌙' : '☀️';
  btn.title = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
  localStorage.setItem('gs-theme', theme);
}

document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.classList.contains('light') ? 'dark' : 'light';
  applyTheme(next);
});

// ── Keyboard shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault(); annotations.undo(); return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault(); annotations.redo(); return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    document.getElementById('save-btn').click();
    return;
  }

  if (inInput) return;
  const map = { v: 'select', p: 'pen', t: 'text', e: 'eraser', d: 'point' };
  if (map[e.key]) document.querySelector(`.tool-btn[data-tool="${map[e.key]}"]`)?.click();
  if (e.key === '\\') toggleSidebar();
});
