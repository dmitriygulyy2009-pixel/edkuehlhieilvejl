/* График прогресса (SVG): повторения в первом подходе + уровень веса + события */
(function (root) {
  var COL = { normal: '#22d3ee', test: '#fbbf24', maint: '#94a3b8', neg: '#c084fc' };
  function dm(d) { var p = d.split('-'); return p[2] + '.' + p[1]; }
  function render(w) {
    var H = w.history;
    if (!H.length) return '<div class="sub" style="text-align:center;padding:30px 0">Пока нет записей — график появится после первой тренировки.</div>';
    var n = H.length, pw = 48, padL = 34, padR = 30, padT = 20, padB = 42, ph = 190;
    var W = Math.max(320, padL + padR + n * pw), Ht = padT + ph + padB;
    var maxR = 10; H.forEach(function (e) { if (e.reps != null && e.reps + 1 > maxR) maxR = e.reps + 1; });
    function X(i) { return padL + pw / 2 + i * pw; }
    function Y(v) { return padT + ph - (v / maxR) * ph; }
    function YL(v) { return padT + ph - (v / 8) * ph; }
    var s = '<svg width="' + W + '" height="' + Ht + '" viewBox="0 0 ' + W + ' ' + Ht + '">';
    s += '<defs><linearGradient id="gl" x1="0" x2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#22d3ee"/></linearGradient>' +
      '<linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22d3ee" stop-opacity=".28"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></linearGradient></defs>';
    // сетка
    [0, 5, 8, 10].forEach(function (v) {
      if (v > maxR) return;
      var y = Y(v), th = (v === 5 || v === 8);
      s += '<line x1="' + padL + '" x2="' + (W - padR + 10) + '" y1="' + y + '" y2="' + y + '" stroke="' + (th ? (v === 8 ? '#34d399' : '#fbbf24') : 'rgba(255,255,255,.1)') + '" stroke-dasharray="' + (th ? '5 5' : '0') + '" stroke-opacity="' + (th ? .55 : 1) + '"/>';
      s += '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" fill="#a79bc7" font-size="11" text-anchor="end">' + v + '</text>';
    });
    // блоки негативных (подсветка)
    var i = 0;
    while (i < n) {
      if (H[i].type === 'neg' || (H[i].type !== 'neg' && isNegDay1(H, i))) {
        var j = i; while (j + 1 < n && (H[j + 1].type === 'neg')) j++;
        s += '<rect x="' + (X(i) - pw / 2) + '" y="' + padT + '" width="' + ((j - i + 1) * pw) + '" height="' + ph + '" fill="rgba(192,132,252,.12)" rx="8"/>';
        i = j + 1;
      } else i++;
    }
    // уровень (ступенчатая линия)
    var lp = '', first = true;
    H.forEach(function (e, k) {
      var y = YL(e.level || 0);
      lp += (first ? 'M' : 'L') + (X(k) - pw / 2) + ' ' + y + ' L' + (X(k) + pw / 2) + ' ' + y + ' '; first = false;
    });
    s += '<path d="' + lp + 'L' + (X(n - 1) + pw / 2) + ' ' + (padT + ph) + ' L' + (X(0) - pw / 2) + ' ' + (padT + ph) + ' Z" fill="url(#ga)"/>';
    s += '<path d="' + lp + '" fill="none" stroke="#22d3ee" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="3 3"/>';
    // линия повторений
    var pts = [], len = 0, px = null, py = null;
    H.forEach(function (e, k) {
      if (e.reps == null || e.type === 'neg') return;
      var x = X(k), y = Y(e.reps); pts.push([x, y]);
      if (px !== null) len += Math.hypot(x - px, y - py); px = x; py = y;
    });
    if (pts.length > 1) s += '<polyline class="draw" style="--len:' + Math.ceil(len + 10) + '" points="' + pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '" fill="none" stroke="url(#gl)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>';
    // точки
    H.forEach(function (e, k) {
      var x = X(k), d = (0.9 + k * 0.05).toFixed(2);
      if (e.reps != null && e.type !== 'neg') {
        s += '<g class="pop" style="animation-delay:' + d + 's;transform-origin:' + x + 'px ' + Y(e.reps) + 'px"><circle cx="' + x + '" cy="' + Y(e.reps) + '" r="6.5" fill="' + (COL[e.type] || '#22d3ee') + '" stroke="#0b0714" stroke-width="2"/>' +
          '<text x="' + x + '" y="' + (Y(e.reps) - 11) + '" fill="#fff" font-size="12" font-weight="700" text-anchor="middle">' + e.reps + '</text></g>';
      } else if (e.type === 'neg') {
        s += '<g class="pop" style="animation-delay:' + d + 's;transform-origin:' + x + 'px ' + (padT + ph) + 'px"><path d="M' + x + ' ' + (padT + ph - 11) + ' l6 6 l-6 6 l-6 -6 z" fill="' + COL.neg + '"/></g>';
      }
      if (k % (n > 14 ? 2 : 1) === 0) s += '<text x="' + x + '" y="' + (padT + ph + 18) + '" fill="#a79bc7" font-size="10" text-anchor="middle">' + dm(e.date) + '</text>';
    });
    // события уровня
    (w.levelLog || []).forEach(function (ev) {
      var k = 0; for (; k < n; k++) if (H[k].date >= ev.date) break; if (k >= n) k = n - 1;
      var up = ev.to > ev.from, x = X(k) + (up ? 8 : -8), y = padT + 10;
      s += '<text x="' + x + '" y="' + y + '" font-size="13" fill="' + (up ? '#34d399' : '#fb5a6b') + '" text-anchor="middle">' + (up ? '▲' : '▼') + '<title>' + ev.from + '→' + ev.to + '</title></text>';
    });
    s += '<text x="' + (W - padR + 10) + '" y="' + (padT + ph + 36) + '" fill="#22d3ee" font-size="10" text-anchor="end" opacity=".8">пунктир — уровень веса (0…8)</text>';
    return s + '</svg>';
  }
  function isNegDay1(H, i) { return false; }
  root.Chart2 = { render: render, COL: COL };
})(window);
