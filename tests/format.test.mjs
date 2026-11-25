import test from 'node:test';
import assert from 'node:assert/strict';
import { dayMonth, monthKey, monthTitle, rangeLabel, relativeLabel, todayIso } from '../src/lib/format.js';

test('dayMonth e monthKey formattano correttamente le date ISO', () => {
  const dm = dayMonth('2027-01-09');
  assert.equal(dm.day, '09');
  assert.equal(dm.month.toLowerCase(), 'gen');
  assert.equal(monthKey('2027-01-09'), '2027-01');
  assert.match(monthTitle('2027-01'), /Gennaio 2027/i);
});

test('rangeLabel gestisce singolo giorno e intervallo', () => {
  const single = rangeLabel({ dateStart: '2027-01-09', dateEnd: '2027-01-09' });
  const multi = rangeLabel({ dateStart: '2027-01-09', dateEnd: '2027-01-10' });
  assert.ok(!single.includes('–'));
  assert.ok(multi.includes('–'));
});

test('relativeLabel classifica eventi passati e futuri', () => {
  assert.equal(relativeLabel({ dateStart: '2020-01-01', dateEnd: '2020-01-02' }), 'Conclusa');
  const today = todayIso();
  assert.equal(relativeLabel({ dateStart: today, dateEnd: today }), 'In corso');
  assert.equal(relativeLabel({ dateStart: '2099-12-31', dateEnd: '2099-12-31' }).startsWith('Tra '), true);
});
