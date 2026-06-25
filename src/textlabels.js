// Text labels stored in graph data-coordinates so they reproject correctly
// when the user pans or zooms.

import katex from 'katex';
import 'katex/dist/katex.min.css';

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>');
}

// Render text with $...$ (inline) and $$...$$ (display) math via KaTeX.
function renderMath(text) {
  const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$)/);
  let html = '';
  for (const part of parts) {
    if (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) {
      try {
        html += katex.renderToString(part.slice(2, -2), { displayMode: true, throwOnError: false });
      } catch { html += escapeHtml(part); }
    } else if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      try {
        html += katex.renderToString(part.slice(1, -1), { displayMode: false, throwOnError: false });
      } catch { html += escapeHtml(part); }
    } else {
      html += escapeHtml(part);
    }
  }
  return html;
}

export class TextLabels {
  constructor(layerId, plotEl) {
    this.layer  = document.getElementById(layerId);
    this.plotEl = plotEl;
    this.labels = []; // { id, el, text, x, y, baseRange, baseFontSize, labelWidth }
  }

  addLabel(text, screenX, screenY) {
    const { x, y } = this._screenToData(screenX, screenY);
    const xa = this.plotEl._fullLayout?.xaxis;
    const baseRange = xa ? Math.abs(xa.range[1] - xa.range[0]) : 20;
    const id = Date.now() + Math.random();
    const entry = { id, el: null, text, x, y, baseRange, baseFontSize: 14, labelWidth: null };
    const el = this._createElement(entry);
    entry.el = el;
    el.style.left = screenX + 'px';
    el.style.top  = screenY + 'px';
    this.layer.appendChild(el);
    this.labels.push(entry);
    this._makeDraggable(el, entry);
    return id;
  }

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

  getLabels() {
    return this.labels.map(l => ({
      text: l.text, x: l.x, y: l.y,
      baseRange: l.baseRange, baseFontSize: l.baseFontSize, labelWidth: l.labelWidth,
    }));
  }

  loadLabels(labels) {
    [...this.labels].forEach(l => l.el.remove());
    this.labels = [];
    for (const l of labels) {
      if (l.x !== undefined && l.y !== undefined && typeof l.x === 'number' && typeof l.y === 'number'
          && Math.abs(l.x) < 1e6 && Math.abs(l.y) < 1e6) {
        const { sx, sy } = this._dataToScreen(l.x, l.y);
        const id = Date.now() + Math.random();
        const entry = {
          id, el: null, text: l.text, x: l.x, y: l.y,
          baseRange: l.baseRange || 20, baseFontSize: l.baseFontSize || 14, labelWidth: l.labelWidth || null,
        };
        const el = this._createElement(entry);
        entry.el = el;
        el.style.left = sx + 'px';
        el.style.top  = sy + 'px';
        if (entry.labelWidth) { el.style.width = entry.labelWidth + 'px'; }
        this.layer.appendChild(el);
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

  _renderContent(el, text) {
    const content = el.querySelector('.text-label-content');
    if (content) content.innerHTML = renderMath(text);
  }

  _startInlineEdit(el, entry) {
    const content = el.querySelector('.text-label-content');
    if (!content || el.querySelector('.text-label-edit')) return;

    const textarea = document.createElement('textarea');
    textarea.className = 'text-label-edit';
    textarea.value = entry.text;
    textarea.rows = Math.max(1, entry.text.split('\n').length);
    content.replaceWith(textarea);
    textarea.focus();
    textarea.select();

    const commit = () => {
      const newText = textarea.value;
      entry.text = newText;
      el.dataset.text = newText;
      const newContent = document.createElement('span');
      newContent.className = 'text-label-content';
      newContent.innerHTML = renderMath(newText);
      textarea.replaceWith(newContent);
    };

    const cancel = () => {
      const newContent = document.createElement('span');
      newContent.className = 'text-label-content';
      newContent.innerHTML = renderMath(entry.text);
      textarea.replaceWith(newContent);
    };

    textarea.addEventListener('blur', commit);
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); textarea.removeEventListener('blur', commit); cancel(); }
    });
  }

  _createElement(entry) {
    const el = document.createElement('div');
    el.className = 'text-label';
    el.dataset.text = entry.text;

    const content = document.createElement('span');
    content.className = 'text-label-content';
    content.innerHTML = renderMath(entry.text);
    el.appendChild(content);

    const del = document.createElement('button');
    del.className = 'delete-label';
    del.innerHTML = '×';
    del.addEventListener('click', e => { e.stopPropagation(); this.removeLabel(entry.id); });
    el.appendChild(del);

    // E handle — horizontal width resize
    const handleE = document.createElement('div');
    handleE.className = 'resize-handle resize-e';
    el.appendChild(handleE);

    // S handle — vertical font-size resize
    const handleS = document.createElement('div');
    handleS.className = 'resize-handle resize-s';
    el.appendChild(handleS);

    // SE handle — proportional font-size resize
    const handleSE = document.createElement('div');
    handleSE.className = 'resize-handle resize-se';
    el.appendChild(handleSE);

    // Double-click to edit
    el.addEventListener('dblclick', e => {
      if (e.target.closest('.delete-label') || e.target.closest('.resize-handle')) return;
      e.stopPropagation();
      this._startInlineEdit(el, entry);
    });

    return el;
  }

  _makeDraggable(el, entry) {
    let dragging = false, startX = 0, startY = 0, origLeft = 0, origTop = 0;

    // ── E handle: horizontal width ──────────────────────────────────────────
    const handleE = el.querySelector('.resize-e');
    let resizingE = false, resizeEStartX = 0, resizeEStartW = 0;

    handleE.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      resizingE = true;
      resizeEStartX = e.clientX;
      resizeEStartW = parseFloat(el.style.width) || el.offsetWidth;
      handleE.setPointerCapture(e.pointerId);
    });
    handleE.addEventListener('pointermove', e => {
      if (!resizingE) return;
      const w = Math.max(60, resizeEStartW + (e.clientX - resizeEStartX));
      entry.labelWidth = w;
      el.style.width = w + 'px';
    });
    handleE.addEventListener('pointerup', () => { resizingE = false; });

    // ── S handle: vertical font size ────────────────────────────────────────
    const handleS = el.querySelector('.resize-s');
    let resizingS = false, resizeSStartY = 0, resizeSStartSize = 14;

    handleS.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      resizingS = true;
      resizeSStartY = e.clientY;
      resizeSStartSize = entry.baseFontSize || 14;
      handleS.setPointerCapture(e.pointerId);
    });
    handleS.addEventListener('pointermove', e => {
      if (!resizingS) return;
      const newSize = Math.max(8, Math.min(120, resizeSStartSize + (e.clientY - resizeSStartY) * 0.4));
      entry.baseFontSize = newSize;
      el.style.fontSize = newSize + 'px';
    });
    handleS.addEventListener('pointerup', () => { resizingS = false; });

    // ── SE handle: proportional font size ───────────────────────────────────
    const handleSE = el.querySelector('.resize-se');
    let resizingSE = false, resizeSEStartY = 0, resizeSEStartSize = 14;

    handleSE.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      resizingSE = true;
      resizeSEStartY = e.clientY;
      resizeSEStartSize = entry.baseFontSize || 14;
      handleSE.setPointerCapture(e.pointerId);
    });
    handleSE.addEventListener('pointermove', e => {
      if (!resizingSE) return;
      const newSize = Math.max(8, Math.min(120, resizeSEStartSize + (e.clientY - resizeSEStartY) * 0.4));
      entry.baseFontSize = newSize;
      el.style.fontSize = newSize + 'px';
    });
    handleSE.addEventListener('pointerup', () => { resizingSE = false; });

    // ── Drag to move ────────────────────────────────────────────────────────
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.delete-label') || e.target.closest('.resize-handle')) return;
      if (el.querySelector('.text-label-edit')) return; // editing — don't drag
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
      const { x, y } = this._screenToData(newLeft, newTop);
      entry.x = x; entry.y = y;
    });
    el.addEventListener('pointerup', () => { dragging = false; });
  }
}
