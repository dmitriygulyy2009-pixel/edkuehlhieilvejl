/* Экран тренировки: шаги, таймеры, запись повторений */
(function (root) {
  var C = 2 * Math.PI * 110, repsNow = 0, warned = '', lastSec = -1, wake = null;

  function W() { return A.S.workouts.filter(function (w) { return w.id === A.sid; })[0]; }
  function plTxt(pl) { return Logic.lvTxt(pl, A.S); }
  function mmss(s) { s = Math.max(0, s); var m = Math.floor(s / 60), r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }

  function lockScreen() { try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { wake = l; }).catch(function () {}); } catch (e) {} }
  function unlockScreen() { try { if (wake) wake.release(); } catch (e) {} wake = null; }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && A.sid) lockScreen(); });

  function open(wid) {
    var w = A.S.workouts.filter(function (x) { return x.id === wid; })[0]; if (!w) return;
    A.sid = wid; Sound.unlock();
    var go = function () { enter(w); lockScreen(); render(); };
    if (!w.session) {
      var msgs = Logic.startSession(A.S, w, new Date()); Store.save();
      enter(w); go = function () { lockScreen(); render(); };
      if (msgs.length) { UI.infoQueue(msgs, go); return; }
    }
    go();
  }
  function enter(w) {
    var ses = w.session, st = ses.steps[ses.i]; repsNow = 0; warned = ''; lastSec = -1;
    if (st && st.k === 'timer' && !ses.endsAt) ses.endsAt = Date.now() + st.dur * 1000;
    Store.save();
  }
  function next() {
    var w = W(); if (!w) return; var ses = w.session;
    ses.i++; ses.endsAt = null; repsNow = 0; warned = ''; lastSec = -1;
    if (ses.i >= ses.steps.length) { done(); return; }
    var st = ses.steps[ses.i]; if (st.k === 'timer') ses.endsAt = Date.now() + st.dur * 1000;
    Store.save(); render();
  }
  function done() {
    var w = W(), msgs = Logic.finishSession(A.S, w, new Date()); Store.save();
    leave(); UI.confetti(); Sound.success();
    msgs.unshift({ kind: 'ok', title: 'Тренировка завершена 💪', text: 'Все подходы выполнены. Результат сохранён в журнале. Отдыхайте и восстанавливайтесь.' });
    UI.infoQueue(msgs, function () { App.go('home'); });
  }
  function leave() { unlockScreen(); A.sid = null; document.getElementById('tabs').style.display = ''; }

  function plus() { repsNow++; Sound.plus(repsNow); var el = document.getElementById('reps'); if (el) { el.textContent = repsNow; el.style.transform = 'scale(1.15)'; setTimeout(function () { el.style.transform = ''; }, 120); } var b = document.getElementById('okbtn'); if (b) b.disabled = false; }
  function minus() { if (repsNow > 0) repsNow--; Sound.tap(); var el = document.getElementById('reps'); if (el) el.textContent = repsNow; }
  function commit() {
    var w = W(), ses = w.session, r = Logic.processFirstSet(A.S, w, ses, repsNow, new Date()); Store.save();
    UI.infoQueue(r.msgs.slice(), function () {
      if (r.offer) {
        UI.modal({
          cls: 'neg', title: 'Негативные с доп. весом', noDismiss: true,
          text: 'Даже на сброшенном весе прогресса нет. Предлагаю перейти на негативные с доп. весом (уровень ' + w.level + '): остальные подходы сегодня — негативные 4 → 3 → 2, затем блок на две недели. Брать негативные можно не чаще раза в 30 дней — это окно сейчас открыто.',
          buttons: [{ label: 'Не сейчас', cls: 'sec', fn: next }, { label: 'Перейти', fn: function () { Logic.startNegBlock(w, ses, true, new Date()); Store.save(); UI.toast('Блок негативных запущен'); next(); } }]
        });
      } else next();
    });
  }
  function exit() {
    var w = W();
    UI.modal({
      title: 'Выйти из тренировки?', text: 'Можно свернуть — тренировка сохранится, таймер продолжит идти по времени. Или отменить её совсем.',
      buttons: [{ label: 'Свернуть', cls: 'sec', fn: function () { leave(); App.go('home'); } },
        { label: 'Отменить', cls: 'bad', fn: function () { if (w.session.recorded) { var ms = Logic.finishSession(A.S, w, new Date()); Store.save(); leave(); UI.infoQueue(ms, function () { App.go('home'); }); } else { w.session = null; Store.save(); leave(); App.go('home'); } } }]
    });
  }

  function render() {
    var w = W(); if (!w) return; var ses = w.session, st = ses.steps[ses.i];
    document.getElementById('tabs').style.display = 'none'; var fb = document.getElementById('fab'); if (fb) fb.remove(); document.getElementById('bg').classList.remove('panic');
    var sets = ses.steps.filter(function (s) { return s.t === 'set'; }), cur = st.t === 'set' ? st.setNo : (ses.steps.slice(0, ses.i).filter(function (s) { return s.t === 'set'; }).length + 1);
    var pills = sets.map(function (s, k) { var n = k + 1; return '<i class="' + (n < cur || (n === cur && st.t === 'set' && false) ? 'd' : (n === cur ? 'c' : '')) + '"></i>'; }).join('');
    var nx = ses.steps[ses.i + 1], h = '<div class="ses">';
    h += '<div class="row" style="width:100%"><button class="ghost" onclick="Sess.exit()">✕</button><div class="sp" style="text-align:center"><b>' + UI.esc(w.name) + '</b><div class="sub">' + (ses.kind === 'neg' ? 'Негативы · ' : ses.kind === 'maint' ? 'Поддержание · ' : '') + plTxt(ses.pl) + '</div></div><span style="width:44px"></span></div>';
    h += '<div class="pill">' + pills + '</div>';
    if (st.k === 'timer') {
      var title = st.t === 'warm' ? '🔥 ' + st.text : '😮‍💨 ' + st.text;
      h += '<h2 style="margin:16px 0 0">' + title + '</h2><div class="sub" style="min-height:40px;max-width:320px">' + UI.esc(st.sub || (nx ? 'Дальше: ' + stepLabel(ses, nx) : '')) + '</div>';
      h += '<div class="ring" id="ring"><svg width="250" height="250"><defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs><circle cx="125" cy="125" r="110" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="12"/><circle id="arc" cx="125" cy="125" r="110" fill="none" stroke="url(#rg)" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="0"/></svg><div class="t"><b id="tm">0:00</b><span class="sub">осталось</span></div></div>';
      if (st.sub && nx) h += '<div class="sub">Дальше: ' + UI.esc(stepLabel(ses, nx)) + '</div>';
      h += '<div class="row" style="margin-top:18px;gap:12px"><button class="btn sec" onclick="Sess.addTime()">+30 сек</button><button class="btn sec" onclick="Sess.skip()">Пропустить ⏭</button></div>';
    } else if (st.t === 'wset') {
      h += '<h2 style="margin:22px 0 4px">🏋️ Разминочный подход</h2><div class="repbox" style="font-size:80px">×' + st.reps + '</div>';
      h += '<div class="wtag">' + (st.neg ? 'негативные · ' : '') + plTxt(st.pl) + '</div><p class="sub" style="max-width:300px">' + UI.esc(st.text) + '</p>';
      h += '<button class="btn ok big" style="margin-top:20px" onclick="Sess.next()">Сделано ✔</button>';
    } else if (st.rec) {
      h += '<h2 style="margin:18px 0 0">' + (ses.kind === 'maint' ? '🧊 Поддерживающий подход' : '⚡ Первый подход — на максимум') + '</h2><div class="wtag">' + plTxt(ses.pl) + '</div>';
      h += '<div class="repbox" id="reps">' + repsNow + '</div><div class="sub">повторений (нажимайте + после каждого)</div>';
      h += '<button class="btn plus" onclick="Sess.plus()">+</button>';
      h += '<div class="row" style="width:100%;margin-top:10px"><button class="btn sec" onclick="Sess.minus()">−1</button><button class="btn ok sp" id="okbtn" onclick="Sess.commit()">Зафиксировать</button></div>';
    } else {
      var n = st.setNo, neg = st.neg;
      h += '<h2 style="margin:22px 0 4px">' + (neg ? '🐢 Негативный подход ' : '💥 Подход ') + n + ' из 4</h2>';
      h += '<div class="repbox">' + (neg ? '×' + st.reps : '∞') + '</div><div class="wtag">' + plTxt(ses.pl) + '</div>';
      h += '<p class="sub" style="max-width:300px">' + (neg ? 'Медленно и подконтрольно опускайтесь (' + st.reps + ' ' + Logic.plural(st.reps, 'раз', 'раза', 'раз') + '). Записывать ничего не нужно.' : 'Делайте на максимум. Записывать ничего не нужно.') + ' ' + (neg ? UI.helpBtn() : '') + '</p>';
      h += '<button class="btn ok big" style="margin-top:20px" onclick="Sess.next()">' + (n === 4 ? 'Завершить тренировку 🏁' : 'Готово ✔') + '</button>';
    }
    root.document.getElementById('view').innerHTML = h + '</div>';
    if (st.k === 'timer') tick();
  }
  function stepLabel(ses, s) {
    if (s.t === 'wset') return 'разминочный подход ×' + s.reps + ' (' + plTxt(s.pl) + ')';
    if (s.t === 'set') return (s.neg ? 'негативный подход ×' + s.reps : s.rec ? 'первый подход на максимум' : 'подход ' + s.setNo + ' на максимум');
    return s.text;
  }
  function tick() {
    var w = A.sid && W(); if (!w || !w.session) return; var ses = w.session, st = ses.steps[ses.i];
    if (!st || st.k !== 'timer') return;
    if (!ses.endsAt) ses.endsAt = Date.now() + st.dur * 1000;
    var rem = Math.ceil((ses.endsAt - Date.now()) / 1000), key = ses.i + ':' + ses.endsAt;
    var tm = document.getElementById('tm'), arc = document.getElementById('arc'), ring = document.getElementById('ring');
    if (tm) tm.textContent = mmss(rem);
    if (arc) arc.setAttribute('stroke-dashoffset', String(C * (1 - Math.max(0, rem) / st.dur)));
    if (ring) ring.classList.toggle('w30', rem <= 30 && rem > 0);
    if (rem <= 30 && rem > 29 && warned !== key && st.dur > 40) { warned = key; Sound.warn30(); }
    else if (rem <= 3 && rem > 0 && rem !== lastSec) { lastSec = rem; Sound.tick(); }
    if (rem <= 0) { Sound.end(); next(); }
  }
  function addTime() { var w = W(); w.session.endsAt += 30000; warned = ''; Store.save(); tick(); }
  function skip() { Sound.tap(); next(); }

  setInterval(function () { if (A.sid) tick(); }, 250);
  root.Sess = { open: open, render: render, next: next, plus: plus, minus: minus, commit: commit, exit: exit, skip: skip, addTime: addTime };
})(window);
