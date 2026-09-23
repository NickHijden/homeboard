// Keep this key stable: changing it would make a Home Screen installation
// look empty even though the old events still exist in Safari's storage.
const STORAGE_KEY = 'homeboard-household-planner-v1';
const BACKUP_STORAGE_KEY = 'homeboard-household-planner-last-known-good-v1';
const IDB_NAME = 'homeboard-household-planner-storage';
const IDB_STORE = 'planner-data';
const SYNC_CONFIG_KEY = 'homeboard-sync-config-v1';
const SYNC_SESSION_KEY = 'homeboard-sync-session-v1';
const SYNC_EMAIL_KEY = 'homeboard-sync-email-v1';
const SYNC_POLL_MS = 15000;
const APP_VERSION = '20260923-19';
const LEGACY_STORAGE_KEYS = [
  'homeboard-household-planner-v2',
  'homeboard-planner-data',
  'homeboard-data',
];
const FOOTBALL_SCHEDULE_VERSION = '20260922-v1';
const FOOTBALL_SCHEDULE = [
  { date: '2026-09-26', startTime: '12:00', opponent: "TAC'90 2", home: false },
  { date: '2026-10-03', startTime: '14:30', opponent: 'Maasdijk 4', home: false },
  { date: '2026-10-10', startTime: '12:45', opponent: 'SVH 3', home: true },
  { date: '2026-10-24', startTime: '12:30', opponent: 'Honselersdijk 5', home: false },
  { date: '2026-10-31', startTime: '12:45', opponent: 'KMD 4', home: true },
  { date: '2026-11-07', startTime: '12:30', opponent: "FC 's-Gravenzande 7", home: false },
  { date: '2026-11-14', startTime: '12:45', opponent: 'SV Leidschenveen 3', home: true },
  { date: '2026-11-21', startTime: '12:00', opponent: 'Wanica Star 4', home: false },
  { date: '2026-11-28', startTime: '12:45', opponent: "FC 's-Gravenzande 8", home: true },
  { date: '2026-12-05', startTime: '14:30', opponent: 'Sportclub Monster 6', home: false },
  { date: '2027-01-16', startTime: '12:45', opponent: "TAC'90 2", home: true },
  { date: '2027-01-23', startTime: '12:45', opponent: 'VELO 5', home: true },
  { date: '2027-01-30', startTime: '12:00', opponent: 'RAS 4', home: false },
  { date: '2027-02-06', startTime: '14:30', opponent: 'SVH 3', home: false },
  { date: '2027-02-13', startTime: '12:45', opponent: 'Maasdijk 4', home: true },
  { date: '2027-03-06', startTime: '12:45', opponent: 'Naaldwijk 4', home: true },
  { date: '2027-03-13', startTime: '14:15', opponent: 'KMD 4', home: false },
  { date: '2027-03-20', startTime: '12:45', opponent: 'Honselersdijk 5', home: true },
  { date: '2027-04-03', startTime: '16:00', opponent: 'SV Leidschenveen 3', home: false },
  { date: '2027-04-10', startTime: '12:45', opponent: "FC 's-Gravenzande 7", home: true },
  { date: '2027-04-17', startTime: '14:45', opponent: "FC 's-Gravenzande 8", home: false },
  { date: '2027-04-24', startTime: '12:45', opponent: 'Wanica Star 4', home: true },
  { date: '2027-05-08', startTime: '14:45', opponent: 'VELO 5', home: false },
  { date: '2027-05-15', startTime: '12:45', opponent: 'Sportclub Monster 6', home: true },
  { date: '2027-05-22', startTime: '15:00', opponent: 'Naaldwijk 4', home: false },
];

let loadedDataFromStorage = false;
let editingTaskId = null;
let editingOccurrenceDate = null;
let editingDayIndex = null;

const state = {
  data: loadData(),
  weekStart: startOfWeek(new Date()),
  lastUndo: null,
  toastTimer: null,
};

const syncState = {
  config: loadSyncConfig(),
  session: loadSyncSession(),
  pollTimer: null,
  queueTimer: null,
  busy: false,
  pending: false,
};

const els = {
  weekHeading: document.querySelector('#weekHeading'),
  weekRange: document.querySelector('#weekRange'),
  weekSummary: document.querySelector('#weekSummary'),
  anyDayBoard: document.querySelector('#anyDayBoard'),
  weekGrid: document.querySelector('#weekGrid'),
  completedAnyDayBoard: document.querySelector('#completedAnyDayBoard'),
  addEventButton: document.querySelector('#addEventButton') || document.querySelector('#addTaskButton'),
  previousWeekButton: document.querySelector('#previousWeekButton'),
  nextWeekButton: document.querySelector('#nextWeekButton'),
  todayButton: document.querySelector('#todayButton'),
  eventDialog: document.querySelector('#eventDialog') || document.querySelector('#taskDialog'),
  dialogTitle: document.querySelector('#dialogTitle'),
  taskForm: document.querySelector('#taskForm'),
  closeDialogButton: document.querySelector('#closeDialogButton'),
  cancelDialogButton: document.querySelector('#cancelDialogButton'),
  deleteEventButton: document.querySelector('#deleteEventButton'),
  completeEventButton: document.querySelector('#completeEventButton'),
  saveEventButton: document.querySelector('#saveEventButton'),
  taskTitle: document.querySelector('#taskTitle'),
  taskDate: document.querySelector('#taskDate'),
  taskAnyDay: document.querySelector('#taskAnyDay'),
  eventStart: document.querySelector('#eventStart') || document.querySelector('#taskTime'),
  eventEnd: document.querySelector('#eventEnd'),
  clearEventStartButton: document.querySelector('#clearEventStartButton'),
  clearEventEndButton: document.querySelector('#clearEventEndButton'),
  taskAssignee: document.querySelector('#taskAssignee'),
  taskType: document.querySelector('#taskType'),
  taskRepeat: document.querySelector('#taskRepeat'),
  taskReminder: document.querySelector('#taskReminder'),
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
  syncProjectUrl: document.querySelector('#syncProjectUrl'),
  syncPublishableKey: document.querySelector('#syncPublishableKey'),
  syncEmail: document.querySelector('#syncEmail'),
  syncPassword: document.querySelector('#syncPassword'),
  saveSyncConfigButton: document.querySelector('#saveSyncConfigButton'),
  syncSignInButton: document.querySelector('#syncSignInButton'),
  syncSignUpButton: document.querySelector('#syncSignUpButton'),
  syncNowButton: document.querySelector('#syncNowButton'),
  syncSignOutButton: document.querySelector('#syncSignOutButton'),
  syncStatus: document.querySelector('#syncStatus'),
  daySettingsDialog: document.querySelector('#daySettingsDialog'),
  daySettingsForm: document.querySelector('#daySettingsForm'),
  daySettingsTitle: document.querySelector('#daySettingsTitle'),
  daySettingPalette: document.querySelector('#daySettingPalette'),
  daySettingLabel: document.querySelector('#daySettingLabel'),
  daySettingColor: document.querySelector('#daySettingColor'),
  daySettingStart: document.querySelector('#daySettingStart'),
  daySettingEnd: document.querySelector('#daySettingEnd'),
  clearDaySettingButton: document.querySelector('#clearDaySettingButton'),
  closeDaySettingsButton: document.querySelector('#closeDaySettingsButton'),
  closeDaySettingsButtonAlt: document.querySelector('#closeDaySettingsButtonAlt'),
};

const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const shortWeekdayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

populateDaySettingHourOptions();
if (applyDataMigrations()) persist();
render();
bindEvents();
registerServiceWorker();
if (loadedDataFromStorage) mirrorDataToIndexedDB(state.data);
recoverFromIndexedDB();
initializeSync();

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
  if (els.taskAnyDay) els.taskAnyDay.addEventListener('change', updateAnyDayField);
  els.closeDialogButton.addEventListener('click', () => closeDialog(els.eventDialog));
  els.cancelDialogButton.addEventListener('click', () => closeDialog(els.eventDialog));
  if (els.deleteEventButton) els.deleteEventButton.addEventListener('click', deleteEditingEvent);
  if (els.completeEventButton) els.completeEventButton.addEventListener('click', completeEditingEvent);
  if (els.clearEventStartButton) els.clearEventStartButton.addEventListener('click', () => clearTimeInput(els.eventStart));
  if (els.clearEventEndButton) els.clearEventEndButton.addEventListener('click', () => clearTimeInput(els.eventEnd));
  if (els.eventStart) {
    els.eventStart.addEventListener('input', updateTimeClearButtons);
    els.eventStart.addEventListener('change', updateTimeClearButtons);
  }
  if (els.eventEnd) {
    els.eventEnd.addEventListener('input', updateTimeClearButtons);
    els.eventEnd.addEventListener('change', updateTimeClearButtons);
  }
  els.eventDialog.addEventListener('click', closeDialogOnBackdrop);
  if (els.daySettingsForm) els.daySettingsForm.addEventListener('submit', saveDaySettings);
  if (els.daySettingPalette) els.daySettingPalette.addEventListener('click', (event) => {
    const option = event.target.closest('.day-color-option');
    if (!option) return;
    setDayStyleColor(option.dataset.color || '');
  });
  if (els.daySettingStart) els.daySettingStart.addEventListener('change', updateDayStyleEndOptions);
  if (els.closeDaySettingsButton) els.closeDaySettingsButton.addEventListener('click', () => closeDialog(els.daySettingsDialog));
  if (els.closeDaySettingsButtonAlt) els.closeDaySettingsButtonAlt.addEventListener('click', () => closeDialog(els.daySettingsDialog));
  if (els.clearDaySettingButton) els.clearDaySettingButton.addEventListener('click', clearDaySettings);
  if (els.daySettingsDialog) els.daySettingsDialog.addEventListener('click', (event) => {
    if (event.target === els.daySettingsDialog) closeDialog(els.daySettingsDialog);
  });

  els.todoForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = els.todoInput.value.trim();
    if (!title) return;
    state.data.todos.unshift({ id: createId(), title, completed: false, updatedAt: nowIso() });
    els.todoInput.value = '';
    saveAndRender();
  });
  els.groceryForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = els.groceryInput.value.trim();
    if (!title) return;
    state.data.groceries.unshift({ id: createId(), title, completed: false, updatedAt: nowIso() });
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
  if (els.saveSyncConfigButton) els.saveSyncConfigButton.addEventListener('click', saveSyncConfig);
  if (els.syncSignInButton) els.syncSignInButton.addEventListener('click', () => signIn(false));
  if (els.syncSignUpButton) els.syncSignUpButton.addEventListener('click', () => signIn(true));
  if (els.syncNowButton) els.syncNowButton.addEventListener('click', () => syncNow(true));
  if (els.syncSignOutButton) els.syncSignOutButton.addEventListener('click', signOut);

  // iPad pauses timers while the Home Screen app is in the background. When
  // it becomes visible again, immediately refresh both the app shell and the
  // shared planner instead of waiting for the polling timer.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration && typeof registration.update === 'function') registration.update();
      }).catch(() => {});
    }
    if (syncState.session) syncNow(false);
  });
}

function render() {
  rollOverdueRecurringTasks();
renderWeekHeader();
  renderAnyDayBoard();
  renderWeek();
  renderCompletedAnyDayBoard();
  renderList('todos', els.todoList, els.todoCount, 'Nothing here yet. Add a small win above.');
  renderList('groceries', els.groceryList, els.groceryCount, 'Your shopping list is clear.');
}

function renderAnyDayBoard() {
  if (!els.anyDayBoard) return;
  const openTasks = state.data.tasks.filter((task) => task.anyDay && isAnyDayTaskOpen(task));
  if (!openTasks.length) {
    els.anyDayBoard.hidden = true;
    els.anyDayBoard.innerHTML = '';
    return;
  }

  const rows = [
    { key: 'me', label: 'Nick', tasks: openTasks.filter((task) => task.assignee === 'me' || task.assignee === 'both') },
    { key: 'partner', label: 'Stephany', tasks: openTasks.filter((task) => task.assignee === 'partner' || task.assignee === 'both') },
  ];
  els.anyDayBoard.hidden = false;
  els.anyDayBoard.innerHTML = `
    <div class="any-day-heading">
      <span class="eyebrow">NO FIXED DAY</span>
      <span>Small wins whenever they fit</span>
    </div>
    <div class="any-day-rows"></div>
  `;
  const rowsElement = els.anyDayBoard.querySelector('.any-day-rows');
  rows.forEach((row) => {
    const rowElement = document.createElement('div');
    rowElement.className = `any-day-row any-day-row-${row.key}`;
    rowElement.innerHTML = `<span class="any-day-label">${row.label}</span><div class="any-day-items"></div>`;
    const itemsElement = rowElement.querySelector('.any-day-items');
    row.tasks.forEach((task) => {
      const item = createTaskElement({
        task,
        dateKey: 'any-day',
        onComplete: () => completeAnyDayTask(task.id, task.title),
      });
      item.classList.add('any-day-task');
      itemsElement.appendChild(item);
    });
    rowsElement.appendChild(rowElement);
  });
}

function renderCompletedAnyDayBoard() {
  if (!els.completedAnyDayBoard) return;
  const days = Array.from({ length: 7 }, (_, index) => addDays(state.weekStart, index));
  const history = Array.isArray(state.data.anyDayCompletions) ? state.data.anyDayCompletions : [];
  const rows = [
    { key: 'me', label: 'Nick' },
    { key: 'partner', label: 'Stephany' },
  ];
  els.completedAnyDayBoard.hidden = false;
  els.completedAnyDayBoard.innerHTML = rows.map((row) => `
    <div class="completed-any-day-row completed-any-day-row-${row.key}">
      <span class="completed-any-day-label">${row.label}</span>
      ${days.map((day) => {
        const dayHistory = history.filter((entry) => entry.completedDate === dateKey(day)
          && (entry.assignee === row.key || entry.assignee === 'both'));
        return `<div class="completed-any-day-cell">${dayHistory.map((entry) => `
          <span class="completed-any-day-item" title="Completed ${escapeAttribute(entry.title)}">
            <span class="completed-any-day-check" aria-hidden="true">✓</span>${escapeHtml(entry.title)}
          </span>`).join('')}</div>`;
      }).join('')}
    </div>
  `).join('');
}

function isAnyDayTaskOpen(task) {
  const viewingWeek = startOfWeek(state.weekStart || new Date());
  if (!isRecurringTask(task)) {
    if (task.anyDayCompleted) return false;
    const taskWeek = startOfWeek(parseDate(task.anyDayDate) || new Date());
    return dateKey(taskWeek) === dateKey(viewingWeek);
  }

  const anchor = parseDate(task.nextAnyDayDate) || parseDate(task.anyDayDate) || viewingWeek;
  return Array.from({ length: 7 }, (_, index) => matchesRecurringDate(anchor, addDays(viewingWeek, index), task.recurrence)).some(Boolean);
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

function getDaySetting(index) {
  const settings = state.data.daySettings || {};
  return settings[index] || settings[String(index)] || { label: '', color: '' };
}

function populateDaySettingHourOptions() {
  if (!els.daySettingStart || !els.daySettingEnd) return;
  els.daySettingStart.innerHTML = '<option value="">All day</option>';
  els.daySettingEnd.innerHTML = '<option value="">All day</option>';
  for (let hour = 0; hour < 24; hour += 1) {
    const value = `${String(hour).padStart(2, '0')}:00`;
    const label = formatHourLabel(hour * 60);
    els.daySettingStart.insertAdjacentHTML('beforeend', `<option value="${value}">${label}</option>`);
  }
  for (let hour = 1; hour <= 24; hour += 1) {
    const value = hour === 24 ? '24:00' : `${String(hour).padStart(2, '0')}:00`;
    const label = hour === 24 ? 'Midnight' : formatHourLabel(hour * 60);
    els.daySettingEnd.insertAdjacentHTML('beforeend', `<option value="${value}">${label}</option>`);
  }
  updateDayStyleEndOptions();
}

function setDayStyleColor(color) {
  const selectedColor = String(color || '').trim();
  if (els.daySettingColor) els.daySettingColor.value = selectedColor;
  if (!els.daySettingPalette) return;
  els.daySettingPalette.querySelectorAll('.day-color-option').forEach((option) => {
    const selected = (option.dataset.color || '') === selectedColor;
    option.classList.toggle('selected', selected);
    option.setAttribute('aria-checked', selected ? 'true' : 'false');
  });
}

function updateDayStyleEndOptions() {
  if (!els.daySettingStart || !els.daySettingEnd) return;
  const start = parseDayStyleTime(els.daySettingStart.value);
  const currentEnd = els.daySettingEnd.value;
  Array.from(els.daySettingEnd.options).forEach((option) => {
    const end = parseDayStyleTime(option.value);
    option.disabled = start !== null && end !== null && end <= start;
  });
  const selectedOption = Array.from(els.daySettingEnd.options).find((option) => option.value === currentEnd);
  if (selectedOption && selectedOption.disabled) els.daySettingEnd.value = '';
}

function openDaySettings(index) {
  if (!els.daySettingsDialog || !els.daySettingsForm) return;
  editingDayIndex = index;
  const setting = getDaySetting(index);
  if (els.daySettingsTitle) els.daySettingsTitle.textContent = `Customize ${weekdayNames[index]}`;
  if (els.daySettingLabel) els.daySettingLabel.value = setting.label || '';
  setDayStyleColor(setting.color || '');
  if (els.daySettingStart) els.daySettingStart.value = setting.startTime || '';
  if (els.daySettingEnd) els.daySettingEnd.value = setting.endTime || '';
  updateDayStyleEndOptions();
  openDialog(els.daySettingsDialog);
  window.setTimeout(() => els.daySettingLabel && els.daySettingLabel.focus(), 30);
}

function saveDaySettings(event) {
  event.preventDefault();
  if (editingDayIndex === null) return;
  const dayName = weekdayNames[editingDayIndex];
  state.data.daySettings = state.data.daySettings || {};
  const label = String(els.daySettingLabel && els.daySettingLabel.value || '').trim();
  const color = String(els.daySettingColor && els.daySettingColor.value || '').trim();
  let startTime = String(els.daySettingStart && els.daySettingStart.value || '').trim();
  let endTime = String(els.daySettingEnd && els.daySettingEnd.value || '').trim();
  const startMinutes = parseDayStyleTime(startTime);
  const endMinutes = parseDayStyleTime(endTime);
  if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
    showToast('Choose an end time after the start time.');
    return;
  }
  // A single boundary is useful for quick setup: “from 6 PM” means until
  // midnight, while “until 9 AM” means from the beginning of the day.
  if (startMinutes !== null && endMinutes === null) endTime = '24:00';
  if (startMinutes === null && endMinutes !== null) startTime = '00:00';
  if (!label && !color && !startTime && !endTime) {
    delete state.data.daySettings[editingDayIndex];
  } else {
    state.data.daySettings[editingDayIndex] = { label, color, startTime, endTime, updatedAt: nowIso() };
  }
  persist();
  closeDialog(els.daySettingsDialog);
  render();
  showToast(`${dayName} style saved`);
}

function clearDaySettings() {
  if (editingDayIndex === null) return;
  const dayName = weekdayNames[editingDayIndex];
  state.data.daySettings = state.data.daySettings || {};
  delete state.data.daySettings[editingDayIndex];
  persist();
  closeDialog(els.daySettingsDialog);
  render();
  showToast(`${dayName} style cleared`);
}

function hexToRgba(hex, alpha) {
  const match = String(hex || '').match(/^#([0-9a-f]{6})$/i);
  if (!match) return '';
  const value = parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function parseDayStyleTime(value) {
  if (String(value || '') === '24:00') return 24 * 60;
  const minutes = parseTimeMinutes(value);
  return minutes === null ? null : minutes;
}

function getDayStyleRange(setting, range) {
  if (!setting || !setting.color) return null;
  const requestedStart = parseDayStyleTime(setting.startTime);
  const requestedEnd = parseDayStyleTime(setting.endTime);
  const start = requestedStart === null ? range.startMinutes : requestedStart;
  const end = requestedEnd === null ? range.endMinutes : requestedEnd;
  const visibleStart = Math.max(range.startMinutes, start);
  const visibleEnd = Math.min(range.endMinutes, end);
  if (visibleEnd <= visibleStart) return null;
  return { start: visibleStart, end: visibleEnd };
}

function renderWeek() {
  const todayKey = dateKey(new Date());
  const days = Array.from({ length: 7 }, (_, index) => addDays(state.weekStart, index));
  const occurrences = [];
  days.forEach((day) => getOccurrencesForDay(day).forEach((occurrence) => occurrences.push(occurrence)));
  const completedCount = occurrences.filter((item) => isCompleted(item.task.id, item.dateKey)).length;
  const openOccurrences = occurrences.filter((item) => !isCompleted(item.task.id, item.dateKey));
  const openCount = openOccurrences.length;
  const anyDayOpenCount = state.data.tasks.filter((task) => task.anyDay && isAnyDayTaskOpen(task)).length;
  const totalOpenCount = openCount + anyDayOpenCount;
  const expiryCount = openOccurrences.filter((item) => item.task.kind === 'expiry').length;
  els.weekSummary.innerHTML = `<span class="summary-dot"></span><span><strong>${totalOpenCount} ${totalOpenCount === 1 ? 'item' : 'items'}</strong> on the board${expiryCount ? ` · <strong class="expiry-summary">${expiryCount} use-by ${expiryCount === 1 ? 'reminder' : 'reminders'}</strong>` : ''}${completedCount ? ` · ${completedCount} done` : ''}</span>`;

  els.weekGrid.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'week-grid-wrapper';
  const grid = document.createElement('div');
  grid.className = 'week-grid timeline-grid';

  const range = getTimelineRange(openOccurrences);
  // Read the same responsive value that paints the horizontal grid lines.
  // Keeping the calculation tied to CSS prevents events from drifting when
  // Safari and the layout media query disagree about the device orientation.
  const untimedByDay = days.map((day) => openOccurrences.filter((item) => item.dateKey === dateKey(day) && !getTaskTimeBounds(item.task)));
  const cssHourHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--calendar-hour-height')) || 46;
  const hasUntimedItems = untimedByDay.some((items) => items.length > 0);
  // Keep the actual hour rows unchanged. Any-time tasks are rendered as a
  // compact overlay inside the 6 AM row instead of adding extra rows above
  // the timeline. This is especially important on the short iPad viewport.
  const hourHeight = cssHourHeight;
  const untimedStartMinutes = 6 * 60;
  const untimedHeight = hasUntimedItems
    ? (hourHeight < 40 ? Math.max(34, hourHeight + 14) : Math.max(16, hourHeight - 2))
    : 0;
  const untimedEndMinutes = untimedStartMinutes + (untimedHeight / hourHeight) * 60;
  const untimedStart = untimedHeight
    ? Math.max(0, ((untimedStartMinutes - range.startMinutes) / 60) * hourHeight)
    : 0;
  const compactTimeline = hourHeight < 40;
  const timedByDay = days.map((day) => openOccurrences
    .filter((item) => item.dateKey === dateKey(day))
    .filter((item) => Boolean(getTaskTimeBounds(item.task))));
  const timedLayoutsByDay = timedByDay.map((timed) => layoutTimedOccurrences(timed));
  const hasTimedItems = openOccurrences.some((item) => Boolean(getTaskTimeBounds(item.task)));
  // Cards have a minimum height, so leave a little room below an event that
  // ends exactly at the last visible hour instead of clipping it.
  const baseTimelineHeight = ((range.endMinutes - range.startMinutes) / 60) * hourHeight;
  const compactClusterCardHeight = 30;
  const stackBottom = timedLayoutsByDay.reduce((latest, placements) => {
    const groups = new Map();
    placements.forEach((placement) => {
      if (placement.stackGroupId === null) return;
      if (!groups.has(placement.stackGroupId)) groups.set(placement.stackGroupId, []);
      groups.get(placement.stackGroupId).push(placement);
    });
    groups.forEach((group) => {
      const groupStart = Math.min(...group.map((placement) => getTaskTimeBounds(placement.item.task).start));
      const clusterBottom = ((groupStart - range.startMinutes) / 60) * hourHeight
        + group.length * compactClusterCardHeight
        + Math.max(0, group.length - 1);
      latest = Math.max(latest, clusterBottom);
    });
    return latest;
  }, 0);
  const stackExtraBuffer = compactTimeline ? Math.max(0, stackBottom - baseTimelineHeight + 8) : 0;
  const bottomBuffer = hasTimedItems ? (compactTimeline ? 44 + stackExtraBuffer : 72) : 0;
  const timelineHeight = Math.max(1, baseTimelineHeight + bottomBuffer);
  grid.style.setProperty('--timeline-height', `${timelineHeight}px`);
  grid.style.setProperty('--hour-height', `${hourHeight}px`);
  grid.style.setProperty('--untimed-height', `${untimedHeight}px`);
  grid.style.setProperty('--untimed-start', `${untimedStart}px`);

  const axisHeader = document.createElement('div');
  axisHeader.className = 'time-axis-header';
  grid.appendChild(axisHeader);

  days.forEach((day, index) => {
    const key = dateKey(day);
    const header = document.createElement('header');
    const daySetting = getDaySetting(index);
    const languageClass = !daySetting.label && index === 5 ? ' language-spanish' : !daySetting.label && index === 6 ? ' language-dutch' : '';
    header.className = `day-header${key === todayKey ? ' today' : ''}${languageClass}`;
    header.tabIndex = 0;
    header.setAttribute('role', 'button');
    header.setAttribute('aria-label', `Customize ${weekdayNames[index]}`);
    header.title = `Customize ${weekdayNames[index]}`;
    // A limited tint belongs to the timeline only; an all-day tint also gets
    // a gentle header tint so the customized day remains easy to spot.
    if (daySetting.color && !daySetting.startTime && !daySetting.endTime) {
      header.style.backgroundColor = hexToRgba(daySetting.color, .13);
    }
    header.addEventListener('click', () => openDaySettings(index));
    header.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openDaySettings(index);
    });
    const dayNote = daySetting.label
      ? `<span class="language-note custom-day-note">${escapeHtml(daySetting.label)}</span>`
      : index === 5 ? '<span class="language-note spanish-note">En Español</span>'
        : index === 6 ? '<span class="language-note dutch-note">In het Nederlands</span>' : '';
    header.innerHTML = `
      <div>
        <p class="day-name">${shortWeekdayNames[index]}</p>
        <p class="day-number">${day.getDate()}</p>
        ${dayNote}
      </div>
      ${key === todayKey ? '<span class="today-label">Today</span>' : ''}
    `;
    grid.appendChild(header);
  });

  const axis = document.createElement('div');
  axis.className = 'time-axis';
  for (let hour = range.startHour; hour <= range.endHour; hour += 1) {
    const label = document.createElement('span');
    label.className = 'timeline-label';
    label.textContent = formatHourLabel(hour * 60);
    label.style.top = `${((hour * 60 - range.startMinutes) / 60) * hourHeight - 7}px`;
    axis.appendChild(label);
  }
  grid.appendChild(axis);

  days.forEach((day, index) => {
    const key = dateKey(day);
    const untimed = untimedByDay[index];
    const timeline = document.createElement('div');
    const daySetting = getDaySetting(index);
    const languageClass = !daySetting.label && index === 5 ? ' language-spanish' : !daySetting.label && index === 6 ? ' language-dutch' : '';
    timeline.className = `day-timeline${key === todayKey ? ' today' : ''}${languageClass}`;
    timeline.style.setProperty('--untimed-height', `${untimedHeight}px`);
    timeline.style.setProperty('--untimed-start', `${untimedStart}px`);
    timeline.addEventListener('click', (event) => {
      if (event.target.closest('.task-item')) return;
      const bounds = timeline.getBoundingClientRect();
      const y = event.clientY - bounds.top;
      let startTime = '';
      if (untimed.length && y >= untimedStart && y < untimedStart + untimedHeight) {
        startTime = '';
      } else {
        const clickedMinutes = range.startMinutes + (y / hourHeight) * 60;
        const snappedMinutes = Math.max(0, Math.min(24 * 60 - 15, Math.round(clickedMinutes / 15) * 15));
        startTime = formatInputTime(snappedMinutes);
      }
      openEventDialog({ date: key, startTime });
    });

    const languageBackdrop = document.createElement('div');
    languageBackdrop.className = `language-backdrop${index === 5 ? ' spanish-backdrop' : index === 6 ? ' dutch-backdrop' : ''}`;
    languageBackdrop.setAttribute('aria-hidden', 'true');
    if (index === 5) languageBackdrop.innerHTML = '<span>🌵</span><span>🌮</span><span>🍹</span><span>🎸</span>';
    if (index === 6) languageBackdrop.innerHTML = '<span>🧀</span><span>🥞</span><span>🧇</span><span>🚲</span>';
    if (languageBackdrop.innerHTML) timeline.appendChild(languageBackdrop);

    const dayStyleRange = getDayStyleRange(daySetting, range);
    if (dayStyleRange) {
      const dayStyleBand = document.createElement('div');
      dayStyleBand.className = 'day-style-band';
      dayStyleBand.setAttribute('aria-hidden', 'true');
      dayStyleBand.style.top = `${((dayStyleRange.start - range.startMinutes) / 60) * hourHeight}px`;
      dayStyleBand.style.height = `${((dayStyleRange.end - dayStyleRange.start) / 60) * hourHeight}px`;
      dayStyleBand.style.backgroundColor = hexToRgba(daySetting.color, .075);
      timeline.appendChild(dayStyleBand);
    }

    if (index < 5) {
      const workingHoursBand = document.createElement('div');
      workingHoursBand.className = 'working-hours-band';
      workingHoursBand.setAttribute('aria-hidden', 'true');
      workingHoursBand.style.top = `${((9 * 60 - range.startMinutes) / 60) * hourHeight}px`;
      workingHoursBand.style.height = `${8 * hourHeight}px`;
      timeline.appendChild(workingHoursBand);
    }

    const lines = document.createElement('div');
    lines.className = 'timeline-lines';
    timeline.appendChild(lines);

    if (untimed.length) {
      const untimedLane = document.createElement('div');
      untimedLane.className = 'untimed-lane';
      untimedLane.style.top = `${untimedStart}px`;
      untimed.forEach((item) => {
        const element = createTaskElement(item);
        element.classList.add('untimed-event');
        untimedLane.appendChild(element);
      });
      timeline.appendChild(untimedLane);
    }

    const timedPlacements = timedLayoutsByDay[index];
    // Overlapping events normally share horizontal lanes. Dense groups that
    // start in the same hour (or contain three or more items) are rendered as
    // a readable full-width stack instead of shrinking every card too far.
    const stackGroups = new Map();
    timedPlacements.forEach((placement) => {
      if (placement.stackGroupId === null) return;
      if (!stackGroups.has(placement.stackGroupId)) stackGroups.set(placement.stackGroupId, []);
      stackGroups.get(placement.stackGroupId).push(placement);
    });
    const renderedStackGroups = new Set();
    const renderSidePlacement = (placement) => {
      const element = createTaskElement(placement.item);
      const bounds = getTaskTimeBounds(placement.item.task);
      const top = ((bounds.start - range.startMinutes) / 60) * hourHeight;
      const minimumHeight = Math.max(compactTimeline ? 31 : 42, ((bounds.end - bounds.start) / 60) * hourHeight - 4);
      const laneWidth = 100 / placement.laneCount;
      element.classList.add('timed-event');
      element.style.top = `${top}px`;
      element.style.height = 'auto';
      element.style.left = `calc(${placement.lane * laneWidth}% + 3px)`;
      element.style.width = `calc(${laneWidth}% - 6px)`;
      if (untimedHeight && bounds.start < untimedEndMinutes && bounds.end > untimedStartMinutes) {
        element.style.zIndex = '6';
      }
      timeline.appendChild(element);
      element.style.height = `${Math.max(minimumHeight, element.scrollHeight + 2)}px`;
    };
    timedPlacements.forEach((placement) => {
      if (placement.stackGroupId === null) {
        renderSidePlacement(placement);
        return;
      }
      if (renderedStackGroups.has(placement.stackGroupId)) return;
      renderedStackGroups.add(placement.stackGroupId);
      const group = stackGroups.get(placement.stackGroupId);
      const groupStart = Math.min(...group.map((entry) => getTaskTimeBounds(entry.item.task).start));
      const cluster = document.createElement('div');
      cluster.className = 'timed-cluster';
      cluster.style.top = `${((groupStart - range.startMinutes) / 60) * hourHeight}px`;
      cluster.style.left = '3px';
      cluster.style.width = 'calc(100% - 6px)';
      group.forEach((entry) => {
        const element = createTaskElement(entry.item);
        element.classList.add('timed-cluster-item');
        cluster.appendChild(element);
      });
      timeline.appendChild(cluster);
    });
    grid.appendChild(timeline);
  });

  wrapper.appendChild(grid);
  els.weekGrid.appendChild(wrapper);
}

function createTaskElement({ task, dateKey: occurrenceDate, onComplete }) {
  const item = document.createElement('article');
  const kind = task.kind === 'expiry' ? 'expiry' : task.kind === 'wellness' ? 'wellness' : task.kind === 'event' ? 'event' : 'task';
  item.className = `task-item ${kind}`;
  item.setAttribute('role', 'button');
  item.setAttribute('tabindex', '0');
  item.setAttribute('aria-label', `Open ${task.title}`);
  const assigneeLabel = task.assignee === 'me' ? 'Nick' : task.assignee === 'partner' ? 'Stephany' : 'Both';
  const assigneeClass = task.assignee === 'me' ? 'assignee-me' : task.assignee === 'partner' ? 'assignee-partner' : 'assignee-both';
  const assigneeDecoration = task.assignee === 'me'
    ? '<span class="assignee-decoration nick-food-decoration" aria-hidden="true">🍛</span>'
    : task.assignee === 'partner'
      ? '<span class="assignee-decoration stephany-monkey-decoration" aria-hidden="true">🐒</span>'
      : '';
  const recurrenceLabel = task.recurrence === 'weekly' ? 'Every week' : task.recurrence === 'biweekly' ? 'Every 2 weeks' : task.recurrence === 'monthly' ? 'Every month' : task.recurrence === 'quarterly' ? 'Every 3 months' : '';
  const kindLabel = kind === 'expiry' ? 'Use-by' : kind === 'wellness' ? 'Wellness' : kind === 'event' ? 'Event' : 'Task';
  const eventTime = formatEventTime(task);
  item.innerHTML = `
    ${assigneeDecoration}
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
  item.querySelector('.task-check').addEventListener('change', () => {
    if (onComplete) onComplete();
    else completeTask(task.id, occurrenceDate, task.title);
  });
  const openTask = (event) => {
    if (event.target.closest('.task-check')) return;
    event.preventDefault();
    event.stopPropagation();
    openEventDialog({ task, date: occurrenceDate === 'any-day' ? 'any-day' : occurrenceDate || task.date });
  };
  item.addEventListener('click', openTask);
  item.addEventListener('keydown', (event) => {
    if (event.target.closest('.task-check')) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    openTask(event);
  });
  return item;
}

function getTimelineRange(occurrences) {
  const timed = occurrences.map((item) => getTaskTimeBounds(item.task)).filter(Boolean);
  const defaultStartHour = 6;
  const defaultEndHour = 21;
  if (!timed.length) return { startMinutes: defaultStartHour * 60, endMinutes: defaultEndHour * 60, startHour: defaultStartHour, endHour: defaultEndHour };
  let earliest = timed[0].start;
  let latest = timed[0].end;
  timed.forEach((bounds) => {
    earliest = Math.min(earliest, bounds.start);
    latest = Math.max(latest, bounds.end);
  });
  const startHour = Math.max(0, Math.min(defaultStartHour, Math.floor(earliest / 60)));
  const endHour = Math.min(24, Math.max(defaultEndHour, startHour + 1, Math.ceil(latest / 60)));
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
  const placements = [];
  let group = null;

  // Build connected overlap groups first. This keeps the lane count local to
  // the events that actually overlap: a late two-column group must not make
  // an unrelated event elsewhere in the day half-width.
  sorted.forEach((item) => {
    const bounds = getTaskTimeBounds(item.task);
    if (!group || bounds.start >= group.end) {
      group = { end: bounds.end, items: [] };
      group.items.push(item);
      placements.push(group);
      return;
    }
    group.end = Math.max(group.end, bounds.end);
    group.items.push(item);
  });

  const layout = [];
  placements.forEach((overlapGroup) => {
    const laneEnds = [];
    const groupPlacements = [];
    overlapGroup.items.forEach((item) => {
      const bounds = getTaskTimeBounds(item.task);
      let lane = 0;
      while (lane < laneEnds.length && laneEnds[lane] > bounds.start) lane += 1;
      laneEnds[lane] = bounds.end;
      groupPlacements.push({ item, lane });
    });
    const laneCount = Math.max(1, laneEnds.length);
    const startHours = overlapGroup.items.map((item) => Math.floor(getTaskTimeBounds(item.task).start / 60));
    const stackGroupId = overlapGroup.items.length >= 3 || new Set(startHours).size === 1 ? placements.indexOf(overlapGroup) : null;
    groupPlacements.forEach((placement) => layout.push({ ...placement, laneCount, stackGroupId }));
  });
  return layout;
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
  if (task.anyDay) return false;
  const anchor = parseDate(task.date);
  if (!anchor || day < anchor) return false;
  if (!isRecurringTask(task)) return dateKey(anchor) === dateKey(day);
  return matchesRecurringDate(anchor, day, task.recurrence);
}

function matchesRecurringDate(anchor, day, recurrence) {
  if (!anchor || day < anchor) return false;
  if (recurrence === 'weekly' || recurrence === 'biweekly') {
    const interval = recurrence === 'biweekly' ? 14 : 7;
    return differenceInDays(anchor, day) % interval === 0;
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

function isRecurringTask(task) {
  return ['weekly', 'biweekly', 'monthly', 'quarterly'].indexOf(task && task.recurrence) !== -1;
}

function rollOverdueRecurringTasks() {
  const currentWeekStart = startOfWeek(new Date());
  const currentWeekKey = dateKey(currentWeekStart);
  let changed = false;

  state.data.tasks.forEach((task) => {
    if (!isRecurringTask(task)) return;

    // Any-day tasks have their own due date because they do not belong to a
    // weekday. Advance that date by the configured interval only; otherwise
    // a monthly or biweekly item would incorrectly reappear every week.
    if (task.anyDay) {
      let dueDate = parseDate(task.nextAnyDayDate) || parseDate(task.anyDayDate) || new Date();
      if (!task.nextAnyDayDate) {
        task.nextAnyDayDate = dateKey(dueDate);
        task.updatedAt = nowIso();
        changed = true;
      }
      let guard = 0;
      while (dateKey(dueDate) < currentWeekKey && guard < 40) {
        task.lastMissedAnyDayDate = dateKey(dueDate);
        dueDate = addRecurringDate(dueDate, task.recurrence);
        task.nextAnyDayDate = dateKey(dueDate);
        task.updatedAt = nowIso();
        changed = true;
        guard += 1;
      }
      return;
    }

    let dueDate = parseDate(task.date);
    if (!dueDate) return;

    // Move past completed occurrences forward until the next open occurrence
    // is reached. This also makes older saved data safe after an app update.
    let guard = 0;
    while (dateKey(dueDate) < currentWeekKey && isCompleted(task.id, dateKey(dueDate)) && guard < 40) {
      dueDate = addRecurringDate(dueDate, task.recurrence);
      task.date = dateKey(dueDate);
      task.updatedAt = nowIso();
      changed = true;
      guard += 1;
    }

    // Weekly open tasks, such as the dishes, carry into the current week on
    // the same weekday. Longer intervals must keep their cadence: advance to
    // their next real occurrence instead of making them appear every week.
    if (dateKey(dueDate) < currentWeekKey && !isCompleted(task.id, dateKey(dueDate))) {
      if (task.recurrence === 'weekly') {
        const weekdayOffset = (dueDate.getDay() + 6) % 7;
        const movedDate = addDays(currentWeekStart, weekdayOffset);
        if (task.date !== dateKey(movedDate)) {
          task.date = dateKey(movedDate);
          task.updatedAt = nowIso();
          changed = true;
        }
      } else {
        let nextDate = dueDate;
        let intervalGuard = 0;
        while (dateKey(nextDate) < currentWeekKey && intervalGuard < 40) {
          nextDate = addRecurringDate(nextDate, task.recurrence);
          intervalGuard += 1;
        }
        if (task.date !== dateKey(nextDate)) {
          task.date = dateKey(nextDate);
          task.updatedAt = nowIso();
          changed = true;
        }
      }
    }
  });

  if (changed) persist();
}

function addRecurringDate(date, recurrence) {
  if (recurrence === 'weekly') return addDays(date, 7);
  if (recurrence === 'biweekly') return addDays(date, 14);
  if (recurrence === 'quarterly') return addMonths(date, 3);
  return addMonths(date, 1);
}

function addMonths(date, amount) {
  const target = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay));
}

function sortOccurrences(left, right) {
  const leftTime = left.task.startTime || '99:99';
  const rightTime = right.task.startTime || '99:99';
  return leftTime.localeCompare(rightTime) || left.task.title.localeCompare(right.task.title);
}

function completeTask(taskId, occurrenceDate, title) {
  const key = completionKey(taskId, occurrenceDate);
  const task = state.data.tasks.find((entry) => entry.id === taskId);
  const previousDate = task && task.date;
  state.data.completions[key] = true;
  if (task && isRecurringTask(task)) {
    const completedDate = parseDate(occurrenceDate);
    if (completedDate) {
      task.date = dateKey(addRecurringDate(completedDate, task.recurrence));
      task.updatedAt = nowIso();
    }
  }
  state.lastUndo = () => {
    delete state.data.completions[key];
    if (task && previousDate) task.date = previousDate;
    persist();
    render();
  };
  persist();
  render();
  showToast(`“${title}” marked done`, 'Undo');
}

function completeAnyDayTask(taskId, title) {
  const task = state.data.tasks.find((entry) => entry.id === taskId);
  if (!task) return;
  const completion = recordAnyDayCompletion(task, dateKey(new Date()));
  const previous = {
    anyDayCompleted: task.anyDayCompleted,
    nextAnyDayDate: task.nextAnyDayDate,
    lastMissedAnyDayDate: task.lastMissedAnyDayDate,
    updatedAt: task.updatedAt,
  };
  if (isRecurringTask(task)) {
    const completedDate = parseDate(task.nextAnyDayDate) || parseDate(task.anyDayDate) || new Date();
    task.nextAnyDayDate = dateKey(addRecurringDate(completedDate, task.recurrence));
    delete task.anyDayCompleted;
    delete task.lastMissedAnyDayDate;
  } else {
    task.anyDayCompleted = true;
  }
  task.updatedAt = nowIso();
  state.lastUndo = () => {
    if (previous.anyDayCompleted === undefined) delete task.anyDayCompleted;
    else task.anyDayCompleted = previous.anyDayCompleted;
    if (previous.nextAnyDayDate === undefined) delete task.nextAnyDayDate;
    else task.nextAnyDayDate = previous.nextAnyDayDate;
    if (previous.lastMissedAnyDayDate === undefined) delete task.lastMissedAnyDayDate;
    else task.lastMissedAnyDayDate = previous.lastMissedAnyDayDate;
    task.updatedAt = previous.updatedAt;
    state.data.anyDayCompletions = (state.data.anyDayCompletions || []).filter((entry) => entry.id !== completion.id);
    persist();
    render();
  };
  persist();
  render();
  showToast(`“${title}” marked done`, 'Undo');
}

function recordAnyDayCompletion(task, completedDate) {
  const entry = {
    id: createId(),
    taskId: task.id,
    title: task.title,
    assignee: task.assignee || 'both',
    completedDate,
    completedAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.data.anyDayCompletions = state.data.anyDayCompletions || [];
  state.data.anyDayCompletions.push(entry);
  return entry;
}

function handleTaskSubmit(event) {
  event.preventDefault();
  // Read the controls directly instead of using FormData. This is more
  // reliable on the older Safari shipped with iPad mini 2.
  const title = String(els.taskTitle.value || '').trim();
  const anyDay = Boolean(els.taskAnyDay && els.taskAnyDay.checked);
  const date = anyDay ? '' : String(els.taskDate.value || '');
  const startTime = String(els.eventStart && els.eventStart.value || '');
  const endTime = String(els.eventEnd && els.eventEnd.value || '');
  const recurrence = String(els.taskRepeat.value || 'none');
  const editingTask = editingTaskId ? state.data.tasks.find((task) => task.id === editingTaskId) : null;
  if (!title || (!anyDay && !date)) return;
  if (startTime && endTime && endTime < startTime) {
    showToast('End time must be after start time');
    return;
  }
  const updatedTask = {
    title,
    date,
    anyDay,
    startTime,
    endTime,
    assignee: String(els.taskAssignee.value || 'both'),
    kind: String(els.taskType.value || 'task'),
    recurrence,
    reminder: String(els.taskReminder && els.taskReminder.value || 'day-before'),
    updatedAt: nowIso(),
  };
  if (anyDay && recurrence !== 'none') {
    updatedTask.nextAnyDayDate = (editingTask && editingTask.nextAnyDayDate)
      || (editingTask && editingTask.anyDayDate)
      || dateKey(state.weekStart);
  }
  if (anyDay) {
    updatedTask.anyDayDate = (editingTask && editingTask.anyDayDate)
      || (editingTask && editingTask.nextAnyDayDate)
      || dateKey(state.weekStart);
  }
  if (editingTask) {
    Object.assign(editingTask, updatedTask);
    if (!anyDay || recurrence === 'none') delete editingTask.nextAnyDayDate;
    if (!anyDay) delete editingTask.anyDayDate;
    if (anyDay) delete editingTask.date;
  } else {
    state.data.tasks.push({ id: createId(), ...updatedTask });
  }
  persist();
  closeDialog(els.eventDialog);
  if (date) state.weekStart = startOfWeek(parseDate(date));
  render();
  showToast(editingTask ? 'Event updated' : 'Event added to the week');
}

function openEventDialog(options = {}) {
  const task = options.task || null;
  editingTaskId = task ? task.id : null;
  editingOccurrenceDate = options.date || (task && task.date) || null;
  els.taskForm.reset();
  if (els.dialogTitle) els.dialogTitle.textContent = task ? 'Edit event' : 'Add an event';
  if (els.saveEventButton) els.saveEventButton.textContent = task ? 'Save changes' : 'Save event';
  if (els.deleteEventButton) els.deleteEventButton.hidden = !task;
  if (els.completeEventButton) els.completeEventButton.hidden = !task;
  els.taskTitle.value = task ? task.title || '' : '';
  els.taskAnyDay.checked = Boolean(task && task.anyDay);
  els.taskDate.value = task && task.anyDay ? '' : options.date || (task && task.date) || dateKey(state.weekStart);
  els.eventStart.value = options.startTime !== undefined ? options.startTime : task && task.startTime || '';
  els.eventEnd.value = task && task.endTime || '';
  els.taskAssignee.value = task && task.assignee || 'both';
  els.taskType.value = task && task.kind || 'event';
  els.taskRepeat.value = task && task.recurrence || 'none';
  if (els.taskReminder) els.taskReminder.value = task && task.reminder || 'day-before';
  updateAnyDayField();
  updateTimeClearButtons();
  openDialog(els.eventDialog);
  window.setTimeout(() => els.taskTitle.focus(), 30);
}

function completeEditingEvent() {
  const task = editingTaskId ? state.data.tasks.find((entry) => entry.id === editingTaskId) : null;
  if (!task) return;
  const occurrenceDate = editingOccurrenceDate && editingOccurrenceDate !== 'any-day'
    ? editingOccurrenceDate
    : task.date;
  closeDialog(els.eventDialog);
  if (task.anyDay) {
    completeAnyDayTask(task.id, task.title);
    return;
  }
  if (!occurrenceDate) return;
  completeTask(task.id, occurrenceDate, task.title);
}

function updateAnyDayField() {
  if (!els.taskAnyDay || !els.taskDate) return;
  const anyDay = els.taskAnyDay.checked;
  els.taskDate.disabled = anyDay;
  els.taskDate.required = !anyDay;
  if (anyDay) els.taskDate.value = '';
  else if (!els.taskDate.value) els.taskDate.value = dateKey(state.weekStart);
}

function clearTimeInput(input) {
  if (!input) return;
  input.value = '';
  updateTimeClearButtons();
  input.focus();
}

function updateTimeClearButtons() {
  if (els.clearEventStartButton) els.clearEventStartButton.hidden = !els.eventStart || !els.eventStart.value;
  if (els.clearEventEndButton) els.clearEventEndButton.hidden = !els.eventEnd || !els.eventEnd.value;
}

function deleteEditingEvent() {
  if (!editingTaskId) return;
  const taskIndex = state.data.tasks.findIndex((entry) => entry.id === editingTaskId);
  const task = taskIndex >= 0 ? state.data.tasks[taskIndex] : null;
  if (!task) return;
  if (!window.confirm(`Delete “${task.title}”?`)) return;
  const deletedTask = JSON.parse(JSON.stringify(task));
  const deletedCompletions = {};
  Object.keys(state.data.completions || {}).forEach((key) => {
    if (key.indexOf(`${task.id}::`) === 0) deletedCompletions[key] = state.data.completions[key];
  });
  markDeleted('tasks', task.id);
  state.data.tasks = state.data.tasks.filter((entry) => entry.id !== task.id);
  Object.keys(state.data.completions || {}).forEach((key) => {
    if (key.indexOf(`${task.id}::`) === 0) delete state.data.completions[key];
  });
  state.lastUndo = () => {
    state.data.tasks.splice(Math.min(taskIndex, state.data.tasks.length), 0, deletedTask);
    Object.assign(state.data.completions, deletedCompletions);
    clearDeletedMark('tasks', deletedTask.id);
    deletedTask.updatedAt = nowIso();
    persist();
    render();
    showToast(`“${deletedTask.title}” restored`);
  };
  persist();
  closeDialog(els.eventDialog);
  render();
  showToast('Event deleted', 'Undo');
}

function handleListClick(event) {
  const target = event.target.closest('[data-list-action]');
  if (!target) return;
  const listName = target.dataset.listName;
  const itemId = target.dataset.itemId;
  const item = state.data[listName].find((entry) => entry.id === itemId);
  if (!item) return;
  if (target.dataset.listAction === 'toggle') {
    item.completed = !item.completed;
    item.updatedAt = nowIso();
  }
  if (target.dataset.listAction === 'delete') {
    const itemIndex = state.data[listName].findIndex((entry) => entry.id === itemId);
    const deletedItem = JSON.parse(JSON.stringify(item));
    markDeleted(listName, itemId);
    state.data[listName] = state.data[listName].filter((entry) => entry.id !== itemId);
    state.lastUndo = () => {
      state.data[listName].splice(Math.min(itemIndex, state.data[listName].length), 0, deletedItem);
      clearDeletedMark(listName, deletedItem.id);
      deletedItem.updatedAt = nowIso();
      persist();
      render();
      showToast(`“${deletedItem.title}” restored`);
    };
    persist();
    render();
    showToast('Item deleted', 'Undo');
    return;
  }
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
  const deletedItems = state.data[listName]
    .map((item, index) => ({ item: JSON.parse(JSON.stringify(item)), index }))
    .filter(({ item }) => item.completed);
  deletedItems.forEach(({ item }) => markDeleted(listName, item.id));
  state.data[listName] = state.data[listName].filter((item) => !item.completed);
  if (state.data[listName].length !== before) {
    state.lastUndo = () => {
      deletedItems.forEach(({ item, index }) => {
        state.data[listName].splice(Math.min(index, state.data[listName].length), 0, item);
        clearDeletedMark(listName, item.id);
        item.updatedAt = nowIso();
      });
      persist();
      render();
      showToast('Completed items restored');
    };
    persist();
    render();
    showToast('Completed items cleared', 'Undo');
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
        anyDayCompletions: Array.isArray(imported.anyDayCompletions) ? imported.anyDayCompletions.map(normalizeAnyDayCompletion) : [],
        daySettings: normalizeDaySettings(imported.daySettings),
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

function loadSyncConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY));
    if (stored && stored.url && stored.key) return { url: String(stored.url), key: String(stored.key) };
  } catch (error) {
    // Fall back to local-only mode.
  }
  return { url: '', key: '' };
}

function loadSyncSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(SYNC_SESSION_KEY));
    if (stored && stored.access_token && stored.refresh_token && stored.user && stored.user.id) return stored;
  } catch (error) {
    // A broken session should never prevent the local planner from opening.
  }
  return null;
}

function loadSyncEmail() {
  try {
    return String(localStorage.getItem(SYNC_EMAIL_KEY) || '');
  } catch (error) {
    return '';
  }
}

function initializeSync() {
  if (els.syncProjectUrl) els.syncProjectUrl.value = syncState.config.url;
  if (els.syncPublishableKey) els.syncPublishableKey.value = syncState.config.key;
  if (els.syncEmail) els.syncEmail.value = loadSyncEmail() || (syncState.session && syncState.session.user && syncState.session.user.email) || '';
  renderSyncStatus();
  if (syncState.session && syncState.config.url && syncState.config.key) {
    startSyncPolling();
    syncNow(false);
  }
}

function saveSyncConfig() {
  const url = String(els.syncProjectUrl.value || '').trim().replace(/\/$/, '');
  const key = String(els.syncPublishableKey.value || '').trim();
  if (!/^https:\/\//i.test(url) || !key) {
    setSyncStatus('Enter the HTTPS project URL and publishable key.', 'error');
    return;
  }
  const connectionChanged = syncState.config.url !== url || syncState.config.key !== key;
  syncState.config = { url, key };
  if (connectionChanged) {
    syncState.session = null;
    stopSyncPolling();
    localStorage.removeItem(SYNC_SESSION_KEY);
  }
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(syncState.config));
  if (syncState.session && !connectionChanged) {
    renderSyncStatus('Connection saved. Already signed in; syncing automatically.', 'connected');
    startSyncPolling();
    syncNow(false);
  } else {
    renderSyncStatus('Connection saved. Sign in below.');
  }
  showToast(connectionChanged ? 'Cloud connection saved' : 'Connection remembered on this device');
}

async function signIn(createAccount) {
  if (!syncState.config.url || !syncState.config.key) {
    setSyncStatus('Save the Supabase connection first.', 'error');
    return;
  }
  const email = String(els.syncEmail.value || '').trim();
  const password = String(els.syncPassword.value || '');
  if (!email || password.length < 8) {
    setSyncStatus('Enter an email and a password of at least 8 characters.', 'error');
    return;
  }
  localStorage.setItem(SYNC_EMAIL_KEY, email);
  setSyncStatus(createAccount ? 'Creating account…' : 'Signing in…');
  try {
    const path = createAccount ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password';
    const response = await syncRequest(path, { method: 'POST', body: { email, password } });
    if (!response.access_token) {
      setSyncStatus('Account created. Check the confirmation email, then sign in.', 'connected');
      return;
    }
    setSyncSession(response);
    startSyncPolling();
    await syncNow(true);
    els.syncPassword.value = '';
  } catch (error) {
    setSyncStatus(error.message || 'Cloud sign-in failed.', 'error');
  }
}

function signOut() {
  stopSyncPolling();
  syncState.session = null;
  localStorage.removeItem(SYNC_SESSION_KEY);
  renderSyncStatus('Signed out. Local planner data is still available.');
}

function setSyncSession(response) {
  syncState.session = {
    access_token: response.access_token,
    refresh_token: response.refresh_token,
    expires_in: response.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + Number(response.expires_in || 3600),
    user: response.user,
  };
  localStorage.setItem(SYNC_SESSION_KEY, JSON.stringify(syncState.session));
}

function startSyncPolling() {
  stopSyncPolling();
  syncState.pollTimer = window.setInterval(() => syncNow(false), SYNC_POLL_MS);
}

function stopSyncPolling() {
  if (syncState.pollTimer) window.clearInterval(syncState.pollTimer);
  syncState.pollTimer = null;
}

function renderSyncStatus(message, type) {
  if (!els.syncStatus) return;
  if (message) els.syncStatus.textContent = message;
  else if (!syncState.config.url || !syncState.config.key) els.syncStatus.textContent = 'Cloud sync is not connected.';
  else if (syncState.session) els.syncStatus.textContent = 'Connected. Syncing automatically.';
  else els.syncStatus.textContent = 'Connection saved. Sign in below.';
  els.syncStatus.className = `sync-status${type ? ` ${type}` : syncState.session ? ' connected' : ''}`;
}

function setSyncStatus(message, type) {
  renderSyncStatus(message, type);
}

async function syncNow(manual) {
  if (!syncState.config.url || !syncState.config.key) {
    if (manual) setSyncStatus('Save the Supabase connection first.', 'error');
    return;
  }
  if (!syncState.session) {
    if (manual) setSyncStatus('Sign in to start cloud sync.', 'error');
    return;
  }
  if (syncState.busy) {
    syncState.pending = true;
    return;
  }
  syncState.busy = true;
  if (manual) setSyncStatus('Syncing…');
  try {
    const session = await ensureSyncSession();
    if (!session) throw new Error('Your session expired. Please sign in again.');
    const remote = await fetchRemoteData(session);
    const localBefore = JSON.stringify(state.data);
    const merged = remote ? mergePlannerData(state.data, remote) : state.data;
    const mergedSignature = JSON.stringify(merged);
    if (mergedSignature !== localBefore) {
      state.data = merged;
      persist({ sync: false });
      render();
    }
    if (!remote || JSON.stringify(remote) !== mergedSignature) await pushRemoteData(session, merged);
    renderSyncStatus('Connected. Synced just now.', 'connected');
  } catch (error) {
    if (/401|403|expired|invalid/i.test(error.message || '')) {
      syncState.session = null;
      localStorage.removeItem(SYNC_SESSION_KEY);
      stopSyncPolling();
    }
    setSyncStatus(error.message || 'Sync failed; local saving is still active.', 'error');
  } finally {
    syncState.busy = false;
    if (syncState.pending) {
      syncState.pending = false;
      window.setTimeout(() => syncNow(false), 250);
    }
  }
}

async function ensureSyncSession() {
  const session = syncState.session;
  if (!session) return null;
  if (!session.expires_at || Date.now() < (Number(session.expires_at) * 1000) - 60000) return session;
  if (!session.refresh_token) return null;
  const response = await syncRequest('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } });
  setSyncSession(response);
  return syncState.session;
}

async function fetchRemoteData(session) {
  const userId = encodeURIComponent(session.user.id);
  const rows = await syncRequest(`/rest/v1/planner_documents?id=eq.${userId}&select=id,data,updated_at`, { method: 'GET' }, session.access_token);
  if (!Array.isArray(rows) || !rows.length) return null;
  return normalizePlannerData(rows[0].data);
}

async function pushRemoteData(session, data) {
  await syncRequest('/rest/v1/planner_documents', {
    method: 'POST',
    body: [{ id: session.user.id, data, updated_at: new Date().toISOString() }],
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  }, session.access_token);
}

async function syncRequest(path, options, accessToken) {
  const headers = {
    apikey: syncState.config.key,
    'Content-Type': 'application/json',
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  Object.keys((options && options.headers) || {}).forEach((key) => { headers[key] = options.headers[key]; });
  const request = { method: (options && options.method) || 'GET', headers };
  if (options && options.body !== undefined) request.body = JSON.stringify(options.body);
  const response = await fetch(syncState.config.url + path, request);
  const text = await response.text();
  let result = null;
  try { result = text ? JSON.parse(text) : null; } catch (error) { result = null; }
  if (!response.ok) {
    const message = result && (result.msg || result.message || result.error_description || result.error) || `Cloud request failed (${response.status})`;
    throw new Error(message);
  }
  return result;
}

function mergePlannerData(local, remote) {
  const localIsDemo = Boolean(local.meta && local.meta.demo);
  const remoteIsDemo = Boolean(remote.meta && remote.meta.demo);
  if (localIsDemo && remoteIsDemo) return remote;
  if (localIsDemo && !remoteIsDemo) return remote;
  if (remoteIsDemo && !localIsDemo) return local;
  const deleted = mergeDeletedMaps(local.meta && local.meta.deleted, remote.meta && remote.meta.deleted);
  return {
    tasks: mergeItems(local.tasks, remote.tasks, deleted.tasks),
    todos: mergeItems(local.todos, remote.todos, deleted.todos),
    groceries: mergeItems(local.groceries, remote.groceries, deleted.groceries),
    completions: Object.assign({}, remote.completions || {}, local.completions || {}),
    anyDayCompletions: mergeItems(local.anyDayCompletions || [], remote.anyDayCompletions || [], {}),
    daySettings: mergeDaySettings(local.daySettings, remote.daySettings),
    meta: { demo: false, deleted },
  };
}

function mergeDeletedMaps(localDeleted, remoteDeleted) {
  const result = { tasks: {}, todos: {}, groceries: {} };
  ['tasks', 'todos', 'groceries'].forEach((listName) => {
    Object.assign(result[listName], (remoteDeleted && remoteDeleted[listName]) || {}, (localDeleted && localDeleted[listName]) || {});
    Object.keys((remoteDeleted && remoteDeleted[listName]) || {}).forEach((id) => {
      result[listName][id] = Math.max(Number((remoteDeleted[listName] || {})[id]) || 0, Number((localDeleted && localDeleted[listName] || {})[id]) || 0);
    });
  });
  return result;
}

function mergeItems(localItems, remoteItems, deleted) {
  const merged = [];
  const byId = {};
  (localItems || []).concat(remoteItems || []).forEach((item) => {
    if (!item || !item.id) return;
    const deletedAt = Number((deleted && deleted[item.id]) || 0);
    const updatedAt = Date.parse(item.updatedAt || '') || 0;
    if (deletedAt && updatedAt <= deletedAt) return;
    if (!byId[item.id]) {
      byId[item.id] = item;
      merged.push(item);
      return;
    }
    const previousUpdatedAt = Date.parse(byId[item.id].updatedAt || '') || 0;
    if (updatedAt > previousUpdatedAt) byId[item.id] = item;
  });
  return merged.map((item) => byId[item.id]);
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
  if (isVolunteeringTask(normalized.title) && normalized.startTime !== '14:00') {
    normalized.startTime = '14:00';
    normalized.updatedAt = nowIso();
  }
  normalized.anyDay = Boolean(normalized.anyDay);
  if (normalized.anyDay) {
    normalized.anyDayDate = normalized.anyDayDate || normalized.nextAnyDayDate || dateKey(startOfWeek(new Date()));
  }
  normalized.reminder = normalized.reminder || 'day-before';
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
    anyDayCompletions: Array.isArray(stored.anyDayCompletions) ? stored.anyDayCompletions.map(normalizeAnyDayCompletion) : [],
    daySettings: normalizeDaySettings(stored.daySettings),
    meta: stored.meta && typeof stored.meta === 'object' ? stored.meta : {},
  };
}

function normalizeAnyDayCompletion(entry) {
  const normalized = {};
  Object.keys(entry || {}).forEach((key) => { normalized[key] = entry[key]; });
  normalized.id = normalized.id || createId();
  normalized.title = String(normalized.title || '').trim();
  normalized.assignee = ['me', 'partner', 'both'].indexOf(normalized.assignee) !== -1 ? normalized.assignee : 'both';
  normalized.completedDate = String(normalized.completedDate || '');
  normalized.updatedAt = normalized.updatedAt || normalized.completedAt || nowIso();
  return normalized;
}

function normalizeDaySettings(settings) {
  const normalized = {};
  for (let index = 0; index < 7; index += 1) {
    const setting = settings && settings[index] || settings && settings[String(index)];
    if (!setting) continue;
    let startTime = normalizeDayStyleTime(setting.startTime, false);
    let endTime = normalizeDayStyleTime(setting.endTime, true);
    const startMinutes = parseDayStyleTime(startTime);
    const endMinutes = parseDayStyleTime(endTime);
    if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
      startTime = '';
      endTime = '';
    }
    if (!setting.label && !setting.color && !startTime && !endTime) continue;
    normalized[index] = {
      label: String(setting.label || '').trim().slice(0, 40),
      color: /^#[0-9a-f]{6}$/i.test(String(setting.color || '')) ? String(setting.color) : '',
      startTime,
      endTime,
      updatedAt: setting.updatedAt || nowIso(),
    };
  }
  return normalized;
}

function normalizeDayStyleTime(value, isEnd) {
  const text = String(value || '').trim();
  if (isEnd && text === '24:00') return text;
  if (!/^\d{2}:00$/.test(text)) return '';
  const hour = Number(text.slice(0, 2));
  if (hour < 0 || hour > (isEnd ? 23 : 23)) return '';
  return text;
}

function mergeDaySettings(local, remote) {
  const merged = {};
  for (let index = 0; index < 7; index += 1) {
    const localSetting = local && (local[index] || local[String(index)]);
    const remoteSetting = remote && (remote[index] || remote[String(index)]);
    if (!localSetting && !remoteSetting) continue;
    if (!localSetting) merged[index] = remoteSetting;
    else if (!remoteSetting) merged[index] = localSetting;
    else merged[index] = (Date.parse(localSetting.updatedAt || '') || 0) >= (Date.parse(remoteSetting.updatedAt || '') || 0)
      ? localSetting
      : remoteSetting;
  }
  return merged;
}

function importFootballSchedule() {
  const meta = state.data.meta || (state.data.meta = {});
  if (meta.footballScheduleVersion === FOOTBALL_SCHEDULE_VERSION) return false;
  const importedAt = nowIso();
  let changed = false;
  FOOTBALL_SCHEDULE.forEach((match) => {
    const matchKey = `${match.date}|${match.startTime}|${match.opponent}`;
    const stableId = `football-${match.date}-${match.opponent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    const existing = state.data.tasks.find((task) => task.id === stableId
      || task.footballKey === matchKey
      || (task.date === match.date && task.startTime === match.startTime && /^futbol\b/i.test(task.title || '')));
    const endTime = formatInputTime(parseTimeMinutes(match.startTime) + 180);
    const desired = {
      id: stableId,
      title: `Futbol @${match.home ? 'home' : 'Away'} · ${match.opponent}`,
      date: match.date,
      anyDay: false,
      startTime: match.startTime,
      endTime,
      assignee: 'me',
      kind: 'event',
      recurrence: 'none',
      reminder: 'none',
      footballKey: matchKey,
      updatedAt: importedAt,
    };
    if (!existing) {
      state.data.tasks.push(desired);
      changed = true;
      return;
    }
    const previousId = existing.id;
    if (previousId !== stableId) {
      const completions = state.data.completions || {};
      const prefix = `${previousId}::`;
      Object.keys(completions).forEach((key) => {
        if (!key.startsWith(prefix)) return;
        completions[`${stableId}${key.slice(previousId.length)}`] = completions[key];
        delete completions[key];
      });
    }
    const differs = Object.keys(desired).some((key) => existing[key] !== desired[key]);
    Object.assign(existing, desired);
    if (differs) changed = true;
  });
  if (meta.footballScheduleVersion !== FOOTBALL_SCHEDULE_VERSION) {
    meta.footballScheduleVersion = FOOTBALL_SCHEDULE_VERSION;
    changed = true;
  }
  return changed;
}

function applyDataMigrations() {
  let changed = importFootballSchedule();
  const meta = state.data.meta || (state.data.meta = {});
  if (!meta.volunteeringStartFixVersion) {
    const task = state.data.tasks.find((entry) => isVolunteeringTask(entry.title));
    if (task) {
      if (task.startTime !== '14:00') {
        task.startTime = '14:00';
        task.updatedAt = nowIso();
        changed = true;
      }
      meta.volunteeringStartFixVersion = '20260923-v1';
      changed = true;
    }
  }
  return changed;
}

function isVolunteeringTask(title) {
  return /^volunt(?:e)?ering\b/i.test(String(title || '').trim());
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
    anyDayCompletions: [],
    daySettings: {},
    meta: { demo: true },
  };
}

function persist(options) {
  try {
    state.data.meta = Object.assign({}, state.data.meta || {}, { demo: false });
    const serialized = JSON.stringify(state.data);
    // The stable primary key preserves the data across app versions. The
    // second copy gives us a recovery path if iOS returns an incomplete store
    // after updating or reinstalling a Home Screen shortcut.
    localStorage.setItem(STORAGE_KEY, serialized);
    localStorage.setItem(BACKUP_STORAGE_KEY, serialized);
    mirrorDataToIndexedDB(state.data);
    if (!options || options.sync !== false) queueCloudSync();
    els.saveStatus.innerHTML = '<span class="status-dot"></span> Saved on this tablet';
  } catch (error) {
    els.saveStatus.innerHTML = '<span class="status-dot" style="background:#e5a34b"></span> Storage is unavailable';
    console.warn('Homeboard data could not be saved', error);
  }
}

function markDeleted(listName, itemId) {
  state.data.meta = state.data.meta || {};
  state.data.meta.deleted = state.data.meta.deleted || { tasks: {}, todos: {}, groceries: {} };
  state.data.meta.deleted[listName] = state.data.meta.deleted[listName] || {};
  state.data.meta.deleted[listName][itemId] = Date.now();
}

function clearDeletedMark(listName, itemId) {
  const deleted = state.data.meta && state.data.meta.deleted && state.data.meta.deleted[listName];
  if (!deleted) return;
  delete deleted[itemId];
}

function queueCloudSync() {
  if (!syncState || !syncState.session || !syncState.config.url || !syncState.config.key) return;
  if (syncState.queueTimer) return;
  syncState.queueTimer = window.setTimeout(() => {
    syncState.queueTimer = null;
    syncNow(false);
  }, 800);
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
    navigator.serviceWorker.register(`./sw.js?v=${APP_VERSION}`).then((registration) => {
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
  if (dialog === els.eventDialog) {
    editingTaskId = null;
    editingOccurrenceDate = null;
  }
  if (dialog === els.daySettingsDialog) editingDayIndex = null;
  document.body.classList.remove('modal-open');
}

function nowIso() { return new Date().toISOString(); }
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
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59) return null;
  if (match[3]) {
    if (hours < 1 || hours > 12) return null;
    if (match[3].toUpperCase() === 'AM' && hours === 12) hours = 0;
    if (match[3].toUpperCase() === 'PM' && hours !== 12) hours += 12;
  }
  if (hours > 23) return null;
  return hours * 60 + minutes;
}
function formatHourLabel(minutes) {
  const normalized = minutes === 24 * 60 ? 0 : minutes;
  const hour = Math.floor(normalized / 60);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour} ${suffix}`;
}
function formatInputTime(minutes) {
  const safeMinutes = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
}
function formatEventTime(task) {
  const start = task.startTime || '';
  const end = task.endTime || '';
  if (start && end) return `${formatTime(start)} – ${formatTime(end)}`;
  if (start) return `From ${formatTime(start)}`;
  if (end) return `Until ${formatTime(end)}`;
  return '';
}
function formatTime(time) {
  const minutesSinceMidnight = parseTimeMinutes(time);
  if (minutesSinceMidnight === null) return String(time || '');
  const hours = Math.floor(minutesSinceMidnight / 60);
  const minutes = minutesSinceMidnight % 60;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
function escapeAttribute(value) { return escapeHtml(value); }
