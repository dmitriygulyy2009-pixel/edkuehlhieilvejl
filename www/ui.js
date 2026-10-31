/* Общие UI-хелперы: хранилище, модалки, тосты, экспорт/импорт */
(function (root) {
  var KEY = 'ironrhythm.state';
  var A = { S: null, tab: 'home', pid: null, sid: null, timer: null };
  root.A = A;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, el) { return (el || document).querySelector(sel); }

  var Store = {
    load: function () {
      var raw = null;
      try { raw = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
      A.S = Logic.migrate(raw);
      Sound.setEnabled(A.S.settings.sound);
    },
    save: function () { try { localStorage.setItem(KEY, JSON.stringify(A.S)); } catch (e) {} },
    reset: function () { try { localStorage.removeItem(KEY); } catch (e) {} A.S = Logic.defaultState(); A.sid = null; A.pid = null; }
  };

  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.style.opacity = 0; t.style.transition = '.4s'; }, 2200); setTimeout(function () { t.remove(); }, 2700);
  }
  function confetti() {
    var cols = ['#8b5cf6', '#22d3ee', '#34d399', '#fbbf24', '#fb5a6b', '#f472b6'];
    for (var i = 0; i < 46; i++) {
      var c = document.createElement('i'); c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length];
      c.style.animationDelay = Math.random() * .6 + 's'; c.style.animationDuration = 1.8 + Math.random() * 1.6 + 's';
      document.body.appendChild(c); setTimeout(function (el) { return function () { el.remove(); }; }(c), 4200);
    }
  }
  /* modal({cls,title,html,text,buttons:[{label,cls,fn}],noDismiss}) -> close() */
  function modal(o) {
    var ov = document.createElement('div'); ov.className = 'ov';
    var sh = document.createElement('div'); sh.className = 'sheet ' + (o.cls || '');
    sh.innerHTML = (o.title ? '<h3>' + o.title + '</h3>' : '') + (o.text ? '<p>' + esc(o.text) + '</p>' : '') + (o.html || '');
    if (o.buttons && o.buttons.length) {
      var ac = document.createElement('div'); ac.className = 'acts';
      o.buttons.forEach(function (b) {
        var bt = document.createElement('button'); bt.className = 'btn ' + (b.cls || ''); bt.textContent = b.label;
        bt.onclick = function () { Sound.tap(); if (b.keep) { b.fn && b.fn(close, sh); } else { close(); b.fn && b.fn(); } };
        ac.appendChild(bt);
      });
      sh.appendChild(ac);
    }
    ov.appendChild(sh); $('#layer').appendChild(ov);
    function close() { ov.remove(); }
    if (!o.noDismiss) ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    if (o.onOpen) o.onOpen(sh, close);
    return close;
  }
  function confirmBox(title, text, yes, fn, cls) {
    modal({ title: title, text: text, buttons: [{ label: 'Отмена', cls: 'sec' }, { label: yes, cls: cls || '', fn: fn }] });
  }
  function infoBox(m, next) {
    var cls = m.kind || 'ok';
    if (cls === 'up') { Sound.up(); confetti(); } else if (cls === 'ok') Sound.success(); else Sound.warn();
    var btns = [{ label: 'Понятно', fn: next }];
    var extra = '';
    if (m.help) extra = '<p><span class="q" id="hq" style="width:auto;padding:0 10px;height:28px">? как делать негативные</span></p>';
    modal({ cls: cls, title: m.title, text: m.text, html: extra, buttons: btns, noDismiss: true, onOpen: function (sh) { var q = sh.querySelector('#hq'); if (q) q.onclick = helpNeg; } });
  }
  function infoQueue(msgs, done) {
    if (!msgs || !msgs.length) { done && done(); return; }
    var m = msgs.shift(); infoBox(m, function () { infoQueue(msgs, done); });
  }
  function helpNeg() {
    modal({
      title: 'Как делать негативные повторения',
      text: 'Негативное повторение — это только фаза опускания: вы «заходите» в верхнюю точку упражнения с помощью опоры, а вниз идёте максимально медленно и подконтрольно.\n\nПример на подтягиваниях: встаньте на стул (или низкую перекладину), запрыгните/подтянитесь так, чтобы подбородок оказался над перекладиной, поднимите ноги и медленно, насколько это возможно, опускайтесь вниз. Одно такое опускание = 1 негативное повторение.\n\nСброс веса при негативных не нужен: вес и так подбирается уровнем.',
      buttons: [{ label: 'Закрыть' }]
    });
  }
  function helpBtn() { return '<span class="q" onclick="UI.helpNeg()">?</span>'; }

  /* ---------- экспорт / импорт ---------- */
  function exportData() {
    var payload = JSON.stringify({ app: 'iron-rhythm', schema: Logic.SCHEMA, exportedAt: new Date().toISOString(), state: A.S }, null, 1);
    var name = 'iron-rhythm-backup-' + Logic.ymd(new Date()) + '.json';
    var cap = root.Capacitor, P = cap && cap.Plugins;
    if (cap && cap.isNativePlatform && cap.isNativePlatform() && P && P.Filesystem && P.Share) {
      P.Filesystem.writeFile({ path: name, data: payload, directory: 'CACHE', encoding: 'utf8' })
        .then(function (r) { return P.Share.share({ title: 'Iron Rhythm — прогресс', text: 'Резервная копия прогресса', url: r.uri, dialogTitle: 'Сохранить прогресс' }); })
        .catch(function (e) { if (!/cancel/i.test(String(e && e.message || e))) toast('Не удалось экспортировать: ' + (e && e.message || e)); });
    } else {
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      a.download = name; document.body.appendChild(a); a.click(); a.remove(); toast('Файл сохранён: ' + name);
    }
  }
  function importData(done) {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json,text/plain';
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var obj = JSON.parse(r.result);
          var st = obj && obj.state ? obj.state : obj;
          if (!st || !Array.isArray(st.workouts)) throw new Error('нет списка тренировок');
          var S = Logic.migrate(obj);
          confirmBox('Загрузить прогресс?', 'Файл содержит тренировок: ' + S.workouts.length + '. Текущие данные в приложении будут заменены.', 'Загрузить', function () {
            A.S = S; A.sid = null; A.pid = null; Sound.setEnabled(S.settings.sound); Store.save(); toast('Прогресс загружен ✔'); done && done();
          });
        } catch (e) { modal({ cls: 'warn', title: 'Не удалось прочитать файл', text: 'Это не похоже на файл прогресса Iron Rhythm (' + e.message + ').', buttons: [{ label: 'Ок' }] }); }
      };
      r.readAsText(f);
    };
    inp.click();
  }

  root.Store = Store;
  root.UI = { esc: esc, $: $, toast: toast, confetti: confetti, modal: modal, confirmBox: confirmBox, infoBox: infoBox, infoQueue: infoQueue, helpNeg: helpNeg, helpBtn: helpBtn, exportData: exportData, importData: importData };
})(window);
