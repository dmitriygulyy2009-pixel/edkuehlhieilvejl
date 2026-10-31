/* Iron Rhythm — чистая логика (без DOM). Можно тестировать в Node. */
(function (root) {
  'use strict';
  var SCHEMA = 1; // версия формата данных. При доработках: увеличить и добавить миграцию в migrate()
  var DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  var DAY_FULL = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];
  var DAY_MS = 86400000;
  var NEG_COOLDOWN = 30;
  var LEVELS = [0, 2, 3, 4, 5, 6, 7, 8];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }
  function daysBetween(a, b) { // a,b: 'YYYY-MM-DD'
    var pa = a.split('-'), pb = b.split('-');
    var da = new Date(+pa[0], +pa[1] - 1, +pa[2]), db = new Date(+pb[0], +pb[1] - 1, +pb[2]);
    return Math.round((db - da) / DAY_MS);
  }

  /* ---------- состояние / миграция ---------- */
  function defaultState() {
    return { v: SCHEMA, settings: { sound: true, plateKg: 3 }, workouts: [] };
  }
  function workoutDefaults() {
    return {
      id: uid(), name: 'Тренировка', status: 'active', fresh: false,
      days: [1, 4], maintDay: 1, level: 0, phase: 'normal', // phase: normal | neg
      block: null, lastNegEnd: null, pendingTest: false, pendingUp: false, dropped: false,
      needsResume: false, lvStart: 0, levelLog: [], history: [], lastDoneDate: '',
      created: ymd(new Date()), session: null
    };
  }
  function migrate(raw) {
    var S = defaultState();
    if (!raw || typeof raw !== 'object') return S;
    if (raw.state && typeof raw.state === 'object') raw = raw.state; // файл экспорта
    var st = raw.settings || {};
    S.settings.sound = st.sound !== false;
    S.settings.plateKg = +st.plateKg > 0 ? +st.plateKg : 3;
    (raw.workouts || []).forEach(function (w) {
      var n = Object.assign(workoutDefaults(), w);
      n.history = (w.history || []).map(function (e) {
        return Object.assign({ id: uid(), ts: Date.now(), date: ymd(new Date()), level: 0, reps: null, type: 'normal', note: '' }, e);
      });
      n.levelLog = w.levelLog || [];
      n.days = (w.days && w.days.length) ? w.days : [1, 4];
      S.workouts.push(n);
    });
    // ---- будущие миграции добавлять сюда: if ((raw.v||1) < 2) {...}
    S.v = SCHEMA;
    return S;
  }
  function newWorkout(o) {
    var w = Object.assign(workoutDefaults(), { name: o.name || 'Тренировка', level: o.level || 0, days: o.days && o.days.length ? o.days : [1, 4], status: o.status || 'active', fresh: !!o.fresh });
    w.maintDay = w.days[0];
    return w;
  }

  /* ---------- уровни ---------- */
  function ramp(L) { return { half: Math.floor(L / 2), q: Math.ceil(L * 3 / 4) }; }
  function dropTo(L) { return L <= 2 ? 0 : L - 1; }
  function upTo(L) { return L === 0 ? 2 : Math.min(8, L + 1); }
  function kg(L, S) { return L * S.settings.plateKg; }
  function lvTxt(L, S) { return L === 0 ? 'свой вес' : L + ' бл. · ' + kg(L, S) + ' кг'; }
  function plural(n, a, b, c) { var m = n % 10, h = n % 100; if (h > 10 && h < 20) return c; if (m === 1) return a; if (m > 1 && m < 5) return b; return c; }

  /* ---------- расписание ---------- */
  function schedDays(w) { return w.status === 'frozen' ? [w.maintDay] : w.days; }
  function lastDue(w, now) {
    var days = schedDays(w);
    for (var i = 0; i < 8; i++) { var d = new Date(now.getTime() - i * DAY_MS); if (days.indexOf(d.getDay()) >= 0) return ymd(d); }
    return ymd(now);
  }
  function nextDate(w, now) {
    var days = schedDays(w);
    for (var i = 1; i < 9; i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 0, 0, 0);
      if (days.indexOf(d.getDay()) >= 0) return d;
    }
    return null;
  }
  function available(w, now) {
    if (w.session) return true;
    if (w.fresh && w.status === 'frozen') return false;
    if (!w.lastDoneDate) return true;
    return w.lastDoneDate < lastDue(w, now);
  }
  function missed(w, now) {
    if (!w.lastDoneDate || w.session) return false;
    var due = lastDue(w, now);
    return w.lastDoneDate < due && due < ymd(now);
  }
  function panic(w, now) {
    if (w.status !== 'active' || w.session) return false;
    if (!(w.lastDoneDate || w.created < ymd(now))) return false;
    var due = lastDue(w, now);
    return due === ymd(now) && (!w.lastDoneDate || w.lastDoneDate < due) && now.getHours() >= 16;
  }

  /* ---------- анализ ---------- */
  function firstSets(w, since) {
    var out = [];
    w.history.forEach(function (e, i) { if ((e.type === 'normal' || e.type === 'test') && i >= (since || 0) && e.reps != null) out.push(e); });
    return out;
  }
  function freezable(w, now) {
    if (w.status !== 'active') return { ok: false, reason: 'Тренировка уже заморожена.' };
    if (w.phase === 'neg') return { ok: false, reason: 'Идёт блок негативных — заморозка недоступна.' };
    var from = now.getTime() - 14 * DAY_MS;
    var es = w.history.filter(function (e) { return (e.type === 'normal' || e.type === 'test') && e.reps != null && e.ts >= from; });
    var need = w.days.length >= 2 ? 3 : 2;
    if (es.length < need) return { ok: false, reason: 'Для заморозки нужно стабильно делать 6+ повторений в первом подходе в течение двух недель. Пока записей за 14 дней: ' + es.length + ' из ' + need + '.' };
    if (es.some(function (e) { return e.reps < 6; })) return { ok: false, reason: 'За последние две недели были результаты меньше 6. Заморозка разрешена только при стабильных 6+. Если нужно заморозить быстро — сбросьте уровень («Сбросить уровень −1») и докажите программе, что с этим весом вы стабильно делаете 6+.' };
    return { ok: true };
  }
  function shouldDrop(w) {
    if (w.level < 2) return false;
    var es = firstSets(w, w.lvStart);
    if (es.length < 3) return false;
    var a = es[es.length - 3].reps, b = es[es.length - 2].reps, c = es[es.length - 1].reps;
    var decline = c < b && b < a && c < 5;
    var allLow = a < 5 && b < 5 && c < 5 && c <= a;
    return decline || allLow;
  }
  function stagnantAtLevel(w) {
    var es = firstSets(w, w.lvStart);
    if (es.length < 3) return false;
    var a = es[es.length - 3].reps, c = es[es.length - 1].reps;
    return c <= a && c < 6;
  }
  function canNeg(w, now) {
    if (w.lastNegEnd) {
      var d = daysBetween(w.lastNegEnd, ymd(now));
      if (d < NEG_COOLDOWN) return { ok: false, reason: 'cooldown', left: NEG_COOLDOWN - d };
    }
    var es = w.history.filter(function (e, i) {
      return (e.type === 'normal' || e.type === 'test') && e.reps != null && (!w.lastNegEnd || e.date > w.lastNegEnd);
    });
    if (es.length >= 3 && es[es.length - 1].reps > es[es.length - 3].reps) return { ok: false, reason: 'growing' };
    return { ok: true };
  }
  function fastGrowth(w, now) {
    var from = now.getTime() - 32 * DAY_MS, n = 0;
    (w.levelLog || []).forEach(function (l) { if (l.ts >= from && l.to > l.from) n += (l.to - l.from) >= 2 && l.from === 0 ? 1 : (l.to - l.from); });
    return n;
  }
  function setLevel(w, to, reason, now) {
    w.levelLog.push({ ts: now.getTime(), date: ymd(now), from: w.level, to: to, reason: reason });
    w.level = to; w.lvStart = w.history.length;
  }

  /* ---------- шаги тренировки ---------- */
  function buildSteps(w, kind) {
    var L = w.level, st = [], neg = kind === 'neg';
    function T(id, dur, text, sub) { return { id: id, k: 'timer', t: dur === 240 || dur === 120 && id.indexOf('rest') === 0 ? 'rest' : 'warm', dur: dur, text: text, sub: sub || '' }; }
    st.push({ id: 'warm', k: 'timer', t: 'warm', dur: 120, text: 'Разминка всего тела', sub: 'Разомните суставы и особенно те участки, которые работают в этом упражнении.' });
    if (L >= 4) {
      var r = ramp(L);
      st.push({ id: 'w1', k: 'task', t: 'wset', pl: 0, reps: 3, neg: neg, text: '3 повтора со своим весом (без доп. веса)' });
      st.push({ id: 'r1', k: 'timer', t: 'rest', dur: 120, text: 'Отдых 2 минуты' });
      st.push({ id: 'w2', k: 'task', t: 'wset', pl: r.half, reps: 2, neg: neg, text: '2 повтора с 50% рабочего веса' });
      st.push({ id: 'r2', k: 'timer', t: 'rest', dur: 120, text: 'Отдых 2 минуты' });
      st.push({ id: 'w3', k: 'task', t: 'wset', pl: r.q, reps: 1, neg: neg, text: '1 повтор с 3/4 рабочего веса' });
    } else {
      st.push({ id: 'w1', k: 'task', t: 'wset', pl: L, reps: 2, neg: neg, text: neg ? '2 негативных повтора' : (L === 0 ? '2 повтора (обычных, либо негативных, если пока не получается)' : '2 повтора с рабочим весом') });
    }
    if (kind === 'maint') {
      st.push({ id: 'r3', k: 'timer', t: 'rest', dur: 240, text: 'Отдых 4 минуты' });
      st.push({ id: 's1', k: 'task', t: 'set', setNo: 1, rec: true, text: 'Поддерживающий подход на отказ' });
      return st;
    }
    var plan = [6, 4, 3, 2];
    for (var i = 1; i <= 4; i++) {
      st.push({ id: 'r' + (i + 2), k: 'timer', t: 'rest', dur: 240, text: 'Отдых 4 минуты' });
      if (neg) st.push({ id: 's' + i, k: 'task', t: 'set', setNo: i, neg: true, reps: plan[i - 1], text: 'Негативный подход' });
      else st.push({ id: 's' + i, k: 'task', t: 'set', setNo: i, rec: i === 1, text: i === 1 ? 'Первый подход — на максимум' : 'Подход на максимум' });
    }
    return st;
  }
  function convertRemainingToNeg(ses) {
    var seq = [4, 3, 2], n = 0;
    ses.steps.forEach(function (s, i) { if (i > ses.i && s.t === 'set') { s.neg = true; s.rec = false; s.reps = seq[n++] || 2; s.text = 'Негативный подход'; } });
  }

  function startSession(S, w, now) {
    var msgs = [];
    if (w.pendingUp && w.level < 8) {
      var to = upTo(w.level);
      msgs.push({ kind: 'up', title: 'Новый уровень!', text: 'Прошлые 7 повторений засчитаны: с этой тренировки уровень ' + to + ' (' + lvTxt(to, S) + '). Добавьте ' + (w.level === 0 ? '2 блина' : '1 блин') + ' в рюкзак.' });
      setLevel(w, to, 'pending', now);
    }
    w.pendingUp = false;
    var kind = (w.phase === 'neg' && w.block && w.block.done >= 1) ? 'neg' : (w.status === 'frozen' ? 'maint' : 'normal');
    w.session = { kind: kind, i: 0, endsAt: null, startedAt: Date.now(), pl: w.level, recorded: false, steps: buildSteps(w, kind) };
    return msgs;
  }

  /* Первый подход записан: решаем, что дальше. Возвращает {msgs, offer} */
  function processFirstSet(S, w, ses, reps, now) {
    var msgs = [], offer = null, L = w.level, first = w.history.length === 0, test = w.pendingTest;
    var type = ses.kind === 'maint' ? 'maint' : (test ? 'test' : 'normal');
    w.history.push({ id: uid(), ts: now.getTime(), date: ymd(now), level: L, reps: reps, type: type, note: type === 'maint' ? 'Поддержание' : (test ? 'Тест после негативных' : '') });
    ses.recorded = true;

    if (type === 'maint') {
      var ms = w.history.filter(function (e) { return e.type === 'maint'; });
      if (reps < 6 && ms.length >= 2 && ms[ms.length - 2].reps < 6) {
        w.needsResume = true;
        msgs.push({ kind: 'warn', title: 'Спад в поддержании', text: 'Два раза подряд меньше 6 повторений. Заморозка больше не оправдана — нужно вернуться к полноценным тренировкам, пока результат не закрепится.' });
      } else msgs.push({ kind: 'ok', title: 'Записано', text: reps + ' ' + plural(reps, 'повтор', 'повтора', 'повторов') + '. Форма удержана — можно отдыхать до следующей недели.' });
      return { msgs: msgs, offer: null };
    }
    if (test) {
      w.pendingTest = false;
      if (reps >= 5) msgs.push({ kind: 'ok', title: 'Поздравляю!', text: 'Тест пройден: ' + reps + ' ' + plural(reps, 'повтор', 'повтора', 'повторов') + '. Вы можете приступать к полноценной тренировке — дальше работаем в обычном режиме.' });
    }
    if (reps >= 8) {
      if (L < 8) {
        var to = upTo(L);
        setLevel(w, to, 'reps8', now); w.dropped = false; ses.pl = to;
        msgs.push({ kind: 'up', title: '+' + (to - L) + ' ' + (to - L > 1 ? 'уровня' : 'уровень') + '!', text: '8 повторений. Вы можете набросить в рюкзак ' + (L === 0 ? '2 блина (' + kg(2, S) + ' кг)' : '1 блин (' + S.settings.plateKg + ' кг)') + '. Остальные 3 подхода — уже с новым весом: уровень ' + to + ' (' + lvTxt(to, S) + ').' });
      } else msgs.push({ kind: 'ok', title: 'Максимальный уровень', text: '8 повторений на уровне 8 — это потолок программы. Держим уровень и растим стабильность.' });
    } else if (reps === 7 && L < 8) {
      w.pendingUp = true;
      msgs.push({ kind: 'ok', title: '7 повторений', text: 'Почти! Новый вес — со следующей тренировки (уровень ' + upTo(L) + '). Сегодня остальные подходы без утяжеления.' });
    } else if (reps < 5) {
      if (first && L >= 4) {
        var nl = reps <= 2 ? 2 : 3;
        setLevel(w, nl, 'too-high', now); ses.pl = nl;
        msgs.push({ kind: 'warn', title: 'Ты чё, какой ' + L + ' уровень? 😄', text: 'Ахахаха. Давай скинем до уровня ' + nl + ' (' + lvTxt(nl, S) + '). Это не слабость — просто честная точка старта.' });
      } else if (L === 0) {
        var cn = canNeg(w, now);
        if (cn.ok) {
          startNegBlock(w, ses, false, now);
          msgs.push({ kind: 'neg', title: 'Слишком мало', text: 'Вы сделали ' + reps + ' — слишком мало. Делаем по плану негативный вид этого упражнения: остальные 3 подхода — негативные повторения 4 → 3 → 2. Затем создаётся блок негативных на две недели.', help: true });
        } else msgs.push(negBlocked(cn, reps));
      } else {
        if (w.dropped && stagnantAtLevel(w) && canNeg(w, now).ok) {
          offer = { weighted: true };
        } else if (shouldDrop(w)) {
          msgs.push(applyDrop(S, w, ses, now));
        } else {
          ses.pl = dropTo(L);
          msgs.push({ kind: 'warn', title: 'Маловато для этого веса', text: 'Для остальных подходов уберите 1 блин (уровень ' + dropTo(L) + '). Если спад повторится, программа сама решит, нужно ли сбрасывать уровень.' });
          if (shouldDrop(w)) { /* на всякий случай */ }
        }
      }
    }
    // независимо от ветки: проверка спада при reps 5–6 на тяжёлых уровнях
    if (reps >= 5 && reps < 7 && L >= 3 && shouldDrop(w)) msgs.push(applyDrop(S, w, ses, now));
    return { msgs: msgs, offer: offer };
  }
  function negBlocked(cn, reps) {
    if (cn.reason === 'cooldown') return { kind: 'warn', title: 'Негативные пока недоступны', text: 'Вы сделали ' + reps + ', но прошлый блок негативных закончился недавно. Следующий можно брать через ' + cn.left + ' ' + plural(cn.left, 'день', 'дня', 'дней') + '. Пока работаем на максимум — остальные подходы делайте на отказ.' };
    return { kind: 'ok', title: 'Растём — негативные не нужны', text: 'Вы идёте вверх по показателям, поэтому негативные не включаются. Зачем ломать то, что работает? Остальные подходы — на максимум.' };
  }
  function applyDrop(S, w, ses, now) {
    var from = w.level, to = dropTo(from), fg = fastGrowth(w, now);
    setLevel(w, to, 'drop', now); w.dropped = true; w.pendingUp = false; ses.pl = to;
    return { kind: 'drop', title: 'Приказ о сбросе уровня', text: (fg >= 3 ? 'За последний месяц рост был очень быстрым (+' + fg + ' ур.), а теперь повторения падают. ' : '') + 'Нервная система устала — бить её 1–2 повторениями не стоит. Уровень ' + from + ' → ' + to + ' (' + lvTxt(to, S) + '). Остальные подходы уже с новым весом.\n\nПомни, что сброс веса (уровня) — это не откат, а процесс тренировки. Это не откат, а пространство сзади для разгона.' };
  }
  function startNegBlock(w, ses, weighted, now) {
    w.phase = 'neg'; w.block = { start: ymd(now), done: 0, weighted: !!weighted };
    convertRemainingToNeg(ses);
  }

  function finishSession(S, w, now) {
    var ses = w.session, msgs = [];
    if (!ses) return msgs;
    w.lastDoneDate = ymd(now);
    if (ses.kind === 'neg') {
      w.history.push({ id: uid(), ts: now.getTime(), date: ymd(now), level: w.level, reps: null, type: 'neg', note: 'Негативные 6/4/3/2 · блок ' + (w.block.done + 1) + '/4' });
    }
    if (w.phase === 'neg' && w.block) {
      w.block.done++;
      if (w.block.done >= 4) {
        w.phase = 'normal'; w.lastNegEnd = ymd(now); w.pendingTest = true; w.block = null; w.lvStart = w.history.length;
        msgs.push({ kind: 'ok', title: 'Блок негативных завершён', text: 'Две недели позади. Следующая тренировка — тест: в первом подходе делайте обычные повторения. Если выйдет 5 и больше — вперёд, к полноценной тренировке.' });
      } else msgs.push({ kind: 'neg', title: 'Негативные: ' + w.block.done + ' из 4', text: 'Блок идёт по плану. Следующая тренировка — снова 6 → 4 → 3 → 2.' });
    }
    w.session = null;
    return msgs;
  }

  function setStatus(S, w, status, now) {
    w.status = status;
    if (status === 'frozen') { if (!w.maintDay && w.maintDay !== 0) w.maintDay = w.days[0]; w.needsResume = false; }
    else { w.fresh = false; w.needsResume = false; }
  }
  function activeOf(S, exceptId) { return S.workouts.filter(function (w) { return w.status === 'active' && w.id !== exceptId; })[0] || null; }
  function sortedWorkouts(S) {
    return S.workouts.slice().sort(function (a, b) { return (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1); });
  }

  var API = {
    SCHEMA: SCHEMA, DAY_NAMES: DAY_NAMES, DAY_FULL: DAY_FULL, LEVELS: LEVELS, NEG_COOLDOWN: NEG_COOLDOWN,
    ymd: ymd, uid: uid, daysBetween: daysBetween, defaultState: defaultState, migrate: migrate, newWorkout: newWorkout,
    ramp: ramp, dropTo: dropTo, upTo: upTo, kg: kg, lvTxt: lvTxt, plural: plural,
    lastDue: lastDue, nextDate: nextDate, available: available, missed: missed, panic: panic,
    firstSets: firstSets, freezable: freezable, shouldDrop: shouldDrop, canNeg: canNeg, setLevel: setLevel,
    buildSteps: buildSteps, startSession: startSession, processFirstSet: processFirstSet, finishSession: finishSession,
    startNegBlock: startNegBlock, convertRemainingToNeg: convertRemainingToNeg, setStatus: setStatus, activeOf: activeOf,
    sortedWorkouts: sortedWorkouts, applyDrop: applyDrop, fastGrowth: fastGrowth
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Logic = API;
})(typeof window !== 'undefined' ? window : globalThis);
