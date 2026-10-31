/* Главные экраны: Тренировки / Прогресс / Настройки */
(function (root) {
  var L = Logic, esc = UI.esc, TABS = [['home', '🏠', 'Тренировки'], ['prog', '📈', 'Прогресс'], ['set', '⚙️', 'Настройки']];
  var sig = '', draft = null;

  function fmtD(s) { var p = s.split('-'); return p[2] + '.' + p[1] + '.' + p[0].slice(2); }
  function wkById(id) { return A.S.workouts.filter(function (w) { return w.id === id; })[0]; }
  function daysTxt(arr) { return arr.slice().sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); }).map(function (d) { return L.DAY_NAMES[d]; }).join(' · '); }
  function dayChips(sel, id, multi) {
    return '<div class="chips" id="' + id + '">' + [1, 2, 3, 4, 5, 6, 0].map(function (d) { return '<span class="chip' + (sel.indexOf(d) >= 0 ? ' on' : '') + '" data-d="' + d + '">' + L.DAY_NAMES[d] + '</span>'; }).join('') + '</div>';
  }
  function bindChips(sh, id, multi, onChange) {
    var box = sh.querySelector('#' + id);
    box.onclick = function (e) {
      var c = e.target.closest('.chip'); if (!c) return; Sound.tap();
      if (multi) c.classList.toggle('on'); else { [].forEach.call(box.children, function (x) { x.classList.remove('on'); }); c.classList.add('on'); }
      onChange && onChange();
    };
    return function () { return [].filter.call(box.children, function (x) { return x.classList.contains('on'); }).map(function (x) { return +x.dataset.d; }); };
  }

  /* ---------- каркас ---------- */
  function go(tab) {
    A.tab = tab; A.sid = null; document.getElementById('tabs').style.display = '';
    document.getElementById('tabs').innerHTML = TABS.map(function (t) { return '<button class="' + (t[0] === tab ? 'on' : '') + '" onclick="App.go(\'' + t[0] + '\')"><span>' + t[1] + '</span>' + t[2] + '</button>'; }).join('');
    var v = document.getElementById('view'); v.scrollTop = 0;
    if (tab === 'home') home(); else if (tab === 'prog') prog(); else settings();
    removeFab(); if (tab === 'home') addFab();
  }
  function addFab() { var b = document.createElement('button'); b.className = 'btn fab'; b.id = 'fab'; b.textContent = '+'; b.onclick = addWorkout; document.body.appendChild(b); }
  function removeFab() { var f = document.getElementById('fab'); if (f) f.remove(); }

  /* ---------- главная ---------- */
  function stateSig(now) { return A.S.workouts.map(function (w) { return [w.id, w.status, L.available(w, now), L.panic(w, now), L.missed(w, now), !!w.session, w.name, w.phase, w.level].join(':'); }).join('|'); }
  function home() {
    var now = new Date(), S = A.S, v = document.getElementById('view'), act = L.activeOf(S, null), h = '';
    sig = stateSig(now);
    h += '<h1>Iron Rhythm</h1><div class="sub">' + ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'][now.getDay()] + ', ' + fmtD(L.ymd(now)) + '</div>';
    document.getElementById('bg').classList.toggle('panic', !!(act && L.panic(act, now)));
    if (!S.workouts.length) {
      h += '<div class="empty"><div class="ico">🏋️</div><h2>Пока нет тренировок</h2><p>Нажмите «+», чтобы добавить первую — выберите название, стартовый уровень и дни недели.</p></div>';
      v.innerHTML = h; return;
    }
    // герой
    if (act) {
      var p = L.panic(act, now), av = L.available(act, now);
      if (p) h += '<div class="card hero red"><div class="sub" style="color:#ffd5da">⚠️ Тренировка не выполнена</div><div class="big" style="font-size:26px;margin:8px 0">Выполните тренировку, либо поставьте на заморозку</div><div class="sub">«' + esc(act.name) + '» — сегодня ещё не сделана, уже после 16:00!</div><button class="btn bad big" style="margin-top:14px" onclick="App.start(\'' + act.id + '\')">Начать сейчас</button></div>';
      else if (av) h += '<div class="card hero now"><div class="sub">Тренировка доступна</div><div class="big" style="margin:8px 0">Пора работать 🔥</div>' + (L.missed(act, now) ? '<div class="sub" style="color:var(--warn)">Вы пропустили плановый день — можно потренироваться вне графика</div>' : '') + '<button class="btn big" style="margin-top:14px" onclick="App.start(\'' + act.id + '\')">' + (act.session ? 'Продолжить' : 'Начать') + ' «' + esc(act.name) + '»</button></div>';
      else h += '<div class="card hero"><div class="sub">До следующей тренировки</div><div class="big" id="cd">…</div><div class="sub">«' + esc(act.name) + '» · ' + daysTxt(act.days) + '</div></div>';
    } else h += '<div class="card hero"><div class="sub">Нет активной тренировки</div><div class="sub">Разморозьте одну из списка ниже или добавьте новую.</div></div>';

    L.sortedWorkouts(S).forEach(function (w, i) { h += wkCard(w, now, i); });
    v.innerHTML = h; updateCd();
  }
  function wkCard(w, now, i) {
    var S = A.S, fr = w.status === 'frozen', av = L.available(w, now), fs = L.firstSets(w), last = fs.length ? fs[fs.length - 1].reps : '—', best = fs.length ? Math.max.apply(null, fs.map(function (e) { return e.reps; })) : '—';
    var badges = '<span class="badge ' + (fr ? 'b-fr' : 'b-act') + '">' + (fr ? (w.fresh ? 'В очереди' : 'Заморожена') : 'Активна') + '</span>';
    if (w.phase === 'neg') badges += ' <span class="badge b-neg">Негативные ' + (w.block ? w.block.done : 0) + '/4</span>';
    if (w.pendingTest) badges += ' <span class="badge b-neg">Тест</span>';
    if (L.missed(w, now) && !fr) badges += ' <span class="badge b-red">Пропуск</span>';
    var h = '<div class="card wk ' + (fr ? 'frozen' : '') + '" style="animation-delay:' + (i * .07) + 's"><div class="row"><div class="sp"><h3>' + esc(w.name) + '</h3><div style="margin-top:6px">' + badges + '</div></div><button class="ghost" onclick="App.menu(\'' + w.id + '\')">⋮</button></div>';
    h += '<div class="meta"><div class="stat">Уровень<b>' + L.lvTxt(w.level, S) + '</b></div><div class="stat">Последний<b>' + last + '</b></div><div class="stat">Рекорд<b>' + best + '</b></div><div class="stat">' + (fr ? 'Поддержание' : 'Дни') + '<b>' + (fr ? (w.fresh ? '—' : L.DAY_NAMES[w.maintDay]) : daysTxt(w.days)) + '</b></div></div>';
    if (w.needsResume) h += '<div class="alert">📉 Спад в режиме поддержания. Нужно вернуть тренировку в активные (⋮ → Разморозить), пока результат не закрепится.</div>';
    if (w.pendingUp && !fr) h += '<div class="alert y">⬆️ Вес повысится со следующей тренировки.</div>';
    if (fr && !w.fresh) h += '<div class="sub" style="margin-top:10px">Раз в неделю — 1 подход на отказ. ' + (av ? '<b style="color:var(--a2)">Сегодня день поддержания.</b>' : '') + '</div>';
    if (fr && av && !w.fresh) h += '<button class="btn sec big" style="margin-top:10px" onclick="App.start(\'' + w.id + '\')">Поддерживающий подход</button>';
    else if (!fr && !av) h += '<div class="sub" style="margin-top:10px">✔ На этом цикле уже выполнено. Следующая: ' + fmtD(L.ymd(L.nextDate(w, now))) + '</div>';
    return h + '</div>';
  }
  function updateCd() {
    var el = document.getElementById('cd'); if (!el) return; var act = L.activeOf(A.S, null); if (!act) return;
    var nd = L.nextDate(act, new Date()); if (!nd) { el.textContent = '—'; return; }
    var s = Math.max(0, Math.floor((nd - new Date()) / 1000)), d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60, z = function (n) { return n < 10 ? '0' + n : n; };
    el.textContent = (d ? d + 'д ' : '') + z(hh) + ':' + z(mm) + ':' + z(ss);
  }
  function start(id) { Sess.open(id); }

  /* ---------- меню тренировки ---------- */
  function menu(id) {
    var w = wkById(id), fr = w.status === 'frozen';
    var items = [['rename', 'Переименовать'], ['days', 'Дни тренировок'], [fr ? 'unfreeze' : 'freeze', fr ? 'Разморозить' : 'Заморозить']];
    if (!fr && w.level > 0) items.push(['lvdown', 'Сбросить уровень −1']);
    items.push(['del', 'Удалить']);
    UI.modal({ cls: 'menu', title: esc(w.name), html: items.map(function (it) { return '<div class="it ' + (it[0] === 'del' ? 'red' : '') + '" data-a="' + it[0] + '">' + it[1] + '</div>'; }).join(''),
      onOpen: function (sh, close) { sh.onclick = function (e) { var it = e.target.closest('.it'); if (!it) return; close(); Sound.tap(); act(it.dataset.a, w); }; } });
  }
  function act(a, w) {
    var now = new Date();
    if (a === 'rename') {
      UI.modal({ title: 'Переименовать', html: '<input type="text" id="nm" value="' + esc(w.name) + '" maxlength="40">', buttons: [{ label: 'Отмена', cls: 'sec' }, { label: 'Сохранить', keep: true, fn: function (close, sh) { var v = sh.querySelector('#nm').value.trim(); if (!v) return; w.name = v; Store.save(); close(); go(A.tab); } }] });
    } else if (a === 'days') {
      UI.modal({ title: 'Дни тренировок', html: dayChips(w.days, 'dc'), onOpen: function (sh) { var get = bindChips(sh, 'dc', true); sh.pick = get; },
        buttons: [{ label: 'Отмена', cls: 'sec' }, { label: 'Сохранить', keep: true, fn: function (close, sh) { var d = sh.pick(); if (!d.length) { UI.toast('Выберите хотя бы один день'); return; } w.days = d; Store.save(); close(); go(A.tab); } }] });
    } else if (a === 'freeze') {
      if (w.session) { UI.toast('Сначала завершите текущую тренировку'); return; }
      var f = L.freezable(w, now);
      if (!f.ok) { UI.modal({ cls: 'warn', title: 'Заморозка недоступна', text: f.reason, buttons: [{ label: 'Понятно' }] }); return; }
      UI.modal({ title: 'Режим поддержания ❄️', text: 'Выберите удобный день недели: раз в неделю — всего 1 подход на отказ (после разминки). Результаты нужно записывать; при устойчивом спаде программа вернёт вас к тренировкам.', html: dayChips([w.days[0]], 'mc'), onOpen: function (sh) { sh.pick = bindChips(sh, 'mc', false); },
        buttons: [{ label: 'Отмена', cls: 'sec' }, { label: 'Заморозить', keep: true, fn: function (close, sh) { var d = sh.pick(); if (!d.length) return; w.maintDay = d[0]; L.setStatus(A.S, w, 'frozen', now); Store.save(); close(); UI.toast('Заморожено ❄️'); go('home'); } }] });
    } else if (a === 'unfreeze') {
      var other = L.activeOf(A.S, w.id);
      if (other) {
        var fo = L.freezable(other, now);
        if (!fo.ok) { UI.modal({ cls: 'warn', title: 'Нельзя разморозить', text: 'Сейчас активна «' + other.name + '», и заморозить её программа не разрешит. ' + fo.reason, buttons: [{ label: 'Понятно' }] }); return; }
        UI.confirmBox('Продолжить эту тренировку?', 'Вы точно хотите продолжить эту тренировку («' + w.name + '»), при этом заморозив активную («' + other.name + '»)?', 'Да, продолжить', function () { other.maintDay = other.days[0]; L.setStatus(A.S, other, 'frozen', now); L.setStatus(A.S, w, 'active', now); Store.save(); go('home'); });
      } else { L.setStatus(A.S, w, 'active', now); Store.save(); UI.toast('Тренировка снова активна'); go('home'); }
    } else if (a === 'lvdown') {
      UI.confirmBox('Сбросить уровень?', 'Уровень ' + w.level + ' → ' + L.dropTo(w.level) + '. Помни: сброс веса — это не откат, а процесс тренировки. Это пространство сзади для разгона.', 'Сбросить', function () { L.setLevel(w, L.dropTo(w.level), 'manual', now); w.dropped = true; w.pendingUp = false; Store.save(); go(A.tab); });
    } else if (a === 'del') {
      UI.confirmBox('Удалить тренировку?', '«' + w.name + '» и вся её история будут удалены без возможности восстановления (если не делали экспорт).', 'Удалить', function () { A.S.workouts = A.S.workouts.filter(function (x) { return x.id !== w.id; }); if (A.pid === w.id) A.pid = null; Store.save(); go(A.tab); }, 'bad');
    }
  }

  function addWorkout() {
    var first = !A.S.workouts.length, lv = 0;
    UI.modal({ title: 'Новая тренировка', html: '<input type="text" id="nm" placeholder="Название упражнения" maxlength="40">' +
      '<h3 style="font-size:15px;margin:16px 0 0">С какого уровня начнем тренировку? ' + UI.helpBtn() + '</h3><div class="sub">Уровень = число блинов в рюкзаке (0 — свой вес, 8 — максимум)</div><div class="chips" id="lc">' + L.LEVELS.map(function (x) { return '<span class="chip' + (x === 0 ? ' on' : '') + '" data-d="' + x + '">' + x + '</span>'; }).join('') + '</div>' +
      '<h3 style="font-size:15px;margin:10px 0 0">Дни недели</h3>' + dayChips([1, 4], 'dc') + (first ? '' : '<div class="sub">Активная тренировка уже есть — новая встанет в очередь (заморожена) до тех пор, пока вы её не разморозите.</div>'),
      onOpen: function (sh) { sh.lv = bindChips(sh, 'lc', false); sh.dd = bindChips(sh, 'dc', true); },
      buttons: [{ label: 'Отмена', cls: 'sec' }, { label: 'Создать', keep: true, fn: function (close, sh) {
        var name = sh.querySelector('#nm').value.trim(), d = sh.dd(), l = sh.lv()[0] || 0;
        if (!name) { UI.toast('Введите название'); return; } if (!d.length) { UI.toast('Выберите дни'); return; }
        var w = L.newWorkout({ name: name, level: l, days: d, status: first || !L.activeOf(A.S, null) ? 'active' : 'frozen', fresh: !(first || !L.activeOf(A.S, null)) });
        A.S.workouts.push(w); Store.save(); close(); Sound.success(); go('home');
      } }] });
  }

  /* ---------- прогресс ---------- */
  function prog() {
    var S = A.S, v = document.getElementById('view'), h = '<h1>Прогресс</h1><div class="sub">Первый подход — ваш главный показатель</div>';
    document.getElementById('bg').classList.remove('panic');
    if (!S.workouts.length) { v.innerHTML = h + '<div class="empty"><div class="ico">📈</div><p>Здесь появится график после первой тренировки.</p></div>'; return; }
    var w = wkById(A.pid) || L.sortedWorkouts(S)[0]; A.pid = w.id;
    h += '<div class="chips">' + L.sortedWorkouts(S).map(function (x) { return '<span class="chip' + (x.id === w.id ? ' on' : '') + '" onclick="App.pick(\'' + x.id + '\')">' + esc(x.name) + '</span>'; }).join('') + '</div>';
    var fs = L.firstSets(w), reps = fs.map(function (e) { return e.reps; }), avg = reps.length ? (reps.slice(-5).reduce(function (a, b) { return a + b; }, 0) / Math.min(5, reps.length)).toFixed(1) : '—';
    var tr = reps.length >= 2 ? (reps[reps.length - 1] - reps[reps.length - 2]) : 0;
    h += '<div class="meta" style="display:flex;gap:8px;flex-wrap:wrap"><div class="stat">Рекорд<b>' + (reps.length ? Math.max.apply(null, reps) : '—') + '</b></div><div class="stat">Среднее (5)<b>' + avg + '</b></div><div class="stat">Динамика<b style="color:' + (tr > 0 ? 'var(--ok)' : tr < 0 ? 'var(--bad)' : 'var(--mut)') + '">' + (tr > 0 ? '▲ +' + tr : tr < 0 ? '▼ ' + tr : '—') + '</b></div><div class="stat">Уровень<b>' + L.lvTxt(w.level, S) + '</b></div></div>';
    h += '<div class="card"><div class="row"><b>График первого подхода</b><span class="sp"></span><span class="sub" style="font-size:11px">● обычный ● тест ● поддержание ◆ негативы</span></div><div class="chartwrap" id="cw">' + Chart2.render(w) + '</div></div>';
    h += '<h2>Журнал</h2><div class="card log">';
    if (!w.history.length) h += '<div class="sub">Записей пока нет.</div>';
    w.history.slice().reverse().forEach(function (e) {
      var t = { normal: ['Тренировка', 'b-act'], test: ['Тест', 'b-neg'], maint: ['Поддержание', 'b-fr'], neg: ['Негативные', 'b-neg'] }[e.type] || ['', ''];
      h += '<div class="e" onclick="App.editEntry(\'' + w.id + '\',\'' + e.id + '\')"><div class="d">' + fmtD(e.date) + '</div><div class="r">' + (e.reps == null ? '◆' : e.reps) + '</div><div class="sp"><span class="badge ' + t[1] + '">' + t[0] + '</span><div class="sub" style="font-size:12px;margin-top:3px">' + L.lvTxt(e.level, S) + (e.note ? ' · ' + esc(e.note) : '') + '</div></div></div>';
    });
    v.innerHTML = h + '</div>';
    var cw = document.getElementById('cw'); if (cw) cw.scrollLeft = cw.scrollWidth;
  }
  function editEntry(wid, eid) {
    var w = wkById(wid), e = w.history.filter(function (x) { return x.id === eid; })[0], r = e.reps;
    UI.modal({ title: fmtD(e.date) + ' · ' + L.lvTxt(e.level, A.S), html: e.reps == null ? '<p class="sub">Запись о негативной тренировке.</p>' : '<div class="row" style="justify-content:center;gap:20px;margin:10px 0"><button class="btn sec" id="m">−</button><b id="v" style="font-size:44px">' + r + '</b><button class="btn sec" id="p">+</button></div><div class="sub" style="text-align:center">Исправить число повторений</div>',
      onOpen: function (sh) { if (e.reps == null) return; sh.querySelector('#m').onclick = function () { if (r > 0) r--; sh.querySelector('#v').textContent = r; }; sh.querySelector('#p').onclick = function () { r++; sh.querySelector('#v').textContent = r; }; },
      buttons: [{ label: 'Удалить', cls: 'bad', fn: function () { UI.confirmBox('Удалить запись?', 'Запись исчезнет из журнала и графика.', 'Удалить', function () { w.history = w.history.filter(function (x) { return x.id !== eid; }); if (w.lvStart > w.history.length) w.lvStart = w.history.length; Store.save(); prog(); }, 'bad'); } },
        { label: 'Сохранить', fn: function () { if (e.reps != null) e.reps = r; Store.save(); prog(); } }] });
  }

  /* ---------- настройки ---------- */
  function settings() {
    var S = A.S, v = document.getElementById('view');
    document.getElementById('bg').classList.remove('panic');
    var h = '<h1>Настройки</h1>';
    h += '<div class="card"><div class="row"><div class="sp"><b>Звуки и вибрация</b><div class="sub">Сигнал за 30 секунд и в конце таймера</div></div><span class="chip ' + (S.settings.sound ? 'on' : '') + '" onclick="App.toggleSound()">' + (S.settings.sound ? 'Вкл' : 'Выкл') + '</span></div></div>';
    h += '<div class="card"><b>Вес одного блина, кг</b><div class="row" style="margin-top:10px"><input type="number" id="pk" inputmode="decimal" min="0.5" step="0.5" value="' + S.settings.plateKg + '"><button class="btn" onclick="App.savePlate()">Ок</button></div><div class="sub" style="margin-top:6px">Используется только для отображения килограммов.</div></div>';
    h += '<div class="card"><b>Сохранение прогресса</b><div class="sub" style="margin:4px 0 12px">Приложение само помнит всё, даже после закрытия. Экспорт нужен для резервной копии или переезда на новую версию — старый файл прогресса всегда будет приниматься.</div><div class="row"><button class="btn sp" onclick="UI.exportData()">⬆ Экспорт</button><button class="btn sec sp" onclick="App.imp()">⬇ Импорт</button></div></div>';
    h += '<div class="card"><b>Как это работает</b> ' + UI.helpBtn() + '<div class="sub" style="margin-top:6px">Разминка 2 мин → разминочные повторения → отдых 4 мин → 4 подхода. Записывается только первый. 8 повторений — уровень вверх, спад — уровень вниз. Нажмите «?», чтобы узнать про негативные повторения.</div></div>';
    h += '<div style="text-align:center"><button class="resetbtn" onclick="App.reset()">сбросить все данные</button><div class="sub" style="font-size:11px;opacity:.4">Iron Rhythm v1.0 · формат данных ' + L.SCHEMA + '</div></div>';
    v.innerHTML = h;
  }
  function reset() { UI.confirmBox('Сбросить всё?', 'Будут удалены ВСЕ тренировки и история. Если нужна копия — сначала сделайте экспорт.', 'Да, сбросить', function () { UI.confirmBox('Точно-точно?', 'Это действие необратимо.', 'Сбросить навсегда', function () { Store.reset(); Store.save(); UI.toast('Данные сброшены'); go('home'); }, 'bad'); }, 'bad'); }

  /* ---------- тики ---------- */
  setInterval(function () {
    if (A.sid || A.tab !== 'home') return;
    var now = new Date(), s = stateSig(now);
    if (s !== sig) { var was = sig.indexOf(':true:') >= 0; home(); var act = L.activeOf(A.S, null); if (act && L.panic(act, now)) Sound.panic(); }
    else updateCd();
  }, 1000);
  document.addEventListener('touchstart', function () { Sound.unlock(); }, { once: true, passive: true });

  root.App = {
    go: go, start: start, menu: menu, pick: function (id) { A.pid = id; prog(); }, editEntry: editEntry,
    toggleSound: function () { A.S.settings.sound = !A.S.settings.sound; Sound.setEnabled(A.S.settings.sound); Store.save(); Sound.tap(); settings(); },
    savePlate: function () { var n = parseFloat(document.getElementById('pk').value); if (n > 0) { A.S.settings.plateKg = n; Store.save(); UI.toast('Сохранено'); } },
    imp: function () { UI.importData(function () { go('home'); }); }, reset: reset
  };

  Store.load();
  var running = A.S.workouts.filter(function (w) { return w.session; })[0];
  go('home');
  if (running) { A.sid = running.id; Sess.render(); }
})(window);
