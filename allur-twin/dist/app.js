(function () {
  'use strict';
  const D = window.TwinData, E = window.TwinEngine;
  const $ = id => document.getElementById(id);
  const fmt = (n, digits = 1) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  const html = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stageName = id => D.stages.find(s => s.id === id)?.name || id;
  const statusText = { success: 'В норме', warning: 'Внимание', danger: 'Отклонение' };
  const modes = { quality: { description: 'Площадь — число изделий с браком. Цвет — превышение нормы 2%.', metric: r => r.defects, value: r => `${fmt(r.defectPercent)}%`, note: r => `${r.defects} из ${r.actual} с браком` },
    downtime: { description: 'Площадь — сумма минут остановок оборудования участка. Цвет — обзорный сигнал.', metric: r => r.downtime, value: r => `${fmt(r.downtime)} мин`, note: r => 'Оборудование-минуты' },
    plan: { description: 'Площадь — план участка. Цвет — выполнение плана.', metric: r => r.plan, value: r => `${fmt(r.attainment)}%`, note: r => `Факт ${r.actual} / план ${r.plan}` } };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('allur-twin-preferences') || '{}'); } catch { /* A locked storage does not prevent the app working. */ }
  const state = { source: 'case', date: ['2026-10-01', '2026-10-02'].includes(saved.date) ? saved.date : '2026-10-02', metric: modes[saved.metric] ? saved.metric : 'quality', view: 'map', selected: 'paint', equipment: null, step: 0,
    sim: { stage: 'paint', stopMinutes: 30, buffer: 4, rate: 15, hours: 8 } };
  let timer = null, resizeFrame = null, toastTimer;
  function persist() { try { localStorage.setItem('allur-twin-preferences', JSON.stringify({ date: state.date, metric: state.metric })); } catch { /* Optional UI preference. */ } }
  function snapshot() {
    return state.source === 'demo' ? D.demoSnapshot(state.step) : { records: D.records.filter(r => r.date === state.date), downtime: D.downtime.filter(r => r.date === state.date), source: 'case' };
  }
  function currentRow() { const s = snapshot(); return E.metrics(s.records.find(r => r.stage === state.selected), s.downtime); }
  function setView(view) {
    state.view = view;
    document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === view); if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    ['map', 'flow', 'simulation'].forEach(v => $('view-' + v).hidden = v !== view);
    $('breadcrumb-view').textContent = { map: 'Карта завода', flow: 'Производство', simulation: 'Что будет, если…' }[view];
    if (view === 'map') drawMap();
    if (view === 'simulation') renderSimulation();
  }
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, 3200); }
  function selectStage(id, equipment = null) {
    state.selected = id; state.equipment = equipment;
    renderDetail(); renderFlow(); drawMap();
  }
  function assetData(stage) {
    const row = E.metrics(snapshot().records.find(r => r.stage === stage), snapshot().downtime);
    return D.assetNames[stage].map((name, i) => {
      const stopped = stage === 'weld' && i === 0 && (state.step === 1 || state.step === 2);
      const qualityProblem = stage === 'paint' && i < 2 && state.step < 4;
      return { name, load: stopped ? 0 : Math.max(0, Math.min(100, row.load - (i * 3 % 11))), status: stopped || qualityProblem && i === 0 ? 'danger' : qualityProblem ? 'warning' : 'success', stopped };
    });
  }
  function drawMap() {
    if (state.view !== 'map') return;
    const map = $('treemap'), s = snapshot(), rows = E.overview(s.records, s.downtime).rows, mode = modes[state.metric];
    const demo = state.source === 'demo';
    map.classList.toggle('demo-map', demo);
    $('map-description').textContent = demo ? 'Площадь — план. Заголовки — выбранный показатель. Ячейки — демо-загрузка и события оборудования.' : mode.description;
    $('map-count').textContent = demo ? '18 демо-ячеек' : '3 линии';
    const rect = map.getBoundingClientRect();
    if (!rect.width) return;
    const items = rows.map(r => ({ id: r.stage, value: demo ? r.plan : mode.metric(r), row: r }));
    const positions = E.treemap(items, rect.width, rect.height);
    map.innerHTML = positions.map(p => {
      const r = p.row, stage = D.stages.find(st => st.id === p.id), status = E.status(r, state.metric, D.limits);
      const small = p.width < 150 || p.height < 130, tiny = p.width < 95 || p.height < 65;
      const style = `left:${p.x}px;top:${p.y}px;width:${p.width}px;height:${p.height}px`;
      const common = `tile ${status} ${state.selected === p.id ? 'is-selected' : ''} ${small ? 'small-tile' : ''} ${tiny ? 'tiny-tile' : ''}`;
      if (demo) return `<div class="${common} demo-tile" style="${style}"><button type="button" class="tile-header" data-stage="${p.id}" aria-label="${stage.name}, ${mode.value(r)}"><span>${stage.name}</span><strong>${mode.value(r)}</strong></button><div class="asset-grid">${assetData(p.id).map(a => `<button type="button" class="asset-cell asset-${a.status} ${state.equipment === a.name && state.selected === p.id ? 'selected-asset' : ''}" data-stage="${p.id}" data-equipment="${html(a.name)}" aria-label="Демо: ${html(a.name)}, ${a.stopped ? 'остановлено' : `загрузка ${a.load}%`}"><span>${html(a.name)}</span><strong>${a.stopped ? 'СТОП' : a.load + '%'}</strong></button>`).join('')}</div></div>`;
      return `<button type="button" class="${common}" style="${style}" data-stage="${p.id}" aria-pressed="${state.selected === p.id}" aria-label="${stage.name}, ${mode.value(r)}, ${mode.note(r)}, ${statusText[status]}"><span class="tile-badge">${stage.line}</span><span class="tile-status">${statusText[status]}</span><span class="tile-content"><span class="tile-name">${stage.name}</span><span class="tile-value">${mode.value(r)}</span><span class="tile-meta">${mode.note(r)}</span></span></button>`;
    }).join('');
    if (!positions.length) map.innerHTML = '<div class="map-empty">За эту запись показатель равен нулю на всех участках.</div>';
    const zeros = items.filter(i => i.value === 0);
    $('zero-lines').hidden = !zeros.length;
    $('zero-lines').innerHTML = zeros.map(z => `<button class="zero-button" type="button" data-stage="${z.id}">${stageName(z.id)} · ${mode.value(z.row)}</button>`).join('');
    map.querySelectorAll('[data-stage]').forEach(b => b.addEventListener('click', () => selectStage(b.dataset.stage, b.dataset.equipment || null)));
    $('zero-lines').querySelectorAll('[data-stage]').forEach(b => b.addEventListener('click', () => selectStage(b.dataset.stage)));
  }
  function renderDetail() {
    const row = currentRow(), stage = D.stages.find(s => s.id === state.selected);
    if (!row) return;
    const status = E.status(row, state.metric, D.limits);
    const qBad = row.defectPercent > D.limits.defectPercent;
    const stop = snapshot().downtime.filter(s => s.stage === row.stage);
    const asset = state.equipment && state.source === 'demo' ? assetData(row.stage).find(a => a.name === state.equipment) : null;
    $('stage-detail').innerHTML = `<div class="detail-top"><span class="stage-code">УЧАСТОК / ${stage.code}</span><span class="status-pill ${status}">${statusText[status]}</span></div><h2>${html(asset ? asset.name : stage.name)}</h2><p class="detail-description">${asset ? 'Демо оборудования · участок ' + stage.name : stage.description}</p><div class="detail-metrics"><div><div class="detail-metric-heading"><span>План / факт участка</span><strong>${row.plan} / ${row.actual}</strong></div><div class="meter-track"><div class="meter-fill" style="width:${Math.min(100, row.attainment)}%"></div></div></div><div><div class="detail-metric-heading"><span>Брак участка</span><strong class="${qBad ? 'danger-text' : 'success-text'}">${fmt(row.defectPercent)}%</strong></div><div class="meter-track"><div class="meter-fill ${qBad ? 'danger' : ''}" style="width:${Math.min(100, row.defectPercent / 10 * 100)}%"></div></div></div><div><div class="detail-metric-heading"><span>${asset ? 'Демо-загрузка ячейки' : 'Загрузка из источника'}</span><strong>${asset ? asset.load : row.load}%</strong></div><div class="meter-track"><div class="meter-fill" style="width:${asset ? asset.load : row.load}%"></div></div></div></div><div class="detail-grid"><div><span>Годных изделий участка</span><strong>${row.good}</strong></div><div><span>Время работы</span><strong>${fmt(row.hours)} ч</strong></div><div><span>С браком</span><strong>${row.defects} изделий</strong></div><div><span>Остановки оборудования</span><strong>${row.downtime} мин</strong></div></div><div class="detail-evidence">${asset ? '<strong>Синтетическая ячейка.</strong> Показатели нагрузки и состояние заданы сценарием; числовые показатели выпуска выше относятся ко всему участку.' : qBad ? `<strong>Превышение на ${fmt(row.defectPercent - 2)} п.п.</strong> Норма брака ≤2%. Проверить причины дефектов; связь с остановками требует подтверждения.` : stop.length ? `<strong>${html(stop[0].equipment)}.</strong> ${html(stop[0].reason)} — ${stop[0].minutes} мин. Это зарегистрированная остановка оборудования.` : '<strong>Брак в пределах нормы.</strong> Остановки за выбранную запись не зарегистрированы.'}</div><button type="button" class="button detail-action" id="detail-simulate">Смоделировать остановку</button>`;
    $('detail-simulate').addEventListener('click', () => { state.sim.stage = state.selected; syncSimInputs(); setView('simulation'); $('sim-stage').focus(); });
  }
  function renderKpis(s) {
    const v = E.overview(s.records, s.downtime), p = v.rows.find(r => r.stage === 'paint');
    $('kpi-output').innerHTML = `${v.final.actual} <span>авто</span>`;
    $('kpi-output-note').textContent = `План ${v.final.plan} · ${fmt(v.final.attainment)}%`;
    $('kpi-quality').innerHTML = `${fmt(p.defectPercent)} <span>% брака</span>`;
    $('kpi-quality').classList.toggle('danger-text', p.defectPercent > 2);
    $('kpi-quality').classList.toggle('success-text', p.defectPercent <= 2);
    $('kpi-quality-note').textContent = `${p.defects} из ${p.actual} · норма ≤ 2%`;
    $('kpi-downtime').innerHTML = `${v.equipmentMinutes} <span>мин</span>`;
  }
  function renderHistory() {
    const demo = state.source === 'demo';
    const entries = demo ? Array.from({ length: state.step + 1 }, (_, i) => { const s = D.demoSnapshot(i), r = s.records.find(r => r.stage === 'assembly'); return { label: s.time, plan: r.plan, actual: r.actual }; }) : D.records.filter(r => r.stage === 'assembly').map(r => ({ label: r.date.slice(8) + '.10', plan: r.plan, actual: r.actual }));
    const max = Math.max(...entries.map(r => Math.max(r.plan, r.actual))) * 1.12;
    $('history-caption').textContent = demo ? 'Синтетический поток' : 'Два дня из кейса';
    $('history-chart').innerHTML = entries.map(r => `<div class="history-row"><span>${r.label}</span><div class="history-bar-track" role="img" aria-label="${r.label}: факт ${r.actual}, план ${r.plan}"><div class="history-bar" style="width:${r.actual / max * 100}%"></div><div class="history-target" style="left:${r.plan / max * 100}%"></div></div><strong>${r.actual}</strong></div>`).join('') + '<p class="history-note">Зелёный — факт выпуска · отметка — план.</p>';
  }
  function renderFlow() {
    const s = snapshot(), v = E.overview(s.records, s.downtime);
    const flows = [{ name: 'Комплектующие', code: '01', detail: 'Склад · данных о запасах нет' }, ...D.stages.map((st, i) => ({ ...st, code: '0' + (i + 2), row: v.rows.find(r => r.stage === st.id) })), { name: 'Контроль качества', code: '05', detail: 'Итоговая проверка · нет данных' }, { name: 'Готовая продукция', code: '06', detail: 'Склад · данных об остатках нет' }];
    $('flow-chain').innerHTML = flows.map(f => {
      const selected = f.id === state.selected, status = f.row ? E.status(f.row, 'quality', D.limits) : '';
      const tag = f.row ? 'button' : 'div', attrs = f.row ? `type="button" data-stage="${f.id}" aria-pressed="${selected}"` : '';
      return `<${tag} ${attrs} class="flow-node ${status} ${selected ? 'is-selected' : ''}"><span class="node-number">ЭТАП ${f.code}</span><h3>${f.name}</h3><div class="node-metric">${f.row ? f.row.actual : '—'}</div><p class="node-detail">${f.row ? `План ${f.row.plan} · брак ${fmt(f.row.defectPercent)}%` : f.detail}</p></${tag}>`;
    }).join('');
    $('flow-chain').querySelectorAll('[data-stage]').forEach(b => b.addEventListener('click', () => selectStage(b.dataset.stage)));
    const selected = v.rows.find(r => r.stage === state.selected);
    $('flow-note').innerHTML = `<strong>${stageName(state.selected)}:</strong> ${selected.actual} обработанных изделий, ${selected.good} годных, ${fmt(selected.hourlyGood)} годных/ч работы. Разница выпуска соседних этапов может быть связана с запасом незавершённого производства. Запасы в источнике не указаны.`;
    $('downtime-list').innerHTML = s.downtime.length ? s.downtime.map(st => `<div class="stop-row"><div><strong>${html(st.equipment)}</strong><p>${stageName(st.stage)} · ${html(st.reason)}</p></div><span class="stop-time">${st.minutes} мин</span></div>`).join('') : '<p class="empty-note">За эту запись остановки не зарегистрированы.</p>';
    const b = v.bottleneck, max = Math.max(...v.rows.map(r => r.hourlyGood));
    $('bottleneck-card').innerHTML = `<div class="bottleneck-content"><div class="bottleneck-title">${stageName(b.stage)} <span class="warning-text">${fmt(b.hourlyGood)} / ч</span></div><p>Минимум годных изделий на час работы среди трёх участков. Это сигнал для проверки производительности, а не подтверждённая причина ограничения потока.</p><div class="bottleneck-bars">${v.rows.map(r => `<div class="bottleneck-bar"><span>${stageName(r.stage)}</span><div class="meter-track"><div class="meter-fill" style="width:${r.hourlyGood / max * 100}%"></div></div><strong>${fmt(r.hourlyGood)}</strong></div>`).join('')}</div></div>`;
  }
  function renderAlerts(s) {
    const demo = state.source === 'demo';
    const list = demo ? s.events.map(ev => ({ ...ev, evidence: ev.detail, recommendation: 'Событие задано демонстрационным сценарием. Откройте карту оборудования или модель остановки.' })).reverse() : E.alerts(s.records, s.downtime, D.stages, D.limits);
    $('alerts-heading').textContent = demo ? 'Лента демонстрационных событий' : 'Отклонения и события';
    $('alerts-subtitle').textContent = demo ? 'Шесть событий для демонстрации обновлений без подключения к заводу.' : 'Наблюдаемые факты и действия для проверки.';
    $('alerts-count').textContent = list.length;
    $('alerts-list').innerHTML = list.map(a => `<article class="alert-item"><span class="alert-sign ${a.type}" aria-hidden="true">${a.type === 'success' ? '✓' : a.type === 'info' ? 'i' : '!'}</span><div><h3>${a.time ? `<span class="alert-time">${a.time}</span>` : ''}${html(a.title)}</h3><p>${html(a.evidence)}</p><details><summary>Что проверить</summary><p>${html(a.recommendation)}</p></details></div></article>`).join('');
  }
  function render() {
    const s = snapshot(), demo = state.source === 'demo';
    $('date-select').value = state.date; $('source-select').value = state.source;
    $('date-field').hidden = demo; $('demo-toolbar').hidden = !demo;
    $('source-banner').classList.toggle('is-demo', demo);
    $('source-banner').querySelector('.source-badge').textContent = demo ? 'ДЕМОНСТРАЦИЯ' : 'ИСХОДНЫЕ ДАННЫЕ';
    $('source-message').textContent = demo ? 'Синтетические показатели и оборудование. Один шаг сценария каждые 5 секунд при запуске.' : 'Записи за выбранную дату из приложения к кейсу. Подключение к заводу не настроено.';
    if (demo) { $('demo-time').textContent = s.time; $('demo-progress').textContent = `Событие ${state.step + 1} / 6`; $('demo-next').disabled = state.step === 5; }
    document.querySelectorAll('[data-metric]').forEach(b => { b.classList.toggle('active', b.dataset.metric === state.metric); b.setAttribute('aria-pressed', String(b.dataset.metric === state.metric)); });
    renderKpis(s); drawMap(); renderDetail(); renderHistory(); renderFlow(); renderAlerts(s);
    $('summary-text').textContent = E.evidenceSummary(s.records, s.downtime, D.stages);
    if (state.view === 'simulation') renderSimulation();
  }
  function stopPlayback() { if (timer) clearInterval(timer); timer = null; $('demo-play').textContent = state.step === 5 ? 'Повторить поток' : 'Запустить поток'; }
  function nextDemo() { if (state.step < 5) state.step += 1; if (state.step === 5) stopPlayback(); render(); }
  function syncSimInputs() { $('sim-stage').value = state.sim.stage; $('sim-stop').value = state.sim.stopMinutes; $('sim-buffer').value = state.sim.buffer; $('sim-rate').value = state.sim.rate; if ($('sim-rate-error')) $('sim-rate-error').hidden = true; $('sim-rate').setAttribute('aria-invalid', 'false'); }
  function renderSimulation() {
    const result = E.simulate(state.sim);
    $('sim-stop-value').textContent = `${state.sim.stopMinutes} мин`;
    $('sim-buffer-value').textContent = `${state.sim.buffer} шт.`;
    $('sim-baseline').textContent = fmt(result.baseline);
    $('sim-output').textContent = fmt(result.output);
    $('sim-loss').textContent = fmt(result.lost);
    $('sim-loss').classList.toggle('success-text', result.lost < .01);
    $('sim-loss').classList.toggle('danger-text', result.lost >= .01);
    const support = result.downstreamBuffers ? `Запас ${result.stock} шт. в ${result.downstreamBuffers === 1 ? 'буфере после остановленного участка' : 'двух буферах после остановленного участка'} может поддерживать поток до ${fmt(result.coverageMinutes)} мин.` : 'После сборки в модели нет этапа, который может компенсировать её остановку.';
    $('sim-interpretation').innerHTML = `<strong>${stageName(result.stage)} · остановка ${result.duration} мин.</strong> ${support} ${result.lost < .01 ? 'Запас защищает выпуск текущей смены, но расходуется.' : `Расчётная потеря выпуска сборки — ≈${fmt(result.lost)} условных изделий.`} Это результат модели, а не прогноз по истории завода.`;
    $('sim-buffers').innerHTML = [['Сварка → окраска', 0], ['Окраска → сборка', 1]].map(([label, i]) => `<div><span>${label} · запас к концу смены</span><strong>${fmt(result.remainingBuffers[i])} шт. <span class="inline-muted"> / исходно ${result.buffer}</span></strong></div>`).join('');
    drawSimChart(result);
  }
  function drawSimChart(r) {
    const node = $('sim-chart'), width = Math.max(280, node.clientWidth - 30), height = 245, margins = { left: 48, right: 18, top: 20, bottom: 40 }, w = width - margins.left - margins.right, h = height - margins.top - margins.bottom;
    const x = minute => margins.left + minute / r.horizon * w;
    const y = value => margins.top + h - value / Math.max(1, r.baseline * 1.08) * h;
    const path = key => r.series.map((p, i) => `${i ? 'L' : 'M'}${x(p.minute).toFixed(2)},${y(p[key]).toFixed(2)}`).join(' ');
    const ticks = [0, .25, .5, .75, 1];
    const grid = ticks.map(t => `<line x1="${margins.left}" y1="${y(r.baseline * t)}" x2="${width - margins.right}" y2="${y(r.baseline * t)}" stroke="#303a48"/><text x="${margins.left - 8}" y="${y(r.baseline * t) + 4}" fill="#a1adbd" text-anchor="end">${fmt(r.baseline * t, 0)}</text><text x="${x(r.horizon * t)}" y="${height - 17}" fill="#a1adbd" text-anchor="middle">${fmt(r.horizon / 60 * t)} ч</text>`).join('');
    node.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="sim-chart-title sim-chart-desc"><title id="sim-chart-title">Накопленный выпуск сборки за смену</title><desc id="sim-chart-desc">Базовый выпуск ${fmt(r.baseline)}, сценарный ${fmt(r.output)}, потеря ${fmt(r.lost)}. Остановка ${stageName(r.stage)} на ${r.duration} минут.</desc><g font-family="Segoe UI,Arial,sans-serif" font-size="12">${grid}<rect x="${x(r.start)}" y="${margins.top}" width="${Math.max(0, x(r.start + r.duration) - x(r.start))}" height="${h}" fill="#efcb88" opacity=".1"/><path d="${path('baseline')}" fill="none" stroke="#aab5c5" stroke-width="2" stroke-dasharray="5 4"/><path d="${path('scenario')}" fill="none" stroke="#6ed4b2" stroke-width="2.5"/><circle cx="${x(r.horizon)}" cy="${y(r.output)}" r="3.5" fill="#6ed4b2"/><text x="${margins.left}" y="12" fill="#a1adbd">Выпуск, усл. шт.</text></g></svg>`;
  }
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('[data-metric]').forEach(b => b.addEventListener('click', () => { state.metric = b.dataset.metric; persist(); render(); }));
  $('source-select').addEventListener('change', e => { stopPlayback(); state.source = e.target.value; state.equipment = null; state.step = 0; render(); });
  $('date-select').addEventListener('change', e => { state.date = e.target.value; state.equipment = null; persist(); render(); });
  $('demo-next').addEventListener('click', nextDemo);
  $('demo-reset').addEventListener('click', () => { stopPlayback(); state.step = 0; render(); });
  $('demo-play').addEventListener('click', () => { if (timer) return stopPlayback(); if (state.step === 5) { state.step = 0; render(); } $('demo-play').textContent = 'Пауза'; timer = setInterval(nextDemo, 5000); });
  $('copy-summary').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('summary-text').textContent); toast('Сводка скопирована'); } catch { toast('Выделите текст сводки и скопируйте его вручную'); } });
  $('open-data').addEventListener('click', () => $('data-dialog').showModal());
  $('open-data-top').addEventListener('click', () => $('data-dialog').showModal());
  $('close-data').addEventListener('click', () => $('data-dialog').close());
  $('close-data-bottom').addEventListener('click', () => $('data-dialog').close());
  $('data-dialog').addEventListener('click', e => { if (e.target === $('data-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
  $('sim-rate').insertAdjacentHTML('afterend', '<p id="sim-rate-error" class="input-error" role="alert" hidden></p>');
  $('sim-rate').setAttribute('aria-describedby', 'sim-rate-error');
  ['sim-stage', 'sim-stop', 'sim-buffer', 'sim-rate'].forEach(id => $(id).addEventListener('input', () => {
    const validRate = $('sim-rate').value !== '' && $('sim-rate').validity.valid;
    $('sim-rate').setAttribute('aria-invalid', String(!validRate));
    $('sim-rate-error').hidden = validRate;
    $('sim-rate-error').textContent = `Введите целое число от 1 до 60. Расчёт использует последнюю корректную скорость: ${state.sim.rate} изделий/ч.`;
    state.sim = { ...state.sim, stage: $('sim-stage').value, stopMinutes: Number($('sim-stop').value), buffer: Number($('sim-buffer').value), rate: validRate ? Number($('sim-rate').value) : state.sim.rate }; renderSimulation();
  }));
  $('sim-reset').addEventListener('click', () => { state.sim = { stage: 'paint', stopMinutes: 30, buffer: 4, rate: 15, hours: 8 }; syncSimInputs(); $('sim-rate-error').hidden = true; $('sim-rate').setAttribute('aria-invalid', 'false'); renderSimulation(); });
  const observer = new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => { drawMap(); if (state.view === 'simulation') drawSimChart(E.simulate(state.sim)); }); });
  observer.observe($('treemap')); observer.observe($('sim-chart'));
  window.addEventListener('pagehide', stopPlayback);
  syncSimInputs(); render();
})();
