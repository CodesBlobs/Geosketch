// Text labels stored in graph data-coordinates so they reproject correctly
// when the user pans or zooms.

export class TextLabels {
  constructor(layerId, plotEl) {
    this.layer  = document.getElementById(layerId);
    this.plotEl = plotEl;
    this.labels = []; // { id, el, text, x, y }  — x,y are data coords
  }

  // screenX/Y come from the click position inside the canvas-container.
  addLabel(text, screenX, screenY) {
    const { x, y } = this._screenToData(screenX, screenY);
    const xa = this.plotEl._fullLayout?.xaxis;
    const baseRange = xa ? Math.abs(xa.range[1] - xa.range[0]) : 20;
    const id = Date.now() + Math.random();
    const el = this._createElement(text, id);
    el.style.left = screenX + 'px';
    el.style.top  = screenY + 'px';
    this.layer.appendChild(el);

    const entry = { id, el, text, x, y, baseRange, baseFontSize: 14 };
    this.labels.push(entry);
    this._makeDraggable(el, entry);
    return id;
  }

  // Call this after every pan/zoom so labels snap back to their graph point.
  reproject() {
    const xa = this.plotEl._fullLayout?.xaxis;
    const currentRange = xa ? Math.abs(xa.range[1] - xa.range[0]) : 20;
    for (const label of this.labels) {
      const { sx, sy } = this._dataToScreen(label.x, label.y);
      label.el.style.left = sx + 'px';
      label.el.style.top  = sy + 'px';
      const scale = (label.baseRange || 20) / currentRange;
      const fontSize = Math.max(6, Math.min(80, (label.baseFontSize || 14) * scale));
      label.el.style.fontSize = fontSize + 'px';
    }
  }

  removeLabel(id) {
    const i = this.labels.findIndex(l => l.id === id);
    if (i !== -1) { this.labels[i].el.remove(); this.labels.splice(i, 1); }
  }

  // Returns labels in data-coordinate format for serialisation.
  getLabels() {
    return this.labels.map(l => ({ text: l.text, x: l.x, y: l.y, baseRange: l.baseRange, baseFontSize: l.baseFontSize }));
  }

  loadLabels(labels) {
    [...this.labels].forEach(l => l.el.remove());
    this.labels = [];
    for (const l of labels) {
      if (l.x !== undefined && l.y !== undefined && typeof l.x === 'number' && typeof l.y === 'number'
          && Math.abs(l.x) < 1e6 && Math.abs(l.y) < 1e6) {
        // New format: data coordinates.
        const { sx, sy } = this._dataToScreen(l.x, l.y);
        const id = Date.now() + Math.random();
        const el = this._createElement(l.text, id);
        el.style.left = sx + 'px';
        el.style.top  = sy + 'px';
        this.layer.appendChild(el);
        const entry = { id, el, text: l.text, x: l.x, y: l.y, baseRange: l.baseRange || 20, baseFontSize: l.baseFontSize || 14 };
        this.labels.push(entry);
        this._makeDraggable(el, entry);
      }
    }
  }

  clearAll() {
    [...this.labels].forEach(l => l.el.remove());
    this.labels = [];
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────

  _screenToData(sx, sy) {
    const xa = this.plotEl._fullLayout?.xaxis;
    const ya = this.plotEl._fullLayout?.yaxis;
    if (!xa || !ya) return { x: sx, y: sy };
    return {
      x: xa.range[0] + (sx - xa._offset) / xa._length * (xa.range[1] - xa.range[0]),
      y: ya.range[1] - (sy - ya._offset) / ya._length * (ya.range[1] - ya.range[0]),
    };
  }

  _dataToScreen(x, y) {
    const xa = this.plotEl._fullLayout?.xaxis;
    const ya = this.plotEl._fullLayout?.yaxis;
    if (!xa || !ya) return { sx: x, sy: y };
    return {
      sx: xa._offset + (x - xa.range[0]) / (xa.range[1] - xa.range[0]) * xa._length,
      sy: ya._offset + (ya.range[1] - y) / (ya.range[1] - ya.range[0]) * ya._length,
    };
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────

  _createElement(text, id) {
    const el = document.createElement('div');
    el.className = 'text-label';
    el.dataset.text = text;
    el.appendChild(document.createTextNode(text));

    const del = document.createElement('button');
    del.className = 'delete-label';
    del.innerHTML = '×';
    del.addEventListener('click', e => { e.stopPropagation(); this.removeLabel(id); });
    el.appendChild(del);
    return el;
  }

  _makeDraggable(el, entry) {
    let startX, startY, origLeft, origTop, dragging = false;

    el.addEventListener('pointerdown', e => {
      if (e.target.classList.contains('delete-label')) return;
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      origLeft = parseFloat(el.style.left) || 0;
      origTop  = parseFloat(el.style.top)  || 0;
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    el.addEventListener('pointermove', e => {
      if (!dragging) return;
      const newLeft = origLeft + (e.clientX - startX);
      const newTop  = origTop  + (e.clientY - startY);
      el.style.left = newLeft + 'px';
      el.style.top  = newTop  + 'px';
      // Keep data coords in sync as the label is dragged.
      const { x, y } = this._screenToData(newLeft, newTop);
      entry.x = x;
      entry.y = y;
    });

    el.addEventListener('pointerup', () => { dragging = false; });
  }
}
