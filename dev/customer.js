// Customer features share the app's scoped planner and authenticated API helpers.
// Keep browser syntax compatible with iOS 12; no optional chaining or modules.
const customerState = { initialized: false, installPrompt: null, access: {}, accessRequests: {}, accessLoading: '', preferences: {}, gestureUntil: 0 };

function plannerEnvironment() { return IS_DEMO_HOST ? 'demo' : IS_DEVELOPMENT_HOST ? 'development' : 'production'; }
function plannerPeople(includeTogether) {
  const rows = HomeboardPlanner.members(state.data.profile);
  if(!includeTogether)return rows;
  // Renaming/removing a person must not make their existing chores disappear.
  (state.data.tasks||[]).concat(state.data.anyDayCompletions||[]).forEach(entry => {
    const id=entry.assignee;
    if(typeof id==='string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id) && id!=='both' && !rows.some(row=>row.id===id))rows.push({id,name:'Former member'});
  });
  return rows.concat([{ id: 'both', name: 'Together' }]);
}
function effectiveAssignee(task, occurrence) { return HomeboardPlanner.assignee(task, state.data.profile, occurrence); }
function populatePeopleChoices() {
  const current = els.taskAssignee.value;
  els.taskAssignee.innerHTML = plannerPeople(true).map(person => `<option value="${escapeAttribute(person.id)}">${escapeHtml(person.name)}</option>`).join('');
  els.taskAssignee.value = current || 'both';
}
function plannerIsWritable() {
  if (IS_DEMO_HOST || MANUAL_SYNC_CONFIG_ALLOWED) return true;
  if (!syncState.session || !householdState.selectedHouseholdId) return false;
  const access = customerState.access[activePlannerScope];
  return Boolean(access && Date.parse(access.expires_at) > Date.now());
}
function canEditPlanner() {
  if (plannerIsWritable()) return true;
  showToast(syncState.session ? 'This board is read-only. Review household access in Settings.' : 'Sign in and open your household first.');
  return false;
}
function customerContext() {
  const scope=activePlannerScope; const generation=syncState.generation;
  return () => scope===activePlannerScope && generation===syncState.generation;
}
function signupReturnUrl() {
  const url=new URL(location.pathname,location.origin);
  const current=new URLSearchParams(location.search);
  ['invite','activate','household'].forEach(key => { if(current.get(key))url.searchParams.set(key,current.get(key)); });
  return url.toString();
}
function initializeCustomerFeatures() {
  customerState.initialized = true;
  try { customerState.preferences = JSON.parse(localStorage.getItem('homeboard-display-v1'+STORAGE_NAMESPACE)) || {}; } catch (error) { /* Device defaults. */ }
  accountElement('customerSettings').innerHTML = `
    <details id="householdPeopleOptions" class="customer-options"><summary>People in this household</summary>
      <p class="field-hint">One name per line. Keep the order when changing a name so existing assignments stay with that person.</p>
      <label class="field-label" for="householdPeople">Names</label><textarea id="householdPeople" class="large-input" rows="3" maxlength="720" placeholder="Alex&#10;Taylor"></textarea>
      <button id="saveHouseholdPeople" class="secondary-button" type="button">Save names</button>
    </details>
    <details class="customer-options"><summary>Display and evening mode</summary>
      <label class="field-label" for="boardTextSize">Text size</label><select id="boardTextSize" class="large-input"><option value="normal">Normal</option><option value="large">Large</option><option value="larger">Extra large</option></select>
      <label class="field-label" for="phoneLayout">Phone layout</label><select id="phoneLayout" class="large-input"><option value="overview">Full board · pinch to zoom</option><option value="responsive">Larger, stacked view</option></select>
      <button id="fitBoardButton" class="secondary-button" type="button">Fit board to screen</button>
      <label class="any-day-toggle"><input id="quietEnabled" type="checkbox" /> Quiet evening mode</label>
      <div class="form-row"><label class="field-label">From<input id="quietStart" class="large-input" type="time" value="21:00" /></label><label class="field-label">Until<input id="quietEnd" class="large-input" type="time" value="07:00" /></label></div>
      <button id="saveDisplayButton" class="secondary-button" type="button">Save display preferences</button>
    </details>
    <button id="installButton" class="secondary-button" type="button">Install Homeboard</button>
    <details id="householdAccessOptions" class="customer-options"><summary>Household access</summary>
      <p id="householdAccessStatus" class="field-hint" role="status"></p>
      <button id="claimPassButton" class="secondary-button" type="button">Get a free launch pass</button>
      <label class="field-label" for="accessPassCode">Activation code</label><input id="accessPassCode" class="large-input" autocomplete="off" maxlength="128" />
      <p id="accessPassHint" class="field-hint">Open your pass email, then press Activate or extend access here. Your six months start when activation succeeds.</p>
      <button id="redeemPassButton" class="secondary-button" type="button">Activate or extend access</button>
      <button id="requestRenewalButton" class="secondary-button" type="button">Request renewal</button>
      <button id="refreshAccessButton" class="subtle-button" type="button">Refresh access</button>
      <p class="field-hint">One pass covers the household. Your board stays available to view and export after expiry.</p>
    </details>
    <p id="customerFeatureStatus" class="field-hint" role="status"></p>`;
  accountElement('boardTextSize').value = customerState.preferences.textSize || 'normal';
  accountElement('phoneLayout').value = customerState.preferences.phoneLayout || 'overview';
  accountElement('quietEnabled').checked = Boolean(customerState.preferences.quietEnabled);
  accountElement('quietStart').value = customerState.preferences.quietStart || '21:00';
  accountElement('quietEnd').value = customerState.preferences.quietEnd || '07:00';
  accountElement('saveHouseholdPeople').addEventListener('click', saveHouseholdPeople);
  accountElement('saveDisplayButton').addEventListener('click', () => {
    customerState.preferences = { textSize: accountElement('boardTextSize').value, phoneLayout: accountElement('phoneLayout').value,
      quietEnabled: accountElement('quietEnabled').checked, quietStart: accountElement('quietStart').value, quietEnd: accountElement('quietEnd').value };
    localStorage.setItem('homeboard-display-v1'+STORAGE_NAMESPACE, JSON.stringify(customerState.preferences));
    applyDisplayPreferences(true); showToast('Display preferences saved on this device.');
  });
  accountElement('fitBoardButton').addEventListener('click', () => applyPhoneLayout(true));
  accountElement('installButton').addEventListener('click', installHomeboard);
  accountElement('closeInstallButton').addEventListener('click', () => closeDialog(accountElement('installDialog')));
  accountElement('claimPassButton').addEventListener('click', claimLaunchPass);
  accountElement('redeemPassButton').addEventListener('click', redeemAccessPass);
  accountElement('requestRenewalButton').addEventListener('click', requestHouseholdRenewal);
  accountElement('refreshAccessButton').addEventListener('click', refreshHouseholdAccess);
  accountElement('forgotPasswordButton').addEventListener('click', requestPasswordRecovery);
  accountElement('passwordRecoveryForm').addEventListener('submit', finishPasswordRecovery);
  accountElement('cancelPasswordRecovery').addEventListener('click', cancelPasswordRecovery);
  accountElement('passwordRecoveryDialog').addEventListener('cancel', event => { event.preventDefault(); cancelPasswordRecovery(); });
  initializePasswordRecovery();
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); customerState.installPrompt = event; });
  window.addEventListener('appinstalled', () => { customerState.installPrompt = null; showToast('Homeboard installed.'); });
  const activation = new URLSearchParams(location.search);
  if (activation.get('activate')) {
    accountElement('accessPassCode').value=activation.get('activate');
    accountElement('householdAccessOptions').open=true;
    accountElement('customerFeatureStatus').textContent='Your pass code is ready. Sign in with the email address that received it, then press Activate or extend access.';
    openDialog(els.settingsDialog);
  }
  window.addEventListener('orientationchange', () => window.setTimeout(() => applyPhoneLayout(true), 250));
  window.addEventListener('online', refreshHouseholdAccess);
  window.addEventListener('focus', () => {
    const access=customerState.access[activePlannerScope];
    if(!access || Date.now()-(access.checked_at||0)>60000)refreshHouseholdAccess();
  });
  document.addEventListener('touchstart', event => { if (event.touches.length > 1) customerState.gestureUntil = Date.now()+800; }, { passive:true });
  document.addEventListener('touchend', () => { if (customerState.gestureUntil > Date.now()) customerState.gestureUntil = Date.now()+500; }, { passive:true });
  document.addEventListener('click', event => {
    if (customerState.gestureUntil > Date.now() && event.target.closest('.app-shell')) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('submit', event => {
    if (['taskForm','todoForm','groceryForm','daySettingsForm'].indexOf(event.target.id) !== -1 && !canEditPlanner()) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  if (IS_DEMO_HOST && !state.data.tasks.length && !state.data.meta.demoInitialized) {
    state.data.tasks = createExampleTasks(); state.data.profile = { members:[{id:'me',name:'Alex'},{id:'partner',name:'Taylor'}], updatedAt:nowIso() };
    state.data.meta.demoInitialized = true; persist({sync:false});
  }
  applyDisplayPreferences(true);
  window.setInterval(() => { applyDisplayPreferences(false); renderCustomerFeatures(); }, 60000);
  render();
}
function renderCustomerFeatures() {
  if (!customerState.initialized) return;
  if(activePlannerScope && !customerState.access[activePlannerScope]) {
    try { const cached=JSON.parse(localStorage.getItem('homeboard-access:'+activePlannerScope)); if(cached && cached.expires_at)customerState.access[activePlannerScope]=cached; } catch(ignore) { /* No verified cache. */ }
  }
  const gate = !MANUAL_SYNC_CONFIG_ALLOWED && !IS_DEMO_HOST && (!syncState.session || (householdState.loaded && !householdState.selectedHouseholdId));
  document.documentElement.classList.toggle('requires-account', gate);
  const panel = accountElement('accountGate'); panel.hidden = !gate;
  if (gate) panel.innerHTML = `<h2>${syncState.session ? 'Set up your household' : 'Welcome to Homeboard'}</h2><p>${syncState.session ? 'Name your household, add the people who live there, then activate a free launch pass or join with an invitation.' : 'Sign in or create an account to open your household. You can try the sample board separately.'}</p><button type="button" class="primary-button" id="openAccountSetup">${syncState.session ? 'Set up household' : 'Sign in / Create account'}</button> <a class="secondary-button" href="?demo=1">Try the demo</a>`;
  const button = accountElement('openAccountSetup'); if (button) button.onclick = () => {
    openDialog(els.settingsDialog);
    const field=syncState.session ? (new URLSearchParams(location.search).get('invite') ? els.inviteTokenInput : els.householdNameInput) : els.syncEmail;
    if(field){field.focus();field.scrollIntoView({block:'center'});}
  };
  accountElement('demoBanner').hidden=!IS_DEMO_HOST;
  const people = accountElement('householdPeople');
  const peopleVersion=activePlannerScope+':'+(state.data.profile && state.data.profile.updatedAt || '');
  if (people && document.activeElement !== people && people.dataset.scope !== peopleVersion) {
    people.value = state.data.profile && state.data.profile.members ? plannerPeople(false).map(p=>p.name).join('\n') : '';
    people.dataset.scope = peopleVersion;
  }
  const selected = getSelectedHousehold();
  accountElement('householdPeopleOptions').hidden=!selected && !IS_DEMO_HOST && !MANUAL_SYNC_CONFIG_ALLOWED;
  accountElement('householdAccessOptions').hidden = !syncState.session || !selected || IS_DEMO_HOST;
  if (selected && !IS_DEMO_HOST) {
    const cached = customerState.access[activePlannerScope];
    const active = cached && Date.parse(cached.expires_at) > Date.now();
    const needsActivation = Boolean(cached && cached.can_claim_free && !active);
    accountElement('householdAccessStatus').textContent = !cached ? 'Checking household access…' : needsActivation ? 'Activation required. Your six-month pass has not started yet.' : (active ? 'Access until ' : 'Read-only since ') + formatLongDate(new Date(cached.expires_at));
    accountElement('claimPassButton').disabled = selected.role !== 'owner' || !cached || !cached.can_claim_free;
    accountElement('redeemPassButton').disabled = selected.role !== 'owner';
    accountElement('requestRenewalButton').disabled = selected.role !== 'owner' || !cached || needsActivation;
    if (!cached && customerState.accessLoading !== activePlannerScope) refreshHouseholdAccess();
    const banner = accountElement('accessBanner');
    const expiring=active && Date.parse(cached.expires_at)-Date.now()<=7*86400000;
    banner.hidden = Boolean((active && !expiring) || MANUAL_SYNC_CONFIG_ALLOWED);
    banner.textContent = !cached ? 'Checking household access…' : needsActivation ? 'Activate your first household pass in Settings → Household access. Your six months have not started yet.' : expiring ? 'Your household pass expires soon. Request renewal in Settings → Household access. Renewal needs operator approval.' : 'This board is read-only. Open Settings → Household access to activate or extend your pass.';
    const activation = new URLSearchParams(location.search);
    if (activation.get('activate') && activation.get('household') === selected.household_id && selected.role === 'owner' && !customerState.activationLinkShown) {
      customerState.activationLinkShown = true;
      accountElement('householdAccessOptions').open = true;
      openDialog(els.settingsDialog);
      accountElement('customerFeatureStatus').textContent = 'Your emailed code is filled in. Press Activate or extend access to apply your pass.';
      window.setTimeout(() => {
        if (accountElement('accessPassCode').value) {
          accountElement('redeemPassButton').focus();
          accountElement('householdAccessOptions').scrollIntoView({block:'center'});
        }
      }, 0);
    }
  } else accountElement('accessBanner').hidden = true;
}
function saveHouseholdPeople() {
  if (!canEditPlanner()) return;
  const names = accountElement('householdPeople').value.split('\n').map(x=>x.trim()).filter(Boolean);
  if (!names.length || names.length > 12 || names.some(name=>name.length>60)) { showToast('Enter 1–12 names, each up to 60 characters.'); return; }
  const old = plannerPeople(false);
  state.data.profile = { members:names.map((name,i)=>({id:old[i] ? old[i].id : 'member-'+createId(),name})), updatedAt:nowIso() };
  populatePeopleChoices(); persist(); render(); showToast('Household names saved.');
}
function applyRecordedCompletion(task, value) {
  const completed = HomeboardPlanner.parseDate(value);
  if (!completed || value > dateKey(new Date())) { showToast('Choose a valid completion date, today or earlier.'); return false; }
  const next = isRecurringTask(task) ? dateKey(HomeboardPlanner.nextDate(completed, task.recurrence)) : '';
  task.lastCompletedOn = value;
  task.updatedAt = new Date(Math.max(Date.now(), Date.parse(task.updatedAt)||0)+1).toISOString();
  task.anyDayScheduleUpdatedAt = task.updatedAt;
  if (task.anyDay) {
    const history = { id:createId(),taskId:task.id,title:task.title,assignee:effectiveAssignee(task),completedDate:value,occurrenceDate:value,
      recurrence:task.recurrence,nextAnyDayDate:next,completedAt:new Date(Date.parse(task.updatedAt)+1).toISOString(),updatedAt:new Date(Date.parse(task.updatedAt)+1).toISOString() };
    state.data.anyDayCompletions.push(history);
    if (next) { task.nextAnyDayDate=next; task.anyDayDate=next; delete task.anyDayCompleted; }
    else task.anyDayCompleted=true;
  } else if (next) task.date=next;
  else state.data.completions[completionKey(task.id,task.date)]=true;
  if (next) { task.recurrenceStartDate=next; task.recurrenceStartWeek=dateKey(startOfWeek(parseDate(next))); }
  return true;
}
function applyDisplayPreferences(fit) {
  const p=customerState.preferences;
  document.documentElement.dataset.textSize=p.textSize || 'normal';
  const now=new Date(); const time=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  document.documentElement.classList.toggle('quiet-evening',Boolean(p.quietEnabled && HomeboardPlanner.quietAt(time,p.quietStart||'21:00',p.quietEnd||'07:00')));
  if (fit) applyPhoneLayout(true);
}
function applyPhoneLayout(reset) {
  const phone = /iPhone|Android.*Mobile/i.test(navigator.userAgent || '') || (window.screen && window.screen.width < 600);
  const overview = phone && customerState.preferences.phoneLayout !== 'responsive';
  const viewport=document.querySelector('meta[name="viewport"]');
  if (!viewport || !reset) return;
  const width = Math.min(window.screen.width || 390, window.innerWidth || 390);
  viewport.content=overview ? 'width=1024, initial-scale='+Math.min(1,width/1024)+', user-scalable=yes, viewport-fit=cover' : 'width=device-width, initial-scale=1, user-scalable=yes, viewport-fit=cover';
  document.documentElement.classList.toggle('phone-overview',overview);
  if (overview) window.scrollTo(0,0);
}
async function installHomeboard() {
  if (customerState.installPrompt) {
    const prompt=customerState.installPrompt; customerState.installPrompt=null; await prompt.prompt(); return;
  }
  const ios=/iPad|iPhone|iPod/i.test(navigator.userAgent||'') || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  accountElement('installInstructions').textContent = ios ? 'In Safari, open the Share menu, choose Add to Home Screen, then Add. Open the new Homeboard icon and sign in once on that device.' : 'Open your browser menu and choose Install app or Add to Home screen. If unavailable, bookmark Homeboard for quick access.';
  openDialog(accountElement('installDialog'));
}
async function refreshHouseholdAccess() {
  if (!syncState.session || !householdState.selectedHouseholdId || IS_DEMO_HOST) return;
  const scope=activePlannerScope; const generation=syncState.generation;
  if(customerState.accessRequests[scope])return customerState.accessRequests[scope];
  customerState.accessLoading=scope;
  const request=(async () => {
  try {
    const result=await householdRpc('get_household_access',{target_household_id:householdState.selectedHouseholdId});
    if (scope!==activePlannerScope || generation!==syncState.generation) return;
    const access=Array.isArray(result) ? result[0] : result;
    if (!access || !access.expires_at) throw new Error('Household access setup is not available yet.');
    access.checked_at=Date.now();customerState.access[scope]=access;
    localStorage.setItem('homeboard-access:'+scope,JSON.stringify(access));
    renderCustomerFeatures();
  } catch(error) {
    if (scope!==activePlannerScope || generation!==syncState.generation) return;
    try { const cached=JSON.parse(localStorage.getItem('homeboard-access:'+scope)); if(cached && cached.expires_at)customerState.access[scope]=cached; } catch(ignore) { /* Remain read-only. */ }
    renderCustomerFeatures();
    accountElement('householdAccessStatus').textContent='Household access could not be checked. Try again when connected.';
  }
  })();
  customerState.accessRequests[scope]=request;
  try { await request; } finally { if(customerState.accessRequests[scope]===request)delete customerState.accessRequests[scope]; }
}
async function claimLaunchPass() {
  const selected=getSelectedHousehold(); if(!selected || selected.role!=='owner')return;
  const current=customerContext();
  const button=accountElement('claimPassButton');button.disabled=true;
  try {
    const session=await ensureSyncSession();
    if(!current())return;
    const result=await syncRequest('/functions/v1/household-email',{method:'POST',body:{action:'claim-pass',household_id:selected.household_id}},session.access_token);
    if(current())accountElement('customerFeatureStatus').textContent=result.message || 'Check your email for an activation link and code.';
  } catch(error) { if(current())accountElement('customerFeatureStatus').textContent='A launch pass could not be issued. '+(error.message||'Please try later.'); }
  finally{if(current())renderCustomerFeatures();}
}
async function redeemAccessPass() {
  const selected=getSelectedHousehold(); if(!selected || selected.role!=='owner')return;
  const current=customerContext();
  const code=accountElement('accessPassCode').value.trim();if(!code)return;
  const button=accountElement('redeemPassButton');button.disabled=true;
  try {
    await householdRpc('redeem_household_pass',{target_household_id:selected.household_id,activation_code:code});
    if(!current())return;
    accountElement('accessPassCode').value=''; delete customerState.access[activePlannerScope];
    await refreshHouseholdAccess(); if(!current())return;
    const clean=new URL(location.href);clean.searchParams.delete('activate');clean.searchParams.delete('household');history.replaceState(null,'',clean.toString());
    const access=customerState.access[activePlannerScope];
    accountElement('customerFeatureStatus').textContent=access && Date.parse(access.expires_at)>Date.now() ? 'Household access activated until '+formatLongDate(new Date(access.expires_at))+'. Your existing board is ready.' : 'Your code was accepted. Refresh access to confirm your expiry date.';
    await syncNow(false);if(current())render();
  } catch(error){if(current())accountElement('customerFeatureStatus').textContent=error.message||'The pass could not be activated.';}
  finally{if(current())renderCustomerFeatures();}
}
async function notifyPlannerChange(taskId, updated) {
  const scope=activePlannerScope; const selected=getSelectedHousehold();
  const current=customerContext();
  if(!selected || !syncState.session || IS_DEMO_HOST){showToast('Saved. Sign in to a household to send a notification.');return;}
  try {
    const deadline=Date.now()+10000;
    while(syncState.busy && current() && Date.now()<deadline)await new Promise(resolve=>window.setTimeout(resolve,50));
    if(!current())return;
    const saved=await syncNow(false); if(!current())return;
    if(!saved){showToast('Saved on this device. Sync the board before sending a notification.');return;}
    const session=await ensureSyncSession();
    if(!current())return;
    const result=await syncRequest('/functions/v1/household-email',{method:'POST',body:{action:'notify',household_id:selected.household_id,request_id:createId(),change:updated?'updated':'added'}},session.access_token);
    showToast(result.message||'Notification accepted for delivery.');
  } catch(error){showToast('Saved, but the notification could not be sent.');}
}
async function requestHouseholdRenewal() {
  const selected=getSelectedHousehold(); if(!selected || selected.role!=='owner')return;
  const current=customerContext();
  const button=accountElement('requestRenewalButton'); button.disabled=true;
  try {
    const session=await ensureSyncSession();
    if(!current())return;
    const result=await syncRequest('/functions/v1/household-email',{method:'POST',body:{action:'request-renewal',household_id:selected.household_id,request_id:createId()}},session.access_token);
    if(current())accountElement('customerFeatureStatus').textContent=result.message+' Renewal needs operator approval.';
  }catch(error){if(current())accountElement('customerFeatureStatus').textContent=error.message||'The renewal request could not be sent.';}
  finally{if(current())renderCustomerFeatures();}
}
async function approveHouseholdRenewal(id) {
  if(!platformAdminState.isAdmin)return;
  const current=customerContext();
  try {
    const session=await ensureSyncSession();
    if(!current())return;
    const result=await syncRequest('/functions/v1/household-email',{method:'POST',body:{action:'approve-pass',household_id:id,request_id:createId()}},session.access_token);
    if(current()){await loadPlatformAdminUI(true);if(current())setPlatformAdminStatus(result.message,'connected');}
  }catch(error){if(current())setPlatformAdminStatus(error.message||'The renewal could not be approved.','error');}
}

async function requestPasswordRecovery() {
  if(IS_DEMO_HOST || customerState.requestingRecovery)return;
  const email=els.syncEmail.value.trim();
  if(!email || !els.syncEmail.checkValidity()){setSyncStatus('Enter your account email first.','error');els.syncEmail.focus();return;}
  const current=customerContext();customerState.requestingRecovery=true;accountElement('forgotPasswordButton').disabled=true;
  try{
    await syncRequest('/auth/v1/recover?redirect_to='+encodeURIComponent(signupReturnUrl()),{method:'POST',body:{email}});
    if(current())setSyncStatus('If this email has an account, a password reset link will arrive shortly. Check your inbox and spam folder.','connected');
  }catch(error){if(current())setSyncStatus(error.status===429?'Please wait before requesting another reset email.':'The reset email could not be requested. Please try again later.','error');}
  finally{customerState.requestingRecovery=false;accountElement('forgotPasswordButton').disabled=false;}
}
async function initializePasswordRecovery() {
  const fragment=new URLSearchParams(location.hash.slice(1));
  if(fragment.get('error')) {
    history.replaceState(null,'',location.pathname+location.search);openDialog(els.settingsDialog);
    setSyncStatus('This email link is invalid or expired. Request a fresh email and try again.','error');return;
  }
  if(fragment.get('type')!=='recovery'){
    if(fragment.get('access_token'))history.replaceState(null,'',location.pathname+location.search);
    return;
  }
  const token=fragment.get('access_token');
  history.replaceState(null,'',location.pathname+location.search);
  if(IS_DEMO_HOST)return;
  const generation=syncState.generation;const current=()=>generation===syncState.generation;
  const recovery={token,verified:false,busy:false};customerState.recovery=recovery;
  openDialog(accountElement('passwordRecoveryDialog'));accountElement('passwordRecoveryStatus').textContent='Checking your reset link…';
  try{
    if(!token)throw new Error('Missing reset token');
    const user=await recoveryAuthRequest(recovery,'GET');
    if(!current() || customerState.recovery!==recovery)return;
    if(!user || !user.id || !user.email)throw new Error('Invalid reset user');
    recovery.verified=true;recovery.userId=user.id;
    accountElement('passwordRecoveryIdentity').textContent=user.email;
    accountElement('passwordRecoveryStatus').textContent='Enter a new password of at least 8 characters.';
    accountElement('saveRecoveryPassword').disabled=false;
  }catch(error){if(current() && customerState.recovery===recovery)accountElement('passwordRecoveryStatus').textContent='This reset link is invalid or expired. Close this screen and request another email.';}
}
function cancelPasswordRecovery() {
  if(customerState.recovery && customerState.recovery.busy)return;
  customerState.recovery=null;accountElement('passwordRecoveryForm').reset();accountElement('saveRecoveryPassword').disabled=true;
  closeDialog(accountElement('passwordRecoveryDialog'));
}
async function recoveryAuthRequest(recovery, method, password) {
  // A reset link is a temporary credential, not the currently saved login.
  // Keep the normal session guard unchanged; allow this credential only at
  // the configured project's Auth user endpoint, which validates it server-side.
  if(IS_DEMO_HOST || !recovery || customerState.recovery!==recovery || !recovery.token || ['GET','PUT'].indexOf(method)===-1)throw new Error('Invalid reset request');
  const generation=syncState.generation;
  const request={method,headers:{apikey:syncState.config.key,Authorization:'Bearer '+recovery.token,'Content-Type':'application/json'}};
  if(method==='PUT')request.body=JSON.stringify({password});
  const response=await fetch(syncState.config.url+'/auth/v1/user',request);
  const user=await response.json();
  if(!response.ok || generation!==syncState.generation || customerState.recovery!==recovery)throw new Error('Reset request could not be verified');
  return user;
}
async function finishPasswordRecovery(event) {
  event.preventDefault();const recovery=customerState.recovery;
  if(!recovery || !recovery.verified || recovery.busy)return;
  const password=accountElement('recoveryPassword').value;
  if(password.length<8 || password!==accountElement('recoveryPasswordAgain').value){accountElement('passwordRecoveryStatus').textContent='Enter matching passwords of at least 8 characters.';return;}
  const generation=syncState.generation;const current=()=>generation===syncState.generation;
  recovery.busy=true;accountElement('saveRecoveryPassword').disabled=true;accountElement('cancelPasswordRecovery').disabled=true;
  try{
    const user=await recoveryAuthRequest(recovery,'PUT',password);
    if(!current() || customerState.recovery!==recovery)return;
    if(!user || user.id!==recovery.userId)throw new Error('Password update not confirmed');
    recovery.busy=false;cancelPasswordRecovery();
    openDialog(els.settingsDialog);setSyncStatus('Password updated. Sign in with your new password to open your existing household.','connected');
  }catch(error){if(current() && customerState.recovery===recovery)accountElement('passwordRecoveryStatus').textContent='The password update could not be confirmed. Try the new password or request another reset link.';}
  finally{recovery.busy=false;accountElement('recoveryPassword').value='';accountElement('recoveryPasswordAgain').value='';accountElement('cancelPasswordRecovery').disabled=false;accountElement('saveRecoveryPassword').disabled=!customerState.recovery || !customerState.recovery.verified;}
}
