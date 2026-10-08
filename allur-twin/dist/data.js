(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.TwinData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const stages = [
    { id: 'weld', name: 'Сварка', line: 'Сварка-1', short: 'СВ', code: '01', description: 'Сварка кузова и проверка соединений.' },
    { id: 'paint', name: 'Окраска', line: 'Окраска-1', short: 'ОК', code: '02', description: 'Подготовка поверхности, нанесение покрытия и сушка.' },
    { id: 'assembly', name: 'Сборка', line: 'Сборка-1', short: 'СБ', code: '03', description: 'Сборка автомобиля перед итоговым контролем качества.' }
  ];
  const records = [
    { date: '2026-10-01', stage: 'weld', plan: 120, actual: 118, hours: 7.8, load: 98, defects: 2 },
    { date: '2026-10-01', stage: 'paint', plan: 120, actual: 115, hours: 7.5, load: 94, defects: 4 },
    { date: '2026-10-01', stage: 'assembly', plan: 120, actual: 121, hours: 8, load: 100, defects: 1 },
    { date: '2026-10-02', stage: 'weld', plan: 120, actual: 111, hours: 7.2, load: 91, defects: 3 },
    { date: '2026-10-02', stage: 'paint', plan: 120, actual: 116, hours: 7.7, load: 96, defects: 6 },
    { date: '2026-10-02', stage: 'assembly', plan: 120, actual: 119, hours: 7.9, load: 99, defects: 2 }
  ];
  const downtime = [
    { date: '2026-10-01', stage: 'weld', equipment: 'ABB-01', reason: 'Ошибка датчика', minutes: 25, planned: false },
    { date: '2026-10-01', stage: 'paint', equipment: 'Камера-02', reason: 'Замена фильтра', minutes: 40, planned: false },
    { date: '2026-10-02', stage: 'assembly', equipment: 'Конвейер-03', reason: 'Обрыв цепи', minutes: 55, planned: false },
    { date: '2026-10-02', stage: 'weld', equipment: 'ABB-04', reason: 'Плановое ТО', minutes: 30, planned: true }
  ];
  const monthlyPlan = [ { model: 'Chevrolet Onix', plan: 2500 }, { model: 'Chevrolet Cobalt', plan: 1800 }, { model: 'JAC J7', plan: 500 } ];
  const limits = { defectPercent: 2, criticalDowntimeMinutes: 60, oeePercent: 85, monthlyUnits: 5500 };
  const assetNames = {
    weld: ['ABB-01', 'ABB-02', 'ABB-03', 'ABB-04', 'Пост сварки-05', 'Контроль швов'],
    paint: ['Камера-01', 'Камера-02', 'Камера-03', 'Камера-04', 'Печь сушки', 'Контроль покрытия'],
    assembly: ['Конвейер-03', 'Пост двигателя', 'Пост электрики', 'Пост салона', 'Пост колёс', 'Выходной пост']
  };
  const demoEvents = [
    { time: '09:00', stage: 'paint', title: 'Окраска: повышенный брак', detail: 'Тестовый поток показывает отклонение качества покрытия.', type: 'danger' },
    { time: '09:10', stage: 'weld', title: 'ABB-01: ошибка датчика', detail: 'Сварочная ячейка остановлена. Начало демонстрационного простоя.', type: 'danger' },
    { time: '09:20', stage: 'assembly', title: 'Сборка: расходуется буфер', detail: 'В модели сокращается запас кузовов перед сборкой.', type: 'warning' },
    { time: '09:30', stage: 'weld', title: 'ABB-01: работа восстановлена', detail: 'Остановка завершена, линия возвращается к штатному режиму.', type: 'success' },
    { time: '09:40', stage: 'paint', title: 'Окраска: корректировка режима', detail: 'Демонстрационный сценарий уменьшает долю дефектных изделий.', type: 'success' },
    { time: '09:50', stage: 'assembly', title: 'Сборка: выпуск восстановлен', detail: 'Последний шаг сценария. Сводка доступна по всем событиям.', type: 'success' }
  ];
  function demoSnapshot(step) {
    step = Math.max(0, Math.min(5, Number(step) || 0));
    const plan = 50 + step * 10;
    const facts = [Math.round(plan * (step === 1 || step === 2 ? .86 : .96)), Math.round(plan * .92), Math.round(plan * (step === 2 ? .88 : .94))];
    const bad = [1 + Math.floor(step / 2), [4, 4, 5, 5, 5, 5][step], 1];
    const rows = stages.map((s, i) => ({ date: 'demo', stage: s.id, plan, actual: facts[i], hours: 3 + step / 6, load: [step === 1 || step === 2 ? 78 : 96, 92, step === 2 ? 84 : 98][i], defects: bad[i] }));
    const stops = step > 0 ? [{ date: 'demo', stage: 'weld', equipment: 'ABB-01', reason: 'Ошибка датчика (симуляция)', minutes: step === 1 ? 10 : 20, planned: false }] : [];
    return { records: rows, downtime: stops, events: demoEvents.slice(0, step + 1), step, time: demoEvents[step].time, source: 'demo' };
  }
  return { stages, records, downtime, monthlyPlan, limits, assetNames, demoEvents, demoSnapshot };
});
