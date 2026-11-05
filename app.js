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
    logBtn.addEventListener('click', () => {
      // גרסה ראשונית: רישום זריקה של היום במינון הנוכחי. המסך המלא יגיע בספרינט 2 (S3).
      data.shots.push({ date: new Date().toISOString(), dose: profile.dose, site: null });
      saveData(data);
      toast('הזריקה נרשמה');
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

function render() {
  const raw = loadData();
  const data = raw && raw.profile ? dedupeShots(raw) : raw;
  if (data && data.profile) renderHome(data);
  else renderOnboarding();
}

render();

// ---------- התקנה כאפליקציה (S9) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
