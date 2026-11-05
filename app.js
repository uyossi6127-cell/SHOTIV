'use strict';

// ---------- שמירת נתונים (על המכשיר בלבד) ----------
const STORAGE_KEY = 'shotiv.v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ---------- חישובים ----------
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function nextShotDate(data, now = new Date()) {
  const today = startOfDay(now);
  const lastShot = data.shots[data.shots.length - 1];
  if (lastShot) {
    return new Date(startOfDay(lastShot.date).getTime() + 7 * DAY_MS);
  }
  const diff = (data.profile.shotDay - today.getDay() + 7) % 7;
  return new Date(today.getTime() + diff * DAY_MS);
}

function daysUntil(date, now = new Date()) {
  return Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
}

function currentWeight(data) {
  const last = data.weights[data.weights.length - 1];
  return last ? last.kg : data.profile.startWeight;
}

function formatKg(n) {
  return (Math.round(n * 10) / 10).toLocaleString('he-IL', { maximumFractionDigits: 1 });
}

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return 'בוקר טוב';
  if (h < 18) return 'צהריים טובים';
  return 'ערב טוב';
}

// ---------- מסכים ----------
const app = document.getElementById('app');

function mount(templateId) {
  const node = document.getElementById(templateId).content.cloneNode(true);
  app.replaceChildren(node);
}

function renderOnboarding() {
  mount('tpl-onboarding');
  const form = document.getElementById('onboarding-form');
  const errorEl = document.getElementById('onboarding-error');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const f = new FormData(form);
    const profile = {
      med: f.get('med'),
      dose: Number(f.get('dose')),
      shotDay: Number(f.get('shotDay')),
      shotTime: f.get('shotTime'),
      startWeight: Number(f.get('startWeight')),
      goalWeight: Number(f.get('goalWeight')),
      createdAt: new Date().toISOString(),
    };

    const problem = validateProfile(profile);
    if (problem) {
      errorEl.textContent = problem;
      errorEl.hidden = false;
      return;
    }

    saveData({ version: 1, profile, shots: [], weights: [] });
    render();
  });
}

function validateProfile(p) {
  if (!p.med) return 'בחר את סוג התרופה.';
  if (!(p.dose > 0)) return 'הזן את המינון שהרופא קבע.';
  if (!(p.startWeight >= 30 && p.startWeight <= 300)) return 'הזן משקל נוכחי בין 30 ל-300 ק"ג.';
  if (!(p.goalWeight >= 30 && p.goalWeight <= 300)) return 'הזן משקל יעד בין 30 ל-300 ק"ג.';
  if (p.goalWeight >= p.startWeight) return 'משקל היעד צריך להיות נמוך מהמשקל הנוכחי.';
  if (!p.shotTime) return 'בחר שעה לתזכורת.';
  return null;
}

function renderHome(data) {
  mount('tpl-home');
  const $ = (sel) => app.querySelector(sel);
  const { profile } = data;

  $('[data-greeting]').textContent = greeting() + ',';

  const next = nextShotDate(data);
  const days = daysUntil(next);
  const daysEl = $('[data-days]');
  const wordEl = $('[data-days-word]');
  if (days > 1) { daysEl.textContent = days; wordEl.textContent = 'ימים'; }
  else if (days === 1) { daysEl.textContent = 'מחר'; wordEl.textContent = ''; }
  else if (days === 0) { daysEl.textContent = 'היום'; wordEl.textContent = ''; }
  else { daysEl.textContent = Math.abs(days); wordEl.textContent = Math.abs(days) === 1 ? 'יום באיחור' : 'ימים באיחור'; }

  $('[data-shot-meta]').textContent =
    `יום ${DAY_NAMES[next.getDay()]} · ${profile.med} ${formatKg(profile.dose)} מ"ג`;

  const now = currentWeight(data);
  const lost = Math.max(0, profile.startWeight - now);
  const left = Math.max(0, now - profile.goalWeight);
  const total = profile.startWeight - profile.goalWeight;
  const pct = total > 0 ? Math.min(100, Math.max(0, Math.round((lost / total) * 100))) : 0;

  $('[data-goal]').textContent = `יעד: ${formatKg(profile.goalWeight)} ק"ג`;
  $('[data-now]').textContent = formatKg(now);
  $('[data-lost]').textContent = lost > 0 ? '−' + formatKg(lost) : '0';
  $('[data-left]').textContent = formatKg(left);
  $('[data-progress-bar]').setAttribute('aria-valuenow', pct);
  $('[data-progress-text]').textContent = `${pct}% מהדרך ליעד`;
  requestAnimationFrame(() => { $('[data-progress-fill]').style.width = pct + '%'; });

  $('[data-motivation]').textContent = motivation(data, pct);

  const logBtn = $('[data-action="log-shot"]');
  const lastShot = data.shots[data.shots.length - 1];
  const loggedToday = lastShot && daysUntil(lastShot.date) === 0;
  if (loggedToday) {
    // כבר נרשמה זריקה היום: לא מאפשרים רישום כפול, אבל מאפשרים לבטל טעות.
    logBtn.textContent = 'ביטול הרישום של היום';
    logBtn.addEventListener('click', () => {
      if (!window.confirm('לבטל את הזריקה שנרשמה היום?')) return;
      data.shots.pop();
      saveData(data);
      toast('הרישום בוטל');
      renderHome(data);
    });
  } else {
    logBtn.addEventListener('click', () => { location.hash = '#log'; });
  }

  // תזכורת שבועית ביומן (S4): מוצגת עד שהמשתמש מאשר שהוסיף.
  if (!profile.calendarAdded) {
    $('[data-reminder-card]').hidden = false;
    $('[data-reminder-text]').textContent =
      `אירוע קבוע בכל יום ${DAY_NAMES[profile.shotDay]} בשעה ${profile.shotTime}. עובד גם כשהאפליקציה סגורה.`;
    $('[data-action="add-calendar"]').addEventListener('click', () => downloadCalendar(data));
    $('[data-action="calendar-done"]').addEventListener('click', () => {
      profile.calendarAdded = true;
      saveData(data);
      renderHome(data);
    });
  }

  $('[data-action="reset"]').addEventListener('click', () => {
    if (window.confirm('למחוק את כל הנתונים ולהתחיל מחדש?')) {
      localStorage.removeItem(STORAGE_KEY);
      render();
    }
  });
}

function motivation(data, pct) {
  if (data.shots.length === 0) return 'ברוך הבא. כשתזריק, לחץ על "רשום זריקה" והספירה תתחיל.';
  if (pct >= 100) return 'הגעת ליעד. עכשיו המטרה היא לשמור עליו.';
  if (pct >= 50) return 'עברת את חצי הדרך. תמשיך באותו קצב.';
  const count = data.shots.length === 1 ? 'נרשמה זריקה ראשונה' : `נרשמו ${data.shots.length} זריקות`;
  return `${count}. כל שבוע מקרב אותך ליעד.`;
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// תיקון חד-פעמי לנתונים שנוצרו לפני התיקון: מוחק זריקות כפולות באותו יום.
function dedupeShots(data) {
  const seen = new Set();
  const before = data.shots.length;
  data.shots = data.shots.filter((s) => {
    const key = startOfDay(s.date).getTime();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (data.shots.length !== before) saveData(data);
  return data;
}

// ---------- רישום זריקה (S3) ----------
const SITES = ['בטן ימין', 'בטן שמאל', 'ירך ימין', 'ירך שמאל', 'זרוע ימין', 'זרוע שמאל'];

function suggestedSite(data) {
  const last = [...data.shots].reverse().find((s) => s.site);
  if (!last) return SITES[0];
  return SITES[(SITES.indexOf(last.site) + 1) % SITES.length];
}

function toDateInput(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function renderLog(data) {
  mount('tpl-log');
  const $ = (sel) => app.querySelector(sel);
  const { profile } = data;
  const form = document.getElementById('log-form');
  const errorEl = document.getElementById('log-error');

  $('[data-med-dose]').textContent = `${profile.med} · ${formatKg(profile.dose)} מ"ג`;

  const lastWithSite = [...data.shots].reverse().find((s) => s.site);
  $('[data-last-site]').textContent = lastWithSite ? `בפעם הקודמת: ${lastWithSite.site}` : '';

  const suggestion = suggestedSite(data);
  const sitesEl = $('[data-sites]');
  SITES.forEach((site) => {
    const label = document.createElement('label');
    label.className = 'choice' + (site === suggestion ? ' suggested' : '');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'site';
    input.value = site;
    input.checked = site === suggestion;
    const span = document.createElement('span');
    span.textContent = site;
    label.append(input, span);
    sitesEl.appendChild(label);
  });

  const dateInput = form.elements.date;
  dateInput.max = toDateInput(new Date());
  dateInput.value = toDateInput(new Date());
  form.querySelectorAll('input[name="when"]').forEach((r) => {
    r.addEventListener('change', () => {
      $('[data-other-date]').hidden = form.elements.when.value !== 'other';
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const when = form.elements.when.value;
    const date = when === 'today' ? new Date() : new Date(dateInput.value + 'T12:00:00');

    if (isNaN(date)) return showError(errorEl, 'בחר תאריך.');
    if (daysUntil(date) > 0) return showError(errorEl, 'אי אפשר לרשום זריקה בתאריך עתידי.');
    if (data.shots.some((s) => daysUntil(s.date, date) === 0)) {
      return showError(errorEl, 'כבר נרשמה זריקה בתאריך הזה.');
    }

    data.shots.push({ date: date.toISOString(), dose: profile.dose, site: form.elements.site.value });
    data.shots.sort((a, b) => new Date(a.date) - new Date(b.date));
    saveData(data);
    toast('הזריקה נרשמה');
    location.hash = '#home';
  });
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}

// ---------- שינוי מינון (S8) ----------
function renderDose(data) {
  mount('tpl-dose');
  const $ = (sel) => app.querySelector(sel);
  const { profile } = data;
  const form = document.getElementById('dose-form');
  const errorEl = document.getElementById('dose-error');
  data.doseHistory = data.doseHistory || [{ date: profile.createdAt, dose: profile.dose }];

  $('[data-current-dose]').textContent = `${profile.med} · ${formatKg(profile.dose)} מ"ג`;

  if (data.doseHistory.length > 1) {
    $('[data-history-card]').hidden = false;
    const list = $('[data-history]');
    [...data.doseHistory].reverse().forEach((h) => {
      const li = document.createElement('li');
      const d = document.createElement('span');
      d.textContent = new Date(h.date).toLocaleDateString('he-IL');
      const v = document.createElement('strong');
      v.textContent = `${formatKg(h.dose)} מ"ג`;
      li.append(d, v);
      list.appendChild(li);
    });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const dose = Number(form.elements.dose.value);
    if (!(dose > 0)) return showError(errorEl, 'הזן את המינון החדש שהרופא קבע.');
    if (dose === profile.dose) return showError(errorEl, 'זה המינון הנוכחי.');
    profile.dose = dose;
    data.doseHistory.push({ date: new Date().toISOString(), dose });
    saveData(data);
    toast('המינון עודכן');
    location.hash = '#log';
  });
}

// ---------- תזכורת ביומן (S4) ----------
function downloadCalendar(data) {
  const { profile } = data;
  const next = nextShotDate(data);
  const [hh, mm] = profile.shotTime.split(':');
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}T${hh}${mm}00`;
  const now = new Date();
  const created = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Shotiv//HE',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:shotiv-weekly-${Date.now()}@shotiv`,
    `DTSTAMP:${created}`,
    `DTSTART:${stamp}`,
    'DURATION:PT15M',
    'RRULE:FREQ=WEEKLY',
    `SUMMARY:זריקת ${profile.med} – Shotiv`,
    'DESCRIPTION:זמן לזריקה השבועית. אחרי הזריקה רשום אותה באפליקציה.',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:זמן לזריקה השבועית',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'shotiv-reminder.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('פתח את הקובץ כדי להוסיף ליומן');
}

// ---------- ניווט בין מסכים ----------
function render() {
  const raw = loadData();
  const data = raw && raw.profile ? dedupeShots(raw) : raw;
  if (!data || !data.profile) return renderOnboarding();
  const route = location.hash.replace('#', '');
  if (route === 'log') return renderLog(data);
  if (route === 'dose') return renderDose(data);
  renderHome(data);
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
render();

// ---------- התקנה כאפליקציה (S9) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
