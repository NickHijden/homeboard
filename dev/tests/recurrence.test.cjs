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

function anyDayTask(repeat = 'weekly', extra = {}) {
  return task('Synthetic laundry', '2026-10-05', repeat, {
    anyDay: true,
    anyDayDate: '2026-10-05',
    nextAnyDayDate: '2026-10-05',
    recurrenceStartWeek: '2026-10-05',
    updatedAt: '2026-10-09T12:00:00Z',
    ...extra,
  });
}

function legacyCompletion(item, extra = {}) {
  return {
    id: 'synthetic-completion',
    taskId: item.id,
    title: item.title,
    completedDate: '2026-10-06',
    completedAt: '2026-10-06T12:00:00Z',
    updatedAt: '2026-10-06T12:00:00Z',
    ...extra,
  };
}

test('legacy completion history repairs a newer stale task without losing its interval', () => {
  const examples = [
    ['weekly', '2026-10-12'],
    ['biweekly', '2026-10-19'],
    ['monthly', '2026-11-05'],
    ['quarterly', '2027-01-05'],
  ];
  examples.forEach(([repeat, nextDate]) => {
    const item = anyDayTask(repeat);
    const history = [legacyCompletion(item)];
    assert.equal(recurrence.reconcileAnyDayTask(item, history), true, repeat);
    assert.equal(item.nextAnyDayDate, nextDate, repeat);
    assert.equal(item.recurrenceStartDate, '2026-10-05');
    assert.equal(recurrence.reconcileAnyDayTask(item, history), false, 'repair is idempotent');
    assert.equal(recurrence.rollOverdueTask(item, new Date(2026, 9, 5), () => false), false);
  });
});

test('duplicate legacy completions in a week do not consume future occurrences', () => {
  const item = anyDayTask();
  const history = [legacyCompletion(item), legacyCompletion(item, { id: 'duplicate', completedDate: '2026-10-07' })];
  recurrence.reconcileAnyDayTask(item, history);
  assert.equal(item.nextAnyDayDate, '2026-10-12');
  assert.equal(recurrence.matchesRecurringDate(new Date(`${item.nextAnyDayDate}T00:00:00`), new Date(2026, 9, 12), 'weekly'), true);
});

test('task IDs keep two identically named chores independent', () => {
  const first = anyDayTask();
  const second = anyDayTask('weekly', { id: 'second-laundry' });
  const history = [legacyCompletion(first)];
  assert.equal(recurrence.reconcileAnyDayTask(first, history), true);
  assert.equal(recurrence.reconcileAnyDayTask(second, history), false);
  assert.equal(second.nextAnyDayDate, '2026-10-05');
});

test('a genuine later occurrence remains due despite earlier history', () => {
  const item = anyDayTask();
  const history = [legacyCompletion(item)];
  recurrence.reconcileAnyDayTask(item, history);
  assert.equal(recurrence.rollOverdueTask(item, new Date(2026, 9, 12), () => false), false);
  assert.equal(recurrence.reconcileAnyDayTask(item, history), false);
  assert.equal(item.nextAnyDayDate, '2026-10-12');
});

test('an explicit schedule change starts a new completion history boundary', () => {
  const item = anyDayTask('weekly', { anyDayScheduleUpdatedAt: '2026-10-08T12:00:00Z' });
  assert.equal(recurrence.reconcileAnyDayTask(item, [legacyCompletion(item)]), false);
  assert.equal(item.nextAnyDayDate, '2026-10-05');
  const newerCompletion = legacyCompletion(item, { completedDate: '2026-10-09', completedAt: '2026-10-09T12:00:00Z' });
  assert.equal(recurrence.reconcileAnyDayTask(item, [newerCompletion]), true);
  assert.equal(item.nextAnyDayDate, '2026-10-12');
});

test('explicit completed occurrences preserve the due date even when checked off early', () => {
  const item = anyDayTask('monthly', {
    recurrenceStartDate: '2026-10-31',
    anyDayDate: '2026-10-31',
    nextAnyDayDate: '2026-10-31',
  });
  const history = [legacyCompletion(item, {
    occurrenceDate: '2026-10-31',
    nextAnyDayDate: '2026-11-30',
    recurrence: 'monthly',
  })];
  recurrence.reconcileAnyDayTask(item, history);
  assert.equal(item.nextAnyDayDate, '2026-11-30');
});

test('legacy history preserves a scheduled occurrence later in its completion week', () => {
  const item = anyDayTask('monthly', {
    recurrenceStartDate: '2026-09-30',
    anyDayDate: '2026-09-30',
    nextAnyDayDate: '2026-10-30',
  });
  recurrence.reconcileAnyDayTask(item, [legacyCompletion(item, { completedDate: '2026-10-28' })]);
  assert.equal(item.nextAnyDayDate, '2026-11-30');
});

test('legacy completion of an overdue task uses its carried week', () => {
  const item = anyDayTask('monthly', {
    recurrenceStartDate: '2026-09-21',
    anyDayDate: '2026-09-21',
    nextAnyDayDate: '2026-09-21',
  });
  recurrence.reconcileAnyDayTask(item, [legacyCompletion(item)]);
  assert.equal(item.nextAnyDayDate, '2026-11-05');
});

test('history never moves a later cursor backward and merging order does not matter', () => {
  const historyItem = anyDayTask();
  const history = [legacyCompletion(historyItem), legacyCompletion(historyItem, {
    id: 'next-week', completedDate: '2026-10-13', completedAt: '2026-10-13T12:00:00Z',
    occurrenceDate: '2026-10-12', nextAnyDayDate: '2026-10-19', recurrence: 'weekly',
  })];
  const left = anyDayTask();
  const right = anyDayTask();
  recurrence.reconcileAnyDayTask(left, history);
  recurrence.reconcileAnyDayTask(right, history.slice().reverse());
  assert.equal(left.nextAnyDayDate, '2026-10-19');
  assert.equal(right.nextAnyDayDate, left.nextAnyDayDate);
  left.nextAnyDayDate = '2026-10-26';
  assert.equal(recurrence.reconcileAnyDayTask(left, history), false);
  assert.equal(left.nextAnyDayDate, '2026-10-26');
});

test('one-time any-day tasks also honor surviving completion history', () => {
  const item = anyDayTask('none');
  assert.equal(recurrence.reconcileAnyDayTask(item, [legacyCompletion(item)]), true);
  assert.equal(item.anyDayCompleted, true);
  assert.equal(recurrence.reconcileAnyDayTask(item, [legacyCompletion(item)]), false);
});

test('unrelated, malformed and older-schedule records cannot change recurring tasks', () => {
  const item = anyDayTask();
  assert.equal(recurrence.reconcileAnyDayTask(item, null), false);
  assert.equal(recurrence.reconcileAnyDayTask(item, [null, { taskId: item.id, completedDate: '2026-02-31' }]), false);
  assert.equal(recurrence.reconcileAnyDayTask(item, [legacyCompletion(item, { recurrence: 'monthly' })]), false);
  assert.equal(recurrence.reconcileAnyDayTask({ ...item, anyDay: false }, [legacyCompletion(item)]), false);
});
