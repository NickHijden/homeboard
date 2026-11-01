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
  if (recurrence === 'fourweekly') return addDays(date, 28);
    if (recurrence === 'quarterly') return addMonths(date, 3);
    return addMonths(date, 1);
  }

  function isRecurringTask(task) {
    return ['weekly', 'biweekly', 'fourweekly', 'monthly', 'quarterly'].indexOf(task && task.recurrence) !== -1;
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
    if (recurrence === 'weekly' || recurrence === 'biweekly' || recurrence === 'fourweekly') {
      const interval = recurrence === 'fourweekly' ? 28 : recurrence === 'biweekly' ? 14 : 7;
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

  function parseCompletionDate(value) {
    const parsed = parseDate(value);
    return parsed && dateKey(parsed) === value ? parsed : null;
  }

  // Old history records contain only the day the user checked the task off.
  // Recover the scheduled occurrence in that week where possible. If there is
  // no occurrence in that week, an overdue task was carried to its Monday.
  function legacyAnyDayOccurrence(task, completedDate) {
    const weekStart = startOfWeek(completedDate);
    const weekEnd = addDays(weekStart, 6);
    let occurrence = getRecurringAnchorDate(task) || parseDate(task.anyDayDate) || weekStart;
    let guard = 0;
    while (dateKey(occurrence) < dateKey(weekStart) && guard < 2400) {
      occurrence = addRecurringDate(occurrence, task.recurrence);
      guard += 1;
    }
    return occurrence >= weekStart && occurrence <= weekEnd ? occurrence : weekStart;
  }

  // Completion history survives merging independently of a task's mutable
  // next date. Rebuild the lower bound from that history so a stale task edit
  // cannot reopen a completed occurrence. Never move a future cursor backward.
  function reconcileAnyDayTask(task, history) {
    if (!task || !task.anyDay) return false;
    const scheduleUpdatedAt = Date.parse(task.anyDayScheduleUpdatedAt || '') || 0;
    const entries = (Array.isArray(history) ? history : []).filter((entry) => {
      if (!entry || entry.taskId !== task.id) return false;
      const completedAt = Date.parse(entry.completedAt || entry.updatedAt || '') || 0;
      if (scheduleUpdatedAt && completedAt <= scheduleUpdatedAt) return false;
      return !entry.recurrence || entry.recurrence === task.recurrence;
    });
    if (!entries.length) return false;
    if (!isRecurringTask(task)) {
      if (task.anyDayCompleted) return false;
      task.anyDayCompleted = true;
      return true;
    }

    const previousDate = parseCompletionDate(task.nextAnyDayDate) || parseCompletionDate(task.anyDayDate);
    let nextDate = previousDate;
    entries.forEach((entry) => {
      const explicitOccurrence = parseCompletionDate(entry.occurrenceDate);
      const completedDate = parseCompletionDate(entry.completedDate);
      const occurrence = explicitOccurrence || (completedDate && legacyAnyDayOccurrence(task, completedDate));
      if (!occurrence) return;
      const recordedNext = parseCompletionDate(entry.nextAnyDayDate);
      const candidate = recordedNext && recordedNext > occurrence
        ? recordedNext
        : addRecurringDate(occurrence, task.recurrence);
      if (!nextDate || candidate > nextDate) nextDate = candidate;
    });
    if (!nextDate || (previousDate && nextDate <= previousDate)) return false;
    task.nextAnyDayDate = dateKey(nextDate);
    delete task.anyDayCompleted;
    delete task.lastMissedAnyDayDate;
    return true;
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
    task.lastMissedDate = dateKey(dueDate);
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
    reconcileAnyDayTask,
    rollOverdueTask,
  };
}));
