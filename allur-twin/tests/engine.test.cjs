const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../dist/engine.js');
const D = require('../dist/data.js');
const near = (actual, expected, epsilon = 1e-7) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
const source = D.records.filter(r => r.date === '2026-10-02');
const stops = D.downtime.filter(r => r.date === '2026-10-02');

test('Source metrics: paint quality and welding plan', () => {
  near(E.metrics(source.find(r => r.stage === 'paint')).defectPercent, 6 / 116 * 100);
  near(E.metrics(source.find(r => r.stage === 'weld')).attainment, 92.5);
});
test('Final output counts assembly once; downtime is equipment-minutes', () => {
  const view = E.overview(source, stops);
  assert.equal(view.final.actual, 119);
  assert.equal(view.equipmentMinutes, 85);
  assert.equal(view.bottleneck.stage, 'paint');
});
test('Detected quality violations have numerical evidence', () => {
  const all = E.alerts(source, stops, D.stages, D.limits);
  const quality = all.filter(a => a.title.includes('брак'));
  assert.deepEqual(quality.map(a => a.stage), ['weld', 'paint']);
  assert.match(quality.find(a => a.stage === 'paint').evidence, /6 из 116/);
});
test('Treemap areas preserve values, cover the canvas and do not overlap', () => {
  const items = [{ id: 'a', value: 6 }, { id: 'b', value: 3 }, { id: 'c', value: 2 }];
  for (const [w, h] of [[700, 340], [288, 320], [1120, 385]]) {
    const rects = E.treemap(items, w, h);
    near(rects.reduce((s, r) => s + r.width * r.height, 0), w * h);
    for (const a of rects) {
      near(a.width * a.height / (w * h), a.value / 11);
      assert.ok(a.x >= -1e-7 && a.y >= -1e-7 && a.x + a.width <= w + 1e-7 && a.y + a.height <= h + 1e-7);
      for (const b of rects) if (a.id !== b.id) assert.ok(Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) < 1e-7 || Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) < 1e-7);
    }
  }
});
test('Zero losses are not assigned fake area', () => {
  assert.deepEqual(E.treemap([{ id: 'a', value: 0 }], 300, 200), []);
  assert.equal(E.treemap([{ id: 'a', value: 3 }, { id: 'b', value: 0 }], 300, 200).length, 1);
});
test('No stop preserves baseline output and buffers', () => {
  for (const stage of ['weld', 'paint', 'assembly']) {
    const r = E.simulate({ stage, stopMinutes: 0, rate: 15, buffer: 4 });
    near(r.baseline, 120); near(r.output, r.baseline); near(r.lost, 0);
    r.remainingBuffers.forEach(b => near(b, 4));
  }
});
test('Buffers protect output differently at each production stage', () => {
  for (const [stage, output] of [['weld', 120], ['paint', 117.5], ['assembly', 112.5]]) {
    near(E.simulate({ stage, stopMinutes: 30, rate: 15, buffer: 5 }).output, output);
  }
});
test('Without buffers a 30-minute stop loses 7.5 units at every stage', () => {
  for (const stage of ['weld', 'paint', 'assembly']) near(E.simulate({ stage, stopMinutes: 30, rate: 15, buffer: 0 }).lost, 7.5);
});
test('Flow conservation, nonnegative buffers and output hold across scenarios', () => {
  for (const stage of ['weld', 'paint', 'assembly']) for (const rate of [1, 15, 60]) for (const buffer of [0, 4, 20]) for (const stopMinutes of [0, 30, 180]) {
    const r = E.simulate({ stage, rate, buffer, stopMinutes });
    near(r.initialStock + r.stageTotals[0], r.output + r.remainingBuffers[0] + r.remainingBuffers[1]);
    assert.ok(r.remainingBuffers.every(v => v >= 0));
    assert.ok(r.output >= 0 && r.output <= r.baseline + 1e-7);
    for (let i = 1; i < r.series.length; i++) assert.ok(r.series[i].scenario >= r.series[i - 1].scenario);
  }
});
test('Stop after shift end has no effect; duration clamps to shift end', () => {
  near(E.simulate({ stage: 'assembly', stopMinutes: 180, startMinutes: 500, rate: 15, buffer: 0 }).lost, 0);
  const r = E.simulate({ stage: 'assembly', stopMinutes: 60, startMinutes: 470, rate: 15, buffer: 0 });
  assert.equal(r.duration, 10); near(r.lost, 2.5);
});
test('Unknown stage is rejected', () => assert.throws(() => E.simulate({ stage: 'missing' }), /Неизвестный участок/));
test('Demo cumulative production and defect counts never decrease', () => {
  for (let i = 1; i < 6; i++) {
    const prev = D.demoSnapshot(i - 1), next = D.demoSnapshot(i);
    next.records.forEach((r, j) => { assert.ok(r.actual >= prev.records[j].actual); assert.ok(r.defects >= prev.records[j].defects); assert.ok(r.defects <= r.actual); });
    assert.equal(next.events.length, i + 1);
  }
});
