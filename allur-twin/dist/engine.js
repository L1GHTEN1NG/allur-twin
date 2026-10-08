(function (root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else root.TwinEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const finite = n => Number.isFinite(Number(n)) ? Number(n) : 0;
  const sum = (rows, key) => rows.reduce((s, r) => s + finite(r[key]), 0);
  function metrics(record, stops = []) {
    if (!record) return null;
    return { ...record, defectPercent: record.actual > 0 ? record.defects / record.actual * 100 : 0,
      attainment: record.plan > 0 ? record.actual / record.plan * 100 : 0,
      good: Math.max(0, record.actual - record.defects), downtime: sum(stops.filter(s => s.stage === record.stage), 'minutes'),
      hourlyGood: record.hours > 0 ? (record.actual - record.defects) / record.hours : null };
  }
  function overview(records, stops) {
    const rows = records.map(r => metrics(r, stops));
    const final = rows.find(r => r.stage === 'assembly');
    return { rows, final, equipmentMinutes: sum(stops, 'minutes'), worstQuality: rows.reduce((w, r) => !w || r.defectPercent > w.defectPercent ? r : w, null),
      bottleneck: rows.filter(r => r.hourlyGood !== null).reduce((w, r) => !w || r.hourlyGood < w.hourlyGood ? r : w, null) };
  }
  function status(row, mode, limits) {
    if (mode === 'quality') return row.defectPercent > limits.defectPercent ? 'danger' : 'success';
    if (mode === 'downtime') return row.downtime > limits.criticalDowntimeMinutes ? 'danger' : row.downtime > 0 ? 'warning' : 'success';
    return row.attainment < 90 ? 'danger' : row.attainment < 100 ? 'warning' : 'success';
  }
  function alerts(records, stops, stages, limits) {
    const result = [];
    for (const row of records.map(r => metrics(r, stops))) {
      const name = stages.find(s => s.id === row.stage).name;
      if (row.defectPercent > limits.defectPercent) result.push({ stage: row.stage, type: 'danger', title: `${name}: брак ${row.defectPercent.toFixed(1)}%`, evidence: `${row.defects} из ${row.actual} изделий; допустимо ${limits.defectPercent}%.`, recommendation: row.stage === 'paint' ? 'Проверить подготовку поверхности и режим нанесения покрытия. Для установления причины нужны результаты осмотра.' : 'Проверить причины дефектов и журнал контроля качества.' });
      if (row.actual < row.plan) result.push({ stage: row.stage, type: 'warning', title: `${name}: отставание на ${row.plan - row.actual}`, evidence: `Факт ${row.actual}, план ${row.plan}; выполнение ${row.attainment.toFixed(1)}%.`, recommendation: 'Сопоставить отставание с остановками и доступностью комплектующих.' });
    }
    for (const stop of stops) result.push({ stage: stop.stage, type: stop.minutes > limits.criticalDowntimeMinutes ? 'danger' : stop.planned ? 'info' : 'warning', title: `${stop.equipment}: ${stop.minutes} мин`, evidence: stop.reason + (stop.planned ? ' · плановая остановка' : ''), recommendation: stop.planned ? 'Учесть плановое обслуживание при расчёте доступности.' : `Проверить восстановление оборудования. Порог критического оборудования — ${limits.criticalDowntimeMinutes} мин/сутки; критичность в исходных данных не указана.` });
    return result;
  }
  // Squarified treemap; zero values stay zero, the UI lists zero-value lines separately.
  function treemap(items, width, height) {
    const total = items.reduce((a, b) => a + Math.max(0, finite(b.value)), 0);
    if (!total || width <= 0 || height <= 0) return [];
    const work = items.filter(i => i.value > 0).map(i => ({ ...i, area: i.value / total * width * height })).sort((a, b) => b.area - a.area);
    let x = 0, y = 0, w = width, h = height, row = [], out = [];
    function worst(list, side) {
      if (!list.length || !side) return Infinity;
      const area = sum(list, 'area'), max = Math.max(...list.map(i => i.area)), min = Math.min(...list.map(i => i.area));
      return Math.max(side * side * max / (area * area), area * area / (side * side * min));
    }
    function layout() {
      const area = sum(row, 'area');
      if (w >= h) {
        const rw = area / h; let offset = y;
        row.forEach(i => { const rh = i.area / rw; out.push({ ...i, x, y: offset, width: rw, height: rh }); offset += rh; });
        x += rw; w = Math.max(0, w - rw);
      } else {
        const rh = area / w; let offset = x;
        row.forEach(i => { const rw = i.area / rh; out.push({ ...i, x: offset, y, width: rw, height: rh }); offset += rw; });
        y += rh; h = Math.max(0, h - rh);
      }
      row = [];
    }
    while (work.length) {
      const side = Math.min(w, h), next = work[0];
      if (!row.length || worst([...row, next], side) <= worst(row, side)) { row.push(work.shift()); }
      else layout();
    }
    if (row.length) layout();
    return out;
  }
  function simulate(input) {
    const stageIndex = ['weld', 'paint', 'assembly'].indexOf(input.stage);
    if (stageIndex < 0) throw new Error('Неизвестный участок');
    const rate = Math.max(1, Math.min(60, finite(input.rate) || 15));
    const horizon = Math.max(1, Math.min(24, finite(input.hours) || 8)) * 60;
    const start = Math.max(0, Math.min(horizon, input.startMinutes === undefined ? 120 : finite(input.startMinutes)));
    const duration = Math.max(0, Math.min(horizon - start, finite(input.stopMinutes)));
    const buffer = Math.max(0, Math.min(100, finite(input.buffer)));
    const downstreamBuffers = 2 - stageIndex;
    const stock = downstreamBuffers * buffer;
    const coverageMinutes = stock / rate * 60;
    function run(stopped) {
      let b1 = buffer, b2 = buffer, output = 0;
      const totals = [0, 0, 0], points = [{ minute: 0, value: 0 }];
      const step = .25;
      for (let minute = 0; minute < horizon; minute += step) {
        const dt = Math.min(step, horizon - minute);
        const overlap = stopped ? Math.max(0, Math.min(minute + dt, start + duration) - Math.max(minute, start)) : 0;
        const cap = [0, 1, 2].map(i => (dt - (i === stageIndex ? overlap : 0)) * rate / 60);
        const q1 = cap[0], q2 = Math.min(cap[1], b1 + q1), q3 = Math.min(cap[2], b2 + q2);
        b1 = Math.max(0, b1 + q1 - q2); b2 = Math.max(0, b2 + q2 - q3); output += q3;
        totals[0] += q1; totals[1] += q2; totals[2] += q3;
        const end = minute + dt;
        if (Math.abs(end % 5) < 1e-7 || end === horizon) points.push({ minute: end, value: output });
      }
      return { output, buffers: [b1, b2], totals, points };
    }
    const base = run(false), scenario = run(true);
    const baseline = base.output, lost = Math.max(0, base.output - scenario.output);
    const series = base.points.map((p, i) => ({ minute: p.minute, baseline: p.value, scenario: scenario.points[i].value }));
    return { stage: input.stage, rate, horizon, start, duration, buffer, downstreamBuffers, stock, coverageMinutes, lost, baseline, output: scenario.output, series,
      remainingBuffers: scenario.buffers, baseBuffers: base.buffers, stageTotals: scenario.totals, initialStock: 2 * buffer,
      bufferNeeded: downstreamBuffers ? Math.ceil(rate * duration / 60 / downstreamBuffers) : null };
  }
  function evidenceSummary(records, stops, stages) {
    const view = overview(records, stops);
    const final = view.final, worst = view.worstQuality;
    const name = id => stages.find(s => s.id === id).name;
    const parts = [];
    if (final) parts.push(`Выпуск сборки: ${final.actual} из ${final.plan}, выполнение плана ${final.attainment.toFixed(1)}%.`);
    if (worst) parts.push(`${name(worst.stage)}: наибольшая доля брака — ${worst.defectPercent.toFixed(1)}% (${worst.defects} из ${worst.actual}).`);
    if (stops.length) { const top = stops.reduce((a, b) => a.minutes > b.minutes ? a : b); parts.push(`Самая длительная зарегистрированная остановка: ${top.equipment}, ${top.minutes} мин, причина — ${top.reason.toLowerCase()}.`); }
    else parts.push('За выбранную запись остановки не зарегистрированы.');
    if (view.bottleneck) parts.push(`Самый низкий выпуск годных изделий на час работы — ${name(view.bottleneck.stage).toLowerCase()}: ${view.bottleneck.hourlyGood.toFixed(1)}. Это кандидат на узкое место для дополнительной проверки.`);
    return parts.join(' ');
  }
  return { metrics, overview, status, alerts, treemap, simulate, evidenceSummary };
});
