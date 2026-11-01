(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HomeboardPlanner = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  function members(profile) {
    const rows = profile && Array.isArray(profile.members) ? profile.members : [];
    const seen = {};
    const valid = rows.filter(row => row && typeof row.id === 'string' && !seen[row.id] && (seen[row.id] = true)
      && /^[a-zA-Z0-9_-]{1,80}$/.test(row.id) && row.id !== 'both' && String(row.name || '').trim()).slice(0,12);
    return valid.length ? valid.map(row => ({ id: row.id, name: String(row.name).trim().slice(0,60) }))
      : [{ id: 'me', name: 'Person 1' }, { id: 'partner', name: 'Person 2' }];
  }
  function assignee(task, profile, occurrence) {
    const people = members(profile);
    if (!task.rotate || task.recurrence === 'none') return task.assignee || 'both';
    const first = Math.max(0, people.findIndex(person => person.id === task.assignee));
    const anchor = task.rotationAnchor || task.recurrenceStartDate || task.anyDayDate || task.date;
    const due = occurrence && occurrence !== 'any-day' ? occurrence : task.nextAnyDayDate || task.date || anchor;
    if (!anchor || !due) return people[first % people.length].id;
    let cursor = parseDate(anchor); const target = parseDate(due); let count = 0;
    while (cursor && target && cursor < target && count < 2400) { cursor = nextDate(cursor, task.recurrence); count++; }
    return people[(first + count) % people.length].id;
  }
  function label(id, profile) {
    if (id === 'both') return 'Together';
    const person = members(profile).find(row => row.id === id);
    return person ? person.name : 'Former member';
  }
  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const parts = value.split('-').map(Number);
    const result = new Date(parts[0], parts[1]-1, parts[2]);
    return key(result) === value ? result : null;
  }
  function key(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
  function nextDate(date, repeat) {
    const dayIntervals = { weekly:7, biweekly:14, fourweekly:28 };
    if (dayIntervals[repeat]) { const result = new Date(date); result.setDate(result.getDate()+dayIntervals[repeat]); return result; }
    const months = repeat === 'quarterly' ? 3 : 1;
    const next = new Date(date.getFullYear(), date.getMonth()+months, 1);
    next.setDate(Math.min(date.getDate(), new Date(next.getFullYear(),next.getMonth()+1,0).getDate()));
    return next;
  }
  function quietAt(time, start, end) {
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start === end) return false;
    return start < end ? time >= start && time < end : time >= start || time < end;
  }
  function newerProfile(left, right) {
    return (Date.parse(left && left.updatedAt) || 0) >= (Date.parse(right && right.updatedAt) || 0) ? left || {} : right || {};
  }
  return { members, assignee, label, parseDate, key, nextDate, quietAt, newerProfile };
}));
