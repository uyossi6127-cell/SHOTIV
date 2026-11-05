'use strict';

// ---------- שמירת נתונים (על המכשיר בלבד) ----------
const APP_VERSION = '27';
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
  form.querySelectorAll('input[name="gender"]').forEach((r) => {
    r.addEventListener('change', () => applyTheme(r.value));
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const f = new FormData(form);
    const profile = {
      gender: f.get('gender'),
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
  if (!p.gender) return 'בחר מגדר.';
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
  $('[data-lost]').textContent = lost > 0 ? '\u200E−' + formatKg(lost) : '0';
  $('[data-left]').textContent = formatKg(left);
  $('[data-progress-bar]').setAttribute('aria-valuenow', pct);
  $('[data-progress-text]').textContent = `${pct}% מהדרך ליעד`;
  requestAnimationFrame(() => { $('[data-progress-fill]').style.width = pct + '%'; });

  $('[data-motivation]').textContent = motivation(data, pct);

  const logBtn = $('[data-action="log-shot"]');
  const lastShot = data.shots[data.shots.length - 1];

  // הזריקה האחרונה (S14)
  if (lastShot) {
    const lastEl = $('[data-last-shot]');
    lastEl.hidden = false;
    lastEl.textContent = `הזריקה האחרונה: ${relativeDay(lastShot.date)}${lastShot.site ? ' · ' + lastShot.site : ''}`;
  }
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

  // תזכורת להישקל: אם עברו 7 ימים ומעלה מהשקילה האחרונה (או מההרשמה)
  const lastWeigh = data.weights.length ? data.weights[data.weights.length - 1].date : profile.createdAt;
  const sinceWeigh = -daysUntil(lastWeigh);
  if (sinceWeigh >= 7) {
    $('[data-weigh-nudge]').hidden = false;
    $('[data-weigh-nudge-text]').textContent = data.weights.length
      ? `השקילה האחרונה הייתה לפני ${sinceWeigh} ימים. לחץ כאן לעדכון.`
      : 'עוד לא עדכנת משקל מאז ההרשמה. לחץ כאן לעדכון.';
  }

  // תזכורת לגבות (S15): אחרי שיש נתונים שחבל לאבד, ואם לא גיבו 30 יום.
  const lastBackup = data.lastBackupAt ? new Date(data.lastBackupAt) : null;
  const backupAge = lastBackup ? -daysUntil(lastBackup) : Infinity;
  if (data.shots.length >= 2 && backupAge > 30) {
    $('[data-backup-nudge]').hidden = false;
    $('[data-backup-nudge-text]').textContent = lastBackup
      ? `הגיבוי האחרון היה לפני ${backupAge} ימים.`
      : 'עדיין לא גיבית. זה לוקח 10 שניות.';
  }
}

function motivation(data, pct) {
  const change = data.weights.length ? latestChange(data) : null;
  if (change !== null && change > 0) return `בשקילה האחרונה עלית ${formatKg(change)} ק"ג. זה קורה, ותנודות קטנות טבעיות. ממשיכים בשגרה.`;
  if (change !== null && change < 0 && pct < 100) return `ירדת ${formatKg(-change)} ק"ג מאז השקילה הקודמת. כל הכבוד, ממשיכים ככה!`;
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
  data.shots.sort((a, b) => new Date(a.date) - new Date(b.date));
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

// ---------- היסטוריית זריקות (S14) ----------
function relativeDay(date) {
  const ago = -daysUntil(date);
  const d = new Date(date);
  const label = `יום ${DAY_NAMES[d.getDay()]}, ${d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}`;
  if (ago === 0) return 'היום';
  if (ago === 1) return 'אתמול';
  return `${label} (לפני ${ago} ימים)`;
}

function renderHistory(data) {
  mount('tpl-history');
  const $ = (sel) => app.querySelector(sel);
  const list = $('[data-shot-list]');

  if (data.shots.length === 0) {
    $('[data-history-empty]').hidden = false;
    return;
  }

  const n = data.shots.length;
  $('[data-history-summary]').textContent = n === 1 ? 'נרשמה זריקה אחת.' : `נרשמו ${n} זריקות.`;

  [...data.shots].reverse().forEach((shot) => {
    const d = new Date(shot.date);
    const li = document.createElement('li');

    const when = document.createElement('div');
    when.className = 'when';
    const day = document.createElement('strong');
    day.textContent = d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
    const site = document.createElement('span');
    site.textContent = shot.site || 'אזור לא נרשם';
    when.append(day, site);

    const dose = document.createElement('span');
    dose.className = 'dose';
    dose.textContent = `${formatKg(shot.dose)} מ"ג`;

    li.append(when, dose);
    list.appendChild(li);
  });
}

// ---------- שקילה וגרף (S5, S6) ----------
function weightPoints(data) {
  return [{ date: data.profile.createdAt, kg: data.profile.startWeight, start: true }, ...data.weights]
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function warnColor(data) {
  const g = data.profile.gender;
  if (g === 'female') return '#D9818B'; // זהב ורוד
  if (g === 'male') return '#2F86C4';   // כחול פנינה
  return '#E07A2E';
}

function buildChart(data) {
  const pts = weightPoints(data);
  const goal = data.profile.goalWeight;
  const W = 340, H = 210, L = 38, R = 14, T = 16, B = 30;
  const t0 = new Date(pts[0].date).getTime();
  const t1 = Math.max(new Date(pts[pts.length - 1].date).getTime(), t0 + 7 * DAY_MS);
  const kgs = pts.map((p) => p.kg).concat(goal);
  const lo = Math.floor(Math.min(...kgs) - 1), hi = Math.ceil(Math.max(...kgs) + 1);
  const x = (d) => L + ((new Date(d).getTime() - t0) / (t1 - t0)) * (W - L - R);
  const y = (kg) => T + ((hi - kg) / (hi - lo)) * (H - T - B);

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `גרף משקל: מ-${formatKg(pts[0].kg)} ל-${formatKg(pts[pts.length - 1].kg)} קילו, יעד ${formatKg(goal)}` });

  // קווי רקע ותוויות ציר
  [hi, Math.round((hi + lo) / 2), lo].forEach((kg) => {
    svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: y(kg), y2: y(kg), stroke: '#E6E4EE', 'stroke-width': 1 }));
    const t = svgEl('text', { x: L - 6, y: y(kg) + 4, 'text-anchor': 'end', 'font-size': 12, fill: '#3E4A55' });
    t.textContent = kg;
    svg.appendChild(t);
  });

  // קו היעד
  svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: y(goal), y2: y(goal), stroke: '#E8572E', 'stroke-width': 2, 'stroke-dasharray': '6 5' }));
  const gl = svgEl('text', { x: W - R, y: y(goal) - 6, 'text-anchor': 'end', 'font-size': 13, 'font-weight': 700, fill: '#B23F1C' });
  gl.textContent = `יעד ${formatKg(goal)}`;
  svg.appendChild(gl);

  // שטח וקו המשקל
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)} ${y(p.kg).toFixed(1)}`).join(' ');
  if (pts.length > 1) {
    const area = `${line} L${x(pts[pts.length - 1].date).toFixed(1)} ${H - B} L${x(pts[0].date).toFixed(1)} ${H - B} Z`;
    svg.appendChild(svgEl('path', { d: area, fill: 'rgba(14,138,98,.08)' }));
    // כל קטע בצבע לפי הכיוון: ירוק לירידה, כתום לעלייה
    for (let i = 1; i < pts.length; i++) {
      const up = pts[i].kg > pts[i - 1].kg;
      svg.appendChild(svgEl('line', { x1: x(pts[i - 1].date), y1: y(pts[i - 1].kg), x2: x(pts[i].date), y2: y(pts[i].kg),
        stroke: up ? warnColor(data) : '#0E8A62', 'stroke-width': 3, 'stroke-linecap': 'round' }));
    }
  }
  pts.forEach((p, i) => {
    const cx = x(p.date), cy = y(p.kg);
    const prev = pts[i - 1];
    const delta = prev ? Math.round((p.kg - prev.kg) * 10) / 10 : 0;
    if (delta > 0) {
      // סימן אזהרה: עיגול כתום עם סימן קריאה
      svg.appendChild(svgEl('circle', { cx, cy, r: 9, fill: warnColor(data), stroke: '#FFFFFF', 'stroke-width': 2 }));
      svg.appendChild(svgEl('rect', { x: cx - 1.4, y: cy - 5.5, width: 2.8, height: 7, rx: 1.4, fill: '#FFFFFF' }));
      svg.appendChild(svgEl('circle', { cx, cy: cy + 4.2, r: 1.5, fill: '#FFFFFF' }));
    } else if (delta < 0) {
      // סימן הצלחה: עיגול ירוק עם וי
      svg.appendChild(svgEl('circle', { cx, cy, r: 9, fill: '#0E8A62', stroke: '#FFFFFF', 'stroke-width': 2 }));
      svg.appendChild(svgEl('path', { d: `M${cx - 4} ${cy} L${cx - 1} ${cy + 3} L${cx + 4.5} ${cy - 3.5}`, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    } else {
      svg.appendChild(svgEl('circle', { cx, cy, r: 5, fill: '#FFFFFF', stroke: '#0E8A62', 'stroke-width': 3 }));
    }
  });

  // תוויות תאריך
  const fmt = (d) => new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  [[pts[0].date, 'start', 'התחלה'], [pts[pts.length - 1].date, 'end', fmt(pts[pts.length - 1].date)]].forEach(([d, anchor, label], i) => {
    if (i === 1 && pts.length === 1) return;
    const t = svgEl('text', { x: x(d), y: H - 8, 'text-anchor': anchor, 'font-size': 12, fill: '#3E4A55' });
    t.textContent = label;
    svg.appendChild(t);
  });
  return svg;
}

function paceText(data) {
  const pts = weightPoints(data);
  if (pts.length < 2) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const weeks = (new Date(last.date) - new Date(first.date)) / (7 * DAY_MS);
  const lost = first.kg - last.kg;
  const left = last.kg - data.profile.goalWeight;
  if (left <= 0) return 'הגעת ליעד! עכשיו המטרה היא לשמור עליו.';
  if (weeks < 1 || lost <= 0) return null;
  const perWeek = lost / weeks;
  const weeksLeft = Math.ceil(left / perWeek);
  return `קצב ממוצע: ${formatKg(perWeek)} ק"ג בשבוע. בקצב הזה תגיע ליעד בעוד כ-${weeksLeft} שבועות.`;
}

const ICONS = {
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M12 6v8"/><circle cx="12" cy="18.5" r="0.6" fill="#fff"/></svg>',
  same: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M6 12h12"/></svg>',
};

function latestChange(data) {
  const pts = weightPoints(data);
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  return Math.round((last.kg - prev.kg) * 10) / 10;
}

function showFeedback(data, justSaved) {
  const box = app.querySelector('[data-feedback]');
  const change = latestChange(data);
  if (change === null) return;
  const total = Math.round((data.profile.startWeight - currentWeight(data)) * 10) / 10;
  let kind, title, text;
  if (change < 0) {
    kind = 'down';
    title = `כל הכבוד! ירדת ${formatKg(-change)} ק"ג מאז השקילה הקודמת`;
    text = total > 0 ? `בסך הכל ירדת ${formatKg(total)} ק"ג. ממשיכים ככה.` : 'ממשיכים ככה.';
  } else if (change > 0) {
    kind = 'up';
    title = `עלית ${formatKg(change)} ק"ג מאז השקילה הקודמת`;
    text = 'תנודות של עד קילו הן טבעיות (מים, מלח, שינה). אם העלייה נמשכת שבועיים, כדאי להתייעץ עם הרופא או הדיאטנית.';
  } else {
    kind = 'same';
    title = 'המשקל יציב מאז השקילה הקודמת';
    text = 'יציבות היא גם התקדמות. ממשיכים בשגרה.';
  }
  box.hidden = false;
  const g = data.profile.gender;
  box.className = `feedback ${kind}${g ? ' g-' + g : ''}`;
  box.querySelector('[data-feedback-icon]').innerHTML = ICONS[kind];
  box.querySelector('[data-feedback-title]').textContent = title;
  box.querySelector('[data-feedback-text]').textContent = text;
  if (!justSaved) return;
  if (kind === 'down') {
    box.classList.add('celebrate');
    const colors = ['#0E8A62', '#5B3FD9', '#E8572E', '#E3AFA3', '#1F6FD1'];
    for (let i = 0; i < 14; i++) {
      const sp = document.createElement('span');
      sp.className = 'spark';
      const ang = (Math.PI * 2 * i) / 14;
      sp.style.background = colors[i % colors.length];
      sp.style.insetInlineStart = '30px';
      sp.style.top = '30px';
      sp.style.setProperty('--dx', `${Math.cos(ang) * 70}px`);
      sp.style.setProperty('--dy', `${Math.sin(ang) * 50}px`);
      box.appendChild(sp);
      setTimeout(() => sp.remove(), 1000);
    }
  } else if (kind === 'up') {
    box.classList.add('warn-in');
  }
}

function renderWeight(data, justSaved = false) {
  mount('tpl-weight');
  const $ = (sel) => app.querySelector(sel);
  const input = $('[data-weight-input]');
  const errorEl = $('[data-weight-error]');
  input.value = (Math.round(currentWeight(data) * 10) / 10).toFixed(1);

  const todayEntry = data.weights.find((w) => daysUntil(w.date) === 0);
  $('[data-today-note]').hidden = !todayEntry;

  app.querySelectorAll('[data-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = (Number(input.value) || currentWeight(data)) + Number(btn.dataset.step);
      input.value = (Math.round(v * 10) / 10).toFixed(1);
    });
  });

  $('[data-action="save-weight"]').addEventListener('click', () => {
    const kg = Math.round(Number(input.value) * 10) / 10;
    if (!(kg >= 30 && kg <= 300)) return showError(errorEl, 'הזן משקל בין 30 ל-300 ק"ג.');
    data.weights = data.weights.filter((w) => daysUntil(w.date) !== 0);
    data.weights.push({ date: new Date().toISOString(), kg });
    data.weights.sort((a, b) => new Date(a.date) - new Date(b.date));
    saveData(data);
    renderWeight(data, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const lost = data.profile.startWeight - currentWeight(data);
  $('[data-lost-badge]').textContent = lost > 0 ? `ירדת ${formatKg(lost)} ק"ג` : 'בהתחלה';
  $('[data-chart]').appendChild(buildChart(data));
  const pace = paceText(data);
  if (pace) { $('[data-pace]').hidden = false; $('[data-pace]').textContent = pace; }
  showFeedback(data, justSaved);

  if (data.weights.length) {
    $('[data-recent-card]').hidden = false;
    const list = $('[data-recent]');
    [...data.weights].reverse().slice(0, 6).forEach((w) => {
      const li = document.createElement('li');
      const d = document.createElement('span');
      d.textContent = new Date(w.date).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' });
      const v = document.createElement('strong');
      v.textContent = `${formatKg(w.kg)} ק"ג`;
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = 'מחק';
      del.setAttribute('aria-label', `מחק שקילה של ${d.textContent}`);
      del.addEventListener('click', () => {
        if (!window.confirm('למחוק את השקילה הזו?')) return;
        data.weights = data.weights.filter((x) => x !== w);
        saveData(data);
        renderWeight(data);
      });
      li.append(d, v, del);
      list.appendChild(li);
    });
  }
}

// ---------- הגדרות וגיבוי (S15) ----------
function renderSettings(data) {
  mount('tpl-settings');
  const $ = (sel) => app.querySelector(sel);

  // תזכורות ביומן
  $('[data-cal-shot-text]').textContent = `כל יום ${DAY_NAMES[data.profile.shotDay]} בשעה ${data.profile.shotTime}`;
  $('[data-cal-weight-text]').textContent = `כל יום ${DAY_NAMES[weighReminderDate(data).getDay()]} בשעה 08:00, בבוקר שאחרי הזריקה`;
  $('[data-action="cal-shot"]').addEventListener('click', () => downloadCalendar(data));
  $('[data-action="cal-weight"]').addEventListener('click', () => downloadWeighCalendar(data));

  // מגדר (משפיע על צבע האזהרה)
  app.querySelectorAll('input[name="genderSetting"]').forEach((r) => {
    r.checked = r.value === data.profile.gender;
    r.addEventListener('change', () => {
      data.profile.gender = r.value;
      saveData(data);
      applyTheme(r.value);
      toast('נשמר');
    });
  });

  // גודל טקסט (נשמר במכשיר, בנפרד מהנתונים)
  const size = localStorage.getItem('shotiv.textSize') || 'normal';
  app.querySelectorAll('input[name="textSize"]').forEach((r) => {
    r.checked = r.value === size;
    r.addEventListener('change', () => {
      localStorage.setItem('shotiv.textSize', r.value);
      applyTextSize();
    });
  });

  $('[data-version]').textContent = `גרסה ${APP_VERSION}`;
  $('[data-last-backup]').textContent = data.lastBackupAt
    ? `גיבוי אחרון: ${new Date(data.lastBackupAt).toLocaleDateString('he-IL')}`
    : 'עדיין לא בוצע גיבוי.';

  $('[data-action="backup"]').addEventListener('click', () => {
    data.lastBackupAt = new Date().toISOString();
    saveData(data);
    const payload = JSON.stringify({ app: 'shotiv', exportedAt: data.lastBackupAt, data }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shotiv-backup-${toDateInput(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('קובץ הגיבוי נשמר. שלח אותו לעצמך.');
    renderSettings(data);
  });

  const errorEl = $('[data-restore-error]');
  $('[data-action="restore"]').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const restored = parsed && parsed.app === 'shotiv' ? parsed.data : null;
      if (!restored || !restored.profile || !Array.isArray(restored.shots)) {
        return showError(errorEl, 'זה לא קובץ גיבוי של Shotiv.');
      }
      restored.weights = Array.isArray(restored.weights) ? restored.weights : [];
      const n = restored.shots.length;
      const msg = `לשחזר גיבוי מ-${new Date(parsed.exportedAt).toLocaleDateString('he-IL')} עם ${n} זריקות? הנתונים הנוכחיים יוחלפו.`;
      if (!window.confirm(msg)) return;
      saveData(restored);
      toast('הנתונים שוחזרו');
      location.hash = '#home';
      render();
    } catch (err) {
      showError(errorEl, 'לא הצלחנו לקרוא את הקובץ. ודא שזה קובץ הגיבוי ששמרת.');
    }
  });

  $('[data-action="reset"]').addEventListener('click', () => {
    const warn = data.lastBackupAt
      ? 'למחוק את כל הנתונים? אי אפשר לבטל.'
      : 'עדיין לא גיבית. כל הנתונים יימחקו לצמיתות. להמשיך?';
    if (!window.confirm(warn)) return;
    localStorage.removeItem(STORAGE_KEY);
    location.hash = '';
    render();
  });
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
function icsStamp(date, hh, mm) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${hh}${mm}00`;
}

function downloadIcs(filename, { uid, start, summary, description }) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const created = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shotiv//HE', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}-${Date.now()}@shotiv`,
    `DTSTAMP:${created}`,
    `DTSTART:${start}`,
    'DURATION:PT15M',
    'RRULE:FREQ=WEEKLY',
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${summary}`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('פתח את הקובץ כדי להוסיף ליומן');
}

// המופע הבא של יום בשבוע (היום נחשב)
function nextWeekday(day, now = new Date()) {
  const today = startOfDay(now);
  return new Date(today.getTime() + ((day - today.getDay() + 7) % 7) * DAY_MS);
}

// תזכורת לזריקה (S4): ביום הזריקה הקבוע בשעה שנבחרה
function downloadCalendar(data) {
  const { profile } = data;
  const [hh, mm] = profile.shotTime.split(':');
  downloadIcs('shotiv-shot-reminder.ics', {
    uid: 'shotiv-shot',
    start: icsStamp(nextWeekday(profile.shotDay), hh, mm),
    summary: `זריקת ${profile.med} – Shotiv`,
    description: 'זמן לזריקה השבועית. אחרי הזריקה רשום אותה באפליקציה.',
  });
}

// תזכורת לשקילה: בבוקר שאחרי יום הזריקה, 08:00
function weighReminderDate(data) {
  return nextWeekday((data.profile.shotDay + 1) % 7);
}
function downloadWeighCalendar(data) {
  downloadIcs('shotiv-weigh-reminder.ics', {
    uid: 'shotiv-weigh',
    start: icsStamp(weighReminderDate(data), '08', '00'),
    summary: 'שקילה שבועית – Shotiv',
    description: 'בוקר, לפני ארוחה. עדכן את המשקל באפליקציה כדי לראות את ההתקדמות.',
  });
}

const THEME_COLORS = { female: '#EDA8AE', male: '#3F95CF' };
function applyTheme(gender) {
  const root = document.documentElement;
  root.classList.toggle('theme-female', gender === 'female');
  root.classList.toggle('theme-male', gender === 'male');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[gender] || '#5B3FD9');
}

function applyTextSize() {
  document.documentElement.classList.toggle('text-large', localStorage.getItem('shotiv.textSize') === 'large');
}
applyTextSize();

// ---------- ניווט בין מסכים ----------
function render() {
  const raw = loadData();
  const data = raw && raw.profile ? dedupeShots(raw) : raw;
  applyTheme(data && data.profile ? data.profile.gender : null);
  if (!data || !data.profile) return renderOnboarding();
  const route = location.hash.replace('#', '');
  if (route === 'log') return renderLog(data);
  if (route === 'dose') return renderDose(data);
  if (route === 'history') return renderHistory(data);
  if (route === 'settings') return renderSettings(data);
  if (route === 'weight') return renderWeight(data);
  renderHome(data);
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
render();

// מסך הפתיחה: נעלם לבד בסוף האנימציה, או בנגיעה.
const splash = document.getElementById('splash');
if (splash) {
  const removeSplash = () => splash.remove();
  splash.addEventListener('animationend', (e) => { if (e.animationName === 'splash-out') removeSplash(); });
  splash.addEventListener('click', removeSplash);
  setTimeout(removeSplash, 5200);
}

// ---------- התקנה כאפליקציה (S9) ----------
if ('serviceWorker' in navigator) {
  // כשגרסה חדשה נכנסת לפעולה, טוענים מחדש פעם אחת כדי להציג אותה מיד
  // (לא בביקור הראשון, כדי לא לקטוע את ההרשמה)
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch(() => {});
  });
}
