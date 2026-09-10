// Keep this key stable: changing it would make a Home Screen installation
// look empty even though the old events still exist in Safari's storage.
const STORAGE_KEY = 'homeboard-household-planner-v1';
const BACKUP_STORAGE_KEY = 'homeboard-household-planner-last-known-good-v1';
const IDB_NAME = 'homeboard-household-planner-storage';
const IDB_STORE = 'planner-data';
const LEGACY_STORAGE_KEYS = [
  'homeboard-household-planner-v2',
  'homeboard-planner-data',
  'homeboard-data',
];

let loadedDataFromStorage = false;

const state = {
  data: loadData(),
  weekStart: startOfWeek(new Date()),
  lastUndo: null,
  toastTimer: null,
};

const els = {
  weekHeading: document.querySelector('#weekHeading'),
  weekRange: document.querySelector('#weekRange'),
  weekSummary: document.querySelector('#weekSummary'),
  weekGrid: document.querySelector('#weekGrid'),
  addEventButton: document.querySelector('#addEventButton') || document.querySelector('#addTaskButton'),
  previousWeekButton: document.querySelector('#previousWeekButton'),
  nextWeekButton: document.querySelector('#nextWeekButton'),
  todayButton: document.querySelector('#todayButton'),
  eventDialog: document.querySelector('#eventDialog') || document.querySelector('#taskDialog'),
  taskForm: document.querySelector('#taskForm'),
  closeDialogButton: document.querySelector('#closeDialogButton'),
  cancelDialogButton: document.querySelector('#cancelDialogButton'),
  taskTitle: document.querySelector('#taskTitle'),
  taskDate: document.querySelector('#taskDate'),
  eventStart: document.querySelector('#eventStart') || document.querySelector('#taskTime'),
  eventEnd: document.querySelector('#eventEnd'),
  taskAssignee: document.querySelector('#taskAssignee'),
  taskType: document.querySelector('#taskType'),
  taskRepeat: document.querySelector('#taskRepeat'),
  todoForm: document.querySelector('#todoForm'),
  todoInput: document.querySelector('#todoInput'),
  todoList: document.querySelector('#todoList'),
  todoCount: document.querySelector('#todoCount'),
  clearTodosButton: document.querySelector('#clearTodosButton'),
  groceryForm: document.querySelector('#groceryForm'),
  groceryInput: document.querySelector('#groceryInput'),
  groceryList: document.querySelector('#groceryList'),
  groceryCount: document.querySelector('#groceryCount'),
  clearGroceriesButton: document.querySelector('#clearGroceriesButton'),
  saveStatus: document.querySelector('#saveStatus'),
  toast: document.querySelector('#toast'),
  settingsButton: document.querySelector('#settingsButton'),
  settingsDialog: document.querySelector('#settingsDialog'),
  closeSettingsButton: document.querySelector('#closeSettingsButton'),
  settingsForm: document.querySelector('#settingsForm'),
  exportButton: document.querySelector('#exportButton'),
  importInput: document.querySelector('#importInput'),
};

const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const shortWeekdayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

render();
bindEvents();
registerServiceWorker();
if (loadedDataFromStorage) mirrorDataToIndexedDB(state.data);
recoverFromIndexedDB();

function bindEvents() {
  if (!els.addEventButton || !els.eventDialog || !els.taskForm) return;
  els.addEventButton.addEventListener('click', () => openEventDialog());
  els.previousWeekButton.addEventListener('click', () => moveWeek(-1));
  els.nextWeekButton.addEventListener('click', () => moveWeek(1));
  els.todayButton.addEventListener('click', () => {
    state.weekStart = startOfWeek(new Date());
    render();
  });

  els.taskForm.addEventListener('submit', handleTaskSubmit);
  els.closeDialogButton.addEventListener('click', () => closeDialog(els.eventDialog));
  els.cancelDialogButton.addEventListener('click', () => closeDialog(els.eventDialog));
  els.eventDialog.addEventListener('click', closeDialogOnBackdrop);

  els.todoForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = els.todoInput.value.trim();
    if (!title) return;
    state.data.todos.unshift({ id: createId(), title, completed: false });
    els.todoInput.value = '';
    saveAndRender();
  });
  els.groceryForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = els.groceryInput.value.trim();
    if (!title) return;
    state.data.groceries.unshift({ id: createId(), title, completed: false });
    els.groceryInput.value = '';
    saveAndRender();
  });
  els.todoList.addEventListener('click', handleListClick);
  els.groceryList.addEventListener('click', handleListClick);
  els.clearTodosButton.addEventListener('click', () => clearCompleted('todos'));
  els.clearGroceriesButton.addEventListener('click', () => clearCompleted('groceries'));

  els.settingsButton.addEventListener('click', () => openDialog(els.settingsDialog));
  els.closeSettingsButton.addEventListener('click', () => closeDialog(els.settingsDialog));
  els.settingsDialog.addEventListener('click', (event) => {
    if (event.target === els.settingsDialog) closeDialog(els.settingsDialog);
  });
  els.settingsForm.addEventListener('submit', (event) => event.preventDefault());
  els.exportButton.addEventListener('click', exportBackup);
  els.importInput.addEventListener('change', importBackup);
}

function render() {
  renderWeekHeader();
  renderWeek();
  renderList('todos', els.todoList, els.todoCount, 'Nothing here yet. Add a small win above.');
  renderList('groceries', els.groceryList, els.groceryCount, 'Your shopping list is clear.');
}

function renderWeekHeader() {
  const today = dateKey(new Date());
  const currentStart = dateKey(startOfWeek(new Date()));
  const viewingCurrentWeek = dateKey(state.weekStart) === currentStart;
  const end = addDays(state.weekStart, 6);
  els.weekHeading.textContent = viewingCurrentWeek ? 'This week' : `${formatMonth(state.weekStart)} week`;
  els.weekRange.textContent = `${formatShortDate(state.weekStart)} – ${formatLongDate(end)}`;
  els.todayButton.textContent = viewingCurrentWeek ? 'Today is highlighted' : 'Jump to today';
  els.todayButton.disabled = viewingCurrentWeek;
  els.todayButton.style.opacity = viewingCurrentWeek ? '.55' : '1';
  els.todayButton.setAttribute('aria-label', viewingCurrentWeek ? `Today is ${today}` : 'Jump to today');
}

function renderWeek() {
  const todayKey = dateKey(new Date());
  const days = Array.from({ length: 7 }, (_, index) => addDays(state.weekStart, index));
  const occurrences = [];
  days.forEach((day) => getOccurrencesForDay(day).forEach((occurrence) => occurrences.push(occurrence)));
  const completedCount = occurrences.filter((item) => isCompleted(item.task.id, item.dateKey)).length;
  const openOccurrences = occurrences.filter((item) => !isCompleted(item.task.id, item.dateKey));
  const openCount = openOccurrences.length;
  const expiryCount = openOccurrences.filter((item) => item.task.kind === 'expiry').length;
  els.weekSummary.innerHTML = `<span class="summary-dot"></span><span><strong>${openCount} ${openCount === 1 ? 'item' : 'items'}</strong> on the board${expiryCount ? ` · <strong class="expiry-summary">${expiryCount} use-by ${expiryCount === 1 ? 'reminder' : 'reminders'}</strong>` : ''}${completedCount ? ` · ${completedCount} done` : ''}</span>`;

  els.weekGrid.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'week-grid-wrapper';
  const grid = document.createElement('div');
  grid.className = 'week-grid timeline-grid';

  const range = getTimelineRange(openOccurrences);
  const hourHeight = isLandscapeTablet() ? 30 : 46;
  const untimedByDay = days.map((day) => openOccurrences.filter((item) => item.dateKey === dateKey(day) && !getTaskTimeBounds(item.task)));
  const maxUntimedCount = Math.max.apply(null, untimedByDay.map((items) => items.length).concat([0]));
  const untimedHeight = maxUntimedCount ? Math.max(38, Math.min(96, maxUntimedCount * 31 + 7)) : 0;
  const timelineHeight = Math.max(1, ((range.endMinutes - range.startMinutes) / 60) * hourHeight + untimedHeight);
  grid.style.setProperty('--timeline-height', `${timelineHeight}px`);
  grid.style.setProperty('--hour-height', `${hourHeight}px`);

  const axisHeader = document.createElement('div');
  axisHeader.className = 'time-axis-header';
  grid.appendChild(axisHeader);

  days.forEach((day, index) => {
    const key = dateKey(day);
    const header = document.createElement('header');
    header.className = `day-header${key === todayKey ? ' today' : ''}`;
    header.innerHTML = `
      <div>
        <p class="day-name">${shortWeekdayNames[index]}</p>
        <p class="day-number">${day.getDate()}</p>
      </div>
      ${key === todayKey ? '<span class="today-label">Today</span>' : ''}
    `;
    grid.appendChild(header);
  });

  const axis = document.createElement('div');
  axis.className = 'time-axis';
  if (untimedHeight) {
    const anyTimeLabel = document.createElement('span');
    anyTimeLabel.className = 'timeline-label any-time-label';
    anyTimeLabel.textContent = 'Any time';
    anyTimeLabel.style.top = '10px';
    axis.appendChild(anyTimeLabel);
  }
  for (let hour = range.startHour; hour <= range.endHour; hour += 1) {
    const label = document.createElement('span');
    label.className = 'timeline-label';
    label.textContent = formatHourLabel(hour * 60);
    label.style.top = `${untimedHeight + ((hour * 60 - range.startMinutes) / 60) * hourHeight - 7}px`;
    axis.appendChild(label);
  }
  grid.appendChild(axis);

  days.forEach((day, index) => {
    const key = dateKey(day);
    const timeline = document.createElement('div');
    timeline.className = `day-timeline${key === todayKey ? ' today' : ''}`;
    timeline.style.setProperty('--untimed-height', `${untimedHeight}px`);

    const lines = document.createElement('div');
    lines.className = 'timeline-lines';
    timeline.appendChild(lines);

    const dayOccurrences = openOccurrences.filter((item) => item.dateKey === key);
    const untimed = untimedByDay[index];
    if (untimed.length) {
      const untimedLane = document.createElement('div');
      untimedLane.className = 'untimed-lane';
      untimed.forEach((item) => {
        const element = createTaskElement(item);
        element.classList.add('untimed-event');
        untimedLane.appendChild(element);
      });
      timeline.appendChild(untimedLane);
    }

    const timed = dayOccurrences.filter((item) => Boolean(getTaskTimeBounds(item.task)));
    layoutTimedOccurrences(timed).forEach((placement) => {
      const element = createTaskElement(placement.item);
      const bounds = getTaskTimeBounds(placement.item.task);
      const top = untimedHeight + ((bounds.start - range.startMinutes) / 60) * hourHeight;
      const height = Math.max(isLandscapeTablet() ? 31 : 42, ((bounds.end - bounds.start) / 60) * hourHeight - 4);
      const laneWidth = 100 / placement.laneCount;
      element.classList.add('timed-event');
      element.style.top = `${top}px`;
      element.style.height = `${height}px`;
      element.style.left = `calc(${placement.lane * laneWidth}% + 3px)`;
      element.style.width = `calc(${laneWidth}% - 6px)`;
      timeline.appendChild(element);
    });

    if (!dayOccurrences.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-day';
      empty.innerHTML = '<span>○</span>Nothing planned';
      timeline.appendChild(empty);
    }
    grid.appendChild(timeline);
  });

  wrapper.appendChild(grid);
  els.weekGrid.appendChild(wrapper);
}

function createTaskElement({ task, dateKey: occurrenceDate }) {
  const item = document.createElement('label');
  const kind = task.kind === 'expiry' ? 'expiry' : task.kind === 'event' ? 'event' : 'task';
  item.className = `task-item ${kind}`;
  const assigneeLabel = task.assignee === 'me' ? 'Me' : task.assignee === 'partner' ? 'Partner' : 'Both';
  const assigneeClass = task.assignee === 'me' ? 'assignee-me' : task.assignee === 'partner' ? 'assignee-partner' : 'assignee-both';
  const recurrenceLabel = task.recurrence === 'weekly' ? 'Every week' : task.recurrence === 'biweekly' ? 'Every 2 weeks' : task.recurrence === 'monthly' ? 'Every month' : '';
  const kindLabel = kind === 'expiry' ? 'Use-by' : kind === 'event' ? 'Event' : 'Task';
  const eventTime = formatEventTime(task);
  item.innerHTML = `
    <input class="task-check" type="checkbox" data-task-id="${escapeAttribute(task.id)}" data-occurrence-date="${occurrenceDate}" aria-label="Mark ${escapeAttribute(task.title)} done" />
    <span class="task-content">
      <span class="task-title">${escapeHtml(task.title)}</span>
      <span class="task-meta">
        ${eventTime ? `<span class="task-time">${eventTime}</span>` : '<span class="task-time untimed">Any time</span>'}
        <span class="kind-chip">${kindLabel}</span>
        <span class="assignee-chip ${assigneeClass}"><span class="assignee-dot" aria-hidden="true"></span>${assigneeLabel}</span>
        ${kind === 'expiry' ? '<span aria-hidden="true">⌛</span>' : ''}
        ${recurrenceLabel ? `<span class="recurrence-icon" title="${recurrenceLabel}" aria-label="${recurrenceLabel}">↻</span>` : ''}
      </span>
    </span>
  `;
  item.querySelector('.task-check').addEventListener('change', () => completeTask(task.id, occurrenceDate, task.title));
  return item;
}

function getTimelineRange(occurrences) {
  const timed = occurrences.map((item) => getTaskTimeBounds(item.task)).filter(Boolean);
  if (!timed.length) return { startMinutes: 6 * 60, endMinutes: 24 * 60, startHour: 6, endHour: 24 };
  let earliest = timed[0].start;
  let latest = timed[0].end;
  timed.forEach((bounds) => {
    earliest = Math.min(earliest, bounds.start);
    latest = Math.max(latest, bounds.end);
  });
  const startHour = Math.max(0, Math.floor(earliest / 60));
  const endHour = Math.min(24, Math.max(startHour + 1, Math.ceil(latest / 60)));
  return { startMinutes: startHour * 60, endMinutes: endHour * 60, startHour, endHour };
}

function getTaskTimeBounds(task) {
  let start = parseTimeMinutes(task.startTime);
  let end = parseTimeMinutes(task.endTime);
  if (start === null && end === null) return null;
  if (start === null) start = Math.max(0, end - 60);
  if (end === null) end = Math.min(24 * 60, start + 60);
  if (end <= start) end = Math.min(24 * 60, start + 60);
  return { start, end };
}

function layoutTimedOccurrences(occurrences) {
  const sorted = occurrences.slice().sort((left, right) => {
    const leftBounds = getTaskTimeBounds(left.task);
    const rightBounds = getTaskTimeBounds(right.task);
    return leftBounds.start - rightBounds.start || leftBounds.end - rightBounds.end || left.task.title.localeCompare(right.task.title);
  });
  const laneEnds = [];
  const placements = [];
  sorted.forEach((item) => {
    const bounds = getTaskTimeBounds(item.task);
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] > bounds.start) lane += 1;
    laneEnds[lane] = bounds.end;
    placements.push({ item, lane });
  });
  return placements.map((placement) => ({ ...placement, laneCount: Math.max(1, laneEnds.length) }));
}

function isLandscapeTablet() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 760px) and (orientation: landscape)').matches;
}

function getOccurrencesForDay(day) {
  const key = dateKey(day);
  return state.data.tasks
    .filter((task) => isDueOn(task, day))
    .map((task) => ({ task, dateKey: key }));
}

function isDueOn(task, day) {
  const anchor = parseDate(task.date);
  if (!anchor || day < anchor) return false;
  const recurrence = task.recurrence || 'none';
  if (recurrence === 'none') return dateKey(anchor) === dateKey(day);
  if (recurrence === 'weekly' || recurrence === 'biweekly') {
    const daysSince = differenceInDays(anchor, day);
    const interval = recurrence === 'weekly' ? 7 : 14;
    return day.getDay() === anchor.getDay() && daysSince % interval === 0;
  }
  if (recurrence === 'monthly') {
    return day.getDate() === anchor.getDate();
  }
  return false;
}

function sortOccurrences(left, right) {
  const leftTime = left.task.startTime || '99:99';
  const rightTime = right.task.startTime || '99:99';
  return leftTime.localeCompare(rightTime) || left.task.title.localeCompare(right.task.title);
}

function completeTask(taskId, occurrenceDate, title) {
  const key = completionKey(taskId, occurrenceDate);
  state.data.completions[key] = true;
  state.lastUndo = () => {
    delete state.data.completions[key];
    persist();
    render();
  };
  persist();
  render();
  showToast(`“${title}” marked done`, 'Undo');
}

function handleTaskSubmit(event) {
  event.preventDefault();
  // Read the controls directly instead of using FormData. This is more
  // reliable on the older Safari shipped with iPad mini 2.
  const title = String(els.taskTitle.value || '').trim();
  const date = String(els.taskDate.value || '');
  const startTime = String(els.eventStart && els.eventStart.value || '');
  const endTime = String(els.eventEnd && els.eventEnd.value || '');
  if (!title || !date) return;
  if (startTime && endTime && endTime < startTime) {
    showToast('End time must be after start time');
    return;
  }
  state.data.tasks.push({
    id: createId(),
    title,
    date,
    startTime,
    endTime,
    assignee: String(els.taskAssignee.value || 'both'),
    kind: String(els.taskType.value || 'task'),
    recurrence: String(els.taskRepeat.value || 'none'),
  });
  persist();
  closeDialog(els.eventDialog);
  state.weekStart = startOfWeek(parseDate(date));
  render();
  showToast('Event added to the week');
}

function openEventDialog() {
  els.taskForm.reset();
  els.taskDate.value = dateKey(new Date());
  openDialog(els.eventDialog);
  window.setTimeout(() => els.taskTitle.focus(), 30);
}

function handleListClick(event) {
  const target = event.target.closest('[data-list-action]');
  if (!target) return;
  const listName = target.dataset.listName;
  const itemId = target.dataset.itemId;
  const item = state.data[listName].find((entry) => entry.id === itemId);
  if (!item) return;
  if (target.dataset.listAction === 'toggle') item.completed = !item.completed;
  if (target.dataset.listAction === 'delete') state.data[listName] = state.data[listName].filter((entry) => entry.id !== itemId);
  persist();
  render();
}

function renderList(listName, container, countElement, emptyMessage) {
  const items = state.data[listName] || [];
  const openCount = items.filter((item) => !item.completed).length;
  countElement.textContent = openCount;
  container.innerHTML = '';
  if (!items.length) {
    container.innerHTML = `<p class="empty-list">${emptyMessage}</p>`;
    return;
  }
  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = `list-row${item.completed ? ' done' : ''}`;
    row.innerHTML = `
      <input class="list-check" type="checkbox" ${item.completed ? 'checked' : ''} data-list-action="toggle" data-list-name="${listName}" data-item-id="${escapeAttribute(item.id)}" aria-label="Mark ${escapeAttribute(item.title)} done" />
      <span class="list-row-text">${escapeHtml(item.title)}</span>
      <button class="delete-row" type="button" data-list-action="delete" data-list-name="${listName}" data-item-id="${escapeAttribute(item.id)}" aria-label="Delete ${escapeAttribute(item.title)}">×</button>
    `;
    container.appendChild(row);
  });
}

function clearCompleted(listName) {
  const before = state.data[listName].length;
  state.data[listName] = state.data[listName].filter((item) => !item.completed);
  if (state.data[listName].length !== before) {
    persist();
    render();
    showToast('Completed items cleared');
  }
}

function moveWeek(amount) {
  state.weekStart = addDays(state.weekStart, amount * 7);
  render();
}

function showToast(message, actionLabel = '') {
  window.clearTimeout(state.toastTimer);
  els.toast.innerHTML = `<span>${escapeHtml(message)}</span>${actionLabel ? `<button type="button" id="toastAction">${escapeHtml(actionLabel)}</button>` : ''}`;
  els.toast.classList.add('visible');
  const action = els.toast.querySelector('#toastAction');
  if (action) {
    action.addEventListener('click', () => {
      if (state.lastUndo) state.lastUndo();
      state.lastUndo = null;
      els.toast.classList.remove('visible');
    });
  }
  state.toastTimer = window.setTimeout(() => els.toast.classList.remove('visible'), 5000);
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `homeboard-backup-${dateKey(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('Backup downloaded');
}

function importBackup(event) {
  const files = event.target.files;
  const file = files && files.length ? files[0] : null;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported.tasks) || !Array.isArray(imported.todos) || !Array.isArray(imported.groceries)) throw new Error('Invalid backup');
      state.data = {
        tasks: imported.tasks.map(normalizeTask),
        todos: imported.todos.map(normalizeListItem),
        groceries: imported.groceries.map(normalizeListItem),
        completions: imported.completions || {},
      };
      persist();
      render();
      closeDialog(els.settingsDialog);
      showToast('Backup restored');
    } catch (error) {
      showToast('That backup file could not be restored');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function loadData() {
  try {
    const keysToTry = [STORAGE_KEY, BACKUP_STORAGE_KEY].concat(LEGACY_STORAGE_KEYS);
    for (let index = 0; index < keysToTry.length; index += 1) {
      const recovered = readStoredData(keysToTry[index]);
      if (recovered) {
        loadedDataFromStorage = true;
        return recovered;
      }
    }
  } catch (error) {
    console.warn('Homeboard data could not be loaded', error);
  }
  return createStarterData();
}

function readStoredData(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const stored = parsed && parsed.data && !Array.isArray(parsed.data) ? parsed.data : parsed;
    return normalizePlannerData(stored);
  } catch (error) {
    return null;
  }
}

function normalizeTask(task) {
  const normalized = {};
  Object.keys(task || {}).forEach((key) => { normalized[key] = task[key]; });
  normalized.id = normalized.id || createId();
  normalized.startTime = normalized.startTime || normalized.time || '';
  normalized.endTime = normalized.endTime || '';
  delete normalized.time;
  return normalized;
}

function normalizeListItem(item) {
  const normalized = {};
  Object.keys(item || {}).forEach((key) => { normalized[key] = item[key]; });
  normalized.id = normalized.id || createId();
  normalized.title = String(normalized.title || '').trim();
  normalized.completed = Boolean(normalized.completed);
  return normalized;
}

function normalizePlannerData(stored) {
  if (!stored || !Array.isArray(stored.tasks) || !Array.isArray(stored.todos) || !Array.isArray(stored.groceries)) return null;
  return {
    tasks: stored.tasks.map(normalizeTask),
    todos: stored.todos.map(normalizeListItem),
    groceries: stored.groceries.map(normalizeListItem),
    completions: stored.completions && typeof stored.completions === 'object' ? stored.completions : {},
  };
}

function createStarterData() {
  const today = new Date();
  const weekStart = startOfWeek(today);
  return {
    tasks: [
      { id: createId(), title: 'Put the garbage outside', date: dateKey(addDays(weekStart, 3)), startTime: '20:00', endTime: '20:15', assignee: 'both', kind: 'task', recurrence: 'weekly' },
      { id: createId(), title: 'Water the plants', date: dateKey(addDays(weekStart, 1)), startTime: '18:00', endTime: '18:20', assignee: 'both', kind: 'task', recurrence: 'biweekly' },
      { id: createId(), title: 'Use the chicken', date: dateKey(addDays(today, 3)), startTime: '', endTime: '', assignee: 'both', kind: 'expiry', recurrence: 'none' },
    ],
    todos: [
      { id: createId(), title: 'Check the mailbox', completed: false },
      { id: createId(), title: 'Book the dentist appointment', completed: false },
    ],
    groceries: [
      { id: createId(), title: 'Milk', completed: false },
      { id: createId(), title: 'Bananas', completed: false },
      { id: createId(), title: 'Dishwasher tablets', completed: false },
    ],
    completions: {},
  };
}

function persist() {
  try {
    const serialized = JSON.stringify(state.data);
    // The stable primary key preserves the data across app versions. The
    // second copy gives us a recovery path if iOS returns an incomplete store
    // after updating or reinstalling a Home Screen shortcut.
    localStorage.setItem(STORAGE_KEY, serialized);
    localStorage.setItem(BACKUP_STORAGE_KEY, serialized);
    mirrorDataToIndexedDB(state.data);
    els.saveStatus.innerHTML = '<span class="status-dot"></span> Saved on this tablet';
  } catch (error) {
    els.saveStatus.innerHTML = '<span class="status-dot" style="background:#e5a34b"></span> Storage is unavailable';
    console.warn('Homeboard data could not be saved', error);
  }
}

function openPlannerDatabase(callback) {
  if (!window.indexedDB) return;
  try {
    const request = window.indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IDB_STORE)) request.result.createObjectStore(IDB_STORE);
    };
    request.onsuccess = () => callback(request.result);
    request.onerror = () => {};
  } catch (error) {
    // IndexedDB is an additional recovery layer; localStorage remains primary.
  }
}

function mirrorDataToIndexedDB(data) {
  openPlannerDatabase((database) => {
    try {
      const transaction = database.transaction([IDB_STORE], 'readwrite');
      transaction.objectStore(IDB_STORE).put(JSON.parse(JSON.stringify(data)), 'current');
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => database.close();
    } catch (error) {
      database.close();
    }
  });
}

function recoverFromIndexedDB() {
  if (loadedDataFromStorage || !window.indexedDB) return;
  openPlannerDatabase((database) => {
    try {
      const transaction = database.transaction([IDB_STORE], 'readonly');
      const request = transaction.objectStore(IDB_STORE).get('current');
      request.onsuccess = () => {
        const recovered = normalizePlannerData(request.result);
        database.close();
        if (!recovered) return;
        state.data = recovered;
        loadedDataFromStorage = true;
        persist();
        render();
        showToast('Your saved planner data was recovered');
      };
      request.onerror = () => database.close();
    } catch (error) {
      database.close();
    }
  });
}

function saveAndRender() {
  persist();
  render();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) window.location.reload();
    });
    navigator.serviceWorker.register('./sw.js?v=20260910-4').then((registration) => {
      if (registration && typeof registration.update === 'function') registration.update();
    }).catch(() => {});
  }
}

function closeDialogOnBackdrop(event) {
  if (event.target === els.eventDialog) closeDialog(els.eventDialog);
}

function openDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') {
    try {
      if (!dialog.open) dialog.showModal();
      return;
    } catch (error) {
      // Fall through to the attribute-based modal used by older Safari.
    }
  }
  dialog.setAttribute('open', 'open');
  document.body.classList.add('modal-open');
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === 'function') {
    try {
      if (dialog.open) dialog.close();
    } catch (error) {
      dialog.removeAttribute('open');
    }
  } else {
    dialog.removeAttribute('open');
  }
  document.body.classList.remove('modal-open');
}

function completionKey(taskId, occurrenceDate) { return `${taskId}::${occurrenceDate}`; }
function isCompleted(taskId, occurrenceDate) { return Boolean(state.data.completions[completionKey(taskId, occurrenceDate)]); }
function createId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function parseDate(value) { if (!value) return null; const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day); }
function startOfWeek(date) { const result = new Date(date.getFullYear(), date.getMonth(), date.getDate()); const day = result.getDay(); const distance = day === 0 ? -6 : 1 - day; result.setDate(result.getDate() + distance); return result; }
function addDays(date, amount) { const result = new Date(date); result.setDate(result.getDate() + amount); return result; }
function differenceInDays(start, end) { return Math.round((end - start) / 86400000); }
function formatShortDate(date) { return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date); }
function formatLongDate(date) { return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(date); }
function formatMonth(date) { return new Intl.DateTimeFormat(undefined, { month: 'long' }).format(date); }
function parseTimeMinutes(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const parts = value.split(':').map(Number);
  if (parts[0] > 23 || parts[1] > 59) return null;
  return parts[0] * 60 + parts[1];
}
function formatHourLabel(minutes) {
  const normalized = minutes === 24 * 60 ? 0 : minutes;
  const hour = Math.floor(normalized / 60);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour} ${suffix}`;
}
function formatEventTime(task) {
  const start = task.startTime || '';
  const end = task.endTime || '';
  if (start && end) return `${formatTime(start)} – ${formatTime(end)}`;
  if (start) return `From ${formatTime(start)}`;
  if (end) return `Until ${formatTime(end)}`;
  return '';
}
function formatTime(time) { const [hours, minutes] = time.split(':').map(Number); const suffix = hours >= 12 ? 'PM' : 'AM'; const displayHour = hours % 12 || 12; return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
function escapeAttribute(value) { return escapeHtml(value); }
