/* Звуки через WebAudio + вибрация */
(function (root) {
  var ctx = null, enabled = true;
  function ensure() {
    if (!ctx) { var C = root.AudioContext || root.webkitAudioContext; if (C) ctx = new C(); }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(f, start, dur, type, vol) {
    var c = ensure(); if (!c || !enabled) return;
    var o = c.createOscillator(), g = c.createGain(), t = c.currentTime + start;
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  function vib(p) { try { if (enabled && navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
  var A = {
    setEnabled: function (v) { enabled = !!v; },
    unlock: function () { ensure(); },
    tap: function () { tone(660, 0, 0.06, 'triangle', 0.12); },
    plus: function (n) { tone(440 + Math.min(n, 12) * 40, 0, 0.09, 'triangle', 0.2); vib(12); },
    warn30: function () { tone(880, 0, 0.15, 'square', 0.18); tone(880, 0.22, 0.15, 'square', 0.18); vib([120, 80, 120]); },
    tick: function () { tone(1000, 0, 0.05, 'square', 0.12); },
    end: function () { [0, 0.28, 0.56].forEach(function (s) { tone(1175, s, 0.2, 'square', 0.25); }); tone(1568, 0.9, 0.5, 'sine', 0.25); vib([300, 120, 300, 120, 500]); },
    success: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.11, 0.25, 'triangle', 0.22); }); vib([60, 40, 120]); },
    up: function () { [392, 523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, i * 0.09, 0.3, 'sawtooth', 0.12); }); vib([80, 50, 80, 50, 200]); },
    warn: function () { tone(300, 0, 0.25, 'sawtooth', 0.18); tone(220, 0.25, 0.35, 'sawtooth', 0.18); vib([200, 100, 200]); },
    panic: function () { tone(760, 0, 0.18, 'square', 0.15); tone(560, 0.2, 0.18, 'square', 0.15); vib([150, 80, 150]); }
  };
  root.Sound = A;
})(window);
