// Annotation layer — canvas is used only for live drawing while the user drags.
// On pointer-up the completed stroke is handed to GraphEngine which renders it
// as a Plotly scatter trace, so it moves perfectly with pan/zoom.

export class AnnotationLayer {
  constructor(canvasId, graphEngine) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.graph = graphEngine;

    this.current = null; // live stroke in progress (screen coords)

    this.penColor   = '#e74c3c';
    this.penSize    = 3;
    this.penOpacity = 1.0;
    this.eraserSize = 20;

    this.active = false;
    this.tool   = 'pen'; // 'pen' | 'line' | 'eraser'

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  // Called after pan/zoom so the live canvas (if mid-stroke) stays clean.
  clearLive() {
    const { offsetWidth: w, offsetHeight: h } = this.canvas.parentElement;
    this.ctx.clearRect(0, 0, w, h);
  }

  // ── Tool activation ────────────────────────────────────────────────────────

  setActive(active) {
    this.active = active;
    this.canvas.style.pointerEvents = active ? 'all' : 'none';
    this.canvas.style.cursor = active
      ? (this.tool === 'eraser' ? 'cell' : 'crosshair')
      : 'default';
  }

  setTool(tool) {
    this.tool = tool;
    if (this.active) this.canvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
  }

  // ── Pointer events ─────────────────────────────────────────────────────────

  onPointerDown(e) {
    if (!this.active) return;
    const { x, y } = this._pos(e);
    if (this.tool === 'eraser') { this.graph.eraseAt(x, y, this.eraserSize / 2); return; }
    // Store screen coords during live drawing — convert to data coords on commit.
    this.current = {
      color: this.penColor, size: this.penSize, opacity: this.penOpacity,
      screenPts: [{ x, y }],
    };
    this.canvas.setPointerCapture(e.pointerId);
  }

  onPointerMove(e) {
    if (!this.active) return;
    const { x, y } = this._pos(e);
    if (this.tool === 'eraser' && e.buttons > 0) {
      this.graph.eraseAt(x, y, this.eraserSize / 2);
      return;
    }
    if (!this.current || e.buttons === 0) return;
    this.current.screenPts.push({ x, y });
    if (this.tool === 'line') {
      this._drawLineLive();
    } else {
      this._drawLiveSegment();
    }
  }

  onPointerUp() {
    if (this.current && this.current.screenPts.length > 1) {
      let pts = this.current.screenPts;
      if (this.tool === 'line') {
        // Only keep start and end — produces a perfectly straight segment
        pts = [pts[0], pts[pts.length - 1]];
      }
      const points = pts.map(p => this.graph.screenToData(p.x, p.y));
      this.graph.addStroke({
        color: this.current.color,
        size:  this.current.size,
        opacity: this.current.opacity,
        points,
      });
      this.clearLive();
    }
    this.current = null;
  }

  // ── Undo / redo — delegated to graph engine ────────────────────────────────

  undo() { this.graph.undoStroke(); }
  redo() { this.graph.redoStroke(); }
  clearAll() { this.graph.clearStrokes(); }

  // ── Internal helpers ───────────────────────────────────────────────────────

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _drawLiveSegment() {
    const pts = this.current.screenPts;
    if (pts.length < 2) return;
    const p0 = pts[pts.length - 2];
    const p1 = pts[pts.length - 1];
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = this.current.opacity;
    ctx.strokeStyle = this.current.color;
    ctx.lineWidth = this.current.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.restore();
  }

  _drawLineLive() {
    const pts = this.current.screenPts;
    const start = pts[0];
    const end = pts[pts.length - 1];
    // Clear first so the preview always shows the current straight line
    this.clearLive();
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = this.current.opacity;
    ctx.strokeStyle = this.current.color;
    ctx.lineWidth = this.current.size;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  _resize() {
    const parent = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const w = parent.offsetWidth;
    const h = parent.offsetHeight;
    this.canvas.width  = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width  = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.scale(dpr, dpr);
  }

  getCanvas() { return this.canvas; }
}
