const test = require('node:test');
const assert = require('node:assert/strict');
const recurrence = require('../recurrence.js');

const currentWeek = new Date(2026, 8, 28); // Monday, 28 September 2026.

function task(title, date, repeat, extra = {}) {
  return {
    id: title.toLowerCase().replace(/[^a-z]+/g, '-'),
    title,
    date,
    recurrence: repeat,
    recurrenceStartDate: date,
    recurrenceStartWeek: '2026-09-21',
    anyDay: false,
    ...extra,
  };
}

test('unfinished recurring tasks are carried into the current week', () => {
  const examples = [
    ['Sofa blankets', '2026-09-22', 'biweekly', '2026-09-29', '2026-10-13'],
    ['Weeds', '2026-09-23', 'monthly', '2026-09-30', '2026-10-30'],
    ['Bed sheets', '2026-09-24', 'quarterly', '2026-10-01', '2027-01-01'],
    ['Fridge clean', '2026-09-25', 'weekly', '2026-10-02', '2026-10-09'],
  ];

  examples.forEach(([title, oldDate, repeat, carriedDate, nextDate]) => {
    const item = task(title, oldDate, repeat);
    assert.equal(recurrence.rollOverdueTask(item, currentWeek, () => false), true, title);
    assert.equal(item.date, carriedDate, `${title} should move to its weekday this week`);
    assert.equal(item.recurrenceStartDate, carriedDate, `${title} should move its recurrence anchor`);
    assert.equal(recurrence.matchesRecurringDate(recurrence.getRecurringAnchorDate(item), new Date(`${carriedDate}T00:00:00`), repeat), true);
    assert.equal(recurrence.matchesRecurringDate(recurrence.getRecurringAnchorDate(item), new Date(`${nextDate}T00:00:00`), repeat), true);
    assert.equal(recurrence.matchesRecurringDate(recurrence.getRecurringAnchorDate(item), new Date('2026-10-06T00:00:00'), repeat), false, `${title} should not appear every week`);
    assert.equal(recurrence.rollOverdueTask(item, currentWeek, () => false), false, `${title} should not move twice`);
  });
});

test('completed old occurrences are skipped without changing their interval', () => {
  const item = task('Water the plants', '2026-09-22', 'biweekly');
  const completed = (id, occurrenceDate) => id === item.id && occurrenceDate === '2026-09-22';

  assert.equal(recurrence.rollOverdueTask(item, currentWeek, completed), true);
  assert.equal(item.date, '2026-10-06');
  assert.equal(item.recurrenceStartDate, '2026-09-22');
  assert.equal(recurrence.matchesRecurringDate(recurrence.getRecurringAnchorDate(item), new Date('2026-10-06T00:00:00'), 'biweekly'), true);
  assert.equal(recurrence.matchesRecurringDate(recurrence.getRecurringAnchorDate(item), new Date('2026-09-29T00:00:00'), 'biweekly'), false);
});

test('unfinished recurring any-day tasks appear in the current week', () => {
  const item = task('Clean surfaces', '2026-09-21', 'monthly', {
    anyDay: true,
    anyDayDate: '2026-09-21',
    nextAnyDayDate: '2026-09-21',
  });

  assert.equal(recurrence.rollOverdueTask(item, currentWeek, () => false), true);
  assert.equal(item.nextAnyDayDate, '2026-09-28');
  assert.equal(item.recurrenceStartDate, '2026-09-28');
  assert.equal(recurrence.rollOverdueTask(item, currentWeek, () => false), false);
});
