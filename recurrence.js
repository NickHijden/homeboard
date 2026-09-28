(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HomeboardRecurrence = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function parseDate(value) {
    if (!value) return null;
    const parts = String(value).split('-').map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function startOfWeek(date) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = result.getDay();
    result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day));
    return result;
  }

  function addDays(date, amount) {
    const result = new Date(date);
    result.setDate(result.getDate() + amount);
    return result;
  }

  function addMonths(date, amount) {
    const target = new Date(date.getFullYear(), date.getMonth() + amount, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay));
  }

  function addRecurringDate(date, recurrence) {
    if (recurrence === 'weekly') return addDays(date, 7);
    if (recurrence === 'biweekly') return addDays(date, 14);
    if (recurrence === 'quarterly') return addMonths(date, 3);
    return addMonths(date, 1);
  }

  function isRecurringTask(task) {
    return ['weekly', 'biweekly', 'monthly', 'quarterly'].indexOf(task && task.recurrence) !== -1;
  }

  function getRecurringAnchorDate(task) {
    if (!isRecurringTask(task)) return parseDate(task && task.date);
    const explicitAnchor = parseDate(task.recurrenceStartDate);
    if (explicitAnchor) return explicitAnchor;
    const startWeek = parseDate(task.recurrenceStartWeek);
    if (startWeek) {
      if (task.anyDay) return startOfWeek(startWeek);
      const taskDate = parseDate(task.date);
      const weekdayOffset = taskDate ? (taskDate.getDay() + 6) % 7 : 0;
      return addDays(startOfWeek(startWeek), weekdayOffset);
    }
    return parseDate(task.date || task.nextAnyDayDate || task.anyDayDate);
  }

  function matchesRecurringDate(anchor, day, recurrence) {
    if (!anchor || day < anchor) return false;
    if (recurrence === 'weekly' || recurrence === 'biweekly') {
      const interval = recurrence === 'biweekly' ? 14 : 7;
      return Math.round((day - anchor) / 86400000) % interval === 0;
    }
    if (recurrence !== 'monthly' && recurrence !== 'quarterly') return false;
    let occurrence = new Date(anchor);
    let guard = 0;
    while (dateKey(occurrence) < dateKey(day) && guard < 480) {
      occurrence = addRecurringDate(occurrence, recurrence);
      guard += 1;
    }
    return dateKey(occurrence) === dateKey(day);
  }

  // Move an unfinished old occurrence into the current week, then move the
  // recurrence anchor with it. This keeps the interval intact instead of
  // skipping a missed task to its next original calendar occurrence.
  function rollOverdueTask(task, currentWeekStart, isCompleted) {
    if (!isRecurringTask(task)) return false;
    const weekStart = startOfWeek(currentWeekStart || new Date());
    const currentWeekKey = dateKey(weekStart);
    const completed = typeof isCompleted === 'function' ? isCompleted : () => false;
    let changed = false;

    if (task.anyDay) {
      let dueDate = parseDate(task.nextAnyDayDate) || parseDate(task.anyDayDate);
      if (!dueDate) return false;
      if (!task.nextAnyDayDate) {
        task.nextAnyDayDate = dateKey(dueDate);
        changed = true;
      }
      if (dateKey(dueDate) < currentWeekKey) {
        task.lastMissedAnyDayDate = dateKey(dueDate);
        task.nextAnyDayDate = currentWeekKey;
        task.anyDayDate = currentWeekKey;
        task.recurrenceStartDate = currentWeekKey;
        task.recurrenceStartWeek = currentWeekKey;
        changed = true;
      }
      return changed;
    }

    let dueDate = parseDate(task.date);
    if (!dueDate) return false;

    // Completed old occurrences are skipped normally. Only an unfinished
    // occurrence is carried into the current week.
    let guard = 0;
    while (dateKey(dueDate) < currentWeekKey && completed(task.id, dateKey(dueDate)) && guard < 40) {
      dueDate = addRecurringDate(dueDate, task.recurrence);
      task.date = dateKey(dueDate);
      changed = true;
      guard += 1;
    }
    if (dateKey(dueDate) >= currentWeekKey) return changed;

    const weekdayOffset = (dueDate.getDay() + 6) % 7;
    const movedDate = addDays(weekStart, weekdayOffset);
    const movedKey = dateKey(movedDate);
    if (task.date !== movedKey) {
      task.date = movedKey;
      changed = true;
    }
    if (task.recurrenceStartDate !== movedKey) {
      task.recurrenceStartDate = movedKey;
      changed = true;
    }
    if (task.recurrenceStartWeek !== currentWeekKey) {
      task.recurrenceStartWeek = currentWeekKey;
      changed = true;
    }
    return changed;
  }

  return {
    addRecurringDate,
    getRecurringAnchorDate,
    isRecurringTask,
    matchesRecurringDate,
    rollOverdueTask,
  };
}));
