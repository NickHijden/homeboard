import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TIME_ZONE = Deno.env.get('HOMEBOARD_TIME_ZONE') || 'Europe/Amsterdam';
const REMINDER_HOUR = Number(Deno.env.get('HOMEBOARD_REMINDER_HOUR') || '9');
const OVERDUE_REMINDER_HOUR = Number(Deno.env.get('HOMEBOARD_OVERDUE_REMINDER_HOUR') || String(REMINDER_HOUR));
const CRON_SECRET = Deno.env.get('HOMEBOARD_CRON_SECRET') || '';
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('HOMEBOARD_FROM_EMAIL') || '';
const RECIPIENTS = [
  Deno.env.get('HOMEBOARD_NICK_EMAILS') || '',
  Deno.env.get('HOMEBOARD_STEPHANY_EMAILS') || '',
].flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);

const OPENERS = [
  'tomorrow has a lovely little adventure waiting for you',
  'tomorrow has a sweet plan with your name on it',
  'there is something wonderful waiting in your shared calendar tomorrow',
  'tomorrow is bringing you another small reason to smile',
  'your favourite household planner has a charming reminder for you',
  'tomorrow has a little sparkle scheduled into it',
];

const COMPLIMENTS = [
  'Nick is cheering you on from the sidelines and thinks you are absolutely wonderful.',
  'Your man loves you very much and is already looking forward to making the day lovely with you.',
  'You are brilliant, beautiful, and very deserving of a day that feels easy and happy.',
  'Consider this a tiny reminder that Nick adores you more than words can fit in one email.',
  'The calendar says what is planned, but Nick says the best part of every day is you.',
  'You make ordinary household moments feel like something worth celebrating.',
];

const SIGN_OFFS = [
  'Have fun, gorgeous. Your man loves you. 💛',
  'Go make tomorrow lovely, Stephany. Nick loves you endlessly. ✨',
  'Enjoy it, beautiful. Consider yourself officially lovebombed. 💕',
  'Have a wonderful time together. You are very, very loved. 🌷',
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-homeboard-cron-secret, x-homeboard-test-secret, x-homeboard-test-kind',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const isTestRun = request.headers.get('x-homeboard-test-secret') === CRON_SECRET && Boolean(CRON_SECRET);
  const isScheduledRun = request.headers.get('x-homeboard-cron-secret') === CRON_SECRET && Boolean(CRON_SECRET);
  const testKind = request.headers.get('x-homeboard-test-kind') || 'connection';
  if (!isTestRun && !isScheduledRun) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const localNow = getLocalParts(new Date());
  const tomorrow = addDays(localNow.date, 1);
  const isMondayOverdueRun = localNow.weekday === 'Mon'
    && localNow.hour >= OVERDUE_REMINDER_HOUR;
  const isRegularReminderWindow = localNow.hour === REMINDER_HOUR && localNow.minute < 15;
  if (!isTestRun && !isMondayOverdueRun && !isRegularReminderWindow) {
    return json({ skipped: true, reason: 'Outside reminder window', localNow });
  }
  if (!BREVO_API_KEY || !FROM_EMAIL || !RECIPIENTS.length) {
    return json({ error: 'Email secrets are not configured' }, 500);
  }

  if (isTestRun) {
    const previousSunday = addDays(localNow.date, -1);
    const previousMonday = addDays(localNow.date, -7);
    const testMessages = [] as Array<{ subject: string; text: string; html: string }>;
    if (testKind === 'connection' || testKind === 'all') {
      testMessages.push({
        subject: 'Homeboard test — your reminders are connected 💌',
        text: 'Hey Stephany,\n\nThis is a test email from Homeboard. If you received it, tomorrow\'s reminders can reach the household inboxes. Nick loves you. 💛\n\nHomeboard',
        html: '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#292d38"><p>Hey Stephany,</p><p>This is a test email from Homeboard. If you received it, tomorrow’s reminders can reach the household inboxes.</p><p>Nick loves you. 💛</p><p>Homeboard</p></div>',
      });
    }
    if (testKind === 'event' || testKind === 'all') {
      testMessages.push(createMessage({ id: 'homeboard-test-event', title: 'Test event reminder', date: tomorrow, startTime: '18:00', endTime: '19:30', recurrence: 'none' }, tomorrow));
    }
    if (testKind === 'overdue' || testKind === 'all') {
      testMessages.push(createOverdueMessage([
        { id: 'homeboard-test-overdue-1', title: 'Test unfinished task', assignee: 'me' },
        { id: 'homeboard-test-overdue-2', title: 'Test unfinished task for Stephany', assignee: 'partner' },
      ], previousMonday, previousSunday));
    }
    if (!testMessages.length) return json({ error: 'Unknown test kind. Use connection, event, overdue, or all.' }, 400);
    for (const message of testMessages) {
      for (const recipient of RECIPIENTS) await sendEmail(message, recipient);
    }
    return json({ testSent: true, testKind, messages: testMessages.length, recipients: RECIPIENTS.length, timeZone: TIME_ZONE });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Supabase service credentials are missing' }, 500);
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: documents, error } = await admin.from('planner_documents').select('id,data');
  if (error) return json({ error: error.message }, 500);

  const overdueSent = isMondayOverdueRun
    ? await sendOverdueReminders(admin, documents || [], localNow.date)
    : 0;
  let sent = 0;
  let considered = 0;
  for (const document of documents || []) {
    const data = document.data || {};
    for (const task of Array.isArray(data.tasks) ? data.tasks : []) {
      if (!task || !task.id || task.reminder === 'none') continue;
      if (!isDueOn(task, tomorrow) || data.completions?.[`${task.id}::${tomorrow}`]) continue;
      const { data: existingClaims, error: existingClaimError } = await admin
        .from('homeboard_reminder_log')
        .select('task_id')
        .eq('planner_id', document.id)
        .eq('task_id', String(task.id))
        .eq('occurrence_date', tomorrow)
        .limit(1);
      if (existingClaimError) return json({ error: existingClaimError.message }, 500);
      if (existingClaims && existingClaims.length) continue;
      considered += 1;

      const message = createMessage(task, tomorrow);
      // Send separately so the four private email addresses are never exposed
      // to one another in a single message's To/Cc headers.
      for (const recipient of RECIPIENTS) await sendEmail(message, recipient);
      const { error: claimError } = await admin
        .from('homeboard_reminder_log')
        .upsert({ planner_id: document.id, task_id: task.id, occurrence_date: tomorrow }, { onConflict: 'planner_id,task_id,occurrence_date', ignoreDuplicates: true });
      if (claimError) return json({ error: claimError.message }, 500);
      sent += 1;
    }
  }
  return json({ sent, considered, overdueSent, date: tomorrow, timeZone: TIME_ZONE });
});

async function sendOverdueReminders(admin: ReturnType<typeof createClient>, documents: Array<Record<string, unknown>>, monday: string) {
  const previousSunday = addDays(monday, -1);
  const previousMonday = addDays(monday, -7);
  let sentTasks = 0;
  for (const document of documents) {
    const data = (document.data || {}) as Record<string, unknown>;
    const tasks = Array.isArray(data.tasks) ? data.tasks as Array<Record<string, unknown>> : [];
    const completions = (data.completions || {}) as Record<string, unknown>;
    const candidates = tasks.map((task) => {
      const occurrenceDate = getOverdueOccurrenceDate(task, previousMonday, previousSunday);
      if (occurrenceDate && completions[`${String(task.id)}::${occurrenceDate}`]) return null;
      return occurrenceDate ? { task, occurrenceDate } : null;
    }).filter((candidate): candidate is { task: Record<string, unknown>; occurrenceDate: string } => Boolean(candidate));
    if (!candidates.length) continue;

    const taskIds = candidates.map(({ task }) => String(task.id));
    const occurrenceDates = candidates.map(({ occurrenceDate }) => occurrenceDate);
    const { data: claims, error: claimError } = await admin
      .from('homeboard_reminder_log')
      .select('task_id, occurrence_date')
      .eq('planner_id', String(document.id))
      .in('task_id', taskIds)
      .in('occurrence_date', occurrenceDates);
    if (claimError) throw new Error(claimError.message);
    const claimed = new Set((claims || []).map((claim) => `${claim.task_id}::${claim.occurrence_date}`));
    const unclaimed = candidates.filter(({ task, occurrenceDate }) => !claimed.has(`${task.id}::${occurrenceDate}`));
    if (!unclaimed.length) continue;

    const message = createOverdueMessage(unclaimed.map(({ task }) => task), previousMonday, previousSunday);
    for (const recipient of RECIPIENTS) await sendEmail(message, recipient);
    for (const { task, occurrenceDate } of unclaimed) {
      const { error: logError } = await admin
        .from('homeboard_reminder_log')
        .upsert({ planner_id: String(document.id), task_id: String(task.id), occurrence_date: occurrenceDate }, { onConflict: 'planner_id,task_id,occurrence_date', ignoreDuplicates: true });
      if (logError) throw new Error(logError.message);
      sentTasks += 1;
    }
  }
  return sentTasks;
}

function getOverdueAnyDayDate(task: Record<string, unknown>, previousMonday: string, previousSunday: string) {
  if (!task.anyDay || task.anyDayCompleted || task.reminder === 'none') return null;
  const recurrence = String(task.recurrence || '');
  if (!['weekly', 'biweekly', 'monthly', 'quarterly'].includes(recurrence)) return null;
  const lastMissed = String(task.lastMissedAnyDayDate || '');
  if (lastMissed >= previousMonday && lastMissed <= previousSunday) return lastMissed;
  const nextDue = String(task.nextAnyDayDate || task.anyDayDate || '');
  if (nextDue >= previousMonday && nextDue <= previousSunday) return nextDue;
  return null;
}

function getOverdueOccurrenceDate(task: Record<string, unknown>, previousMonday: string, previousSunday: string) {
  if (task.reminder === 'none') return null;
  if (task.anyDay) return getOverdueAnyDayDate(task, previousMonday, previousSunday);
  if (!['weekly', 'biweekly', 'monthly', 'quarterly'].includes(String(task.recurrence || ''))) return null;
  const rememberedMiss = String(task.lastMissedDate || '');
  if (rememberedMiss >= previousMonday && rememberedMiss <= previousSunday) return rememberedMiss;
  for (let offset = 0; offset < 7; offset += 1) {
    const occurrenceDate = addDays(previousMonday, offset);
    if (isDueOn(task, occurrenceDate)) return occurrenceDate;
  }
  return null;
}

function createOverdueMessage(tasks: Array<Record<string, unknown>>, previousMonday: string, previousSunday: string) {
  const rows = tasks.map((task) => {
    const title = String(task.title || 'Household task');
    const assignee = task.assignee === 'me' ? 'Nick' : task.assignee === 'partner' ? 'Stephany' : 'Both';
    return { title, assignee };
  });
  const subject = `Homeboard — ${rows.length} unfinished task${rows.length === 1 ? '' : 's'} from last week`;
  const text = [
    'Hey Nick and Stephany,',
    '',
    `These flexible recurring tasks were still open at the end of ${previousSunday} (the week of ${previousMonday}):`,
    ...rows.map((row) => `• ${row.title} — ${row.assignee}`),
    '',
    'A fresh week is a lovely chance to finish them together. Stephany, you are wonderful, and Nick is cheering you both on. 💛',
    '',
    'Love,',
    'Homeboard',
  ].join('\n');
  const htmlRows = rows.map((row) => `<li><strong>${escapeHtml(row.title)}</strong> <span style="color:#858b97">— ${escapeHtml(row.assignee)}</span></li>`).join('');
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#292d38;max-width:620px">
      <p>Hey Nick and Stephany,</p>
      <p>These flexible recurring tasks were still open at the end of <strong>${escapeHtml(previousSunday)}</strong>:</p>
      <ul>${htmlRows}</ul>
      <p>A fresh week is a lovely chance to finish them together. Stephany, you are wonderful, and Nick is cheering you both on. 💛</p>
      <p>Love,<br />Homeboard</p>
    </div>`;
  return { subject, text, html };
}

async function sendEmail(message: { subject: string; text: string; html: string }, recipient: string) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: FROM_EMAIL, name: 'Homeboard' },
      to: [{ email: recipient }],
      subject: message.subject,
      textContent: message.text,
      htmlContent: message.html,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Brevo failed: ${detail}`);
  }
}

function createMessage(task: Record<string, unknown>, date: string) {
  const hash = stringHash(`${String(task.id)}:${date}`);
  const title = String(task.title || 'something lovely');
  const eventTime = formatEventTime(task);
  const opener = OPENERS[hash % OPENERS.length];
  const compliment = COMPLIMENTS[Math.floor(hash / 7) % COMPLIMENTS.length];
  const signOff = SIGN_OFFS[Math.floor(hash / 13) % SIGN_OFFS.length];
  const subject = `A little love note for tomorrow: ${title}`;
  const text = [
    'Hey Stephany,',
    '',
    `Tomorrow ${opener}: “${title}”${eventTime ? ` at ${eventTime}` : ''}.`,
    '',
    compliment,
    '',
    signOff,
    '',
    'Love,',
    'Homeboard (with a little help from Nick)',
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#292d38;max-width:620px">
      <p>Hey Stephany,</p>
      <p>Tomorrow ${escapeHtml(opener)}: <strong>“${escapeHtml(title)}”</strong>${eventTime ? ` at <strong>${escapeHtml(eventTime)}</strong>` : ''}.</p>
      <p>${escapeHtml(compliment)}</p>
      <p style="font-size:18px">${escapeHtml(signOff)}</p>
      <p>Love,<br />Homeboard <span style="color:#8b88ed">(with a little help from Nick)</span></p>
    </div>`;
  return { subject, text, html };
}

function isDueOn(task: Record<string, unknown>, target: string) {
  const anchor = parseDateKey(String(task.recurrenceStartDate || task.date || ''));
  if (!anchor) return false;
  const targetDate = parseDateKey(target);
  if (!targetDate || dateNumber(targetDate) < dateNumber(anchor)) return false;
  const recurrence = String(task.recurrence || 'none');
  const days = Math.round((Date.UTC(targetDate.year, targetDate.month - 1, targetDate.day) - Date.UTC(anchor.year, anchor.month - 1, anchor.day)) / 86400000);
  if (recurrence === 'none') return days === 0;
  if (recurrence === 'weekly') return days % 7 === 0;
  if (recurrence === 'biweekly') return days % 14 === 0;
  if (recurrence === 'monthly' || recurrence === 'quarterly') {
    const months = (targetDate.year - anchor.year) * 12 + targetDate.month - anchor.month;
    const interval = recurrence === 'quarterly' ? 3 : 1;
    return months >= 0 && months % interval === 0 && targetDate.day === anchor.day;
  }
  return false;
}

function formatEventTime(task: Record<string, unknown>) {
  const start = parseTime(String(task.startTime || ''));
  const end = parseTime(String(task.endTime || ''));
  if (!start && !end) return '6:00 AM (no time set)';
  if (start && end) return `${formatTime(start)}–${formatTime(end)}`;
  if (start) return `from ${formatTime(start)}`;
  return `until ${formatTime(end!)}`;
}

function parseTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59) return null;
  if (match[3]) {
    if (hour < 1 || hour > 12) return null;
    if (match[3].toUpperCase() === 'AM' && hour === 12) hour = 0;
    if (match[3].toUpperCase() === 'PM' && hour !== 12) hour += 12;
  }
  if (hour > 23) return null;
  return { hour, minute };
}

function formatTime(time: { hour: number; minute: number }) {
  const suffix = time.hour >= 12 ? 'PM' : 'AM';
  const hour = time.hour % 12 || 12;
  return `${hour}:${String(time.minute).padStart(2, '0')} ${suffix}`;
}

function getLocalParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(value);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'short' }).format(value);
  return { date: `${get('year')}-${String(get('month')).padStart(2, '0')}-${String(get('day')).padStart(2, '0')}`, year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), weekday };
}

function addDays(value: string, amount: number) {
  const parsed = parseDateKey(value);
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function parseDateKey(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function dateNumber(value: { year: number; month: number; day: number }) {
  return Date.UTC(value.year, value.month - 1, value.day);
}

function stringHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash) + value.charCodeAt(index) | 0;
  return Math.abs(hash);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
