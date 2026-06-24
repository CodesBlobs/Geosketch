import Plotly from 'plotly.js-dist-min';
import { compile } from 'mathjs';

const PLOT_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#34495e', '#e91e63', '#00bcd4'
];

const SCOPE = { e: Math.E, pi: Math.PI, PI: Math.PI, tau: 2 * Math.PI };

const THEMES = {
  dark: {
    bg: '#0d1020', grid: '#1e2235', zeroline: '#3a4060',
    axis: '#2e3247', muted: '#7c84a8',
  },
  light: {
    bg: '#f7f8ff', grid: '#e2e4f0', zeroline: '#b0b4cc',
    axis: '#d0d3e8', muted: '#626882',
  },
};

function buildLayout(theme = 'dark') {
  const t = THEMES[theme] || THEMES.dark;
  const axisBase = {
    color: t.axis,
    gridcolor: t.grid,
    zerolinecolor: t.zeroline,
    zerolinewidth: 2,
    tickcolor: t.axis,
    tickfont: { color: t.muted },
  };
  return {
    paper_bgcolor: t.bg,
    plot_bgcolor: t.bg,
    font: { color: t.muted, size: 11 },
    margin: { l: 40, r: 20, t: 20, b: 40 },
    xaxis: { ...axisBase, range: [-10, 10] },
    yaxis: { ...axisBase, range: [-10, 10], scaleanchor: 'x', scaleratio: 1 },
    showlegend: false,
    dragmode: 'pan',
    hovermode: false,
    annotations: [],
    modebar: { remove: ['lasso2d', 'select2d', 'autoScale2d', 'resetScale2d', 'hoverClosestCartesian', 'hoverCompareCartesian', 'toggleSpikelines'] },
  };
}

function normalise(expr) {
  if (!expr) return expr;
  const sup = { '⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9' };
  expr = expr.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, m => '^' + [...m].map(c => sup[c]).join(''));
  expr = expr.replace(/(\d)([a-zA-Z])/g, '$1*$2');
  expr = expr.replace(/(\d)\(/g, '$1*(');
  expr = expr.replace(/\)\(/g, ')*(');
  return expr;
}

function _fmt(v) {
  if (!isFinite(v)) return v > 0 ? '+∞' : '−∞';
  if (v === 0) return '0';
  const abs = Math.abs(v);
  // Trim to 4 sig figs, strip trailing zeros
  return parseFloat(v.toPrecision(4)).toString();
}

function safeCompile(expr) {
  try { return compile(normalise(expr)); } catch { return null; }
}

function safeEval(compiled, scope) {
  try {
    const v = compiled.evaluate(scope);
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  } catch { return null; }
}

export class GraphEngine {
  constructor(containerId) {
    this.el = document.getElementById(containerId);
    this.functions = [];
    this.strokes = [];          // { id, color, size, opacity, points:[{x,y}] }
    this.textAnnotations = [];  // { id, text, x, y }  — data coords
    this._strokeRedoStack = [];
    this.showGrid = true;
    this._theme = 'dark';
    this.layout = buildLayout('dark');
    this._dragging = false;
    // Track drag in capture phase so it's set before any child handlers fire
    window.addEventListener('mousedown', () => { this._dragging = true; },  true);
    window.addEventListener('mouseup',   () => { this._dragging = false; }, true);
    this._init();
    this._initHover();
  }

  _init() {
    Plotly.newPlot(this.el, [], this.layout, {
      responsive: true,
      displayModeBar: true,
      scrollZoom: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    });
  }

  // ── Custom smooth hover ───────────────────────────────────────────────────

  _initHover() {
    const container = this.el.parentElement;

    const tip = document.createElement('div');
    tip.className = 'graph-hover-tip';
    container.appendChild(tip);
    this._hoverTip = tip;

    this.hoverState = { active: false, x: 0, y: 0, snapped: false };

    // Use window capture-phase so Plotly's stopPropagation can't swallow the event
    window.addEventListener('mousemove', e => {
      if (this._dragging) {
        tip.style.display = 'none';
        this.hoverState.active = false;
        tip.style.borderColor = '';
        tip.style.color = '';
        return;
      }

      // Check cursor is inside the graph container
      const cRect = container.getBoundingClientRect();
      if (e.clientX < cRect.left || e.clientX > cRect.right ||
          e.clientY < cRect.top  || e.clientY > cRect.bottom) {
        tip.style.display = 'none';
        this.hoverState.active = false;
        return;
      }

      // sx/sy relative to the plot div (Plotly's _offset is also relative to this div)
      const pRect = this.el.getBoundingClientRect();
      const sx = e.clientX - pRect.left;
      const sy = e.clientY - pRect.top;

      const xa = this.el._fullLayout?.xaxis;
      const ya = this.el._fullLayout?.yaxis;
      if (!xa || !ya) return;

      // Only show inside the axes area
      if (sx < xa._offset || sx > xa._offset + xa._length ||
          sy < ya._offset || sy > ya._offset + ya._length) {
        tip.style.display = 'none';
        this.hoverState.active = false;
        return;
      }

      const { x, y } = this.screenToData(sx, sy);
      const snap = this.snapToCurve(x, y);

      this.hoverState = { active: true, x: snap.x, y: snap.y, snapped: snap.snapped };

      // Show snapped coordinates; highlight when on a curve
      tip.textContent = `x: ${_fmt(snap.x)}   y: ${_fmt(snap.y)}`;
      tip.style.borderColor = snap.snapped ? (snap.color || 'var(--accent)') : '';
      tip.style.color       = snap.snapped ? (snap.color || 'var(--accent)') : '';
      tip.style.display = 'block';

      const tipW = tip.offsetWidth || 130;
      const tipH = tip.offsetHeight || 22;
      tip.style.left = Math.min(sx + 14, xa._offset + xa._length - tipW - 4) + 'px';
      tip.style.top  = Math.max(sy - tipH - 6, ya._offset + 4) + 'px';
    }, true); // ← capture phase: fires before Plotly's stopPropagation
  }

  // ── Function management ───────────────────────────────────────────────────

  addFunction(config) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const fn = {
      id,
      type:  config.type  || 'cartesian',
      color: config.color || PLOT_COLORS[this.functions.length % PLOT_COLORS.length],
      visible: true,
      expr:  config.expr  ?? 'sin(x)',
      xExpr: config.xExpr ?? 'cos(t)',
      yExpr: config.yExpr ?? 'sin(t)',
      tMin:  Object.prototype.hasOwnProperty.call(config, 'tMin') ? config.tMin : -10,
      tMax:  Object.prototype.hasOwnProperty.call(config, 'tMax') ? config.tMax : 10,
      // Point-type fields
      px:    config.px    ?? '0',
      py:    config.py    ?? '0',
      label: config.label ?? '',
    };
    this.functions.push(fn);
    this._replot();
    return fn;
  }

  updateFunction(id, updates) {
    const fn = this.functions.find(f => f.id === id);
    if (fn) { Object.assign(fn, updates); this._replot(); }
  }

  removeFunction(id) {
    this.functions = this.functions.filter(f => f.id !== id);
    this._replot();
  }

  // ── Stroke management (pen drawings) ─────────────────────────────────────

  addStroke(stroke) {
    const s = { id: Date.now() + Math.random(), ...stroke };
    this.strokes.push(s);
    this._strokeRedoStack = [];
    this._replot();
    return s;
  }

  undoStroke() {
    if (this.strokes.length === 0) return;
    this._strokeRedoStack.push(this.strokes.pop());
    this._replot();
  }

  redoStroke() {
    if (this._strokeRedoStack.length === 0) return;
    this.strokes.push(this._strokeRedoStack.pop());
    this._replot();
  }

  // Remove any stroke that has a point within `radius` screen pixels of (sx, sy).
  eraseAt(sx, sy, radius) {
    const before = this.strokes.length;
    this.strokes = this.strokes.filter(stroke =>
      !stroke.points.some(p => {
        const { sx: px, sy: py } = this._dataToScreen(p.x, p.y);
        return Math.hypot(px - sx, py - sy) < radius;
      })
    );
    if (this.strokes.length !== before) {
      this._strokeRedoStack = [];
      this._replot();
    }
  }

  clearStrokes() {
    this.strokes = [];
    this._strokeRedoStack = [];
    this._replot();
  }

  // ── Text annotation management ────────────────────────────────────────────

  addTextAnnotation(text, x, y) {
    const id = Date.now() + Math.random();
    this.textAnnotations.push({ id, text, x, y });
    this._applyAnnotations();
    return id;
  }

  moveTextAnnotation(id, x, y) {
    const a = this.textAnnotations.find(a => a.id === id);
    if (a) { a.x = x; a.y = y; this._applyAnnotations(); }
  }

  removeTextAnnotation(id) {
    this.textAnnotations = this.textAnnotations.filter(a => a.id !== id);
    this._applyAnnotations();
  }

  clearTextAnnotations() {
    this.textAnnotations = [];
    this._applyAnnotations();
  }

  _applyAnnotations() {
    const t = THEMES[this._theme] || THEMES.dark;
    const anns = this.textAnnotations.map(a => ({
      x: a.x, y: a.y,
      text: a.text,
      showarrow: false,
      xanchor: 'left',
      yanchor: 'bottom',
      font: { color: this._theme === 'light' ? '#1a1d2e' : '#e8eaf6', size: 14, family: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
      bgcolor: this._theme === 'light' ? 'rgba(255,255,255,0.9)' : 'rgba(26,29,39,0.88)',
      bordercolor: t.axis,
      borderwidth: 1,
      borderpad: 5,
    }));
    this.layout.annotations = anns;
    Plotly.relayout(this.el, { annotations: anns });
  }

  // ── Snap: find closest cartesian curve at data x within threshold ─────────

  snapToCurve(x, y) {
    const ya = this.el._fullLayout?.yaxis;
    if (!ya) return { x, y, snapped: false };

    // 50-pixel snap zone converted to data-y units
    const thresh = 50 * Math.abs(ya.range[1] - ya.range[0]) / ya._length;

    let bestDist = thresh;
    let bestY = null;
    let bestColor = null;

    for (const fn of this.functions) {
      if (!fn.visible || fn.type !== 'cartesian') continue;
      const compiled = safeCompile(fn.expr);
      if (!compiled) continue;
      const fy = safeEval(compiled, { ...SCOPE, x });
      if (fy === null) continue;
      const dist = Math.abs(fy - y);
      if (dist < bestDist) { bestDist = dist; bestY = fy; bestColor = fn.color; }
    }

    return bestY !== null
      ? { x, y: bestY, snapped: true, color: bestColor }
      : { x, y, snapped: false, color: null };
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────

  screenToData(sx, sy) {
    const xa = this.el._fullLayout?.xaxis;
    const ya = this.el._fullLayout?.yaxis;
    if (!xa || !ya) return { x: 0, y: 0 };
    return {
      x: xa.range[0] + (sx - xa._offset) / xa._length * (xa.range[1] - xa.range[0]),
      y: ya.range[1] - (sy - ya._offset) / ya._length * (ya.range[1] - ya.range[0]),
    };
  }

  _dataToScreen(dx, dy) {
    const xa = this.el._fullLayout?.xaxis;
    const ya = this.el._fullLayout?.yaxis;
    if (!xa || !ya) return { sx: dx, sy: dy };
    return {
      sx: xa._offset + (dx - xa.range[0]) / (xa.range[1] - xa.range[0]) * xa._length,
      sy: ya._offset + (ya.range[1] - dy) / (ya.range[1] - ya.range[0]) * ya._length,
    };
  }

  // ── Trace builders ────────────────────────────────────────────────────────

  _buildTrace(fn) {
    switch (fn.type) {
      case 'parametric': return this._buildParametricTrace(fn);
      case 'polar':      return this._buildPolarTrace(fn);
      case 'implicit':   return this._buildImplicitTrace(fn);
      case 'point':      return this._buildPointTrace(fn);
      default:           return this._buildCartesianTrace(fn);
    }
  }

  _buildCartesianTrace(fn) {
    const { xmin, xmax } = this._getXRange();
    const N = 800;
    const compiled = safeCompile(fn.expr);
    if (!compiled) return null;

    const xs = [], ys = [];
    for (let i = 0; i <= N; i++) {
      const x = xmin + (xmax - xmin) * i / N;
      const y = safeEval(compiled, { ...SCOPE, x });
      if (y === null || Math.abs(y) > 1e10) { xs.push(x); ys.push(null); }
      else { xs.push(x); ys.push(y); }
    }
    return { x: xs, y: ys, type: 'scatter', mode: 'lines', line: { color: fn.color, width: 2.5 }, connectgaps: false,
      hoverinfo: 'none' };
  }

  _buildParametricTrace(fn) {
    if (!fn.xExpr?.trim()) return null;
    const cx = safeCompile(fn.xExpr);
    const cy = safeCompile(fn.yExpr?.trim() || 't');
    if (!cx || !cy) return null;

    let tMin = fn.tMin, tMax = fn.tMax;
    if (tMin === null || tMax === null) {
      const { xmin, xmax } = this._getXRange();
      const { ymin, ymax } = this._getYRange();
      tMin = Math.min(xmin, ymin);
      tMax = Math.max(xmax, ymax);
    }

    const N = 2000;
    const xs = [], ys = [];
    for (let i = 0; i <= N; i++) {
      const t = tMin + (tMax - tMin) * i / N;
      const x = safeEval(cx, { ...SCOPE, t });
      const y = safeEval(cy, { ...SCOPE, t });
      if (x === null || y === null) { xs.push(null); ys.push(null); }
      else { xs.push(x); ys.push(y); }
    }
    return { x: xs, y: ys, type: 'scatter', mode: 'lines', line: { color: fn.color, width: 2.5 }, connectgaps: false,
      hoverinfo: 'none' };
  }

  _buildPolarTrace(fn) {
    const cr = safeCompile(fn.expr);
    if (!cr) return null;

    const N = 1000;
    const xs = [], ys = [];
    for (let i = 0; i <= N; i++) {
      const theta = fn.tMin + (fn.tMax - fn.tMin) * i / N;
      const r = safeEval(cr, { ...SCOPE, theta, t: theta });
      if (r === null) { xs.push(null); ys.push(null); }
      else { xs.push(r * Math.cos(theta)); ys.push(r * Math.sin(theta)); }
    }
    return { x: xs, y: ys, type: 'scatter', mode: 'lines', line: { color: fn.color, width: 2.5 }, connectgaps: false,
      hoverinfo: 'none' };
  }

  _buildImplicitTrace(fn) {
    const compiled = safeCompile(fn.expr);
    if (!compiled) return null;

    const { xmin, xmax } = this._getXRange();
    const { ymin, ymax } = this._getYRange();
    const N = 150;
    const dx = (xmax - xmin) / N;
    const dy = (ymax - ymin) / N;

    const v = Array.from({ length: N + 1 }, (_, j) =>
      Array.from({ length: N + 1 }, (_, i) => {
        const val = safeEval(compiled, { ...SCOPE, x: xmin + i * dx, y: ymin + j * dy });
        return val === null ? NaN : val;
      })
    );

    const xs = [], ys = [];
    const lerp = (a, b, va, vb) => a + (b - a) * (va / (va - vb));

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const v00 = v[j][i], v10 = v[j][i + 1];
        const v01 = v[j + 1][i], v11 = v[j + 1][i + 1];
        if (isNaN(v00) || isNaN(v10) || isNaN(v01) || isNaN(v11)) continue;

        const x0 = xmin + i * dx,     x1 = xmin + (i + 1) * dx;
        const y0 = ymin + j * dy,     y1 = ymin + (j + 1) * dy;
        const pts = [];

        if ((v00 > 0) !== (v10 > 0)) pts.push([lerp(x0, x1, v00, v10), y0]);
        if ((v01 > 0) !== (v11 > 0)) pts.push([lerp(x0, x1, v01, v11), y1]);
        if ((v00 > 0) !== (v01 > 0)) pts.push([x0, lerp(y0, y1, v00, v01)]);
        if ((v10 > 0) !== (v11 > 0)) pts.push([x1, lerp(y0, y1, v10, v11)]);

        if (pts.length >= 2) {
          xs.push(pts[0][0], pts[1][0], null);
          ys.push(pts[0][1], pts[1][1], null);
          if (pts.length === 4) {
            xs.push(pts[2][0], pts[3][0], null);
            ys.push(pts[2][1], pts[3][1], null);
          }
        }
      }
    }

    return { x: xs, y: ys, type: 'scatter', mode: 'lines', line: { color: fn.color, width: 2 }, connectgaps: false,
      hoverinfo: 'none' };
  }

  _buildPointTrace(fn) {
    const cx = safeCompile(String(fn.px ?? 0));
    const cy = safeCompile(String(fn.py ?? 0));
    if (!cx || !cy) return null;
    const x = safeEval(cx, SCOPE);
    const y = safeEval(cy, SCOPE);
    if (x === null || y === null) return null;
    return {
      x: [x], y: [y],
      type: 'scatter',
      mode: 'markers+text',
      marker: { color: fn.color, size: 10, line: { color: fn.color, width: 2 } },
      text: fn.label ? [fn.label] : [`(${_fmt(x)}, ${_fmt(y)})`],
      textposition: 'top right',
      textfont: { color: fn.color, size: 12 },
      hoverinfo: 'none',
      showlegend: false,
    };
  }

  _buildStrokeTrace(stroke) {
    return {
      x: stroke.points.map(p => p.x),
      y: stroke.points.map(p => p.y),
      type: 'scatter',
      mode: 'lines',
      line: { color: stroke.color, width: stroke.size },
      opacity: stroke.opacity,
      connectgaps: false,
      hoverinfo: 'none',
      showlegend: false,
    };
  }

  // ── Range helpers ─────────────────────────────────────────────────────────

  _getXRange() {
    const r = this.el._fullLayout?.xaxis?.range;
    return r ? { xmin: r[0], xmax: r[1] } : { xmin: -10, xmax: 10 };
  }

  _getYRange() {
    const r = this.el._fullLayout?.yaxis?.range;
    return r ? { ymin: r[0], ymax: r[1] } : { ymin: -10, ymax: 10 };
  }

  // ── Core replot ───────────────────────────────────────────────────────────

  _replot() {
    const fnTraces = this.functions
      .filter(f => f.visible)
      .map(f => this._buildTrace(f))
      .filter(Boolean);
    const strokeTraces = this.strokes.map(s => this._buildStrokeTrace(s));
    Plotly.react(this.el, [...fnTraces, ...strokeTraces], this.layout, {
      responsive: true, displayModeBar: true, scrollZoom: true,
    });
  }

  // ── Other controls ────────────────────────────────────────────────────────

  resetView() {
    Plotly.relayout(this.el, { 'xaxis.range': [-10, 10], 'yaxis.range': [-10, 10] });
    setTimeout(() => this._replot(), 50);
  }

  toggleGrid() {
    this.showGrid = !this.showGrid;
    const t = THEMES[this._theme];
    const g = this.showGrid ? t.grid : 'transparent';
    Plotly.relayout(this.el, { 'xaxis.gridcolor': g, 'yaxis.gridcolor': g });
  }

  setTheme(theme) {
    this._theme = theme;
    const xr = this.el._fullLayout?.xaxis?.range ?? [-10, 10];
    const yr = this.el._fullLayout?.yaxis?.range ?? [-10, 10];
    this.layout = buildLayout(theme);
    this.layout.xaxis.range = [...xr];
    this.layout.yaxis.range = [...yr];
    this._replot();
    // Re-apply annotations with new theme colours
    this._applyAnnotations();
  }

  onRelayout(cb) { this.el.on('plotly_relayout', cb); }

  exportPNG(annotationCanvas) {
    return new Promise(resolve => {
      Plotly.toImage(this.el, { format: 'png', width: this.el.offsetWidth, height: this.el.offsetHeight })
        .then(plotUrl => {
          const canvas = document.createElement('canvas');
          canvas.width = this.el.offsetWidth;
          canvas.height = this.el.offsetHeight;
          const ctx = canvas.getContext('2d');
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0);
            ctx.drawImage(annotationCanvas, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          };
          img.src = plotUrl;
        });
    });
  }
}
