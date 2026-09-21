import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TIME_ZONE = Deno.env.get('HOMEBOARD_TIME_ZONE') || 'Europe/Amsterdam';
const REMINDER_HOUR = Number(Deno.env.get('HOMEBOARD_REMINDER_HOUR') || '9');
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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-homeboard-cron-secret, x-homeboard-test-secret',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const isTestRun = request.headers.get('x-homeboard-test-secret') === CRON_SECRET && Boolean(CRON_SECRET);
  const isScheduledRun = request.headers.get('x-homeboard-cron-secret') === CRON_SECRET && Boolean(CRON_SECRET);
  if (!isTestRun && !isScheduledRun) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const localNow = getLocalParts(new Date());
  if (!isTestRun && (localNow.hour !== REMINDER_HOUR || localNow.minute >= 15)) {
    return json({ skipped: true, reason: 'Outside reminder window', localNow });
  }
  if (!BREVO_API_KEY || !FROM_EMAIL || !RECIPIENTS.length) {
    return json({ error: 'Email secrets are not configured' }, 500);
  }

  if (isTestRun) {
    const testMessage = {
      subject: 'Homeboard test — your reminders are connected 💌',
      text: 'Hey Stephany,\n\nThis is a test email from Homeboard. If you received it, tomorrow\'s reminders can reach the household inboxes. Nick loves you. 💛\n\nHomeboard',
      html: '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#292d38"><p>Hey Stephany,</p><p>This is a test email from Homeboard. If you received it, tomorrow’s reminders can reach the household inboxes.</p><p>Nick loves you. 💛</p><p>Homeboard</p></div>',
    };
    for (const recipient of RECIPIENTS) await sendEmail(testMessage, recipient);
    return json({ testSent: true, recipients: RECIPIENTS.length, timeZone: TIME_ZONE });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Supabase service credentials are missing' }, 500);
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const tomorrow = addDays(localNow.date, 1);
  const { data: documents, error } = await admin.from('planner_documents').select('id,data');
  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  let considered = 0;
  for (const document of documents || []) {
    const data = document.data || {};
    for (const task of Array.isArray(data.tasks) ? data.tasks : []) {
      if (!task || !task.id || task.reminder === 'none') continue;
      if (!isDueOn(task, tomorrow) || data.completions?.[`${task.id}::${tomorrow}`]) continue;
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
  return json({ sent, considered, date: tomorrow, timeZone: TIME_ZONE });
});

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
  const anchor = parseDateKey(String(task.date || ''));
  if (!anchor) return false;
  const targetDate = parseDateKey(target);
  if (!targetDate || dateNumber(targetDate) < dateNumber(anchor)) return false;
  const recurrence = String(task.recurrence || 'none');
  const days = Math.round((Date.UTC(targetDate.year, targetDate.month - 1, targetDate.day) - Date.UTC(anchor.year, anchor.month - 1, anchor.day)) / 86400000);
  if (recurrence === 'none') return days === 0;
  if (recurrence === 'weekly') return days % 7 === 0;
  if (recurrence === 'biweekly') return days % 14 === 0;
  if (recurrence === 'monthly') return targetDate.day === anchor.day;
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
  return { date: `${get('year')}-${String(get('month')).padStart(2, '0')}-${String(get('day')).padStart(2, '0')}`, year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute') };
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
