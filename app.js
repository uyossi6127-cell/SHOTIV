// © 2026 Yossi Ozan. All rights reserved. כל הזכויות שמורות.
'use strict';

// ---------- שמירת נתונים (על המכשיר בלבד) ----------
const APP_VERSION = '39';
// כתובת לקבלת דיווחים על תוכן מסוכן. אפשר להחליף לכתובת ייעודית (למשל support@shotiv.co.il).
const REPORT_EMAIL = 'uyossi6127@gmail.com';
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

// פנייה לפי מגדר: g('טקסט לגבר', 'טקסט לאישה')
let GENDER = null;
const g = (m, f) => (GENDER === 'female' ? f : m);

function mount(templateId) {
  const node = document.getElementById(templateId).content.cloneNode(true);
  if (GENDER === 'female') node.querySelectorAll('[data-f]').forEach((el) => { el.textContent = el.dataset.f; });
  app.replaceChildren(node);
}



// ---------- יומן אישי (הרגשה, תופעות לוואי, שאלות לרופא) ----------
const MOODS = { 5: ['', 'טוב מאוד'], 4: ['', 'טוב'], 3: ['', 'ככה ככה'], 2: ['', 'קשה'], 1: ['', 'קשה מאוד'] };
const MOOD_COLORS = { 1: '#D93A4A', 2: '#F07B3F', 3: '#E8A82E', 4: '#5FB85A', 5: '#159A6E' };
function miniMeter(v) {
  const wrap = document.createElement('span');
  wrap.className = 'mini-meter';
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement('i');
    b.style.height = `${6 + i * 4}px`;
    if (i <= v) b.style.background = MOOD_COLORS[v];
    wrap.appendChild(b);
  }
  return wrap;
}
function drawMoodTrend(svg, entries) {
  const pts = entries.slice(0, 14).reverse();
  const W = 320, H = 110, padX = 14, top = 12, bottom = 18;
  const x = (i) => (pts.length === 1 ? W / 2 : W - padX - (i * (W - 2 * padX)) / (pts.length - 1)); // RTL: הכי ישן מימין
  const y = (m) => top + ((5 - m) * (H - top - bottom)) / 4;
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => { const n = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
  svg.replaceChildren();
  const defs = el('defs', {});
  const lg = el('linearGradient', { id: 'mt-grad', x1: '0', y1: '0', x2: '0', y2: '1' });
  [[0, '#159A6E'], [.5, '#E8A82E'], [1, '#D93A4A']].forEach(([o, c]) => lg.appendChild(el('stop', { offset: o, 'stop-color': c })));
  defs.appendChild(lg); svg.appendChild(defs);
  for (let m = 1; m <= 5; m++) svg.appendChild(el('line', { x1: padX, x2: W - padX, y1: y(m), y2: y(m), stroke: '#E6E3EF', 'stroke-width': 1 }));
  if (pts.length > 1) {
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.mood).toFixed(1)}`).join(' ');
    svg.appendChild(el('path', { d, fill: 'none', stroke: 'url(#mt-grad)', 'stroke-width': 3.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }
  pts.forEach((p, i) => svg.appendChild(el('circle', { cx: x(i), cy: y(p.mood), r: 6, fill: MOOD_COLORS[p.mood], stroke: '#FFFFFF', 'stroke-width': 2.5 })));
}
const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`; };

function journalToday(data) {
  const key = dayKey(new Date());
  return (data.journal || []).find((e) => dayKey(e.date) === key) || null;
}

function effectsSummary(journal, days = 30) {
  const since = Date.now() - days * 86400000;
  const counts = {};
  journal.filter((e) => new Date(e.date).getTime() >= since)
    .forEach((e) => (e.effects || []).forEach((x) => { counts[x] = (counts[x] || 0) + 1; }));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return top.length ? `נפוץ ב-30 הימים האחרונים: ${top.map(([k, n]) => `${k} ×${n}`).join(' · ')}` : '';
}

function renderJournal(data) {
  mount('tpl-journal');
  window.scrollTo(0, 0);
  const $ = (sel) => app.querySelector(sel);
  const form = $('#journal-form');
  const effectsBox = $('[data-effects]');
  const noneBox = $('[data-no-effects]');
  const today = journalToday(data);

  // מילוי מראש: רשומה של היום, או הרגשה שנבחרה במסך הבית
  const preMood = new URLSearchParams(location.hash.split('?')[1] || '').get('mood');
  if (today) {
    $('[data-journal-title]').textContent = 'עדכון היומן של היום';
    form.querySelector(`input[name=mood][value="${today.mood}"]`).checked = true;
    (today.effects || []).forEach((x) => { const i = effectsBox.querySelector(`input[value="${x}"]`); if (i) i.checked = true; });
    if (today.effects && today.effects.length === 0) noneBox.checked = true;
    form.note.value = today.note || '';
  }
  if (preMood && MOODS[preMood]) form.querySelector(`input[name=mood][value="${preMood}"]`).checked = true;

  // "בלי תופעות" מבטל את השאר, ולהפך
  effectsBox.addEventListener('change', (e) => {
    if (e.target === noneBox && noneBox.checked) effectsBox.querySelectorAll('input:not([data-no-effects])').forEach((i) => { i.checked = false; });
    else if (e.target !== noneBox && e.target.checked) noneBox.checked = false;
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('[data-journal-error]');
    const moodInput = form.querySelector('input[name=mood]:checked');
    if (!moodInput) { err.textContent = g('בחר איך הרגשת היום.', 'בחרי איך הרגשת היום.'); err.hidden = false; return; }
    err.hidden = true;
    const effects = [...effectsBox.querySelectorAll('input:checked:not([data-no-effects])')].map((i) => i.value);
    const fresh = loadData();
    fresh.journal = fresh.journal || [];
    const existing = journalToday(fresh);
    const entry = existing || { id: Date.now(), date: new Date().toISOString() };
    entry.mood = Number(moodInput.value);
    entry.effects = effects;
    entry.note = form.note.value.trim();
    if (!existing) fresh.journal.push(entry);
    const q = form.question.value.trim();
    if (q) { fresh.questions = fresh.questions || []; fresh.questions.push({ id: Date.now(), date: new Date().toISOString(), text: q, done: false }); }
    saveData(fresh);
    toast(existing ? 'היומן עודכן' : 'נשמר ביומן');
    renderJournal(fresh);
    // התראות בטיחות אחרי שמירה
    const severe = entry.mood <= 2 && (effects.includes('הקאות') || effects.includes('כאב בטן'));
    app.querySelector('[data-journal-alert]').hidden = !severe;
    app.querySelector('[data-journal-mood]').hidden = entry.mood !== 1;
    const shown = app.querySelector('.advice:not([hidden])');
    if (shown) shown.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // שאלות פתוחות לרופא
  const questions = (data.questions || []).filter((q) => !q.done);
  if (questions.length) {
    $('[data-questions-card]').hidden = false;
    const ul = $('[data-questions]');
    questions.forEach((q) => {
      const li = document.createElement('li');
      li.innerHTML = '<label class="q-item"><input type="checkbox"><span></span></label>';
      li.querySelector('span').textContent = q.text;
      li.querySelector('input').addEventListener('change', () => {
        const fresh = loadData();
        const item = (fresh.questions || []).find((x) => x.id === q.id);
        if (item) item.done = true;
        saveData(fresh);
        li.classList.add('done');
        setTimeout(() => li.remove(), 500);
      });
      ul.appendChild(li);
    });
  }

  // רשומות אחרונות
  const entries = (data.journal || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
  if (entries.length) {
    $('[data-entries-card]').hidden = false;
    $('[data-effects-summary]').textContent = effectsSummary(data.journal);
    if (entries.length >= 2) {
      $('[data-mood-trend]').hidden = false;
      $('[data-trend-range]').textContent = `${entries.length > 14 ? 14 : entries.length} רישומים אחרונים`;
      drawMoodTrend($('[data-trend-svg]'), entries);
    }
    const ul = $('[data-entries]');
    entries.forEach((en) => {
      const li = document.createElement('li');
      const [emoji, label] = MOODS[en.mood] || ['', ''];
      li.innerHTML = '<span class="e-meter"></span><div><strong></strong><p class="muted small-text"></p><p class="e-note"></p></div>';
      li.querySelector('.e-meter').appendChild(miniMeter(en.mood));
      li.querySelector('strong').textContent = `${relativeDay(en.date)} · ${label}`;
      li.querySelector('.muted').textContent = en.effects && en.effects.length ? en.effects.join(' · ') : 'בלי תופעות לוואי';
      const noteEl = li.querySelector('.e-note');
      if (en.note) noteEl.textContent = en.note; else noteEl.remove();
      ul.appendChild(li);
    });
  }
}

// ---------- בטיחות ותמיכה ----------
function renderSafety(data) {
  mount('tpl-safety');
  window.scrollTo(0, 0);
  const box = app.querySelector('[data-symptoms]');
  const show = () => {
    const picked = new Set([...box.querySelectorAll('input:checked')].map((i) => i.value));
    const urgent = picked.has('urgent');
    app.querySelector('[data-advice="urgent"]').hidden = !urgent;
    app.querySelector('[data-advice="doctor"]').hidden = urgent || !picked.has('doctor');
    app.querySelector('[data-advice="mood"]').hidden = !picked.has('mood');
    const first = app.querySelector('.advice:not([hidden])');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  box.addEventListener('change', show);

  const form = app.querySelector('#report-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = form.querySelector('[data-report-error]');
    const type = form.type.value;
    const details = form.details.value.trim();
    if (!type) { err.textContent = g('בחר את סוג הבעיה.', 'בחרי את סוג הבעיה.'); err.hidden = false; return; }
    if (details.length < 5) { err.textContent = g('כתוב בכמה מילים מה קרה.', 'כתבי בכמה מילים מה קרה.'); err.hidden = false; return; }
    err.hidden = true;
    const subject = `Shotiv · דיווח: ${type}`;
    const body = `סוג: ${type}\n\nפירוט:\n${details}\n\n---\nגרסת אפליקציה: ${APP_VERSION}\nתאריך: ${new Date().toLocaleString('he-IL')}`;
    location.href = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    toast(g('נפתח מייל עם הדיווח. לחץ "שלח" כדי לסיים.', 'נפתח מייל עם הדיווח. לחצי "שלח" כדי לסיים.'));
  });
}

// ---------- הרשמה ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function readAccount(form) {
  const f = new FormData(form);
  return {
    fullName: String(f.get('fullName') || '').trim().replace(/\s+/g, ' '),
    age: Number(f.get('age')),
    email: String(f.get('email') || '').trim().toLowerCase(),
  };
}

function validateAccount(a) {
  if (a.fullName.length < 2) return 'הזן שם מלא.';
  if (!a.fullName.includes(' ')) return 'הזן שם פרטי ושם משפחה.';
  if (!Number.isInteger(a.age) || a.age < 18 || a.age > 120) return 'הזן גיל בין 18 ל-120.';
  if (!EMAIL_RE.test(a.email)) return 'כתובת האימייל לא תקינה. לדוגמה: name@example.com';
  return null;
}

function firstName(data) {
  const n = data && data.account && data.account.fullName;
  return n ? n.split(' ')[0] : '';
}

function renderRegister(data) {
  mount('tpl-register');
  const form = document.getElementById('register-form');
  const errorEl = document.getElementById('register-error');
  const existing = !!(data && data.profile);
  if (existing) {
    form.querySelector('[data-reg-title]').textContent = 'השלמת פרטים';
    form.querySelector('[data-reg-btn]').textContent = 'שמור והמשך';
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const account = readAccount(form);
    const problem = validateAccount(account);
    if (problem) { errorEl.textContent = problem; errorEl.hidden = false; return; }
    account.createdAt = new Date().toISOString();
    const next = Object.assign({ version: 1 }, data || {}, { account });
    saveData(next);
    render();
  });
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

    const prev = loadData() || {};
    saveData({ version: 1, account: prev.account, profile, shots: [], weights: [] });
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

  const name = firstName(data);
  $('[data-greeting]').textContent = greeting() + (name ? ` ${name},` : ',');

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
  const jt = journalToday(data);
  const jStatus = $('[data-journal-status]');
  if (jt) {
    const [emoji, label] = MOODS[jt.mood];
    jStatus.textContent = `היום רשמת: ${label}${jt.effects && jt.effects.length ? ' · ' + jt.effects.join(', ') : ''}`;
    const sel = $(`[data-quick-moods] a[href$="mood=${jt.mood}"]`);
    if (sel) sel.classList.add('on');
  } else {
    jStatus.textContent = g('לחיצה אחת, ואפשר להוסיף תופעות לוואי ושאלות לרופא.', 'לחיצה אחת, ואפשר להוסיף תופעות לוואי ושאלות לרופא.');
  }

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
      ? `השקילה האחרונה הייתה לפני ${sinceWeigh} ימים. ${g('לחץ', 'לחצי')} כאן לעדכון.`
      : g('עוד לא עדכנת משקל מאז ההרשמה. לחץ כאן לעדכון.', 'עוד לא עדכנת משקל מאז ההרשמה. לחצי כאן לעדכון.');
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
  if (data.shots.length === 0) return g('ברוך הבא. כשתזריק, לחץ על "רשום זריקה" והספירה תתחיל.', 'ברוכה הבאה. כשתזריקי, לחצי על "רשמי זריקה" והספירה תתחיל.');
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

    if (isNaN(date)) return showError(errorEl, g('בחר תאריך.', 'בחרי תאריך.'));
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
  const W = 340, H = 240, L = 34, R = 18, T = 40, B = 30;
  const t0 = new Date(pts[0].date).getTime();
  const t1 = Math.max(new Date(pts[pts.length - 1].date).getTime(), t0 + 7 * DAY_MS);
  const kgs = pts.map((p) => p.kg).concat(goal);
  const lo = Math.floor(Math.min(...kgs) - 1), hi = Math.ceil(Math.max(...kgs) + 1);
  const x = (d) => L + ((new Date(d).getTime() - t0) / (t1 - t0)) * (W - L - R);
  const y = (kg) => T + ((hi - kg) / (hi - lo)) * (H - T - B);
  const P = pts.map((p) => ({ x: x(p.date), y: y(p.kg), kg: p.kg, date: p.date }));
  const uid = 'c' + Math.random().toString(36).slice(2, 7);

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'wchart',
    'aria-label': `גרף משקל: מ-${formatKg(pts[0].kg)} ל-${formatKg(pts[pts.length - 1].kg)} קילו, יעד ${formatKg(goal)}` });

  const defs = svgEl('defs', {});
  defs.innerHTML = `
    <linearGradient id="${uid}-area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0E8A62" stop-opacity=".28"/>
      <stop offset="1" stop-color="#0E8A62" stop-opacity="0"/>
    </linearGradient>
    <filter id="${uid}-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#0E8A62" flood-opacity=".35"/>
    </filter>
    <filter id="${uid}-soft" x="-20%" y="-40%" width="140%" height="180%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#1B2B2A" flood-opacity=".18"/>
    </filter>`;
  svg.appendChild(defs);

  // קווי רשת עדינים ותוויות
  const ticks = [hi, Math.round((hi + lo) / 2), lo];
  ticks.forEach((kg) => {
    svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: y(kg), y2: y(kg), stroke: '#E9E7F0', 'stroke-width': 1, 'stroke-dasharray': '2 4' }));
    const t = svgEl('text', { x: L - 8, y: y(kg) + 4, 'text-anchor': 'end', 'font-size': 12, fill: '#6B7480' });
    t.textContent = kg;
    svg.appendChild(t);
  });

  // עקומה חלקה (Catmull-Rom) בין נקודות
  const seg = (i) => {
    const p0 = P[i - 2] || P[i - 1], p1 = P[i - 1], p2 = P[i], p3 = P[i + 1] || P[i];
    const k = 0.18;
    const c1x = p1.x + (p2.x - p0.x) * k, c1y = p1.y + (p2.y - p0.y) * k;
    const c2x = p2.x - (p3.x - p1.x) * k, c2y = p2.y - (p3.y - p1.y) * k;
    return `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  };

  // קו היעד עם דגל
  const gy = y(goal);
  svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: gy, y2: gy, stroke: '#E8572E', 'stroke-width': 2, 'stroke-dasharray': '7 6', class: 'goal-line' }));
  const goalG = svgEl('g', { class: 'goal-tag', filter: `url(#${uid}-soft)` });
  const goalLabel = `יעד ${formatKg(goal)}`;
  const gw = 14 + goalLabel.length * 7.2;
  goalG.appendChild(svgEl('rect', { x: W - R - gw, y: gy - 13, width: gw, height: 26, rx: 13, fill: '#E8572E' }));
  const gt = svgEl('text', { x: W - R - gw / 2, y: gy + 5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: '#FFFFFF' });
  gt.textContent = goalLabel;
  goalG.appendChild(gt);
  // דגלון קטן בתחילת קו היעד
  goalG.appendChild(svgEl('path', { d: `M${L + 2} ${gy} V${gy - 16} L${L + 14} ${gy - 11.5} L${L + 2} ${gy - 7}`, fill: '#E8572E', stroke: '#E8572E', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
  svg.appendChild(goalG);

  if (P.length > 1) {
    // שטח מתחת לעקומה
    let d = `M${P[0].x.toFixed(1)} ${P[0].y.toFixed(1)}`;
    for (let i = 1; i < P.length; i++) d += ' ' + seg(i);
    const area = `${d} L${P[P.length - 1].x.toFixed(1)} ${H - B} L${P[0].x.toFixed(1)} ${H - B} Z`;
    svg.appendChild(svgEl('path', { d: area, fill: `url(#${uid}-area)`, class: 'chart-area' }));
    // כל קטע בצבע לפי הכיוון, מצויר באנימציה אחד אחרי השני
    for (let i = 1; i < P.length; i++) {
      const up = P[i].kg > P[i - 1].kg;
      const path = svgEl('path', { d: `M${P[i - 1].x.toFixed(1)} ${P[i - 1].y.toFixed(1)} ${seg(i)}`, fill: 'none',
        stroke: up ? warnColor(data) : '#0E8A62', 'stroke-width': 4, 'stroke-linecap': 'round',
        pathLength: 1, class: 'chart-seg', filter: up ? '' : `url(#${uid}-glow)` });
      path.style.animationDelay = `${150 + (i - 1) * 220}ms`;
      svg.appendChild(path);
    }
  }

  // נקודות
  P.forEach((p, i) => {
    const prev = P[i - 1];
    const delta = prev ? Math.round((p.kg - prev.kg) * 10) / 10 : 0;
    const last = i === P.length - 1;
    const g = svgEl('g', { class: 'chart-dot' });
    g.style.animationDelay = `${150 + Math.max(0, i - 1) * 220 + (i ? 200 : 0)}ms`;
    g.style.transformOrigin = `${p.x}px ${p.y}px`;
    if (last) g.appendChild(svgEl('circle', { cx: p.x, cy: p.y, r: 14, fill: delta > 0 ? warnColor(data) : '#0E8A62', opacity: 0.18, class: 'chart-halo' }));
    if (delta > 0) {
      g.appendChild(svgEl('circle', { cx: p.x, cy: p.y, r: 9, fill: warnColor(data), stroke: '#FFFFFF', 'stroke-width': 2.5 }));
      g.appendChild(svgEl('rect', { x: p.x - 1.4, y: p.y - 5.5, width: 2.8, height: 7, rx: 1.4, fill: '#FFFFFF' }));
      g.appendChild(svgEl('circle', { cx: p.x, cy: p.y + 4.2, r: 1.5, fill: '#FFFFFF' }));
    } else if (delta < 0) {
      g.appendChild(svgEl('circle', { cx: p.x, cy: p.y, r: 9, fill: '#0E8A62', stroke: '#FFFFFF', 'stroke-width': 2.5 }));
      g.appendChild(svgEl('path', { d: `M${p.x - 4} ${p.y} L${p.x - 1} ${p.y + 3} L${p.x + 4.5} ${p.y - 3.5}`, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    } else {
      g.appendChild(svgEl('circle', { cx: p.x, cy: p.y, r: 6, fill: '#FFFFFF', stroke: '#0E8A62', 'stroke-width': 3 }));
    }
    svg.appendChild(g);
  });

  // בועת המשקל הנוכחי מעל הנקודה האחרונה
  const lastP = P[P.length - 1];
  const bubble = svgEl('g', { class: 'chart-bubble', filter: `url(#${uid}-soft)` });
  bubble.style.animationDelay = `${300 + (P.length - 1) * 220}ms`;
  const label = `${formatKg(lastP.kg)} ק"ג`;
  const bw = 18 + label.length * 7.6;
  const bx = Math.min(Math.max(lastP.x - bw / 2, L), W - R - bw);
  const by = lastP.y - 44;
  bubble.appendChild(svgEl('rect', { x: bx, y: by, width: bw, height: 28, rx: 14, fill: '#1B2B2A' }));
  bubble.appendChild(svgEl('path', { d: `M${lastP.x - 6} ${by + 27} L${lastP.x} ${by + 34} L${lastP.x + 6} ${by + 27} Z`, fill: '#1B2B2A' }));
  const bt = svgEl('text', { x: bx + bw / 2, y: by + 19, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 800, fill: '#FFFFFF', direction: 'rtl', 'unicode-bidi': 'embed' });
  bt.textContent = label;
  bubble.appendChild(bt);
  svg.appendChild(bubble);

  // תוויות תאריך
  const fmt = (d) => new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  const first = svgEl('text', { x: P[0].x, y: H - 8, 'text-anchor': 'start', 'font-size': 12, fill: '#6B7480' });
  first.textContent = `התחלה · ${formatKg(pts[0].kg)}`;
  svg.appendChild(first);
  if (P.length > 1) {
    const lt = svgEl('text', { x: lastP.x, y: H - 8, 'text-anchor': 'end', 'font-size': 12, fill: '#6B7480' });
    lt.textContent = fmt(lastP.date);
    svg.appendChild(lt);
  }
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
    const colors = ['#0E8A62', '#EDA8AE', '#7DC0E8', '#E3939A', '#1F6FAE'];
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
    if (!(kg >= 30 && kg <= 300)) return showError(errorEl, g('הזן משקל בין 30 ל-300 ק"ג.', 'הזיני משקל בין 30 ל-300 ק"ג.'));
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

  const accForm = $('#account-form');
  if (accForm && data.account) {
    accForm.fullName.value = data.account.fullName || '';
    accForm.age.value = data.account.age || '';
    accForm.email.value = data.account.email || '';
    accForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const err = accForm.querySelector('[data-account-error]');
      const ok = accForm.querySelector('[data-account-ok]');
      const a = readAccount(accForm);
      const problem = validateAccount(a);
      ok.hidden = true;
      if (problem) { err.textContent = problem; err.hidden = false; return; }
      err.hidden = true;
      const fresh = loadData();
      fresh.account = Object.assign({}, fresh.account, a);
      saveData(fresh);
      ok.hidden = false;
    });
  }

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
      if (!restored.account && data.account) restored.account = data.account;
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
    if (!(dose > 0)) return showError(errorEl, g('הזן את המינון החדש שהרופא קבע.', 'הזיני את המינון החדש שהרופא קבע.'));
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
    description: g('זמן לזריקה השבועית. אחרי הזריקה רשום אותה באפליקציה.', 'זמן לזריקה השבועית. אחרי הזריקה רשמי אותה באפליקציה.'),
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
    description: g('בוקר, לפני ארוחה. עדכן את המשקל באפליקציה כדי לראות את ההתקדמות.', 'בוקר, לפני ארוחה. עדכני את המשקל באפליקציה כדי לראות את ההתקדמות.'),
  });
}

const THEME_COLORS = { female: '#D9405F', male: '#1A7FE8' };
function applyTheme(gender) {
  GENDER = gender || null;
  const root = document.documentElement;
  root.classList.toggle('theme-female', gender === 'female');
  root.classList.toggle('theme-male', gender === 'male');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[gender] || '#E8336F');
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
  if (!data || !data.account) return renderRegister(data);
  if (!data.profile) return renderOnboarding();
  const route = location.hash.replace('#', '').split('?')[0];
  if (route === 'log') return renderLog(data);
  if (route === 'dose') return renderDose(data);
  if (route === 'history') return renderHistory(data);
  if (route === 'settings') return renderSettings(data);
  if (route === 'weight') return renderWeight(data);
  if (route === 'safety') return renderSafety(data);
  if (route === 'journal') return renderJournal(data);
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
