/**
 * Tiny charts: zero-dependency, canvas-based.
 * Exports:
 *  - lineChart(canvas, labels[], values[], {color?, fill?, yFormatter?, xTickCount?})
 *  - barChart(canvas, labels[], values[], {color?, yFormatter?, xLabelRotation?})
 *  - clearChart(canvas)
 * Notes:
 *  - Labels are strings for the x-axis.
 *  - Values are numbers (NaN/undefined will be skipped).
 *  - Canvas elements will be auto-scaled for device pixel ratio.
 */

function setupCanvas(canvas) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssWidth = canvas.clientWidth || canvas.width;
  const cssHeight = canvas.clientHeight || canvas.height;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: cssWidth, height: cssHeight, dpr };
}

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

function computeRange(values) {
  const arr = values.filter(v => Number.isFinite(v));
  if (arr.length === 0) return { min: 0, max: 1 };
  let min = Math.min(...arr);
  let max = Math.max(...arr);
  if (min === max) {
    const pad = Math.abs(min || 1) * 0.1;
    min -= pad;
    max += pad;
  }
  return { min, max };
}

function drawGrid(ctx, x, y, w, h, yTicks, yFormatter) {
  ctx.save();
  ctx.strokeStyle = '#232a39';
  ctx.fillStyle = '#a3adc2';
  ctx.lineWidth = 1;

  const step = h / yTicks;
  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let i = 0; i <= yTicks; i++) {
    const yy = y + i * step;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();

    const tVal = 1 - i / yTicks;
    ctx.fillStyle = '#7d889e';
    const label = yFormatter ? yFormatter(tVal) : '';
    if (label) ctx.fillText(label, x - 6, yy);
  }
  ctx.restore();
}

function ticks(min, max, count) {
  const step = (max - min) / count;
  const arr = [];
  for (let i = 0; i <= count; i++) arr.push(min + step * i);
  return arr;
}

function defaultYFormatterFactory(min, max, count) {
  const tks = ticks(min, max, count);
  return (t) => {
    const idx = Math.round(t * count);
    const v = clamp(idx, 0, tks.length - 1);
    const val = tks[v];
    if (Math.abs(val) >= 1000) return (val / 1000).toFixed(1) + 'k';
    return String(Math.round(val));
  };
}

export function clearChart(canvas) {
  if (!canvas) return;
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
}

export function lineChart(canvas, labels, values, opts = {}) {
  if (!canvas) return;
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  // layout
  const leftPad = 46;
  const rightPad = 12;
  const topPad = 12;
  const bottomPad = 40;

  const plotX = leftPad;
  const plotY = topPad;
  const plotW = width - leftPad - rightPad;
  const plotH = height - topPad - bottomPad;

  const range = computeRange(values);
  const yMin = range.min;
  const yMax = range.max;

  // grid
  const yTicks = 4;
  const yFormatter = opts.yFormatter || defaultYFormatterFactory(yMin, yMax, yTicks);
  drawGrid(ctx, plotX, plotY, plotW, plotH, yTicks, yFormatter);

  // x labels
  ctx.save();
  ctx.fillStyle = '#7d889e';
  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const n = labels.length;
  const xTickCount = clamp(opts.xTickCount ?? 6, 2, 20);
  const step = Math.max(1, Math.floor(n / xTickCount));
  for (let i = 0; i < n; i += step) {
    const t = n <= 1 ? 0.5 : i / (n - 1);
    const xx = plotX + t * plotW;
    ctx.fillText(labels[i] ?? '', xx, plotY + plotH + 8);
  }
  ctx.restore();

  // line path
  ctx.save();
  ctx.strokeStyle = opts.color || '#4f7cff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const nValid = values.filter(v => Number.isFinite(v)).length;
  if (nValid === 0) {
    ctx.restore();
    return;
  }
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    const t = values.length <= 1 ? 0.5 : i / (values.length - 1);
    const xx = plotX + t * plotW;
    const yy = plotY + (1 - (v - yMin) / (yMax - yMin)) * plotH;
    if (ctx.currentPathEmpty || i === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  }
  ctx.stroke();

  if (opts.fill) {
    ctx.lineTo(plotX + plotW, plotY + plotH);
    ctx.lineTo(plotX, plotY + plotH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
    grad.addColorStop(0, 'rgba(79,124,255,0.25)');
    grad.addColorStop(1, 'rgba(79,124,255,0.02)');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // draw points
  ctx.fillStyle = opts.color || '#4f7cff';
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    const t = values.length <= 1 ? 0.5 : i / (values.length - 1);
    const xx = plotX + t * plotW;
    const yy = plotY + (1 - (v - yMin) / (yMax - yMin)) * plotH;
    ctx.beginPath();
    ctx.arc(xx, yy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function barChart(canvas, labels, values, opts = {}) {
  if (!canvas) return;
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  // layout
  const leftPad = 46;
  const rightPad = 12;
  const topPad = 12;
  const bottomPad = 60;

  const plotX = leftPad;
  const plotY = topPad;
  const plotW = width - leftPad - rightPad;
  const plotH = height - topPad - bottomPad;

  const range = computeRange(values);
  const yMin = Math.min(0, range.min);
  const yMax = Math.max(1, range.max);

  const yTicks = 4;
  const yFormatter = opts.yFormatter || defaultYFormatterFactory(yMin, yMax, yTicks);
  drawGrid(ctx, plotX, plotY, plotW, plotH, yTicks, yFormatter);

  // bars
  const n = values.length;
  const gap = 8;
  const barW = Math.max(4, (plotW - gap * (n - 1)) / n);

  ctx.save();
  ctx.fillStyle = opts.color || '#27c093';
  for (let i = 0; i < n; i++) {
    const v = Number.isFinite(values[i]) ? values[i] : 0;
    const x = plotX + i * (barW + gap);
    const y0 = plotY + (1 - (0 - yMin) / (yMax - yMin)) * plotH;
    const yVal = plotY + (1 - (v - yMin) / (yMax - yMin)) * plotH;
    const h = y0 - yVal;
    ctx.fillRect(x, h >= 0 ? yVal : y0, barW, Math.abs(h));
  }
  ctx.restore();

  // x labels
  ctx.save();
  ctx.fillStyle = '#7d889e';
  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif';
  const rotate = opts.xLabelRotation ? (Math.PI / 180) * opts.xLabelRotation : 0;
  for (let i = 0; i < n; i++) {
    const x = plotX + i * (barW + gap) + barW / 2;
    const y = plotY + plotH + 8;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotate);
    ctx.textAlign = rotate ? 'right' : 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(labels[i] ?? '', 0, 0);
    ctx.restore();
  }
  ctx.restore();
}
