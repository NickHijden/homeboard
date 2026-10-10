// Keep the production keys stable. The public staging path has a separate
// namespace because GitHub Pages paths share the same browser origin.
const IS_STAGING_HOST = isStagingHost();
const IS_DEMO_HOST = new URLSearchParams(window.location.search).get('demo') === '1';
const STORAGE_NAMESPACE = (IS_STAGING_HOST ? '-staging' : '') + (IS_DEMO_HOST ? '-demo' : '');
const STORAGE_KEY = `homeboard-household-planner-v1${STORAGE_NAMESPACE}`;
const BACKUP_STORAGE_KEY = `homeboard-household-planner-last-known-good-v1${STORAGE_NAMESPACE}`;
const IDB_NAME = `homeboard-household-planner-storage${STORAGE_NAMESPACE}`;
const IDB_STORE = 'planner-data';
const SYNC_CONFIG_KEY = `homeboard-sync-config-v1${STORAGE_NAMESPACE}`;
const SYNC_SESSION_KEY = `homeboard-sync-session-v1${STORAGE_NAMESPACE}`;
const SYNC_EMAIL_KEY = `homeboard-sync-email-v1${STORAGE_NAMESPACE}`;
const HOUSEHOLD_SELECTION_KEY = `homeboard-household-selection-v1${STORAGE_NAMESPACE}`;
const ACCOUNT_RESET_KEY = `homeboard-account-reset-v1${STORAGE_NAMESPACE}`;
const HOUSEHOLD_DELETED_KEY = `homeboard-household-deleted-v1${STORAGE_NAMESPACE}:`;
let storageGeneration = readStorageGeneration();
const SYNC_POLL_MS = 15000;
const APP_VERSION = '20261010-01-staging';
// Bump independently of the app when the acknowledged wording changes.
const PRIVACY_TERMS_VERSION = '2026-10-08-draft-1';
const PRODUCTION_SUPABASE_URL = 'https://yflzmwriknvxhwhaetuk.supabase.co';
const IS_DEVELOPMENT_HOST = isDevelopmentHost();
const PRODUCTION_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vnprRkQ5uPS2yH1D9fJu1w_-V0jEd0z';
const CENTRAL_PRODUCTION_CONFIG = { url: PRODUCTION_SUPABASE_URL, key: PRODUCTION_SUPABASE_PUBLISHABLE_KEY };
// The public test site follows the customer flow, with its own fixed backend.
const CENTRAL_STAGING_CONFIG = {
  url: 'https://axfxuqihsscjekicbgkk.supabase.co',
  key: 'sb_publishable_AJsvciGTAoJU62s-KPhUjQ_-sN4b7vB',
};
const MANUAL_SYNC_CONFIG_ALLOWED = IS_DEVELOPMENT_HOST && !IS_STAGING_HOST;
const HOUSEHOLD_UI_ENABLED = IS_DEVELOPMENT_HOST || Boolean(CENTRAL_PRODUCTION_CONFIG.url && CENTRAL_PRODUCTION_CONFIG.key);
const LEGACY_STORAGE_KEYS = IS_STAGING_HOST ? [
  'homeboard-household-planner-v2-staging',
  'homeboard-planner-data-staging',
  'homeboard-data-staging',
] : [
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

const syncState = {
  config: loadSyncConfig(),
  session: loadSyncSession(),
  pollTimer: null,
  queueTimer: null,
  busy: false,
  pending: false,
  authenticating: false,
  generation: 0,
  deleting: false,
};
let accountBusy = false;
let deletionPreview = null;
let householdDeletion = null;
let householdDeleteBusy = false;

const householdState = {
  households: [],
  invitations: [],
  members: [],
  membersHouseholdId: '',
  selectedHouseholdId: loadHouseholdSelection(),
  loaded: false,
  loading: false,
};
let householdLoadPromise = null;
let householdLoadGeneration = -1;
let invitationState = null;
let activePlannerScope = plannerScopeFor(syncState.session, householdState.selectedHouseholdId);
let plannerGeneration = 0;
let plannerRevision = 0;
let plannerRecoveryPromise = Promise.resolve();
const state = {
  data: loadData(),
  weekStart: startOfWeek(new Date()),
  lastUndo: null,
  toastTimer: null,
};
const platformAdminState = {
  isAdmin: false,
  households: [],
  loaded: false,
  loading: false,
};

const els = {
  weekHeading: document.querySelector('#weekHeading'),
  weekRange: document.querySelector('#weekRange'),
  weekSummary: document.querySelector('#weekSummary'),
  anyDayBoard: document.querySelector('#anyDayBoard'),
  weekGrid: document.querySelector('#weekGrid'),
  completedAnyDayBoard: document.querySelector('#completedAnyDayBoard'),
  addEventButton: document.querySelector('#addEventButton') || document.querySelector('#addTaskButton'),
  taskOverviewButton: document.querySelector('#taskOverviewButton'),
  taskOverviewDialog: document.querySelector('#taskOverviewDialog'),
  closeTaskOverviewButton: document.querySelector('#closeTaskOverviewButton'),
  closeTaskOverviewButtonAlt: document.querySelector('#closeTaskOverviewButtonAlt'),
  taskOverviewSummary: document.querySelector('#taskOverviewSummary'),
  taskOverviewList: document.querySelector('#taskOverviewList'),
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
  taskStartWeek: document.querySelector('#taskStartWeek'),
  recurrenceStartGroup: document.querySelector('#recurrenceStartGroup'),
  recurrenceStartHint: document.querySelector('#recurrenceStartHint'),
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
  environmentBadge: document.querySelector('#environmentBadge'),
  toast: document.querySelector('#toast'),
  settingsButton: document.querySelector('#settingsButton'),
  householdButton: document.querySelector('#householdButton'),
  settingsDialog: document.querySelector('#settingsDialog'),
  closeSettingsButton: document.querySelector('#closeSettingsButton'),
  settingsForm: document.querySelector('#settingsForm'),
  exportButton: document.querySelector('#exportButton'),
  importInput: document.querySelector('#importInput'),
  backupDialog: document.querySelector('#backupDialog'),
  backupText: document.querySelector('#backupText'),
  backupStatus: document.querySelector('#backupStatus'),
  closeBackupButton: document.querySelector('#closeBackupButton'),
  closeBackupButtonAlt: document.querySelector('#closeBackupButtonAlt'),
  copyBackupButton: document.querySelector('#copyBackupButton'),
  syncProjectUrl: document.querySelector('#syncProjectUrl'),
  syncPublishableKey: document.querySelector('#syncPublishableKey'),
  syncEmail: document.querySelector('#syncEmail'),
  syncPassword: document.querySelector('#syncPassword'),
  saveSyncConfigButton: document.querySelector('#saveSyncConfigButton'),
  syncSignInButton: document.querySelector('#syncSignInButton'),
  syncSignUpButton: document.querySelector('#syncSignUpButton'),
  signupAcknowledgement: document.querySelector('#signupAcknowledgement'),
  signupAcknowledgementPanel: document.querySelector('#signupAcknowledgementPanel'),
  syncNowButton: document.querySelector('#syncNowButton'),
  syncSignOutButton: document.querySelector('#syncSignOutButton'),
  syncStatus: document.querySelector('#syncStatus'),
  syncCopy: document.querySelector('#syncCopy'),
  syncConfigFields: document.querySelector('#syncConfigFields'),
  householdSection: document.querySelector('#householdSection'),
  platformAdminSection: document.querySelector('#platformAdminSection'),
  platformAdminList: document.querySelector('#platformAdminList'),
  platformAdminStatus: document.querySelector('#platformAdminStatus'),
  householdWorkspace: document.querySelector('#householdWorkspace'),
  householdAuthStatus: document.querySelector('#householdAuthStatus'),
  householdSelect: document.querySelector('#householdSelect'),
  householdMemberList: document.querySelector('#householdMemberList'),
  householdRenamePanel: document.querySelector('#householdRenamePanel'),
  householdRenameInput: document.querySelector('#householdRenameInput'),
  renameHouseholdButton: document.querySelector('#renameHouseholdButton'),
  householdNameInput: document.querySelector('#householdNameInput'),
  createHouseholdButton: document.querySelector('#createHouseholdButton'),
  householdInvitePanel: document.querySelector('#householdInvitePanel'),
  inviteEmailInput: document.querySelector('#inviteEmailInput'),
  createInvitationButton: document.querySelector('#createInvitationButton'),
  invitationLinkBox: document.querySelector('#invitationLinkBox'),
  invitationLinkInput: document.querySelector('#invitationLinkInput'),
  copyInvitationButton: document.querySelector('#copyInvitationButton'),
  invitationList: document.querySelector('#invitationList'),
  inviteTokenInput: document.querySelector('#inviteTokenInput'),
  acceptInvitationButton: document.querySelector('#acceptInvitationButton'),
  householdStatus: document.querySelector('#householdStatus'),
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

initializeEnvironment();
populateDaySettingHourOptions();
if (applyDataMigrations()) persist();
render();
bindEvents();
registerServiceWorker();
if (loadedDataFromStorage) mirrorDataToIndexedDB(state.data);
recoverFromIndexedDB();
initializeSync();
initializeCustomerFeatures();

function bindEvents() {
  bindAccountDataEvents();
  if (!els.addEventButton || !els.eventDialog || !els.taskForm) return;
  els.addEventButton.addEventListener('click', () => openEventDialog());
  els.previousWeekButton.addEventListener('click', () => moveWeek(-1));
  els.nextWeekButton.addEventListener('click', () => moveWeek(1));
  els.todayButton.addEventListener('click', () => {
    state.weekStart = startOfWeek(new Date());
    render();
  });

  els.taskForm.addEventListener('submit', handleTaskSubmit);
  if (els.taskOverviewButton) els.taskOverviewButton.addEventListener('click', () => {
    renderTaskOverview();
    openDialog(els.taskOverviewDialog);
  });
  if (els.closeTaskOverviewButton) els.closeTaskOverviewButton.addEventListener('click', () => closeDialog(els.taskOverviewDialog));
  if (els.closeTaskOverviewButtonAlt) els.closeTaskOverviewButtonAlt.addEventListener('click', () => closeDialog(els.taskOverviewDialog));
  if (els.taskOverviewDialog) els.taskOverviewDialog.addEventListener('click', (event) => {
    if (event.target === els.taskOverviewDialog) closeDialog(els.taskOverviewDialog);
  });
  if (els.taskAnyDay) els.taskAnyDay.addEventListener('change', updateAnyDayField);
  if (els.taskRepeat) els.taskRepeat.addEventListener('change', updateRecurrenceStartField);
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
  if (els.closeBackupButton) els.closeBackupButton.addEventListener('click', () => closeDialog(els.backupDialog));
  if (els.closeBackupButtonAlt) els.closeBackupButtonAlt.addEventListener('click', () => closeDialog(els.backupDialog));
  if (els.copyBackupButton) els.copyBackupButton.addEventListener('click', copyBackupText);
  if (els.backupDialog) els.backupDialog.addEventListener('click', (event) => {
    if (event.target === els.backupDialog) closeDialog(els.backupDialog);
  });
  if (els.saveSyncConfigButton) els.saveSyncConfigButton.addEventListener('click', saveSyncConfig);
  if (els.syncSignInButton) els.syncSignInButton.addEventListener('click', () => signIn(false));
  if (els.syncSignUpButton) els.syncSignUpButton.addEventListener('click', () => signIn(true));
  if (els.syncEmail) els.syncEmail.addEventListener('input', resetSignupAcknowledgement);
  if (els.signupAcknowledgement) els.signupAcknowledgement.addEventListener('change', () => {
    els.signupAcknowledgement.removeAttribute('aria-invalid');
  });
  if (els.syncNowButton) els.syncNowButton.addEventListener('click', () => syncNow(true));
  if (els.syncSignOutButton) els.syncSignOutButton.addEventListener('click', logoutFromUI);
  accountElement('deleteHouseholdButton').addEventListener('click', reviewHouseholdDeletion);
  accountElement('deleteHouseholdForm').addEventListener('submit', deleteHouseholdFromUI);
  accountElement('deleteHouseholdPhrase').addEventListener('input', renderHouseholdDeletionControls);
  ['closeDeleteHouseholdButton', 'cancelDeleteHouseholdButton'].forEach(id => {
    accountElement(id).addEventListener('click', cancelHouseholdDeletion);
  });
  accountElement('deleteHouseholdDialog').addEventListener('cancel', event => {
    event.preventDefault();
    cancelHouseholdDeletion();
  });
  if (els.householdButton) els.householdButton.addEventListener('click', () => {
    openDialog(els.settingsDialog);
    renderHouseholdUI();
    if (syncState.session) loadHouseholds(true);
    if (syncState.session) loadPlatformAdminUI(true);
  });
  if (els.householdSelect) els.householdSelect.addEventListener('change', () => {
    householdState.selectedHouseholdId = els.householdSelect.value || '';
    saveHouseholdSelection();
    activatePlannerScope(plannerScopeFor(syncState.session, householdState.selectedHouseholdId));
    loadHouseholdMembers();
    loadHouseholdInvitations();
    renderHouseholdUI();
    syncNow(false);
  });
  if (els.createHouseholdButton) els.createHouseholdButton.addEventListener('click', createHouseholdFromUI);
  if (els.renameHouseholdButton) els.renameHouseholdButton.addEventListener('click', renameHouseholdFromUI);
  if (els.createInvitationButton) els.createInvitationButton.addEventListener('click', createInvitationFromUI);
  if (els.copyInvitationButton) els.copyInvitationButton.addEventListener('click', copyInvitationLink);
  if (els.acceptInvitationButton) els.acceptInvitationButton.addEventListener('click', acceptInvitationFromUI);
  if (els.invitationList) els.invitationList.addEventListener('click', handleInvitationListClick);
  if (els.householdMemberList) els.householdMemberList.addEventListener('click', handleHouseholdMemberListClick);
  if (els.platformAdminList) els.platformAdminList.addEventListener('click', handlePlatformAdminListClick);

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
    if (syncState.session) {
      syncNow(false);
      loadHouseholds(true);
      loadPlatformAdminUI(true);
    }
  });
}

function isDevelopmentHost() {
  const host = String(window.location.hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || window.location.port === '4173' || IS_STAGING_HOST;
}

function isStagingHost() {
  const host = String(window.location.hostname || '').toLowerCase();
  const pathname = String(window.location.pathname || '').replace(/\/$/, '');
  return host === 'nickhijden.github.io' && (pathname === '/homeboard/dev' || pathname.startsWith('/homeboard/dev/'));
}

function isKnownProductionUrl(url) {
  return String(url || '').replace(/\/$/, '').toLowerCase() === PRODUCTION_SUPABASE_URL;
}

function initializeEnvironment() {
  if (els.environmentBadge && IS_DEVELOPMENT_HOST) {
    els.environmentBadge.hidden = false;
    els.environmentBadge.textContent = IS_STAGING_HOST ? 'DEVELOPMENT · STAGING' : 'DEVELOPMENT · LOCAL ONLY';
    els.environmentBadge.title = IS_STAGING_HOST
      ? 'This public staging site is isolated from the production Supabase project.'
      : 'This preview is isolated from the production Supabase project.';
  }
  if (els.syncConfigFields) els.syncConfigFields.hidden = !MANUAL_SYNC_CONFIG_ALLOWED;
  if (els.syncCopy && MANUAL_SYNC_CONFIG_ALLOWED) els.syncCopy.textContent = 'Use the Homeboard Development project and your test account here. Customers never need to enter a project URL or API key.';
  if (els.householdButton) els.householdButton.hidden = !HOUSEHOLD_UI_ENABLED;
  if (els.householdSection) els.householdSection.hidden = !HOUSEHOLD_UI_ENABLED;
}

function render() {
  renderCustomerFeatures();
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

  const rows = plannerPeople(true).map(person => ({ key: person.id, label: person.name, tasks: openTasks.filter(task => effectiveAssignee(task) === person.id) })).filter(row => row.tasks.length);
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
    rowElement.innerHTML = `<span class="any-day-label">${escapeHtml(row.label)}</span><div class="any-day-items"></div>`;
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
  const rows = plannerPeople(true).map(person => ({ key: person.id, label: person.name }));
  els.completedAnyDayBoard.hidden = false;
  els.completedAnyDayBoard.innerHTML = rows.map((row) => `
    <div class="completed-any-day-row completed-any-day-row-${row.key}">
      <span class="completed-any-day-label">${escapeHtml(row.label)}</span>
      ${days.map((day) => {
        const dayHistory = history.filter((entry) => entry.completedDate === dateKey(day)
          && entry.assignee === row.key);
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

function reconcileAnyDayCompletions(data) {
  const deleted = data.meta && data.meta.deleted && data.meta.deleted.anyDayCompletions;
  const history = mergeItems(data.anyDayCompletions || [], [], deleted);
  let changed = history.length !== (data.anyDayCompletions || []).length;
  data.anyDayCompletions = history;
  const recurrence = window.HomeboardRecurrence;
  if (recurrence && typeof recurrence.reconcileAnyDayTask === 'function') {
    data.tasks.forEach((task) => {
      if (recurrence.reconcileAnyDayTask(task, history)) changed = true;
    });
  }
  return changed;
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

function getTaskRecurrenceLabel(task) {
  if (task.recurrence === 'weekly') return 'Every week';
  if (task.recurrence === 'biweekly') return 'Every 2 weeks';
  if (task.recurrence === 'monthly') return 'Every month';
  if (task.recurrence === 'quarterly') return 'Every 3 months';
  return 'One time';
}

function getTaskOverviewSchedule(task) {
  const recurrence = getTaskRecurrenceLabel(task);
  const date = parseDate(task.anyDay ? (task.nextAnyDayDate || task.anyDayDate) : task.date);
  if (task.anyDay) {
    return recurrence === 'One time'
      ? `Any day${date ? ` · week of ${formatShortDate(date)}` : ''}`
      : `Any day · ${recurrence}`;
  }
  if (!date) return recurrence;
  const weekday = weekdayNames[(date.getDay() + 6) % 7];
  if (task.recurrence === 'weekly') return `Every ${weekday}`;
  if (task.recurrence === 'biweekly') return `Every 2 weeks · ${weekday}`;
  if (task.recurrence === 'monthly') return `Every month · day ${date.getDate()}`;
  if (task.recurrence === 'quarterly') return `Every 3 months · ${formatShortDate(date)}`;
  return `One time · ${formatLongDate(date)}`;
}

function getTaskOverviewStartWeek(task) {
  if (!isRecurringTask(task)) return '';
  const anchor = parseDate(task.recurrenceStartWeek || task.recurrenceStartDate || task.date || task.nextAnyDayDate || task.anyDayDate);
  return anchor ? `Starts week of ${formatShortDate(startOfWeek(anchor))}` : '';
}

function getTaskKindLabel(task) {
  if (task.kind === 'expiry') return 'Use-by';
  if (task.kind === 'wellness') return 'Health & wellness';
  if (task.kind === 'event') return 'Event';
  return 'Task';
}

function getTaskAssigneeLabel(task) {
  return HomeboardPlanner.label(effectiveAssignee(task), state.data.profile);
}

function getTaskOverviewRecurrenceRank(task) {
  const order = { weekly: 0, biweekly: 1, fourweekly: 2, monthly: 3, quarterly: 4, none: 5 };
  return Object.prototype.hasOwnProperty.call(order, task.recurrence) ? order[task.recurrence] : order.none;
}

function getTaskOverviewRows(tasks) {
  const rows = [];
  tasks.forEach((task) => {
    const title = String(task.title || '').trim();
    const normalizedTitle = title.toLowerCase();
    const isCountedHouseholdTask = normalizedTitle === 'dishes' || normalizedTitle === 'laundry';
    if (!isCountedHouseholdTask) {
      rows.push({ task, title, count: 1 });
      return;
    }
    const existing = rows.find((row) => row.groupKey === normalizedTitle);
    if (existing) {
      existing.count += 1;
      return;
    }
    rows.push({
      groupKey: normalizedTitle,
      task,
      title: normalizedTitle === 'dishes' ? 'Dishes' : 'Laundry',
      count: 1,
    });
  });
  return rows.sort((left, right) => getTaskOverviewRecurrenceRank(left.task) - getTaskOverviewRecurrenceRank(right.task)
    || left.title.localeCompare(right.title));
}

function renderTaskOverview() {
  if (!els.taskOverviewList) return;
  const tasks = state.data.tasks
    .filter((task) => task.kind === 'task')
    .slice()
    .sort((left, right) => getTaskOverviewRecurrenceRank(left) - getTaskOverviewRecurrenceRank(right)
      || String(left.title || '').localeCompare(String(right.title || '')));
  const recurringCount = tasks.filter((task) => isRecurringTask(task)).length;
  if (els.taskOverviewSummary) {
    els.taskOverviewSummary.innerHTML = `<span class="summary-dot"></span><span><strong>${tasks.length}</strong> ${tasks.length === 1 ? 'task' : 'tasks'} · ${recurringCount} recurring</span>`;
  }
  els.taskOverviewList.innerHTML = '';
  if (!tasks.length) {
    els.taskOverviewList.innerHTML = '<p class="task-overview-empty">No tasks saved yet.</p>';
    return;
  }
  const columns = plannerPeople(true).map(person => ({ key: person.id, label: person.name, tasks: getTaskOverviewRows(tasks.filter(task => effectiveAssignee(task) === person.id)) }));
  columns.forEach((column) => {
    const section = document.createElement('section');
    section.className = 'task-overview-column';
    section.innerHTML = `<div class="task-overview-column-heading"><h3>${escapeHtml(column.label)}</h3><span>${column.tasks.length}</span></div>`;
    const list = document.createElement('div');
    list.className = 'task-overview-column-list';
    if (!column.tasks.length) {
      list.innerHTML = '<p class="task-overview-column-empty">No tasks</p>';
    }
    column.tasks.forEach((overviewTask) => {
      const task = overviewTask.task;
      const displayTitle = overviewTask.count > 1 || overviewTask.groupKey
        ? `${overviewTask.title} (${overviewTask.count}x)`
        : overviewTask.title;
      const row = document.createElement('button');
      row.className = 'task-overview-item task';
      row.type = 'button';
      row.title = `Edit ${displayTitle}`;
      row.setAttribute('aria-label', `Edit ${displayTitle}, ${getTaskRecurrenceLabel(task)}`);
      row.innerHTML = `
        <span class="task-overview-main">
          <strong class="task-overview-title">${escapeHtml(displayTitle)}</strong>
          <span class="task-overview-interval">${escapeHtml(getTaskRecurrenceLabel(task))}</span>
        </span>
        <span class="task-overview-arrow" aria-hidden="true">›</span>
      `;
      row.addEventListener('click', () => {
        closeDialog(els.taskOverviewDialog);
        openEventDialog({ task, date: task.anyDay ? 'any-day' : task.date });
      });
      list.appendChild(row);
    });
    section.appendChild(list);
    els.taskOverviewList.appendChild(section);
  });
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
  if (!canEditPlanner()) return;
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
  // Use fixed five-minute CSS grid rows for event placement. The visible
  // hour lines remain unchanged, but cards no longer depend on a separately
  // calculated pixel offset that can drift on Safari/iPad.
  const timelineSlotMinutes = 5;
  const timelineSlotHeight = hourHeight / (60 / timelineSlotMinutes);
  const timelineSlots = Math.max(1, Math.ceil((range.endMinutes - range.startMinutes) / timelineSlotMinutes));
  const timedByDay = days.map((day) => openOccurrences
    .filter((item) => item.dateKey === dateKey(day))
    .filter((item) => Boolean(getTaskTimeBounds(item.task))));
  const timedLayoutsByDay = timedByDay.map((timed) => layoutTimedOccurrences(timed));
  const hasTimedItems = openOccurrences.some((item) => Boolean(getTaskTimeBounds(item.task)));
  // Cards have a minimum height, so leave a little room below an event that
  // ends exactly at the last visible hour instead of clipping it.
  const baseTimelineHeight = ((range.endMinutes - range.startMinutes) / 60) * hourHeight;
  const getClusterCardHeight = (task) => {
    const bounds = getTaskTimeBounds(task);
    return Math.max(compactTimeline ? 31 : 42, ((bounds.end - bounds.start) / 60) * hourHeight - 4);
  };
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
        + group.reduce((total, placement) => total + getClusterCardHeight(placement.item.task), 0)
        + Math.max(0, group.length - 1);
      latest = Math.max(latest, clusterBottom);
    });
    return latest;
  }, 0);
  const stackExtraBuffer = Math.max(0, stackBottom - baseTimelineHeight + 8);
  const bottomBuffer = hasTimedItems ? (compactTimeline ? 44 + stackExtraBuffer : 72 + stackExtraBuffer) : 0;
  const timelineHeight = Math.max(1, baseTimelineHeight + bottomBuffer);
  grid.style.setProperty('--timeline-height', `${timelineHeight}px`);
  grid.style.setProperty('--hour-height', `${hourHeight}px`);
  grid.style.setProperty('--timeline-slot-height', `${timelineSlotHeight}px`);
  grid.style.setProperty('--timeline-slots', `${timelineSlots}`);
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
    timeline.style.setProperty('--timeline-slot-height', `${timelineSlotHeight}px`);
    timeline.style.setProperty('--timeline-slots', `${timelineSlots}`);
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
    // Every timed card keeps its own calculated top position. True collisions
    // use the full column width and overlap instead of shrinking the cards
    // until their titles become unreadable. A later card is placed above an
    // earlier one and can be tapped to inspect or edit it.
    const renderSidePlacement = (placement, placementIndex) => {
      const element = createTaskElement(placement.item);
      const bounds = getTaskTimeBounds(placement.item.task);
      const relativeStart = Math.max(0, bounds.start - range.startMinutes);
      const relativeEnd = Math.max(relativeStart + timelineSlotMinutes, bounds.end - range.startMinutes);
      const startRow = Math.floor(relativeStart / timelineSlotMinutes) + 1;
      const endRow = Math.min(timelineSlots + 1, Math.max(startRow + 1, Math.ceil(relativeEnd / timelineSlotMinutes) + 1));
      const remainderMinutes = relativeStart % timelineSlotMinutes;
      const minimumHeight = Math.max(compactTimeline ? 31 : 42, ((bounds.end - bounds.start) / 60) * hourHeight - 4);
      element.classList.add('timed-event');
      element.style.position = 'relative';
      element.style.gridColumn = '1';
      element.style.gridRow = `${startRow} / ${endRow}`;
      element.style.alignSelf = 'start';
      element.style.top = 'auto';
      element.style.left = 'auto';
      element.style.width = 'auto';
      element.style.margin = `${(remainderMinutes / timelineSlotMinutes) * timelineSlotHeight}px 3px 0`;
      element.style.height = 'auto';
      element.style.zIndex = String(4 + placementIndex);
      if (untimedHeight && bounds.start < untimedEndMinutes && bounds.end > untimedStartMinutes) {
        element.style.zIndex = '6';
      }
      timeline.appendChild(element);
      element.style.height = `${Math.max(minimumHeight, element.scrollHeight + 2)}px`;
    };
    timedPlacements.forEach(renderSidePlacement);
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
  const assignedPerson = effectiveAssignee(task, occurrenceDate);
  const assigneeLabel = HomeboardPlanner.label(assignedPerson, state.data.profile);
  const assigneeClass = assignedPerson === 'me' ? 'assignee-me' : assignedPerson === 'partner' ? 'assignee-partner' : 'assignee-both';
  const assigneeDecoration = '';
  const recurrenceLabel = task.recurrence === 'weekly' ? 'Every week' : task.recurrence === 'biweekly' ? 'Every 2 weeks' : task.recurrence === 'fourweekly' ? 'Every 4 weeks' : task.recurrence === 'monthly' ? 'Every month' : task.recurrence === 'quarterly' ? 'Every 3 months' : '';
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
        <span class="assignee-chip ${assigneeClass}"><span class="assignee-dot" aria-hidden="true"></span>${escapeHtml(assigneeLabel)}</span>
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
    const laneCount = overlapGroup.items.length > 1 ? 2 : 1;
    // True collisions deliberately overlap at full width. This keeps the
    // title readable and, importantly, never changes the item's real top
    // position. The lane value is retained only for compatibility with the
    // placement shape used by the renderer.
    groupPlacements.forEach((placement) => layout.push({ ...placement, laneCount, stackGroupId: null }));
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
  // Keep the original recurrence anchor separate from the next visible
  // occurrence. This means a task can be completed today without losing its
  // future weekly, biweekly, monthly, or quarterly occurrences.
  const anchor = getRecurringAnchorDate(task);
  if (!anchor || day < anchor) return false;
  if (!isRecurringTask(task)) return dateKey(anchor) === dateKey(day);
  return matchesRecurringDate(anchor, day, task.recurrence);
}

function matchesRecurringDate(anchor, day, recurrence) {
  if (!anchor || day < anchor) return false;
  if (recurrence === 'weekly' || recurrence === 'biweekly' || recurrence === 'fourweekly') {
    const interval = recurrence === 'fourweekly' ? 28 : recurrence === 'biweekly' ? 14 : 7;
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

function rollOverdueRecurringTasks() {
  if (!plannerIsWritable()) return;
  const currentWeekStart = startOfWeek(new Date());
  // Completion history survives stale task edits and is authoritative before
  // rollover decides whether an old occurrence is still unfinished.
  let changed = reconcileAnyDayCompletions(state.data);

  if (typeof window !== 'undefined' && window.HomeboardRecurrence && typeof window.HomeboardRecurrence.rollOverdueTask === 'function') {
    state.data.tasks.forEach((task) => {
      if (!window.HomeboardRecurrence.rollOverdueTask(task, currentWeekStart, isCompleted)) return;
      task.updatedAt = nowIso();
      changed = true;
    });
    if (changed) persist();
    return;
  }

  const currentWeekKey = dateKey(currentWeekStart);

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
  if (recurrence === 'fourweekly') return addDays(date, 28);
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
  if (!canEditPlanner()) return;
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

function completeAnyDayTask(taskId, title) {
  if (!canEditPlanner()) return;
  reconcileAnyDayCompletions(state.data);
  const task = state.data.tasks.find((entry) => entry.id === taskId);
  if (!task || !task.anyDay || !isAnyDayTaskOpen(task)) return;
  const previous = {
    anyDayCompleted: task.anyDayCompleted,
    nextAnyDayDate: task.nextAnyDayDate,
    lastMissedAnyDayDate: task.lastMissedAnyDayDate,
    scheduleUpdatedAt: task.anyDayScheduleUpdatedAt,
  };
  const completion = recordAnyDayCompletion(task, dateKey(new Date()));
  if (isRecurringTask(task)) {
    task.nextAnyDayDate = completion.nextAnyDayDate;
    delete task.anyDayCompleted;
    delete task.lastMissedAnyDayDate;
  } else {
    task.anyDayCompleted = true;
  }
  task.updatedAt = completion.updatedAt;
  state.lastUndo = () => {
    // Sync can replace task objects while the Undo toast is visible.
    const currentTask = state.data.tasks.find((entry) => entry.id === taskId);
    const undoneAt = Math.max(Date.now(), Date.parse(completion.updatedAt) || 0,
      Date.parse(currentTask && currentTask.updatedAt || '') || 0) + 1;
    if (currentTask && currentTask.anyDayScheduleUpdatedAt === previous.scheduleUpdatedAt
      && (!isRecurringTask(currentTask) || currentTask.nextAnyDayDate === completion.nextAnyDayDate)) {
      ['anyDayCompleted', 'nextAnyDayDate', 'lastMissedAnyDayDate'].forEach((key) => {
        if (previous[key] === undefined) delete currentTask[key];
        else currentTask[key] = previous[key];
      });
      currentTask.updatedAt = new Date(undoneAt).toISOString();
    }
    state.data.anyDayCompletions = (state.data.anyDayCompletions || []).filter((entry) => entry.id !== completion.id);
    markDeleted('anyDayCompletions', completion.id, undoneAt);
    persist();
    render();
  };
  persist();
  render();
  showToast(`“${title}” marked done`, 'Undo');
}

function recordAnyDayCompletion(task, completedDate) {
  const occurrenceDate = task.nextAnyDayDate || task.anyDayDate || completedDate;
  // The same occurrence completed on two devices is one completion. A later
  // re-completion after Undo must be newer than its deletion marker.
  const id = `any-day:${task.id}:${occurrenceDate}:${task.anyDayScheduleUpdatedAt || 'original'}`;
  const deleted = state.data.meta && state.data.meta.deleted && state.data.meta.deleted.anyDayCompletions;
  const completedAt = new Date(Math.max(Date.now(), (Number(deleted && deleted[id]) || 0) + 1,
    (Date.parse(task.anyDayScheduleUpdatedAt || '') || 0) + 1,
    (Date.parse(task.updatedAt || '') || 0) + 1)).toISOString();
  const entry = {
    id,
    taskId: task.id,
    title: task.title,
    assignee: effectiveAssignee(task),
    completedDate,
    occurrenceDate,
    recurrence: task.recurrence || 'none',
    nextAnyDayDate: isRecurringTask(task) ? dateKey(addRecurringDate(parseDate(occurrenceDate), task.recurrence)) : '',
    completedAt,
    updatedAt: completedAt,
  };
  state.data.anyDayCompletions = state.data.anyDayCompletions || [];
  state.data.anyDayCompletions.push(entry);
  return entry;
}

function handleTaskSubmit(event) {
  event.preventDefault();
  if (!canEditPlanner()) return;
  // Read the controls directly instead of using FormData. This is more
  // reliable on the older Safari shipped with iPad mini 2.
  const title = String(els.taskTitle.value || '').trim();
  const anyDay = Boolean(els.taskAnyDay && els.taskAnyDay.checked);
  const date = anyDay ? '' : String(els.taskDate.value || '');
  const startTime = String(els.eventStart && els.eventStart.value || '');
  const endTime = String(els.eventEnd && els.eventEnd.value || '');
  const recurrence = String(els.taskRepeat.value || 'none');
  const completedInput = accountElement('taskCompletedOn').value;
  if (completedInput && (!HomeboardPlanner.parseDate(completedInput) || completedInput > dateKey(new Date()))) {
    showToast('Choose a valid completion date, today or earlier.'); return;
  }
  const volunteering = isVolunteeringTask(title);
  const editingTask = editingTaskId ? state.data.tasks.find((task) => task.id === editingTaskId) : null;
  const startWeekValue = recurrence !== 'none' ? String(els.taskStartWeek && els.taskStartWeek.value || '').trim() : '';
  const startWeekDate = startWeekValue ? parseDate(startWeekValue) : null;
  if (!title || (!anyDay && !date)) return;
  if (recurrence !== 'none' && !startWeekDate) {
    showToast('Choose a start week for this recurring task.');
    return;
  }
  if (!volunteering && startTime && endTime && endTime < startTime) {
    showToast('End time must be after start time');
    return;
  }
  let firstRecurrenceDate = '';
  if (recurrence !== 'none' && startWeekDate) {
    if (anyDay) {
      firstRecurrenceDate = dateKey(startOfWeek(startWeekDate));
    } else {
      const selectedDate = parseDate(date);
      const weekdayOffset = selectedDate ? (selectedDate.getDay() + 6) % 7 : 0;
      firstRecurrenceDate = dateKey(addDays(startOfWeek(startWeekDate), weekdayOffset));
    }
  }
  const effectiveDate = recurrence !== 'none' && !anyDay ? firstRecurrenceDate : date;
  const previousStart = editingTask && (editingTask.recurrenceStartWeek || editingTask.recurrenceStartDate
    || editingTask.anyDayDate || editingTask.nextAnyDayDate);
  const sameAnyDaySchedule = Boolean(editingTask && editingTask.anyDay && anyDay
    && editingTask.recurrence === recurrence
    && (recurrence === 'none' || (previousStart && dateKey(startOfWeek(parseDate(previousStart))) === firstRecurrenceDate)));
  const previousChangeTime = editingTask ? (state.data.anyDayCompletions || []).reduce((latest, entry) => {
    return entry.taskId === editingTask.id
      ? Math.max(latest, Date.parse(entry.completedAt || entry.updatedAt || '') || 0) : latest;
  }, Math.max(Date.parse(editingTask.updatedAt || '') || 0, Date.parse(editingTask.anyDayScheduleUpdatedAt || '') || 0)) : 0;
  const updatedTask = {
    title,
    date: effectiveDate,
    anyDay,
    startTime: volunteering ? '14:00' : startTime,
    endTime: volunteering ? '17:00' : endTime,
    assignee: String(els.taskAssignee.value || 'both'),
    kind: String(els.taskType.value || 'task'),
    recurrence,
    reminder: String(els.taskReminder && els.taskReminder.value || 'day-before'),
    updatedAt: new Date(Math.max(Date.now(), previousChangeTime + 1)).toISOString(),
  };
  if (recurrence !== 'none') {
    updatedTask.recurrenceStartWeek = dateKey(startOfWeek(startWeekDate));
    updatedTask.recurrenceStartDate = sameAnyDaySchedule
      ? (editingTask.recurrenceStartDate || firstRecurrenceDate) : firstRecurrenceDate;
  }
  if (anyDay && recurrence !== 'none') {
    // Editing a title, assignee or reminder must not reset completed work.
    updatedTask.nextAnyDayDate = sameAnyDaySchedule
      ? (editingTask.nextAnyDayDate || editingTask.anyDayDate || firstRecurrenceDate)
      : (firstRecurrenceDate || dateKey(startOfWeek(state.weekStart)));
  }
  if (anyDay) {
    updatedTask.anyDayDate = sameAnyDaySchedule ? editingTask.anyDayDate : recurrence !== 'none'
      ? (firstRecurrenceDate || dateKey(startOfWeek(state.weekStart)))
      : (editingTask && editingTask.anyDayDate) || (editingTask && editingTask.nextAnyDayDate) || dateKey(state.weekStart);
    if (editingTask && !sameAnyDaySchedule) {
      updatedTask.anyDayScheduleUpdatedAt = updatedTask.updatedAt;
      delete editingTask.anyDayCompleted;
    }
  }
  updatedTask.rotate = Boolean(accountElement('taskRotate').checked && recurrence !== 'none');
  updatedTask.rotationAnchor = editingTask && editingTask.rotationAnchor || firstRecurrenceDate || effectiveDate;
  if (editingTask) {
    Object.assign(editingTask, updatedTask);
    if (!anyDay || recurrence === 'none') delete editingTask.nextAnyDayDate;
    if (!anyDay) {
      delete editingTask.anyDayDate;
      delete editingTask.anyDayScheduleUpdatedAt;
    }
    if (recurrence === 'none') {
      delete editingTask.recurrenceStartWeek;
      delete editingTask.recurrenceStartDate;
    }
    if (anyDay) delete editingTask.date;
  } else {
    updatedTask.id = createId();
    state.data.tasks.push(updatedTask);
  }
  const savedTask = editingTask || updatedTask;
  const completedOn = accountElement('taskCompletedOn').value;
  if (completedOn && !applyRecordedCompletion(savedTask, completedOn)) return;
  const notify = accountElement('notifyHousehold').checked;
  persist();
  if (notify) notifyPlannerChange(savedTask.id, Boolean(editingTask));
  closeDialog(els.eventDialog);
  if (effectiveDate) state.weekStart = startOfWeek(parseDate(effectiveDate));
  render();
  showToast(editingTask ? 'Event updated' : 'Event added to the week');
}

function openEventDialog(options = {}) {
  const task = options.task || null;
  editingTaskId = task ? task.id : null;
  editingOccurrenceDate = options.date || (task && task.date) || null;
  els.taskForm.reset();
  populatePeopleChoices();
  accountElement('taskRotate').checked = Boolean(task && task.rotate);
  accountElement('taskCompletedOn').max = dateKey(new Date());
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
  if (els.taskStartWeek) {
    const recurrenceAnchor = task && (task.recurrenceStartWeek || task.recurrenceStartDate || task.nextAnyDayDate || task.anyDayDate || task.date);
    els.taskStartWeek.value = recurrenceAnchor && els.taskRepeat.value !== 'none'
      ? dateKey(startOfWeek(parseDate(recurrenceAnchor)))
      : '';
  }
  if (els.taskReminder) els.taskReminder.value = task && task.reminder || 'day-before';
  updateAnyDayField();
  updateRecurrenceStartField();
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
  updateRecurrenceStartField();
}

function updateRecurrenceStartField() {
  if (!els.taskRepeat || !els.recurrenceStartGroup || !els.taskStartWeek) return;
  const recurring = els.taskRepeat.value !== 'none';
  els.recurrenceStartGroup.hidden = !recurring;
  els.taskStartWeek.disabled = !recurring;
  if (!recurring) {
    els.taskStartWeek.value = '';
    return;
  }
  if (!els.taskStartWeek.value) {
    const dateValue = els.taskDate && els.taskDate.value;
    const anchor = parseDate(dateValue) || state.weekStart || new Date();
    els.taskStartWeek.value = dateKey(startOfWeek(anchor));
  }
  if (els.recurrenceStartHint) {
    els.recurrenceStartHint.textContent = els.taskAnyDay && els.taskAnyDay.checked
      ? 'The task becomes available from this week onward.'
      : 'The selected weekday starts repeating from this week.';
  }
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
  if (!canEditPlanner()) return;
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
  if (!canEditPlanner()) return;
  const target = event.target.closest('[data-list-action]');
  if (!target) return;
  const listName = target.dataset.listName;
  const itemId = target.dataset.itemId;
  const item = state.data[listName].find((entry) => entry.id === itemId);
  if (!item) return;
  if (target.dataset.listAction === 'edit') {
    const editedTitle = window.prompt('Edit item\n\nDo not enter payment-card details, passwords, government identification numbers, medical records, or other highly sensitive information.', item.title);
    if (editedTitle === null) return;
    const nextTitle = editedTitle.trim();
    if (!nextTitle) {
      showToast('The item name cannot be empty');
      return;
    }
    const currentPriority = Number(item.priority) === 1 || Number(item.priority) === 2 ? Number(item.priority) : null;
    let nextPriority = currentPriority;
    if (listName === 'todos') {
      const priorityInput = window.prompt('Priority: enter 1 for most important, 2 for second, or leave blank for no color', currentPriority ? String(currentPriority) : '');
      if (priorityInput === null) return;
      const priorityValue = priorityInput.trim();
      if (priorityValue && priorityValue !== '1' && priorityValue !== '2') {
        showToast('Priority must be 1, 2, or blank');
        return;
      }
      nextPriority = priorityValue ? Number(priorityValue) : null;
    }
    if (nextTitle === item.title && nextPriority === currentPriority) return;
    item.title = nextTitle;
    if (listName === 'todos') {
      if (nextPriority) item.priority = nextPriority;
      else delete item.priority;
    }
    item.updatedAt = nowIso();
    persist();
    render();
    showToast('Item updated');
    return;
  }
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
  const orderedItems = listName === 'todos'
    ? items.slice().sort((a, b) => {
      const aCompleted = a.completed ? 1 : 0;
      const bCompleted = b.completed ? 1 : 0;
      if (aCompleted !== bCompleted) return aCompleted - bCompleted;
      const aPriority = Number(a.priority) === 1 || Number(a.priority) === 2 ? Number(a.priority) : 3;
      const bPriority = Number(b.priority) === 1 || Number(b.priority) === 2 ? Number(b.priority) : 3;
      return aPriority - bPriority;
    })
    : items;
  orderedItems.forEach((item) => {
    const row = document.createElement('div');
    const priority = Number(item.priority) === 1 || Number(item.priority) === 2 ? Number(item.priority) : null;
    row.className = `list-row${item.completed ? ' done' : ''}${priority ? ` priority-${priority}` : ''}`;
    row.innerHTML = `
      <input class="list-check" type="checkbox" ${item.completed ? 'checked' : ''} data-list-action="toggle" data-list-name="${listName}" data-item-id="${escapeAttribute(item.id)}" aria-label="Mark ${escapeAttribute(item.title)} done" />
      ${priority ? `<span class="list-priority" aria-label="Priority ${priority}">${priority}</span>` : ''}
      <span class="list-row-text">${escapeHtml(item.title)}</span>
      <button class="edit-row" type="button" data-list-action="edit" data-list-name="${listName}" data-item-id="${escapeAttribute(item.id)}" aria-label="Edit ${escapeAttribute(item.title)}">✎</button>
      <button class="delete-row" type="button" data-list-action="delete" data-list-name="${listName}" data-item-id="${escapeAttribute(item.id)}" aria-label="Delete ${escapeAttribute(item.title)}">×</button>
    `;
    container.appendChild(row);
  });
}

function clearCompleted(listName) {
  if (!canEditPlanner()) return;
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
      if (state.lastUndo && canEditPlanner()) state.lastUndo();
      state.lastUndo = null;
      els.toast.classList.remove('visible');
    });
  }
  state.toastTimer = window.setTimeout(() => els.toast.classList.remove('visible'), 5000);
}

function exportBackup() {
  downloadJson(Object.assign({}, state.data, { _homeboardBackup: { environment: plannerEnvironment(), householdId: householdState.selectedHouseholdId || '', version: 2 } }), 'backup');
}

function downloadJson(data, kind) {
  const backupText = JSON.stringify(data, null, 2);
  // iOS 12 Safari can navigate to a blob URL but cannot reliably open the
  // resulting resource. Show a copyable fallback instead of leaving the user
  // on Safari's "WebKitBlobResource error" page.
  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent || '')
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const link = document.createElement('a');
  if (isIOS || !('download' in link)) {
    openBackupFallback(backupText, kind);
    return;
  }
  const blob = new Blob([backupText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `homeboard-${kind}-${dateKey(new Date())}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(kind === 'backup' ? 'Backup downloaded' : 'Account export downloaded');
}

function openBackupFallback(backupText, kind) {
  if (!els.backupDialog || !els.backupText) {
    showToast('This iPad cannot download backups directly. Use a laptop to download one.');
    return;
  }
  els.backupText.value = backupText;
  const label = kind === 'account-export' ? 'account export' : 'backup';
  document.querySelector('#backupTitle').textContent = `Copy your ${label}`;
  document.querySelector('#backupInstructions').textContent = `Copy this ${label} text, paste it into a text file and save it with a .json ending. Keep the file private.`;
  els.copyBackupButton.textContent = `Copy ${label} text`;
  els.backupText.setAttribute('aria-label', `Homeboard ${label} JSON`);
  if (els.backupStatus) els.backupStatus.textContent = `The ${label} text is ready to copy.`;
  openDialog(els.backupDialog);
}

function copyBackupText() {
  if (!els.backupText) return;
  els.backupText.focus();
  els.backupText.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch (error) { copied = false; }
  if (copied) {
    if (els.backupStatus) els.backupStatus.textContent = 'Copied. Paste it into a .json file on your laptop.';
    showToast('JSON copied');
  } else if (els.backupStatus) {
    els.backupStatus.textContent = 'Please press and hold the selected text, then choose Copy.';
  }
}

function accountElement(id) { return document.getElementById(id); }

function bindAccountDataEvents() {
  accountElement('exportAccountButton').addEventListener('click', exportAccountData);
  accountElement('deleteAccountButton').addEventListener('click', reviewAccountDeletion);
  accountElement('deleteAccountForm').addEventListener('submit', deleteAccount);
  ['closeDeleteAccountButton', 'cancelDeleteAccountButton'].forEach((id) => {
    accountElement(id).addEventListener('click', cancelAccountDeletion);
  });
  ['deleteAccountPassword', 'deleteAccountPhrase'].forEach((id) => {
    accountElement(id).addEventListener('input', renderAccountControls);
  });
  accountElement('deleteAccountDialog').addEventListener('cancel', (event) => {
    event.preventDefault();
    cancelAccountDeletion();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === SYNC_SESSION_KEY && !event.newValue && !localStorage.getItem(SYNC_SESSION_KEY) && syncState.session) {
      signOut();
    }
    if (event.key && event.key.startsWith(HOUSEHOLD_DELETED_KEY) && event.newValue) {
      try {
        const deleted = JSON.parse(event.newValue);
        if (deleted.project === syncState.config.url && deleted.householdId) {
          applyHouseholdDeletion(deleted.householdId);
        }
      } catch (error) { /* Ignore invalid events from browser storage. */ }
    }
    if (event.key === ACCOUNT_RESET_KEY && event.newValue !== storageGeneration) {
      clearDeletedAccountFromDevice(false).then(() => {
        accountElement('accountDataStatus').textContent = 'An account was deleted in another tab. This device’s saved login and planner have been cleared.';
      });
    }
  });
}

function renderAccountControls() {
  const signedIn = Boolean(syncState.session);
  ['exportAccountButton', 'deleteAccountButton', 'includeDeviceData'].forEach((id) => {
    accountElement(id).disabled = !signedIn || accountBusy || syncState.authenticating || householdDeleteBusy;
  });
  accountElement('confirmDeleteAccountButton').disabled = !signedIn || accountBusy || !deletionPreview
    || accountElement('deleteAccountConfirmation').hidden
    || accountElement('deleteAccountPhrase').value !== 'DELETE'
    || !accountElement('deleteAccountPassword').value;
  ['closeDeleteAccountButton', 'cancelDeleteAccountButton', 'deleteAccountPassword', 'deleteAccountPhrase'].forEach((id) => {
    accountElement(id).disabled = syncState.deleting;
  });
}

function accountErrorMessage(error) {
  if (/function.*(not find|does not exist)|schema cache|404|Failed to fetch/i.test(error.message || '')) {
    return 'This account service is unavailable. The Homeboard operator may need to finish setup. Your data has been kept.';
  }
  return error.message || 'The request failed. Your data has been kept.';
}

async function exportAccountData() {
  if (accountBusy || !syncState.session) return;
  const current = customerContext();
  accountBusy = true;
  renderAccountControls();
  const status = accountElement('accountDataStatus');
  status.textContent = 'Preparing your account export…';
  try {
    const includeDevice = accountElement('includeDeviceData').checked;
    const data = await householdRpc('export_my_account_data', {});
    if (!current()) return;
    if (!data || data.format !== 'homeboard-account-export' || !data.account
      || data.account.id !== syncState.session.user.id) throw new Error('The account export could not be verified. Please try again.');
    data.access_and_delivery = await householdRpc('export_my_access_records', {});
    if (!current()) return;
    if (includeDevice) data.device_planner = JSON.parse(JSON.stringify(state.data));
    downloadJson(data, 'account-export');
    status.textContent = 'Your account export is ready. Keep this file private. Use Download backup for a restorable planner copy.';
  } catch (error) {
    if (current()) status.textContent = accountErrorMessage(error);
  } finally {
    accountBusy = false;
    renderAccountControls();
  }
}

async function reviewAccountDeletion() {
  if (accountBusy || !syncState.session) return;
  deletionPreview = null;
  accountBusy = true;
  accountElement('deleteAccountPassword').value = '';
  accountElement('deleteAccountPhrase').value = '';
  accountElement('deleteAccountConfirmation').hidden = true;
  accountElement('deleteAccountHouseholds').textContent = '';
  accountElement('deleteAccountIdentity').textContent = syncState.session.user.email || '';
  const status = accountElement('deleteAccountStatus');
  status.textContent = 'Checking your account and household ownership…';
  openDialog(accountElement('deleteAccountDialog'));
  renderAccountControls();
  try {
    const preview = await householdRpc('preview_my_account_deletion', {});
    if (!accountElement('deleteAccountDialog').hasAttribute('open')) return;
    if (!preview || !syncState.session || preview.account_id !== syncState.session.user.id
      || !Array.isArray(preview.households) || typeof preview.platform_admin !== 'boolean') {
      throw new Error('Your account could not be verified. Sign in again.');
    }
    const sharedOwner = preview.households.some((h) => h.role === 'owner' && h.other_members > 0);
    preview.households.forEach((h) => {
      const item = document.createElement('li');
      item.textContent = `${h.name}: ${h.role === 'owner'
        ? h.other_members > 0 ? 'transfer ownership first' : 'household and planner will be deleted'
        : 'you will leave; the shared planner stays'}.`;
      accountElement('deleteAccountHouseholds').appendChild(item);
    });
    status.textContent = preview.platform_admin
      ? 'Another administrator must remove your platform administrator access before you can delete your account.'
      : sharedOwner ? 'Transfer ownership in Household settings, then review deletion again.'
        : 'Confirm your current password and type DELETE to continue.';
    deletionPreview = preview;
    accountElement('deleteAccountConfirmation').hidden = preview.platform_admin || sharedOwner;
  } catch (error) {
    status.textContent = accountErrorMessage(error);
  } finally {
    accountBusy = false;
    renderAccountControls();
  }
}

function cancelAccountDeletion() {
  if (syncState.deleting) return;
  deletionPreview = null;
  accountElement('deleteAccountPassword').value = '';
  accountElement('deleteAccountPhrase').value = '';
  closeDialog(accountElement('deleteAccountDialog'));
}

async function deleteAccount(event) {
  event.preventDefault();
  if (accountBusy || !deletionPreview || accountElement('deleteAccountConfirmation').hidden
    || accountElement('deleteAccountPhrase').value !== 'DELETE' || !accountElement('deleteAccountPassword').value) return;
  accountBusy = true;
  const status = accountElement('deleteAccountStatus');
  status.textContent = 'Confirming your password and deleting your account…';
  renderAccountControls();
  try {
    const session = await ensureSyncSession();
    if (!session || session.user.id !== deletionPreview.account_id) throw new Error('Sign in again and review deletion.');
    syncState.deleting = true;
    syncState.generation += 1; // Discard all earlier cloud responses.
    stopSyncPolling();
    if (syncState.queueTimer) window.clearTimeout(syncState.queueTimer);
    syncState.queueTimer = null;
    syncState.pending = false;
    renderAuthControls();
    const body = { password: accountElement('deleteAccountPassword').value, confirmation: 'DELETE', preview: deletionPreview };
    accountElement('deleteAccountPassword').value = '';
    let result;
    try {
      result = await syncRequest('/functions/v1/delete-account', { method: 'POST', body }, session.access_token);
    } catch (error) {
      // A connection loss may follow a successful server deletion. Signing out
      // prevents automatic uploads while the operator checks an unknown result.
      if (!error.status || error.status >= 500) signOut();
      throw error;
    } finally { body.password = ''; }
    if (!result || result.deleted !== true || result.account_id !== session.user.id) {
      signOut();
      throw new Error('The deletion result could not be verified. Your local data has been kept. Contact the Homeboard operator.');
    }
    const cleared = await clearDeletedAccountFromDevice(true);
    closeDialog(accountElement('deleteAccountDialog'));
    deletionPreview = null;
    accountElement('accountDataStatus').textContent = cleared
      ? 'Account deleted. Your login and planner on this device have been cleared.'
      : 'Account deleted. Some browser storage could not be cleared. Clear this site’s browser data on this device.';
    showToast('Account deleted');
  } catch (error) {
    status.textContent = `${accountErrorMessage(error)} Close this dialog and review deletion again${syncState.session ? '.' : ' after signing in.'}`;
    deletionPreview = null;
    accountElement('deleteAccountConfirmation').hidden = true;
  } finally {
    syncState.deleting = false;
    accountBusy = false;
    accountElement('deleteAccountPassword').value = '';
    renderAuthControls();
    if (syncState.session) startSyncPolling();
  }
}

function readStorageGeneration() {
  try { return localStorage.getItem(ACCOUNT_RESET_KEY) || ''; } catch (error) { return ''; }
}

function createEmptyPlanner() {
  return { tasks: [], todos: [], groceries: [], completions: {}, anyDayCompletions: [], daySettings: {},
    meta: { demo: false, footballScheduleVersion: FOOTBALL_SCHEDULE_VERSION, volunteeringStartFixVersion: '20260923-v2' } };
}

async function clearDeletedAccountFromDevice(broadcast) {
  let cleared = true;
  if (broadcast) {
    try { localStorage.setItem(ACCOUNT_RESET_KEY, `${Date.now()}-${Math.random()}`); } catch (error) { cleared = false; }
  }
  storageGeneration = readStorageGeneration();
  try { signOut({ discardPlanner: true }); } catch (error) { cleared = false; }
  [SYNC_SESSION_KEY, SYNC_EMAIL_KEY, HOUSEHOLD_SELECTION_KEY, STORAGE_KEY, BACKUP_STORAGE_KEY].concat(LEGACY_STORAGE_KEYS).forEach((key) => {
    try { localStorage.removeItem(key); } catch (error) { cleared = false; }
  });
  try {
    Object.keys(localStorage).filter(key => [STORAGE_KEY, BACKUP_STORAGE_KEY, HOUSEHOLD_SELECTION_KEY]
      .some(base => key.startsWith(`${base}:scope:`))).forEach(key => localStorage.removeItem(key));
  } catch (error) { cleared = false; }
  state.data = createEmptyPlanner();
  loadedDataFromStorage = true;
  state.lastUndo = null;
  if (state.toastTimer) window.clearTimeout(state.toastTimer);
  els.toast.classList.remove('visible');
  els.syncEmail.value = '';
  els.syncPassword.value = '';
  els.backupText.value = '';
  accountElement('deleteAccountPassword').value = '';
  accountElement('deleteAccountPhrase').value = '';
  // Clear any stale editor values and prevent an old form restoring entries.
  document.querySelectorAll('dialog').forEach((dialog) => {
    if (dialog !== els.settingsDialog) closeDialog(dialog);
  });
  els.taskForm.reset();
  els.daySettingsForm.reset();
  persist({ sync: false });
  render();
  if (window.indexedDB) {
    cleared = (await new Promise((resolve) => {
      let finished = false;
      const finish = (ok) => { if (!finished) { finished = true; resolve(ok); } };
      window.setTimeout(() => finish(false), 3000);
      try {
        const request = window.indexedDB.open(IDB_NAME, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(IDB_STORE)) request.result.createObjectStore(IDB_STORE);
        };
        request.onerror = () => finish(false);
        request.onsuccess = () => {
          const database = request.result;
          try {
            const transaction = database.transaction([IDB_STORE], 'readwrite');
            transaction.objectStore(IDB_STORE).clear();
            transaction.objectStore(IDB_STORE).put({ data: createEmptyPlanner(), generation: storageGeneration }, 'current');
            transaction.oncomplete = () => { database.close(); finish(true); };
            transaction.onerror = transaction.onabort = () => { database.close(); finish(false); };
          } catch (error) { database.close(); finish(false); }
        };
      } catch (error) { finish(false); }
    })) && cleared;
  }
  return cleared;
}

function importBackup(event) {
  const files = event.target.files;
  const file = files && files.length ? files[0] : null;
  if (!file) return;
  if (!canEditPlanner()) { event.target.value = ''; return; }
  const importScope = activePlannerScope;
  const importGeneration = syncState.generation;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      if (activePlannerScope !== importScope || syncState.generation !== importGeneration || !canEditPlanner()) throw new Error('The selected household changed');
      const imported = JSON.parse(reader.result);
      const source = imported._homeboardBackup;
      if (source && source.environment !== plannerEnvironment()) throw new Error('Backups cannot be moved between Development and Production');
      const recovered = normalizePlannerData(imported.data || imported);
      if (!recovered) throw new Error('Invalid backup');
      if (!window.confirm('Restore this backup into the currently selected planner? Its current contents will be replaced.')) return;
      state.data = recovered;
      persist();
      render();
      closeDialog(els.settingsDialog);
      showToast('Backup restored');
    } catch (error) {
      showToast(error.message || 'That backup file could not be restored');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function loadSyncConfig() {
  if (IS_DEMO_HOST) return { url: '', key: '' };
  // Ignore saved manual overrides on the public staging site, including any
  // stale production connection. Local developer previews remain configurable.
  if (IS_STAGING_HOST) return { url: CENTRAL_STAGING_CONFIG.url, key: CENTRAL_STAGING_CONFIG.key };
  if (!IS_DEVELOPMENT_HOST) return { url: CENTRAL_PRODUCTION_CONFIG.url, key: CENTRAL_PRODUCTION_CONFIG.key };
  try {
    const stored = JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY));
    if (stored && stored.url && stored.key) {
      const url = String(stored.url).replace(/\/$/, '');
      if (IS_DEVELOPMENT_HOST && isKnownProductionUrl(url)) return { url: '', key: '' };
      return { url, key: String(stored.key) };
    }
  } catch (error) {
    // Fall back to local-only mode.
  }
  return { url: '', key: '' };
}

function loadSyncSession() {
  if (IS_DEMO_HOST) return null;
  try {
    const stored = JSON.parse(localStorage.getItem(SYNC_SESSION_KEY));
    if (storageGeneration && (!stored || stored.device_generation !== storageGeneration)) return null;
    if (IS_STAGING_HOST && !sessionBelongsToProject(stored, CENTRAL_STAGING_CONFIG.url)) return null;
    if (stored && stored.access_token && stored.refresh_token && stored.user && stored.user.id) return stored;
  } catch (error) {
    // A broken session should never prevent the local planner from opening.
  }
  return null;
}

function sessionBelongsToProject(session, projectUrl) {
  // This is a routing safeguard for saved sessions, not JWT authentication.
  // Supabase still validates the token on every authenticated request.
  try {
    const payload = String(session.access_token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(payload)).iss === `${projectUrl}/auth/v1`;
  } catch (error) { return false; }
}

function loadSyncEmail() {
  try {
    return String(localStorage.getItem(SYNC_EMAIL_KEY) || '');
  } catch (error) {
    return '';
  }
}

function loadHouseholdSelection() {
  try {
    const accountScope = plannerScopeFor(syncState.session, '');
    if (!accountScope) return '';
    const saved = localStorage.getItem(scopedStorageKey(HOUSEHOLD_SELECTION_KEY, accountScope));
    // The old selection is only a hint; membership is verified before sync.
    return String(saved === null ? localStorage.getItem(HOUSEHOLD_SELECTION_KEY) || '' : saved);
  } catch (error) {
    return '';
  }
}

function saveHouseholdSelection() {
  try {
    const accountScope = plannerScopeFor(syncState.session, '');
    if (accountScope) localStorage.setItem(scopedStorageKey(HOUSEHOLD_SELECTION_KEY, accountScope), householdState.selectedHouseholdId || '');
    localStorage.removeItem(HOUSEHOLD_SELECTION_KEY);
  } catch (error) {
    // Local storage is optional; the selected household can be recovered on refresh.
  }
}

function plannerScopeFor(session, householdId, config) {
  if (!session || !session.user || !session.user.id) return '';
  return encodeURIComponent(JSON.stringify([(config || syncState.config).url, session.user.id, householdId || null]));
}

function scopedStorageKey(base, scope) {
  return scope ? `${base}:scope:${scope}` : base;
}

function plannerDatabaseKey(scope) { return scope ? `scope:${scope}` : 'current'; }

function activatePlannerScope(scope, discardOutgoing = false) {
  if (scope === activePlannerScope) return;
  // Flush the outgoing planner to its own cache, never the new destination.
  if (!discardOutgoing && loadedDataFromStorage) persist({ sync: false });
  activePlannerScope = scope;
  plannerGeneration += 1;
  plannerRevision += 1;
  if (syncState.queueTimer) window.clearTimeout(syncState.queueTimer);
  syncState.queueTimer = null;
  syncState.pending = syncState.busy;
  loadedDataFromStorage = false;
  state.data = loadData();
  state.lastUndo = null;
  editingTaskId = null;
  editingOccurrenceDate = null;
  editingDayIndex = null;
  if (state.toastTimer) window.clearTimeout(state.toastTimer);
  els.toast.classList.remove('visible');
  [els.eventDialog, els.daySettingsDialog, els.taskOverviewDialog, els.backupDialog].forEach(closeDialog);
  els.taskForm.reset();
  els.daySettingsForm.reset();
  els.todoInput.value = '';
  els.groceryInput.value = '';
  render();
  recoverFromIndexedDB();
}

function initializeSync() {
  resetSignupAcknowledgement();
  if (MANUAL_SYNC_CONFIG_ALLOWED && els.syncProjectUrl) els.syncProjectUrl.value = syncState.config.url;
  if (MANUAL_SYNC_CONFIG_ALLOWED && els.syncPublishableKey) els.syncPublishableKey.value = syncState.config.key;
  if (els.syncEmail) els.syncEmail.value = loadSyncEmail() || (syncState.session && syncState.session.user && syncState.session.user.email) || '';
  if (els.inviteTokenInput) {
    try { els.inviteTokenInput.value = new URL(window.location.href).searchParams.get('invite') || ''; } catch (error) { /* Older Safari can ignore a malformed URL. */ }
  }
  renderSyncStatus();
  renderHouseholdUI();
  if (syncState.session && syncState.config.url && syncState.config.key) {
    startSyncPolling();
    loadHouseholds();
    loadPlatformAdminUI();
    syncNow(false);
  }
}

function saveSyncConfig() {
  if (!MANUAL_SYNC_CONFIG_ALLOWED) {
    setSyncStatus('This Homeboard build is centrally configured.', 'connected');
    return;
  }
  const url = String(els.syncProjectUrl.value || '').trim().replace(/\/$/, '');
  const key = String(els.syncPublishableKey.value || '').trim();
  if (!/^https:\/\//i.test(url) || !key) {
    setSyncStatus('Enter the HTTPS project URL and publishable key.', 'error');
    return;
  }
  if (IS_DEVELOPMENT_HOST && isKnownProductionUrl(url)) {
    setSyncStatus('This local development preview cannot connect to the production project. Use Homeboard Development.', 'error');
    return;
  }
  const connectionChanged = syncState.config.url !== url || syncState.config.key !== key;
  syncState.config = { url, key };
  if (connectionChanged) {
    syncState.generation += 1;
    resetSignupAcknowledgement();
    syncState.session = null;
    stopSyncPolling();
    localStorage.removeItem(SYNC_SESSION_KEY);
    householdState.households = [];
    householdState.invitations = [];
    householdState.members = [];
    householdState.membersHouseholdId = '';
    householdState.selectedHouseholdId = '';
    householdState.loaded = false;
    platformAdminState.isAdmin = false;
    platformAdminState.households = [];
    platformAdminState.loaded = false;
    saveHouseholdSelection();
    activatePlannerScope('');
    renderPlatformAdminUI();
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
  if (syncState.authenticating || syncState.deleting) return;
  if (createAccount && (!els.signupAcknowledgement || !els.signupAcknowledgement.checked)) {
    setSyncStatus('Read and agree to the Terms of Use and acknowledge the Privacy Notice before creating an account.', 'error');
    if (els.signupAcknowledgement) {
      els.signupAcknowledgement.setAttribute('aria-invalid', 'true');
      els.signupAcknowledgement.focus();
    }
    return;
  }
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
  syncState.authenticating = true;
  syncState.generation += 1;
  setSyncStatus(createAccount ? 'Creating account…' : 'Signing in…');
  try {
    localStorage.setItem(SYNC_EMAIL_KEY, email);
    const path = createAccount ? '/auth/v1/signup?redirect_to=' + encodeURIComponent(signupReturnUrl()) : '/auth/v1/token?grant_type=password';
    const body = { email, password };
    if (createAccount) {
      // Supabase stores signup data on the account, including when email
      // confirmation is required. This is user metadata, not an audit log.
      body.data = { homeboard_acknowledgement: {
        terms_version: PRIVACY_TERMS_VERSION,
        privacy_notice_version: PRIVACY_TERMS_VERSION,
        acceptable_use_version: PRIVACY_TERMS_VERSION,
        acknowledged_at: nowIso(),
      } };
    }
    const response = await syncRequest(path, { method: 'POST', body });
    resetSignupAcknowledgement();
    els.syncPassword.value = '';
    if (!response.access_token) {
      setSyncStatus('Signup request received. If confirmation is required, check your email before signing in.', 'connected');
      return;
    }
    setSyncSession(response);
    startSyncPolling();
    await loadHouseholds(true);
    await loadPlatformAdminUI(true);
    await syncNow(true, true);
  } catch (error) {
    setSyncStatus(error.message || 'Cloud sign-in failed.', 'error');
  } finally {
    syncState.authenticating = false;
    renderAuthControls();
  }
}

function resetSignupAcknowledgement() {
  if (!els.signupAcknowledgement) return;
  els.signupAcknowledgement.checked = false;
  els.signupAcknowledgement.removeAttribute('aria-invalid');
}

function renderAuthControls() {
  renderCustomerFeatures();
  const signedIn = Boolean(syncState.session);
  accountElement('signedOutAccountPanel').hidden = signedIn;
  accountElement('signedInAccountPanel').hidden = !signedIn;
  accountElement('signedInEmail').textContent = signedIn && syncState.session.user ? syncState.session.user.email || 'Homeboard account' : '';
  if (els.signupAcknowledgementPanel) els.signupAcknowledgementPanel.hidden = signedIn;
  if (els.syncSignUpButton) els.syncSignUpButton.hidden = signedIn;
  [els.syncEmail, els.syncPassword, els.syncSignInButton, els.syncSignUpButton,
    els.syncSignOutButton, els.saveSyncConfigButton, els.signupAcknowledgement].forEach((control) => {
    if (control) control.disabled = syncState.authenticating || syncState.deleting || householdDeleteBusy;
  });
  renderAccountControls();
}

async function logoutFromUI() {
  if (!syncState.session || syncState.deleting || householdDeleteBusy) return;
  const token = syncState.session.access_token;
  const config = { ...syncState.config };
  signOut();
  const generation = syncState.generation;
  // Clear this browser immediately, including its other tabs, even offline.
  // Revocation is limited to this session so other devices keep their login.
  const controller = typeof window.AbortController === 'function' ? new window.AbortController() : null;
  const timeout = controller ? window.setTimeout(() => controller.abort(), 8000) : null;
  try {
    const request = { method: 'POST', headers: { apikey: config.key, Authorization: `Bearer ${token}` } };
    if (controller) request.signal = controller.signal;
    const response = await fetch(`${config.url}/auth/v1/logout?scope=local`, request);
    if (!response.ok && response.status !== 401 && response.status !== 403) throw new Error('Logout unavailable');
  } catch (error) {
    if (generation === syncState.generation && !syncState.session) {
      renderSyncStatus('Logged out of this browser. The server could not be reached to end the session.', 'error');
    }
  } finally { if (timeout !== null) window.clearTimeout(timeout); }
}

function signOut(options) {
  syncState.generation += 1;
  if (syncState.queueTimer) window.clearTimeout(syncState.queueTimer);
  syncState.queueTimer = null;
  syncState.pending = false;
  resetSignupAcknowledgement();
  stopSyncPolling();
  syncState.session = null;
  if (els.syncPassword) els.syncPassword.value = '';
  householdDeletion = null;
  closeDialog(accountElement('deleteHouseholdDialog'));
  accountElement('deleteHouseholdPhrase').value = '';
  localStorage.removeItem(SYNC_SESSION_KEY);
  householdState.households = [];
  householdState.invitations = [];
  householdState.members = [];
  householdState.membersHouseholdId = '';
  householdState.selectedHouseholdId = '';
  householdState.loaded = false;
  platformAdminState.isAdmin = false;
  platformAdminState.households = [];
  platformAdminState.loaded = false;
  saveHouseholdSelection();
  activatePlannerScope('', Boolean(options && options.discardPlanner));
  renderPlatformAdminUI();
  renderHouseholdUI();
  renderSyncStatus('Logged out. Sign in to open your household planner.');
}

function setSyncSession(response) {
  const previousUserId = syncState.session && syncState.session.user && syncState.session.user.id;
  syncState.session = {
    access_token: response.access_token,
    refresh_token: response.refresh_token,
    expires_in: response.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + Number(response.expires_in || 3600),
    user: response.user,
    device_generation: storageGeneration,
  };
  localStorage.setItem(SYNC_SESSION_KEY, JSON.stringify(syncState.session));
  if (previousUserId !== syncState.session.user.id) {
    syncState.generation += 1;
    householdState.households = [];
    householdState.invitations = [];
    householdState.members = [];
    householdState.membersHouseholdId = '';
    householdState.loaded = false;
    householdState.selectedHouseholdId = loadHouseholdSelection();
    platformAdminState.isAdmin = false;
    platformAdminState.households = [];
    platformAdminState.loaded = false;
    renderPlatformAdminUI();
    activatePlannerScope(plannerScopeFor(syncState.session, householdState.selectedHouseholdId));
  }
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
  renderAuthControls();
  if (!els.syncStatus) return;
  if (message) els.syncStatus.textContent = message;
  else if (!syncState.config.url || !syncState.config.key) els.syncStatus.textContent = 'Cloud sync is not connected.';
  else if (syncState.session) els.syncStatus.textContent = 'Connected. Syncing automatically.';
  else if (!MANUAL_SYNC_CONFIG_ALLOWED) els.syncStatus.textContent = 'Sign in to your Homeboard account.';
  else els.syncStatus.textContent = 'Connection saved. Sign in below.';
  els.syncStatus.className = `sync-status${type ? ` ${type}` : syncState.session ? ' connected' : ''}`;
}

function setSyncStatus(message, type) {
  renderSyncStatus(message, type);
}

function renderHouseholdUI() {
  renderCustomerFeatures();
  if (!HOUSEHOLD_UI_ENABLED || !els.householdSection) return;
  const invitations = syncInvitationContext();
  const signedIn = Boolean(syncState.session);
  if (els.householdAuthStatus) {
    els.householdAuthStatus.textContent = signedIn
      ? `Signed in as ${syncState.session.user && syncState.session.user.email ? syncState.session.user.email : 'this account'}.`
      : 'Sign in above to continue.';
    els.householdAuthStatus.className = `sync-status${signedIn ? ' connected' : ''}`;
  }
  if (els.householdWorkspace) els.householdWorkspace.hidden = !signedIn;
  if (!signedIn) {
    if (els.householdStatus) els.householdStatus.textContent = '';
    return;
  }

  const households = householdState.households || [];
  const selected = getSelectedHousehold();
  accountElement('firstHouseholdExamplesHint').hidden = !householdState.loaded || households.length > 0;
  accountElement('householdOptions').hidden = !selected || selected.role !== 'owner';
  accountElement('deleteHouseholdButton').disabled = householdState.loading || householdDeleteBusy || accountBusy;
  if (els.householdSelect) {
    els.householdSelect.hidden = !households.length;
    els.householdSelect.innerHTML = households.map((household) => `
      <option value="${escapeAttribute(household.household_id)}" ${household.household_id === householdState.selectedHouseholdId ? 'selected' : ''}>
        ${escapeHtml(household.household_name)} · ${escapeHtml(household.role)}
      </option>
    `).join('');
    els.householdSelect.disabled = householdState.loading || invitations.busy || !households.length;
  }
  if (els.createHouseholdButton) els.createHouseholdButton.disabled = householdState.loading;
  if (els.createInvitationButton) els.createInvitationButton.disabled = householdState.loading || invitations.busy || !selected || selected.role !== 'owner';
  if (els.copyInvitationButton) els.copyInvitationButton.disabled = invitations.busy;
  if (els.acceptInvitationButton) els.acceptInvitationButton.disabled = householdState.loading;
  if (els.householdInvitePanel) els.householdInvitePanel.hidden = !selected || selected.role !== 'owner';
  if (els.householdRenamePanel) els.householdRenamePanel.hidden = !selected || selected.role !== 'owner';
  if (els.householdRenameInput && selected && document.activeElement !== els.householdRenameInput) {
    els.householdRenameInput.value = selected.household_name || '';
  }
  if (els.renameHouseholdButton) els.renameHouseholdButton.disabled = householdState.loading || !selected || selected.role !== 'owner';
  if (els.invitationLinkBox && !els.invitationLinkInput.value) els.invitationLinkBox.hidden = true;
  renderHouseholdMembers();
  renderInvitationList();
}

function getSelectedHousehold() {
  return (householdState.households || []).find((household) => household.household_id === householdState.selectedHouseholdId) || null;
}

function reviewHouseholdDeletion() {
  const selected = getSelectedHousehold();
  if (!selected || selected.role !== 'owner' || !syncState.session || householdDeleteBusy || accountBusy) return;
  householdDeletion = { id: selected.household_id, name: selected.household_name, generation: syncState.generation };
  accountElement('deleteHouseholdName').textContent = selected.household_name;
  accountElement('deleteHouseholdPhrase').value = '';
  accountElement('deleteHouseholdStatus').textContent = 'Your account and other households will stay available.';
  renderHouseholdDeletionControls();
  openDialog(accountElement('deleteHouseholdDialog'));
  accountElement('cancelDeleteHouseholdButton').focus();
}

function renderHouseholdDeletionControls() {
  const selected = getSelectedHousehold();
  accountElement('confirmDeleteHouseholdButton').disabled = householdDeleteBusy || !householdDeletion
    || !syncState.session || householdDeletion.generation !== syncState.generation
    || !selected || selected.household_id !== householdDeletion.id || selected.role !== 'owner'
    || accountElement('deleteHouseholdPhrase').value !== householdDeletion.name;
  ['deleteHouseholdPhrase', 'closeDeleteHouseholdButton', 'cancelDeleteHouseholdButton'].forEach(id => {
    accountElement(id).disabled = householdDeleteBusy;
  });
}

function cancelHouseholdDeletion() {
  if (householdDeleteBusy) return;
  householdDeletion = null;
  accountElement('deleteHouseholdPhrase').value = '';
  closeDialog(accountElement('deleteHouseholdDialog'));
}

async function deleteHouseholdFromUI(event) {
  event.preventDefault();
  renderHouseholdDeletionControls();
  if (accountElement('confirmDeleteHouseholdButton').disabled) return;
  const review = { ...householdDeletion };
  householdDeleteBusy = true;
  plannerGeneration += 1; // Ignore cloud reads begun before confirmation.
  renderHouseholdDeletionControls();
  renderAuthControls();
  accountElement('deleteHouseholdStatus').textContent = 'Deleting household…';
  try {
    const deleted = await householdRpc('delete_my_household', {
      target_household_id: review.id, confirmed_household_name: accountElement('deleteHouseholdPhrase').value,
    });
    if (review.generation !== syncState.generation) return;
    if (deleted !== true) throw new Error('Deletion could not be confirmed. Refresh Household settings before trying again.');
    householdDeleteBusy = false;
    await applyHouseholdDeletion(review.id, true);
  } catch (error) {
    if (review.generation !== syncState.generation) return;
    accountElement('deleteHouseholdStatus').textContent = /schema cache|does not exist|404/i.test(error.message || '')
      ? 'Household deletion is not available yet. Please try again later.'
      : /Failed to fetch|NetworkError/i.test(error.message || '')
        ? 'The connection was interrupted. Refresh Household settings to check whether deletion completed before trying again.'
        : error.message || 'Deletion could not be confirmed. Refresh Household settings before trying again.';
  } finally {
    householdDeleteBusy = false;
    renderHouseholdDeletionControls();
    renderAuthControls();
    renderHouseholdUI();
  }
}

function deletedHouseholdKey(project, householdId) {
  return HOUSEHOLD_DELETED_KEY + encodeURIComponent(JSON.stringify([project, householdId]));
}

function scopeMatchesHousehold(scope, project, householdId) {
  try {
    const parts = JSON.parse(decodeURIComponent(scope));
    return parts[0] === project && parts[2] === householdId;
  } catch (error) { return false; }
}

function isDeletedPlannerScope(scope) {
  if (!scope) return false;
  try {
    const parts = JSON.parse(decodeURIComponent(scope));
    return Boolean(parts[2] && localStorage.getItem(deletedHouseholdKey(parts[0], parts[2])));
  } catch (error) { return false; }
}

async function applyHouseholdDeletion(householdId, broadcast = false) {
  const project = syncState.config.url;
  let cacheCleared = true;
  try {
    if (broadcast) localStorage.setItem(deletedHouseholdKey(project, householdId), JSON.stringify({ project, householdId, at: Date.now() }));
    // Remove only this household's copies, including caches from another
    // account on the same browser. The marker prevents delayed recovery/writes.
    Object.keys(localStorage).forEach(key => {
      const prefix = [STORAGE_KEY, BACKUP_STORAGE_KEY].map(base => `${base}:scope:`).find(base => key.startsWith(base));
      if (prefix && scopeMatchesHousehold(key.slice(prefix.length), project, householdId)) localStorage.removeItem(key);
    });
  } catch (error) { cacheCleared = false; }
  syncState.generation += 1;
  const generation = syncState.generation;
  householdState.households = householdState.households.filter(home => home.household_id !== householdId);
  if (householdState.selectedHouseholdId === householdId) {
    householdState.selectedHouseholdId = householdState.households.length ? householdState.households[0].household_id : '';
    householdState.members = [];
    householdState.membersHouseholdId = '';
    householdState.invitations = [];
    if (els.invitationLinkInput) els.invitationLinkInput.value = '';
    saveHouseholdSelection();
    activatePlannerScope(plannerScopeFor(syncState.session, householdState.selectedHouseholdId), true);
  }
  householdState.loaded = false;
  householdDeletion = null;
  accountElement('deleteHouseholdPhrase').value = '';
  closeDialog(accountElement('deleteHouseholdDialog'));
  renderHouseholdUI();
  await new Promise(resolve => {
    const timeout = window.setTimeout(() => { cacheCleared = false; resolve(); }, 3000);
    const finish = () => { window.clearTimeout(timeout); resolve(); };
    openPlannerDatabase(database => {
      try {
        const tx = database.transaction([IDB_STORE], 'readwrite');
        const request = tx.objectStore(IDB_STORE).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const key = String(cursor.key);
          if (key.startsWith('scope:') && scopeMatchesHousehold(key.slice(6), project, householdId)) cursor.delete();
          cursor.continue();
        };
        tx.oncomplete = () => { database.close(); finish(); };
        tx.onabort = tx.onerror = () => { cacheCleared = false; database.close(); finish(); };
      } catch (error) { cacheCleared = false; database.close(); finish(); }
    }, () => { cacheCleared = false; finish(); });
  });
  if (generation !== syncState.generation) return;
  await loadHouseholds(true);
  if (generation !== syncState.generation) return;
  await syncNow(false);
  if (generation !== syncState.generation) return;
  setHouseholdStatus(cacheCleared
    ? 'Household deleted. Your account and other households have been kept.'
    : 'Household deleted. Some saved browser copies could not be cleared. Clear this site’s browser data on this device.', cacheCleared ? 'connected' : 'error');
}

function setHouseholdStatus(message, type) {
  if (!els.householdStatus) return;
  els.householdStatus.textContent = message || '';
  els.householdStatus.className = `sync-status${type ? ` ${type}` : ''}`;
}

async function loadHouseholds(force = false, preferredHouseholdId = '') {
  if (householdDeleteBusy) return householdState.households;
  if (!HOUSEHOLD_UI_ENABLED || !syncState.session || !syncState.config.url || !syncState.config.key) {
    renderHouseholdUI();
    return;
  }
  const generation = syncState.generation;
  if (householdLoadPromise && householdLoadGeneration === generation) return householdLoadPromise;
  if (householdState.loaded && !force) return householdState.households;
  householdState.loading = true;
  renderHouseholdUI();
  householdLoadGeneration = generation;
  const request = (async () => {
    try {
      const rows = await householdRpc('list_my_households', {});
      if (generation !== syncState.generation || !syncState.session || householdDeleteBusy) return [];
      if (!Array.isArray(rows)) throw new Error('The household list is unavailable.');
      householdState.households = Array.isArray(rows) ? rows : [];
      const activationHousehold = new URLSearchParams(location.search).get('household');
      if (!preferredHouseholdId && activationHousehold && rows.some(row => row.household_id === activationHousehold)) preferredHouseholdId = activationHousehold;
      if (preferredHouseholdId) {
        if (!rows.some(household => household.household_id === preferredHouseholdId)) throw new Error('The household is not available yet.');
        householdState.selectedHouseholdId = preferredHouseholdId;
      }
      if (!householdState.households.some((household) => household.household_id === householdState.selectedHouseholdId)) {
        householdState.selectedHouseholdId = householdState.households[0] ? householdState.households[0].household_id : '';
      }
      saveHouseholdSelection();
      activatePlannerScope(plannerScopeFor(syncState.session, householdState.selectedHouseholdId));
      householdState.invitations = [];
      await loadHouseholdMembers();
      await loadHouseholdInvitations();
      if (generation !== syncState.generation || !syncState.session) return [];
      householdState.loaded = true;
      setHouseholdStatus(householdState.households.length ? 'Household account ready.' : 'Create your household or join one with an invitation.', 'connected');
      return householdState.households;
    } catch (error) {
      if (generation !== syncState.generation || !syncState.session) return [];
      // A failed membership lookup must never reroute a shared board into
      // private account storage. Keep its cache and retry before syncing.
      householdState.loaded = false;
      setHouseholdStatus(MANUAL_SYNC_CONFIG_ALLOWED
        ? 'Run household-invitations-setup.sql in Homeboard Development, then refresh this screen.'
        : 'The household service is not enabled yet. Please try again later.', 'error');
      return [];
    } finally {
      if (generation === syncState.generation) {
        householdState.loading = false;
        renderHouseholdUI();
      }
    }
  })();
  householdLoadPromise = request;
  try {
    return await request;
  } finally {
    if (householdLoadPromise === request) householdLoadPromise = null;
  }
}

async function loadHouseholdMembers() {
  const selected = getSelectedHousehold();
  const householdId = selected && selected.household_id;
  if (!selected || !syncState.session) {
    householdState.members = [];
    householdState.membersHouseholdId = '';
    renderHouseholdMembers();
    return;
  }
  try {
    const rows = await householdRpc('list_household_members', { target_household_id: householdId });
    if (getSelectedHousehold() && getSelectedHousehold().household_id === householdId) {
      householdState.members = Array.isArray(rows) ? rows : [];
      householdState.membersHouseholdId = householdId;
    }
  } catch (error) {
    if (getSelectedHousehold() && getSelectedHousehold().household_id === householdId) {
      householdState.members = [];
      householdState.membersHouseholdId = householdId;
    }
  }
  renderHouseholdMembers();
}

function renderHouseholdMembers() {
  if (!els.householdMemberList) return;
  const selected = getSelectedHousehold();
  if (!selected || householdState.membersHouseholdId !== selected.household_id) {
    els.householdMemberList.innerHTML = '<p class="household-empty">No member details available yet.</p>';
    return;
  }
  if (!householdState.members.length) {
    els.householdMemberList.innerHTML = '<p class="household-empty">No members found.</p>';
    return;
  }
  const currentUserId = syncState.session && syncState.session.user && syncState.session.user.id;
  els.householdMemberList.innerHTML = householdState.members.map((member) => {
    const isCurrentUser = member.user_id === currentUserId;
    const label = isCurrentUser ? `${member.email || 'Homeboard account'} · You` : (member.email || 'Homeboard account');
    const role = member.role === 'owner' ? 'Owner' : 'Member';
    const removeButton = selected.role === 'owner' && !isCurrentUser && member.role !== 'owner'
      ? `<button class="subtle-button" type="button" data-member-action="remove" data-member-id="${escapeAttribute(member.user_id)}">Remove</button>`
      : '';
    const transferButton = selected.role === 'owner' && !isCurrentUser && member.role === 'member'
      ? `<button class="subtle-button" type="button" data-member-action="transfer" data-member-id="${escapeAttribute(member.user_id)}">Make owner</button>`
      : '';
    const leaveButton = isCurrentUser && member.role === 'member'
      ? `<button class="subtle-button" type="button" data-member-action="leave">Leave</button>`
      : '';
    return `<div class="household-member-row">
      <div><strong>${escapeHtml(label)}</strong><span>${role}</span></div>
      <div class="household-member-actions">${transferButton}${removeButton}${leaveButton}</div>
    </div>`;
  }).join('');
}

async function loadPlatformAdminUI(force = false) {
  if (!HOUSEHOLD_UI_ENABLED || !syncState.session || !syncState.config.url || !syncState.config.key) {
    platformAdminState.isAdmin = false;
    platformAdminState.households = [];
    platformAdminState.loaded = false;
    renderPlatformAdminUI();
    return;
  }
  if (platformAdminState.loading || (platformAdminState.loaded && !force)) return;
  const generation = syncState.generation;
  platformAdminState.loading = true;
  try {
    const result = await householdRpc('is_platform_admin', {});
    if (generation !== syncState.generation) return;
    const isAdmin = result === true
      || result === 'true'
      || (Array.isArray(result) && result[0] === true)
      || Boolean(result && result.is_platform_admin === true);
    platformAdminState.isAdmin = isAdmin;
    platformAdminState.households = isAdmin
      ? (await householdRpc('list_platform_households', {})) || []
      : [];
    if (generation !== syncState.generation) return;
    if (isAdmin) {
      const accessRows = await householdRpc('list_platform_household_access', {});
      if (generation !== syncState.generation) return;
      platformAdminState.households = platformAdminState.households.map(household => Object.assign({}, household,
        (Array.isArray(accessRows) ? accessRows : []).find(row => row.household_id === household.household_id) || {}));
    }
    platformAdminState.loaded = true;
    if (isAdmin) setPlatformAdminStatus('Platform administrator access enabled.', 'connected');
  } catch (error) {
    platformAdminState.isAdmin = false;
    platformAdminState.households = [];
    platformAdminState.loaded = true;
  } finally {
    platformAdminState.loading = false;
    renderPlatformAdminUI();
  }
}

function setPlatformAdminStatus(message, type) {
  if (!els.platformAdminStatus) return;
  els.platformAdminStatus.textContent = message || '';
  els.platformAdminStatus.className = `sync-status${type ? ` ${type}` : ''}`;
}

function renderPlatformAdminUI() {
  if (!els.platformAdminSection || !els.platformAdminList) return;
  const visible = Boolean(platformAdminState.isAdmin && syncState.session);
  els.platformAdminSection.hidden = !visible;
  if (!visible) {
    els.platformAdminList.innerHTML = '';
    return;
  }
  if (!platformAdminState.households.length) {
    els.platformAdminList.innerHTML = '<p class="household-empty">No households found.</p>';
    return;
  }
  els.platformAdminList.innerHTML = platformAdminState.households.map((household) => {
    const memberCount = Number(household.member_count) || 0;
    return `<div class="platform-admin-row">
      <div><strong>${escapeHtml(household.household_name)}</strong><span>${memberCount} member${memberCount === 1 ? '' : 's'} · created ${escapeHtml(formatLongDate(new Date(household.created_at)))}</span></div>
      <div><span>${household.expires_at ? 'Access until '+escapeHtml(formatLongDate(new Date(household.expires_at))) : ''}</span>${household.renewal_requested ? '<strong>Renewal requested</strong>' : ''}</div>
      <button class="secondary-button" type="button" data-admin-action="renew" data-household-id="${escapeAttribute(household.household_id)}">Approve 6-month pass</button>
      <button class="danger-button" type="button" data-admin-action="delete" data-household-id="${escapeAttribute(household.household_id)}">Delete</button>
    </div>`;
  }).join('');
}

async function handlePlatformAdminListClick(event) {
  const renewButton = event.target.closest('[data-admin-action="renew"]');
  if (renewButton) {
    if (window.confirm('Approve a new household pass and email its activation code to the owner?')) await approveHouseholdRenewal(renewButton.dataset.householdId);
    return;
  }
  const button = event.target.closest('[data-admin-action="delete"]');
  if (!button) return;
  const household = platformAdminState.households.find((item) => item.household_id === button.dataset.householdId);
  if (!household) return;
  if (!window.confirm(`Delete the household “${household.household_name}” permanently?`)) return;
  const confirmation = window.prompt(`Type the household name exactly to confirm deletion:\n${household.household_name}`);
  if (confirmation !== household.household_name) {
    setPlatformAdminStatus('Deletion cancelled: the household name did not match.', 'error');
    return;
  }
  try {
    platformAdminState.loading = true;
    renderPlatformAdminUI();
    await householdRpc('delete_household_for_admin', { target_household_id: household.household_id });
    await loadHouseholds(true);
    await loadPlatformAdminUI(true);
    setPlatformAdminStatus(`Household “${household.household_name}” was deleted.`, 'connected');
  } catch (error) {
    setPlatformAdminStatus(error.message || 'The household could not be deleted.', 'error');
  } finally {
    platformAdminState.loading = false;
    renderPlatformAdminUI();
  }
}

async function loadHouseholdInvitations() {
  const context = syncInvitationContext();
  if (!context.householdId) return;
  const requestId = ++context.requestId;
  context.loading = true;
  context.error = false;
  renderInvitationList();
  try {
    const rows = await householdRpc('list_household_invitations', { target_household_id: context.householdId });
    if (syncInvitationContext() !== context || context.requestId !== requestId) return;
    if (!Array.isArray(rows)) throw new Error('Invitation list unavailable');
    householdState.invitations = Array.isArray(rows) ? rows : [];
    if (context.link) {
      const current = rows.find(item => item.invitation_id === context.link.id);
      if (!current || invitationStatus(current) !== 'Pending' || current.expires_at !== context.link.expiresAt) clearInvitationLink();
    }
  } catch (error) {
    if (syncInvitationContext() !== context || context.requestId !== requestId) return;
    householdState.invitations = [];
    context.error = true;
  } finally {
    if (syncInvitationContext() === context && context.requestId === requestId) {
      context.loading = false;
      renderInvitationList();
    }
  }
}

// Invitation responses and freshly generated links belong to one owner/session.
// A late request must never populate another household or a later sign-in.
function syncInvitationContext() {
  const selected = getSelectedHousehold();
  const householdId = syncState.session && selected && selected.role === 'owner' ? selected.household_id : '';
  if (!invitationState || invitationState.householdId !== householdId || invitationState.generation !== syncState.generation) {
    invitationState = { householdId, generation: syncState.generation, requestId: 0, loading: false, error: false, busy: false, link: null };
    householdState.invitations = [];
    clearInvitationLink();
  }
  return invitationState;
}

function clearInvitationLink() {
  if (invitationState) invitationState.link = null;
  if (els.invitationLinkInput) els.invitationLinkInput.value = '';
  if (els.invitationLinkBox) els.invitationLinkBox.hidden = true;
  const recipient = accountElement('invitationLinkRecipient');
  if (recipient) recipient.textContent = '';
}

function invitationStatus(invitation) {
  return invitation.accepted_at ? 'Accepted' : invitation.revoked_at ? 'Revoked' : new Date(invitation.expires_at) <= new Date() ? 'Expired' : 'Pending';
}

function renderInvitationList() {
  if (!els.invitationList) return;
  const context = syncInvitationContext();
  if (!context.householdId) {
    els.invitationList.innerHTML = '';
    return;
  }
  if (context.error) {
    els.invitationList.innerHTML = '<p class="household-empty">Invitations could not be loaded. <button type="button" class="subtle-button" data-invitation-action="refresh">Try again</button></p>';
    return;
  }
  if (context.loading) {
    els.invitationList.innerHTML = '<p class="household-empty">Loading invitations…</p>';
    return;
  }
  if (!householdState.invitations.length) {
    els.invitationList.innerHTML = '<p class="household-empty">No invitations yet.</p>';
    return;
  }
  els.invitationList.innerHTML = householdState.invitations.map((invitation) => {
    const status = invitationStatus(invitation);
    const date = invitation.accepted_at || invitation.revoked_at || invitation.expires_at;
    const label = status === 'Accepted' ? 'Accepted · joined' : status === 'Revoked' ? 'Revoked' : status === 'Expired' ? 'Expired' : 'Pending · expires';
    const disabled = context.busy || householdState.loading ? 'disabled' : '';
    const action = (name, text) => `<button class="subtle-button" type="button" data-invitation-action="${name}" data-invitation-id="${escapeAttribute(invitation.invitation_id)}" ${disabled}>${text}</button>`;
    return `<div class="invitation-row">
      <div class="invitation-details"><strong>${escapeHtml(invitation.invited_email)}</strong><span>${label} ${escapeHtml(formatLongDate(new Date(date)))}</span></div>
      <div class="invitation-actions">${status === 'Pending' || status === 'Expired' ? action('renew', 'Renew link') : ''}${status === 'Pending' ? action('revoke', 'Revoke') : ''}</div>
    </div>`;
  }).join('');
}

async function createHouseholdFromUI() {
  if (!syncState.session || householdState.loading) return;
  const generation = syncState.generation;
  const firstHousehold = householdState.loaded && householdState.households.length === 0;
  const name = String(els.householdNameInput && els.householdNameInput.value || '').trim();
  const peopleInput = accountElement('newHouseholdPeople');
  const names = peopleInput.value.split('\n').map(value => value.trim()).filter(Boolean);
  if (names.length > 12 || names.some(value => value.length > 60)) {
    setHouseholdStatus('Enter up to 12 names, each up to 60 characters.', 'error'); return;
  }
  if (!name) {
    setHouseholdStatus('Enter a household name first.', 'error');
    return;
  }
  try {
    householdState.loading = true;
    renderHouseholdUI();
    const householdId = await householdRpc('create_household', { household_name: name });
    if (generation !== syncState.generation) return;
    els.householdNameInput.value = '';
    peopleInput.value = '';
    if (householdLoadPromise) await householdLoadPromise;
    await loadHouseholds(true, householdId);
    if (generation !== syncState.generation) return;
    if (!householdState.loaded) throw new Error('Household created. Refresh Household settings to open it.');
    if (householdState.selectedHouseholdId !== householdId) return;
    const examplesAdded = firstHousehold && !state.data.tasks.length;
    if (names.length) state.data.profile = { members:names.map((person,index) => ({ id:index === 0 ? 'me' : index === 1 ? 'partner' : 'member-'+createId(),name:person })), updatedAt:nowIso() };
    if (examplesAdded) {
      state.data.tasks = createExampleTasks();
      state.weekStart = startOfWeek(new Date());
      persist({ sync: false });
      render();
    }
    if (names.length) { persist({sync:false}); render(); }
    await refreshHouseholdAccess();
    await syncNow(false);
    if (generation !== syncState.generation) return;
    if (!plannerIsWritable()) {
      accountElement('householdAccessOptions').open=true;
      setHouseholdStatus('Household ready. Next, get your free launch pass below, activate it from your email, then invite the other members.', 'connected');
      return;
    }
    setHouseholdStatus(examplesAdded
      ? 'Household created with two example tasks. Edit or delete them to make this planner yours.'
      : 'Household created. You can now invite your partner.', 'connected');
  } catch (error) {
    setHouseholdStatus(error.message || 'The household could not be created.', 'error');
    householdState.loading = false;
    renderHouseholdUI();
  }
}

function createExampleTasks() {
  const week = startOfWeek(new Date());
  const weekKey = dateKey(week);
  const sunday = dateKey(addDays(week, 6));
  const common = { assignee: 'both', kind: 'task', recurrence: 'weekly', reminder: 'none',
    recurrenceStartWeek: weekKey, updatedAt: nowIso() };
  return [
    Object.assign({}, common, { id: createId(), title: 'Example: Weekly tidy-up', anyDay: true,
      anyDayDate: weekKey, nextAnyDayDate: weekKey, recurrenceStartDate: weekKey, startTime: '', endTime: '' }),
    Object.assign({}, common, { id: createId(), title: 'Example: Plan next week', anyDay: false,
      date: sunday, recurrenceStartDate: sunday, startTime: '18:00', endTime: '18:15' }),
  ];
}

async function renameHouseholdFromUI() {
  const selected = getSelectedHousehold();
  const name = String(els.householdRenameInput && els.householdRenameInput.value || '').trim();
  if (!selected || selected.role !== 'owner') {
    setHouseholdStatus('Only the household owner can rename this household.', 'error');
    return;
  }
  if (!name) {
    setHouseholdStatus('Enter a household name first.', 'error');
    return;
  }
  try {
    householdState.loading = true;
    renderHouseholdUI();
    await householdRpc('rename_household', {
      target_household_id: selected.household_id,
      new_name: name,
    });
    await loadHouseholds(true);
    await loadPlatformAdminUI(true);
    setHouseholdStatus('Household name updated.', 'connected');
  } catch (error) {
    setHouseholdStatus(error.message || 'The household name could not be updated.', 'error');
  } finally {
    householdState.loading = false;
    renderHouseholdUI();
  }
}

async function createInvitationFromUI() {
  if (!syncState.session || householdState.loading || syncInvitationContext().busy) return;
  const selected = getSelectedHousehold();
  const email = String(els.inviteEmailInput && els.inviteEmailInput.value || '').trim();
  if (!selected || selected.role !== 'owner') {
    setHouseholdStatus('Only a household owner can create an invitation.', 'error');
    return;
  }
  if (!email || !email.includes('@')) {
    setHouseholdStatus('Enter your partner’s email address first.', 'error');
    return;
  }
  await mutateInvitation('create_household_invitation', {
    target_household_id: selected.household_id, target_email: email, ttl_hours: 168,
  }, 'Invitation created. Copy the link and send it to your partner.');
}

async function acceptInvitationFromUI() {
  const rawValue = String(els.inviteTokenInput && els.inviteTokenInput.value || '').trim();
  let token = rawValue;
  try {
    if (/^https?:\/\//i.test(rawValue)) token = new URL(rawValue).searchParams.get('invite') || rawValue;
  } catch (error) {
    token = rawValue;
  }
  if (!token) {
    setHouseholdStatus('Paste an invitation link or token first.', 'error');
    return;
  }
  try {
    householdState.loading = true;
    renderHouseholdUI();
    const code = token.replace(/[ -]/g, '');
    const joined = /^[a-f0-9]{16}$/i.test(code)
      ? await householdRpc('accept_household_code', { invitation_code: code })
      : await householdRpc('accept_household_invitation', { raw_token: token });
    els.inviteTokenInput.value = '';
    if (householdLoadPromise) await householdLoadPromise;
    await loadHouseholds(true, joined && joined[0] && joined[0].household_id);
    if (!householdState.loaded) throw new Error('Invitation accepted. Refresh Household settings to open it.');
    await syncNow(false);
    setHouseholdStatus('Invitation accepted. You joined the household.', 'connected');
  } catch (error) {
    setHouseholdStatus(error.message || 'The invitation could not be accepted.', 'error');
  } finally {
    householdState.loading = false;
    renderHouseholdUI();
  }
}

async function handleInvitationListClick(event) {
  const button = event.target.closest('[data-invitation-action]');
  const context = syncInvitationContext();
  if (!button || button.disabled || !context.householdId || context.busy || householdState.loading) return;
  const action = button.dataset.invitationAction;
  if (action === 'refresh') {
    await loadHouseholdInvitations();
    return;
  }
  const invitation = householdState.invitations.find(item => item.invitation_id === button.dataset.invitationId);
  if (!invitation || context.loading || context.error) return;
  const status = invitationStatus(invitation);
  if (action === 'renew' && (status === 'Pending' || status === 'Expired')) {
    if (!window.confirm(`Create a new invitation link for ${invitation.invited_email}? The old link will stop working.`)) return;
    await mutateInvitation('renew_household_invitation', { target_invitation_id: invitation.invitation_id },
      'New link ready for 7 days. The old link no longer works. Copy this link and send it to your partner.');
  } else if (action === 'revoke' && status === 'Pending') {
    if (!window.confirm(`Revoke the invitation for ${invitation.invited_email}? They will no longer be able to join with this link.`)) return;
    await mutateInvitation('revoke_household_invitation', { target_invitation_id: invitation.invitation_id }, 'Invitation revoked. Its link no longer works.');
  }
}

async function mutateInvitation(functionName, body, successMessage) {
  const context = syncInvitationContext();
  if (!context.householdId || context.busy) return;
  context.busy = true;
  clearInvitationLink();
  renderHouseholdUI();
  try {
    let deliveryMessage = '';
    let result;
    if (functionName !== 'revoke_household_invitation' && accountElement('emailInvitation').checked) {
      const session = await ensureSyncSession();
      const delivery = await syncRequest('/functions/v1/household-email', { method: 'POST', body: {
        action: functionName === 'create_household_invitation' ? 'invite' : 'renew', household_id: context.householdId,
        email: body.target_email, invitation_id: body.target_invitation_id, request_id: createId(),
      } }, session.access_token);
      result = delivery.invitation;
      deliveryMessage = delivery.message;
    } else result = await householdRpc(functionName, body);
    if (syncInvitationContext() !== context) return;
    if (functionName !== 'revoke_household_invitation') {
      const invitation = Array.isArray(result) ? result[0] : result;
      if (!invitation || !invitation.token) throw new Error('No invitation link was returned. Refresh the list before trying again.');
      const link = new URL(window.location.pathname, window.location.origin);
      link.searchParams.set('invite', invitation.token);
      context.link = { id: invitation.invitation_id, expiresAt: invitation.expires_at };
      els.invitationLinkInput.value = link.toString();
      els.invitationLinkBox.hidden = false;
      accountElement('invitationLinkRecipient').textContent = deliveryMessage
        ? `${deliveryMessage}${invitation.code ? ' Code: '+invitation.code : ''}`
        : `Send this link to ${invitation.invited_email}. No email has been sent automatically.`;
      if (functionName === 'create_household_invitation') els.inviteEmailInput.value = '';
    }
    await loadHouseholdInvitations();
    if (syncInvitationContext() === context) setHouseholdStatus(deliveryMessage || successMessage, 'connected');
  } catch (error) {
    if (syncInvitationContext() !== context) return;
    const message = error.message || '';
    setHouseholdStatus(/schema cache|does not exist|404/i.test(message)
      ? 'This invitation feature is not available yet. Please try again later.'
      : /Failed to fetch|NetworkError/i.test(message)
        ? 'The invitation could not be confirmed. Refresh the list before trying again.'
        : message || 'The invitation could not be updated.', 'error');
  } finally {
    if (syncInvitationContext() === context) {
      context.busy = false;
      renderHouseholdUI();
    }
  }
}

async function handleHouseholdMemberListClick(event) {
  const button = event.target.closest('[data-member-action]');
  if (!button) return;
  const selected = getSelectedHousehold();
  if (!selected) return;
  const action = button.dataset.memberAction;
  const member = householdState.members.find((item) => item.user_id === button.dataset.memberId);
  const memberLabel = member && member.email ? member.email : 'this member';
  if (action === 'remove') {
    if (!window.confirm(`Remove ${memberLabel} from this household?`)) return;
    try {
      householdState.loading = true;
      renderHouseholdUI();
      await householdRpc('remove_household_member', {
        target_household_id: selected.household_id,
        target_user_id: button.dataset.memberId,
      });
      await loadHouseholds(true);
      setHouseholdStatus('Member removed from the household.', 'connected');
    } catch (error) {
      setHouseholdStatus(error.message || 'The member could not be removed.', 'error');
    } finally {
      householdState.loading = false;
      renderHouseholdUI();
    }
    return;
  }
  if (action === 'transfer') {
    if (!window.confirm(`Make ${memberLabel} the household owner? You will become a regular member.`)) return;
    try {
      householdState.loading = true;
      renderHouseholdUI();
      await householdRpc('transfer_household_ownership', {
        target_household_id: selected.household_id,
        target_user_id: button.dataset.memberId,
      });
      await loadHouseholds(true);
      setHouseholdStatus(`${memberLabel} is now the household owner.`, 'connected');
    } catch (error) {
      setHouseholdStatus(error.message || 'Ownership could not be transferred.', 'error');
    } finally {
      householdState.loading = false;
      renderHouseholdUI();
    }
    return;
  }
  if (action === 'leave') {
    if (!window.confirm('Leave this household? You will need a new invitation to join again.')) return;
    try {
      householdState.loading = true;
      renderHouseholdUI();
      await householdRpc('leave_household', { target_household_id: selected.household_id });
      await loadHouseholds(true);
      setHouseholdStatus('You left the household.', 'connected');
    } catch (error) {
      setHouseholdStatus(error.message || 'You could not leave the household.', 'error');
    } finally {
      householdState.loading = false;
      renderHouseholdUI();
    }
  }
}

async function copyInvitationLink() {
  const context = syncInvitationContext();
  if (!context.householdId || context.busy || !context.link) return;
  const value = String(els.invitationLinkInput && els.invitationLinkInput.value || '');
  if (!value) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(value);
    else {
      els.invitationLinkInput.focus();
      els.invitationLinkInput.select();
      if (!document.execCommand('copy')) throw new Error('Manual copy required');
    }
    if (syncInvitationContext() === context) setHouseholdStatus('Invitation link copied. Send it to your partner.', 'connected');
  } catch (error) {
    if (syncInvitationContext() !== context) return;
    els.invitationLinkInput.focus();
    els.invitationLinkInput.select();
    setHouseholdStatus('Select the link and copy it manually.', 'error');
  }
}

async function householdRpc(functionName, body) {
  const generation = syncState.generation;
  const session = await ensureSyncSession();
  if (generation !== syncState.generation) throw new Error('This account session has changed.');
  if (!session) throw new Error('Sign in to manage your household.');
  return syncRequest(`/rest/v1/rpc/${functionName}`, { method: 'POST', body }, session.access_token);
}

async function syncNow(manual, authenticatedNow) {
  if (syncState.deleting || householdDeleteBusy || (syncState.authenticating && !authenticatedNow) || storageGeneration !== readStorageGeneration()) return;
  const generation = syncState.generation;
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
  let syncingPlannerGeneration = null;
  if (manual) setSyncStatus('Syncing…');
  try {
    const session = await ensureSyncSession();
    if (!session) throw new Error('Your session expired. Please sign in again.');
    const household = await ensureSelectedHouseholdForSync();
    if (generation !== syncState.generation || syncState.deleting) return;
    const scope = plannerScopeFor(session, household && household.household_id);
    if (scope !== activePlannerScope) activatePlannerScope(scope);
    syncingPlannerGeneration = plannerGeneration;
    await plannerRecoveryPromise;
    if (generation !== syncState.generation || syncingPlannerGeneration !== plannerGeneration || syncState.deleting) return;
    const remote = await fetchRemoteData(session, household);
    if (generation !== syncState.generation || syncingPlannerGeneration !== plannerGeneration || syncState.deleting) return;
    if (household && !MANUAL_SYNC_CONFIG_ALLOWED) await refreshHouseholdAccess();
    if (generation !== syncState.generation || syncingPlannerGeneration !== plannerGeneration || syncState.deleting) return;
    const localBefore = JSON.stringify(state.data);
    const merged = remote ? mergePlannerData(state.data, remote) : state.data;
    const mergedSignature = JSON.stringify(merged);
    state.data = merged;
    persist({ sync: false });
    if (mergedSignature !== localBefore) render();
    const writable = plannerIsWritable();
    if (writable && (!remote || JSON.stringify(remote) !== mergedSignature)) await pushRemoteData(session, merged, household);
    if (generation !== syncState.generation || syncingPlannerGeneration !== plannerGeneration || syncState.deleting) return;
    renderSyncStatus(!writable ? 'Connected. Board refreshed; editing requires active household access.' : household ? 'Connected. Shared household synced just now.' : 'Connected. Synced just now.', 'connected');
    return writable;
  } catch (error) {
    if (generation !== syncState.generation || (syncingPlannerGeneration !== null && syncingPlannerGeneration !== plannerGeneration) || syncState.deleting) return;
    if (error.status === 401 || /session expired|invalid.*(token|jwt)/i.test(error.message || '')) {
      syncState.session = null;
      localStorage.removeItem(SYNC_SESSION_KEY);
      stopSyncPolling();
    }
    setSyncStatus(error.message || 'Sync failed; local saving is still active.', 'error');
  } finally {
    syncState.busy = false;
    if (syncState.pending && !syncState.deleting && syncState.session) {
      syncState.pending = false;
      window.setTimeout(() => syncNow(false), 250);
    }
  }
}

async function ensureSelectedHouseholdForSync() {
  if (!HOUSEHOLD_UI_ENABLED || !syncState.session) return null;
  if (!householdState.loaded) await loadHouseholds();
  if (!householdState.loaded) throw new Error('Households could not be loaded. Your saved planner has been kept; try syncing again.');
  return getSelectedHousehold();
}

async function ensureSyncSession() {
  const session = syncState.session;
  if (!session) return null;
  if (!session.expires_at || Date.now() < (Number(session.expires_at) * 1000) - 60000) return session;
  if (!session.refresh_token) return null;
  const generation = syncState.generation;
  const response = await syncRequest('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } });
  if (generation !== syncState.generation || syncState.session !== session) return syncState.session;
  setSyncSession(response);
  return syncState.session;
}

async function fetchRemoteData(session, household) {
  if (household) {
    const householdId = encodeURIComponent(household.household_id);
    const rows = await syncRequest(`/rest/v1/household_documents?household_id=eq.${householdId}&select=household_id,data,updated_at`, { method: 'GET' }, session.access_token);
    if (!Array.isArray(rows) || !rows.length) throw new Error('This household planner is unavailable. Refresh Household settings and try again.');
    const raw = rows[0].data;
    // SQL creates an explicit empty JSON document. Empty is a valid board,
    // never permission to import the previously open or private planner.
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && !Object.keys(raw).length) return createEmptyPlanner();
    const householdData = normalizePlannerData(raw);
    if (householdData) return householdData;
    throw new Error('This household planner could not be read. Its saved data has been kept.');
  }
  return fetchLegacyRemoteData(session);
}

async function fetchLegacyRemoteData(session) {
  const userId = encodeURIComponent(session.user.id);
  const rows = await syncRequest(`/rest/v1/planner_documents?id=eq.${userId}&select=id,data,updated_at`, { method: 'GET' }, session.access_token);
  if (!Array.isArray(rows) || !rows.length) return null;
  return normalizePlannerData(rows[0].data);
}

async function pushRemoteData(session, data, household) {
  if (household) {
    const householdId = encodeURIComponent(household.household_id);
    await syncRequest(`/rest/v1/household_documents?household_id=eq.${householdId}`, {
      method: 'PATCH',
      body: { data, updated_at: new Date().toISOString() },
      headers: { Prefer: 'return=minimal' },
    }, session.access_token);
    return;
  }
  await syncRequest('/rest/v1/planner_documents', {
    method: 'POST',
    body: [{ id: session.user.id, data, updated_at: new Date().toISOString() }],
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  }, session.access_token);
}

async function syncRequest(path, options, accessToken) {
  if (IS_DEMO_HOST) throw new Error('The demo does not connect to household accounts.');
  const generation = syncState.generation;
  if (accessToken && (!syncState.session || accessToken !== syncState.session.access_token)) throw new Error('This account session has changed.');
  if (syncState.deleting && path !== '/functions/v1/delete-account') throw new Error('Account deletion is in progress.');
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
  if (generation !== syncState.generation || storageGeneration !== readStorageGeneration()) throw new Error('This account session has changed.');
  let result = null;
  try { result = text ? JSON.parse(text) : null; } catch (error) { result = null; }
  if (!response.ok) {
    const message = result && (result.msg || result.message || result.error_description || result.error) || `Cloud request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
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
  const merged = {
    tasks: mergeItems(local.tasks, remote.tasks, deleted.tasks).map((task) => Object.assign({}, task)),
    todos: mergeItems(local.todos, remote.todos, deleted.todos),
    groceries: mergeItems(local.groceries, remote.groceries, deleted.groceries),
    completions: Object.assign({}, remote.completions || {}, local.completions || {}),
    anyDayCompletions: mergeItems(local.anyDayCompletions || [], remote.anyDayCompletions || [], deleted.anyDayCompletions),
    daySettings: mergeDaySettings(local.daySettings, remote.daySettings),
    profile: HomeboardPlanner.newerProfile(local.profile, remote.profile),
    meta: Object.assign({}, remote.meta || {}, local.meta || {}, { demo: false, deleted }),
  };
  reconcileAnyDayCompletions(merged);
  return merged;
}

function mergeDeletedMaps(localDeleted, remoteDeleted) {
  const result = { tasks: {}, todos: {}, groceries: {}, anyDayCompletions: {} };
  ['tasks', 'todos', 'groceries', 'anyDayCompletions'].forEach((listName) => {
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
  if (isDeletedPlannerScope(activePlannerScope)) return createEmptyPlanner();
  try {
    const keysToTry = [scopedStorageKey(STORAGE_KEY, activePlannerScope), scopedStorageKey(BACKUP_STORAGE_KEY, activePlannerScope)]
      .concat(activePlannerScope ? [] : LEGACY_STORAGE_KEYS);
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
  // Examples are added only when a customer creates their first household.
  return createEmptyPlanner();
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
  if (isVolunteeringTask(normalized.title)
    && (normalized.startTime !== '14:00' || normalized.endTime !== '17:00')) {
    normalized.startTime = '14:00';
    normalized.endTime = '17:00';
    normalized.updatedAt = nowIso();
  }
  normalized.anyDay = Boolean(normalized.anyDay);
  if (normalized.anyDay) {
    normalized.anyDayDate = normalized.anyDayDate || normalized.nextAnyDayDate || dateKey(startOfWeek(new Date()));
  }
  if (isRecurringTask(normalized)) {
    normalized.recurrenceStartWeek = normalized.recurrenceStartWeek
      || (normalized.recurrenceStartDate ? dateKey(startOfWeek(parseDate(normalized.recurrenceStartDate))) : '')
      || (normalized.date ? dateKey(startOfWeek(parseDate(normalized.date))) : '');
    const anchorDate = getRecurringAnchorDate(normalized);
    normalized.recurrenceStartDate = normalized.recurrenceStartDate
      || (anchorDate ? dateKey(anchorDate) : '')
      || normalized.nextAnyDayDate
      || normalized.anyDayDate
      || '';
  } else {
    delete normalized.recurrenceStartWeek;
    delete normalized.recurrenceStartDate;
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
  const priority = Number(normalized.priority);
  if (priority === 1 || priority === 2) normalized.priority = priority;
  else delete normalized.priority;
  return normalized;
}

function normalizePlannerData(stored) {
  if (!stored || !Array.isArray(stored.tasks) || !Array.isArray(stored.todos) || !Array.isArray(stored.groceries)) return null;
  const normalized = {
    tasks: stored.tasks.map(normalizeTask),
    todos: stored.todos.map(normalizeListItem),
    groceries: stored.groceries.map(normalizeListItem),
    completions: stored.completions && typeof stored.completions === 'object' ? stored.completions : {},
    anyDayCompletions: Array.isArray(stored.anyDayCompletions) ? stored.anyDayCompletions.map(normalizeAnyDayCompletion) : [],
    daySettings: normalizeDaySettings(stored.daySettings),
    profile: stored.profile && typeof stored.profile === 'object' ? stored.profile : {},
    meta: stored.meta && typeof stored.meta === 'object' ? stored.meta : {},
  };
  reconcileAnyDayCompletions(normalized);
  return normalized;
}

function normalizeAnyDayCompletion(entry) {
  const normalized = {};
  Object.keys(entry || {}).forEach((key) => { normalized[key] = entry[key]; });
  normalized.id = normalized.id || createId();
  normalized.title = String(normalized.title || '').trim();
  normalized.assignee = /^[a-zA-Z0-9_-]{1,80}$/.test(normalized.assignee || '') ? normalized.assignee : 'both';
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
  // Saved pilot entries remain intact; never import its schedule automatically.
  let changed = false;
  const meta = state.data.meta || (state.data.meta = {});
  if (meta.volunteeringStartFixVersion !== '20260923-v2') {
    state.data.tasks.forEach((task) => {
      if (!isVolunteeringTask(task.title)) return;
      if (task.startTime === '14:00' && task.endTime === '17:00') return;
      task.startTime = '14:00';
      task.endTime = '17:00';
      task.updatedAt = nowIso();
      changed = true;
    });
    meta.volunteeringStartFixVersion = '20260923-v2';
    changed = true;
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
  if (isDeletedPlannerScope(activePlannerScope)) return;
  if (storageGeneration !== readStorageGeneration()) { clearDeletedAccountFromDevice(false); return; }
  plannerRevision += 1;
  try {
    reconcileAnyDayCompletions(state.data);
    state.data.meta = Object.assign({}, state.data.meta || {}, { demo: false });
    const serialized = JSON.stringify(state.data);
    // Each project/account/household has its own primary and recovery copy.
    // Unassigned old device data stays under the original keys for recovery;
    // it is never silently adopted by an authenticated planner.
    localStorage.setItem(scopedStorageKey(STORAGE_KEY, activePlannerScope), serialized);
    localStorage.setItem(scopedStorageKey(BACKUP_STORAGE_KEY, activePlannerScope), serialized);
    loadedDataFromStorage = true;
    mirrorDataToIndexedDB(state.data);
    if (!options || options.sync !== false) queueCloudSync();
    els.saveStatus.innerHTML = '<span class="status-dot"></span> Saved on this tablet';
  } catch (error) {
    els.saveStatus.innerHTML = '<span class="status-dot" style="background:#e5a34b"></span> Storage is unavailable';
    console.warn('Homeboard data could not be saved', error);
  }
}

function markDeleted(listName, itemId, deletedAt) {
  state.data.meta = state.data.meta || {};
  state.data.meta.deleted = state.data.meta.deleted || { tasks: {}, todos: {}, groceries: {} };
  state.data.meta.deleted[listName] = state.data.meta.deleted[listName] || {};
  state.data.meta.deleted[listName][itemId] = deletedAt || Date.now();
}

function clearDeletedMark(listName, itemId) {
  const deleted = state.data.meta && state.data.meta.deleted && state.data.meta.deleted[listName];
  if (!deleted) return;
  delete deleted[itemId];
}

function queueCloudSync() {
  if (syncState.deleting) return;
  if (!syncState || !syncState.session || !syncState.config.url || !syncState.config.key) return;
  if (syncState.queueTimer) return;
  syncState.queueTimer = window.setTimeout(() => {
    syncState.queueTimer = null;
    syncNow(false);
  }, 800);
}

function openPlannerDatabase(callback, onError) {
  if (!window.indexedDB) { if (onError) onError(); return; }
  try {
    const request = window.indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IDB_STORE)) request.result.createObjectStore(IDB_STORE);
    };
    request.onsuccess = () => callback(request.result);
    request.onerror = () => { if (onError) onError(); };
  } catch (error) {
    // IndexedDB is an additional recovery layer; localStorage remains primary.
    if (onError) onError();
  }
}

function mirrorDataToIndexedDB(data) {
  const generation = storageGeneration;
  const scope = activePlannerScope;
  const snapshot = JSON.parse(JSON.stringify(data));
  openPlannerDatabase((database) => {
    if (generation !== storageGeneration || generation !== readStorageGeneration() || isDeletedPlannerScope(scope)) { database.close(); return; }
    try {
      const transaction = database.transaction([IDB_STORE], 'readwrite');
      transaction.objectStore(IDB_STORE).put({ data: snapshot, generation }, plannerDatabaseKey(scope));
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => database.close();
    } catch (error) {
      database.close();
    }
  });
}

function recoverFromIndexedDB() {
  const generation = storageGeneration;
  const scope = activePlannerScope;
  const revision = plannerRevision;
  if (loadedDataFromStorage || !window.indexedDB || isDeletedPlannerScope(scope)) {
    plannerRecoveryPromise = Promise.resolve();
    return plannerRecoveryPromise;
  }
  plannerRecoveryPromise = new Promise(resolve => {
    let finished = false;
    const finish = () => { finished = true; window.clearTimeout(timeout); resolve(); };
    const timeout = window.setTimeout(finish, 3000);
    openPlannerDatabase((database) => {
      if (finished) { database.close(); return; }
      try {
        const transaction = database.transaction([IDB_STORE], 'readonly');
        const request = transaction.objectStore(IDB_STORE).get(plannerDatabaseKey(scope));
        request.onsuccess = () => {
          const stored = request.result;
          const recovered = stored && (stored.generation || '') === generation
            ? normalizePlannerData(stored.data || stored) : null;
          database.close();
          if (!finished && recovered && generation === storageGeneration && generation === readStorageGeneration()
            && scope === activePlannerScope && revision === plannerRevision && !isDeletedPlannerScope(scope)) {
            state.data = recovered;
            loadedDataFromStorage = true;
            persist();
            render();
            showToast('Your saved planner data was recovered');
          }
          finish();
        };
        request.onerror = () => { database.close(); finish(); };
      } catch (error) { database.close(); finish(); }
    }, finish);
  });
  return plannerRecoveryPromise;
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
