/* 영상 연출 공통: 사람이 쓰는 것처럼 보이게 하는 도구 (flow.html, driver.js, scene8-send.html이 함께 씁니다)
     - 한글 입력: 자모가 조합되는 과정까지 보여 줍니다 (ㄱ → 고 → 곡 → 고개 → 고객)
     - 마우스 커서: 화면에 그린 커서가 목표까지 곡선으로 움직이고 누릅니다. 실제 커서는 숨깁니다
     - 고정 난수: 타자 간격의 흔들림이 녹화할 때마다 같습니다
   URL 옵션
     speed=1   머무는 시간 배율 (장면 사이 대기. 내레이션 길이에 맞출 때)
     type=1    손동작 배율 (타자, 커서 이동. 클수록 느리게)
     cursor=0  화면 커서를 그리지 않음 (편집기에서 커서를 얹을 때) */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var speed = Number(params.get('speed')) || 1;
  var typeRate = Number(params.get('type')) || 1;
  var showCursor = params.get('cursor') !== '0';

  var seed = 20261012;
  function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function wait(ms) { return sleep(ms * speed); }   // 머무는 시간
  function act(ms) { return sleep(ms * typeRate); } // 손동작 시간
  // 탭이 가려지면 requestAnimationFrame이 멈추므로 타이머로 대신 진행합니다
  function frame(f) { if (document.hidden) setTimeout(function () { f(performance.now()); }, 16); else requestAnimationFrame(f); }

  /* ---------- 한글 조합 ---------- */
  var L = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  var T = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
  var VFIRST = { 9: 8, 10: 8, 11: 8, 14: 13, 15: 13, 16: 13, 19: 18 };                        // ㅘ → ㅗ 처럼 겹모음의 첫 자모
  var TFIRST = { 3: 1, 5: 4, 6: 4, 9: 8, 10: 8, 11: 8, 12: 8, 13: 8, 14: 8, 15: 8, 18: 17 };  // ㄳ → ㄱ 처럼 겹받침의 첫 자모
  // 받침 + 다음 초성이 겹받침이 되는 짝 (얼 + ㅁ → 얾)
  var TPAIR = { '1,19': 3, '4,22': 5, '4,27': 6, '8,1': 9, '8,16': 10, '8,17': 11, '8,19': 12, '8,25': 13, '8,26': 14, '8,27': 15, '17,19': 18 };
  function dec(ch) {
    var c = ch.charCodeAt(0) - 0xAC00;
    return c >= 0 && c <= 11171 ? { l: Math.floor(c / 588), v: Math.floor(c % 588 / 28), t: c % 28 } : null;
  }
  function com(l, v, t) { return String.fromCharCode(0xAC00 + (l * 21 + v) * 28 + t); }
  // 글자를 칠 때 화면에 보이는 중간 상태를 차례로 돌려줍니다
  function keystrokes(text) {
    var out = [], done = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i], d = dec(ch);
      if (!d) { done += ch; out.push(done); continue; }
      var pd = done ? dec(done[done.length - 1]) : null, asFinal = T.indexOf(L[d.l]);
      // 앞 글자에 받침이 없으면 다음 초성이 잠깐 받침으로 붙었다가 모음을 치면 넘어옵니다 (도깨비불)
      var pair = pd && pd.t ? TPAIR[pd.t + ',' + asFinal] : null;
      if (pd && !pd.t && asFinal > 0) out.push(done.slice(0, -1) + com(pd.l, pd.v, asFinal));
      else if (pair) out.push(done.slice(0, -1) + com(pd.l, pd.v, pair));
      else out.push(done + L[d.l]);
      if (VFIRST[d.v] != null) out.push(done + com(d.l, VFIRST[d.v], 0));
      out.push(done + com(d.l, d.v, 0));
      if (d.t) {
        if (TFIRST[d.t] != null) out.push(done + com(d.l, d.v, TFIRST[d.t]));
        out.push(done + com(d.l, d.v, d.t));
      }
      done += ch;
    }
    return out;
  }
  // set(문자열)로 화면에 반영하며 입력합니다. prefix는 이미 있는 앞부분
  async function type(set, text, prefix) {
    prefix = prefix || '';
    var ks = keystrokes(text), prev = '';
    for (var i = 0; i < ks.length; i++) {
      set(prefix + ks[i]);
      var last = ks[i][ks[i].length - 1], ms = 62 + rand() * 70;
      if (ks[i].length > prev.length && /[\s]/.test(last)) ms += 40 + rand() * 60;     // 낱말 사이
      if (/[,.?!]/.test(last)) ms += 160 + rand() * 120;                                // 문장부호 뒤
      if (rand() < 0.04) ms += 220 + rand() * 200;                                     // 가끔 멈칫
      prev = ks[i];
      await act(ms);
    }
  }

  /* ---------- 화면 커서 ---------- */
  // 커서는 가장 바깥 창 하나에만 그립니다. iframe 안에서는 바깥 창의 커서를 빌려 씁니다
  var owner = window;
  try { if (window.parent !== window && window.parent.Human) owner = window.parent; } catch (e) { /* 다른 출처 */ }
  // iframe 위에서도 실제 커서는 숨깁니다
  if (showCursor && owner !== window) document.addEventListener('DOMContentLoaded', function () {
    var s = document.createElement('style'); s.textContent = 'html, html * { cursor: none !important; }'; document.head.appendChild(s);
  });
  var cur = null;
  function cursor() {
    if (owner !== window) return owner.Human._cursor();
    if (cur) return cur;
    var doc = document, st = doc.createElement('style');
    st.textContent = '' +
      (showCursor ? 'html, html * { cursor: none !important; }' : '') +
      '.hc { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; will-change: transform; }' +
      '.hc svg { display: block; transform-origin: 3px 2px; transition: transform .09s ease; filter: drop-shadow(0 1px 1.5px rgba(0,0,0,.35)); }' +
      '.hc.down svg { transform: scale(.86); }' +
      '.hc .beam { display: none; margin: -11px 0 0 -6px; } .hc.text .beam { display: block; } .hc.text .arrow { display: none; }' +
      '.hc i { position: absolute; left: -15px; top: -15px; width: 32px; height: 32px; border-radius: 50%; background: rgba(228,0,43,.28); opacity: 0; }' +
      '.hc i.go { animation: hcRipple .5s ease-out; }' +
      '@keyframes hcRipple { from { opacity: 1; transform: scale(.3); } to { opacity: 0; transform: scale(1.5); } }';
    doc.head.appendChild(st);
    var el = doc.createElement('div');
    el.className = 'hc';
    el.innerHTML = '<i></i><svg class="arrow" width="22" height="26" viewBox="0 0 22 26"><path d="M2 1.5 L2 20.5 L6.8 16.2 L10 23.6 L13.2 22.2 L10.1 15 L16.6 15 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>' +
      '<svg class="beam" width="12" height="22" viewBox="0 0 12 22"><path d="M2 1.5 H5 Q6 1.5 6 3 V19 Q6 20.5 5 20.5 H2 M10 1.5 H7 Q6 1.5 6 3 M10 20.5 H7 Q6 20.5 6 19" fill="none" stroke="#fff" stroke-width="3"/><path d="M2 1.5 H5 Q6 1.5 6 3 V19 Q6 20.5 5 20.5 H2 M10 1.5 H7 Q6 1.5 6 3 M10 20.5 H7 Q6 20.5 6 19" fill="none" stroke="#111" stroke-width="1.3"/></svg>';
    if (!showCursor) el.style.display = 'none';
    doc.body.appendChild(el);
    cur = { el: el, x: innerWidth * 0.62, y: innerHeight * 0.72 };
    el.style.transform = 'translate(' + cur.x + 'px,' + cur.y + 'px)';
    return cur;
  }
  // 요소의 한 점을 커서가 있는 창 기준 좌표로 바꿉니다. fx, fy는 요소 안 위치 비율 (기본 가운데)
  function point(el, fx, fy) {
    var r = el.getBoundingClientRect(), x = r.left + r.width * (fx == null ? 0.5 : fx), y = r.top + r.height * (fy == null ? 0.5 : fy);
    if (owner !== window) { var fr = window.frameElement.getBoundingClientRect(); x += fr.left; y += fr.top; }
    return { x: Math.round(x), y: Math.round(y) };
  }
  // 살짝 휘는 곡선으로, 가속했다가 감속하며 움직입니다
  // ms를 주면 그 시간 동안 곧게 움직입니다 (드래그처럼 짧게 여러 번 움직일 때)
  function moveTo(x, y, ms) {
    var c = cursor(), x0 = c.x, y0 = c.y, dx = x - x0, dy = y - y0, dist = Math.hypot(dx, dy);
    if (dist < 2) return Promise.resolve();
    var dur = (ms || Math.min(1050, 280 + dist * 0.42)) * typeRate, bend = ms ? 0 : (rand() - 0.5) * 0.22 * dist;
    var nx = dist ? -dy / dist : 0, ny = dist ? dx / dist : 0, start = performance.now();
    return new Promise(function (resolve) {
      frame(function step(now) {
        var k = Math.min(1, (now - start) / dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2, arc = 4 * e * (1 - e) * bend;
        c.x = x0 + dx * e + nx * arc; c.y = y0 + dy * e + ny * arc;
        c.el.style.transform = 'translate(' + c.x + 'px,' + c.y + 'px)';
        if (k < 1) frame(step); else resolve();
      });
    });
  }
  async function press() {
    var c = cursor(), ring = c.el.querySelector('i');
    c.el.classList.add('down');
    ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go');
    await act(110);
    c.el.classList.remove('down');
    await act(70);
  }
  async function moveToEl(el, fx, fy) { var p = point(el, fx, fy); await moveTo(p.x, p.y); return p; }
  // 'text'면 글자 입력용 I자, 아니면 화살표
  function shape(kind) { cursor().el.classList.toggle('text', kind === 'text'); }
  // 이 창 기준 좌표를 커서가 있는 창 기준으로 바꿉니다
  function toOwner(x, y) {
    if (owner !== window) { var fr = window.frameElement.getBoundingClientRect(); x += fr.left; y += fr.top; }
    return { x: Math.round(x), y: Math.round(y) };
  }

  window.Human = {
    speed: speed, typeRate: typeRate, rand: rand, wait: wait, act: act, frame: frame,
    keystrokes: keystrokes, type: type,
    point: point, toOwner: toOwner, moveTo: moveTo, moveToEl: moveToEl, press: press, shape: shape,
    _cursor: cursor
  };
})();
