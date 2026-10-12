/* 영상 녹화 드라이버: Scene 3–7을 실제 index.html 위에서 사람이 쓰는 것처럼 진행합니다.
   video/serve.js가 index.html의 <head> 맨 앞에 human.js와 함께 넣으므로, 페이지 스크립트보다 먼저 실행됩니다.

   하는 일
     1) 날짜 고정: 기간 프리셋이 고정 응답의 기간(2026-04-12 ~ 2026-10-12)과 같아지도록 오늘을 2026-10-12로 둡니다
     2) /api/chat 대신 video/fixtures의 고정 응답을 돌려줍니다 (n8n 호출 없음. 영상용으로 손본 응답입니다)
     3) 녹화용 화면 정리: 제품 이름(KT 옵티), 결론을 미리 보여 주는 고객 카드 설명·내부 안내 문구·상담 ID·쓸 수 없는 결합 할인 버튼 숨김
     4) 녹화용 전환 효과: 보고서 등장, 가정 변경 강조, 탭·채팅 전환. index.html 자체는 바꾸지 않습니다
     5) STEPS를 화면 커서로 누르고 한글로 입력하며 진행하고, 클릭 위치·시각을 cue로 남깁니다

   URL 옵션 (human.js 옵션 speed · type · cursor도 같이 씁니다)
     play=1      불러오면 바로 진행      play=wait   부모 창(flow.html)의 시작 신호를 기다림
     bundle=1    Scene 7에 가족결합 탭 포함 (U00603은 결합 대상이 아니라 안내 문구만 나옵니다)
     ops=1       마지막에 운영 버튼으로 대시보드 이동 (대시보드는 n8n에서 실시간 조회합니다)
     date=YYYY-MM-DD   고정 날짜 변경
   키: Esc 중단 · Alt+C cue를 클립보드로 복사 */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var H = window.Human;

  /* ---------- 1) 날짜 고정 ---------- */
  var RealDate = Date;
  var shift = new RealDate((params.get('date') || '2026-10-12') + 'T10:00:00').getTime() - RealDate.now();
  function FixedDate() {
    var a = [].slice.call(arguments);
    if (!(this instanceof FixedDate)) return new RealDate(RealDate.now() + shift).toString();
    return a.length ? new (Function.prototype.bind.apply(RealDate, [null].concat(a)))() : new RealDate(RealDate.now() + shift);
  }
  FixedDate.prototype = RealDate.prototype;
  FixedDate.now = function () { return RealDate.now() + shift; };
  FixedDate.parse = RealDate.parse;
  FixedDate.UTC = RealDate.UTC;
  window.Date = FixedDate;

  /* ---------- 2) 고정 응답 ---------- */
  var FIX = '/video/fixtures/';
  var Q_TVING = '티빙 안 보면 베이직80이 싸네. 실제로 티빙 얼마나 봐?';
  var Q_MESSAGE = '이 고객한테 보낼 안내 문자 써줘';
  // review: intent가 review인 요청. q: 질문 문장이 정확히 같을 때. wait: 응답까지 기다리는 시간(ms, speed 적용 전)
  var FIXTURES = [
    { user: 'U00603', intent: 'review', req: 'U00603-review.request.json', res: 'U00603-review.response.json', wait: 2400 },
    { user: 'U00603', q: Q_TVING, req: 'U00603-followup1.request.json', res: 'U00603-followup1.response.json', wait: 1500 },
    { user: 'U00603', q: Q_MESSAGE, req: 'U00603-message.request.json', res: 'U00603-message.response.json', wait: 2100 }
  ];
  var stopped = false;

  var realFetch = window.fetch.bind(window);
  window.fetch = async function (url, opts) {
    if (String(url).indexOf('/api/chat') !== 0) return realFetch(url, opts);
    var body = {};
    try { body = JSON.parse((opts && opts.body) || '{}'); } catch (e) { /* 무시 */ }
    var f = FIXTURES.filter(function (x) {
      return x.user === body.userId && (x.intent ? body.intent === x.intent : x.q === String(body.chatInput || '').trim());
    })[0];
    if (!f) {
      console.warn('[driver] 고정 응답 없음:', body.userId, body.intent, body.chatInput);
      return new Response(JSON.stringify({ output: '녹화용 고정 응답이 없는 질문입니다.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    // 기간이 고정 응답을 받을 때와 다르면 화면의 날짜와 보고서가 어긋납니다
    var saved = await realFetch(FIX + f.req).then(function (r) { return r.json(); });
    if (saved.startDate !== body.startDate || saved.endDate !== body.endDate)
      console.warn('[driver] 기간이 고정 응답과 다릅니다:', body.startDate + '~' + body.endDate, '≠', saved.startDate + '~' + saved.endDate);
    var text = await realFetch(FIX + f.res).then(function (r) { return r.text(); });
    await H.wait(f.wait);
    return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  /* ---------- 3·4) 녹화용 화면 정리와 전환 효과 ----------
     전환 효과는 #report에 잠깐 붙이는 클래스로 켭니다. 보고서는 조작할 때마다 통째로 다시 그려지므로, 클래스가 붙어 있는 동안만 움직입니다
       rec-reveal  보고서가 처음 나올 때 위에서부터 차례로 떠오름
       rec-pulse   가정을 바꿀 때 최저 카드·최저 태그에 테두리 물결, 청구액 숫자 강조
       rec-tab     탭을 바꿀 때 내용이 떠오름 */
  var css = '' +
    // 정리: 결론을 미리 말하는 카드 설명, 내부 도구 안내, 상담 ID, 이 고객에게 쓸 수 없는 결합 할인 선택
    '.pick .why, #custNote, #sid { display: none !important; }' +
    '.whatif .wi:has([data-w="tie"]:disabled) { display: none; }' +
    '.label, .who, .field-label { font-family: var(--font-body) !important; letter-spacing: 0 !important; font-size: 12px !important; }' +
    '.tabs { overflow-y: hidden; } #msg { overflow-y: hidden; }' +
    '@keyframes recIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }' +
    '@keyframes recFade { from { opacity: 0; } to { opacity: 1; } }' +
    '@keyframes recRing { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 45%, transparent); } 100% { box-shadow: 0 0 0 12px transparent; } }' +
    '@keyframes recInk { 0% { color: var(--accent); } }' +
    '#report .loading { animation: recFade .35s ease both; }' +
    '#report .empty { animation: recFade .4s ease both; }' +
    '.rec-reveal .rhead, .rec-reveal .kpi, .rec-reveal .notices, .rec-reveal .tabs, .rec-reveal .whatif, .rec-reveal .otable-wrap { animation: recIn .5s ease both; }' +
    '.rec-reveal .kpi:nth-child(2) { animation-delay: .1s; } .rec-reveal .kpi:nth-child(3) { animation-delay: .2s; }' +
    '.rec-reveal .notices { animation-delay: .28s; } .rec-reveal .tabs { animation-delay: .34s; }' +
    '.rec-reveal .whatif { animation-delay: .4s; } .rec-reveal .otable-wrap { animation-delay: .48s; }' +
    '.rec-pulse .kpi.hl, .rec-pulse .tag.best { animation: recRing 1s ease-out; }' +
    '.rec-pulse .kpi .v, .rec-pulse .otable td.final { animation: recInk 1.4s ease; }' +
    '.otable tr.detail td { animation: recFade .35s ease both; }' +
    '.rec-tab #tabBody { animation: recIn .45s ease both; }' +
    '#feed > .row { animation: recIn .35s ease both; }' +
    '#feed .suggest { animation: recFade .4s .2s ease both; }';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  // 페이지 스크립트가 처음 화면을 그린 뒤 문구를 영상에 맞춥니다
  document.addEventListener('DOMContentLoaded', function () {
    var brand = document.querySelector('.top .brand');
    if (brand) brand.innerHTML = '<span class="kt">KT</span>옵티';
    var sum = document.querySelector('#cands summary');
    if (sum) sum.textContent = '최적화 요청 고객 (4)';
    // 안내 문구의 "후보 고객"을 "요청 고객"으로 (왼쪽 패널, 첫 채팅 안내)
    [document.querySelector('.side'), document.getElementById('feed')].forEach(function (root) {
      if (!root) return;
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
      while ((n = w.nextNode())) if (n.nodeValue.indexOf('후보 고객') >= 0) n.nodeValue = n.nodeValue.replace(/후보 고객/g, '요청 고객');
    });
  });
  function flag(cls, ms) {
    var rep = document.getElementById('report');
    rep.classList.add(cls);
    setTimeout(function () { rep.classList.remove(cls); }, ms);
  }

  /* ---------- 5) 진행 ---------- */
  var $ = function (s) { return document.querySelector(s); };
  // flow.html 안이면 그 창의 시간축에 cue를 모읍니다
  var sink = null;
  try { if (window.parent !== window && window.parent.__rec) sink = window.parent.__rec; } catch (e) { /* 다른 출처 */ }
  var cues = [], t0 = 0, scene = '';
  window.__videoCues = cues;

  function log(action, el) {
    var c = { scene: scene, action: action };
    if (el) { var p = H.point(el); c.x = p.x; c.y = p.y; }
    if (sink) { sink.cue(c); return; }
    c.t = Math.round(performance.now() - t0);
    cues.push(c);
    console.log('[driver]', (c.t / 1000).toFixed(2) + 's', scene, action, el ? '(' + c.x + ',' + c.y + ')' : '');
  }
  function waitFor(fn, ms) {
    var end = performance.now() + (ms || 20000);
    return new Promise(function (resolve, reject) {
      (function poll() {
        if (stopped) return reject(new Error('중단'));
        var v = typeof fn === 'string' ? $(fn) : fn();
        if (v) return resolve(v);
        if (performance.now() > end) return reject(new Error('기다리다 시간 초과: ' + fn));
        setTimeout(poll, 50);
      })();
    });
  }
  // 커서를 옮겨 누릅니다
  async function tap(sel, action, fx, fy) {
    var el = await waitFor(sel);
    await H.moveToEl(el, fx, fy);
    log(action, el);
    await H.press();
    el.click();
    return el;
  }
  // 가정을 바꾸는 클릭: 바뀐 최저 카드·태그·청구액을 강조합니다
  async function toggle(sel, action) {
    var el = await waitFor(sel);
    await H.moveToEl(el);
    log(action, el);
    await H.press();
    flag('rec-pulse', 1500);
    el.click();
  }
  // 커서를 읽는 자리 근처로 옮겨 둡니다 (화면을 가리지 않게)
  async function rest(sel, fx, fy) { var el = await waitFor(sel); await H.moveToEl(el, fx, fy); }
  // 부드러운 스크롤 (가속 후 감속)
  function glide(el, to, ms) {
    return new Promise(function (resolve) {
      var from = el.scrollTop, d = Math.max(0, Math.min(to, el.scrollHeight - el.clientHeight)) - from, start = performance.now(), dur = ms * H.speed;
      if (!d) return resolve();
      H.frame(function step(now) {
        var k = Math.min(1, (now - start) / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        el.scrollTop = from + d * e;
        if (k < 1) H.frame(step); else resolve();
      });
    });
  }
  // 보고서 위에 커서를 두고 해당 요소가 위쪽에 오도록 스크롤합니다. sel이 없으면 맨 위로
  async function scrollReport(sel, action, ms) {
    var rep = $('#report'), el = sel ? await waitFor(sel) : null;
    var top = el ? el.getBoundingClientRect().top - rep.getBoundingClientRect().top + rep.scrollTop - 12 : 0;
    await H.moveToEl(rep, 0.62, 0.6);
    log(action);
    await glide(rep, top, ms || 1100);
  }
  // 채팅 입력창을 눌러 한글로 입력하고 Enter로 보냅니다 (문장이 고정 응답과 같아야 합니다)
  async function ask(text, action) {
    var msg = await waitFor(function () { var m = $('#msg'); return m && !m.disabled && m; });
    await H.moveToEl(msg, 0.3, 0.5);
    H.shape('text');
    log(action + ' 입력', msg);
    await H.press();
    msg.focus({ preventScroll: true });
    await H.act(250);
    await H.type(function (v) { msg.value = v; msg.dispatchEvent(new Event('input', { bubbles: true })); }, text);
    await H.act(450);
    log(action + ' Enter 전송');
    msg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    H.shape('arrow');
  }
  function answered() { return waitFor(function () { return !$('#feed .dots') && $('#feed > .row.ai:last-child .suggest'); }, 30000); }

  /* 장면 순서. H.wait(ms)는 화면을 보여 주는 시간입니다. TTS 길이에 맞춰 이 숫자나 speed 옵션을 고치면 됩니다 */
  var STEPS = [
    ['3', async function () { await H.wait(900); await rest('#customers', 0.5, 0.1); await H.wait(500); }],
    ['3', async function () { await tap(function () { var i = $('#customers input[value="U00603"]'); return i && i.closest('.pick'); }, '요청 고객 김수서 선택', 0.4, 0.5); await H.wait(1300); }],
    ['3', async function () { await tap('#presets [data-months="6"]', '기간 6개월'); await H.wait(900); }],
    ['3', async function () { flag('rec-reveal', 5200); await tap('#report [data-start]', '요금제 적정성 검토 시작'); }],
    ['4', async function () {
      log('로딩 스켈레톤');
      await rest('#report', 0.5, 0.9);
      await waitFor('#kpis'); log('보고서 표시: KPI 카드');
      await H.wait(800); await rest('#kpis .kpi.hl', 0.5, 1.15); await H.wait(2600);
    }],
    ['4', async function () { await scrollReport('#report .whatif', '선택지 표로 스크롤'); await H.wait(2400); }],
    ['4', async function () { await tap('#report .oname [data-row="OPT1"]', '베이직80 행 펼치기 (계산 근거)', 0.3, 0.5); await H.wait(3600); }],
    ['4', async function () { await tap('#report .oname [data-row="OPT1"]', '베이직80 행 접기', 0.3, 0.5); await H.wait(900); }],
    ['5', async function () { await toggle('#report [data-w="selective"][data-v="true"]', '선택약정 25% 적용'); await H.wait(3400); }],
    ['5', async function () { await toggle('#report [data-w="selective"][data-v="false"]', '선택약정 미적용으로 되돌림'); await H.wait(1200); }],
    ['5', async function () { await toggle('#report [data-keep="티빙"]', '티빙을 계속 쓸 유료 서비스에서 해제 → 베이직80 최저'); await H.wait(800); await rest('#kpis .kpi.hl', 0.5, 1.15); await H.wait(3400); }],
    ['5', async function () { await toggle('#report [data-wreset]', '보고서 값으로'); await H.wait(1700); }],
    ['6', async function () { await ask(Q_TVING, '질문: 티빙 실사용'); }],
    ['6', async function () { await answered(); log('답변 + 다음 추천 질문'); await rest('#report', 0.78, 0.86); await H.wait(4600); }],
    ['7', async function () { await scrollReport(null, '보고서 맨 위로', 800); flag('rec-tab', 900); await tap('#report [data-tab="usage"]', '사용량 탭'); await H.wait(3200); }],
    ['7', async function () { await scrollReport('#report .card.wide', '서비스별 사용으로 스크롤', 1400); await H.wait(3000); }],
    ['7', async function () {
      if (params.get('bundle') !== '1') return;
      await scrollReport(null, '보고서 맨 위로', 800); flag('rec-tab', 900); await tap('#report [data-tab="bundle"]', '가족결합 탭'); await H.wait(2600);
    }],
    ['7', async function () { await scrollReport(null, '보고서 맨 위로', 900); flag('rec-tab', 900); await tap('#report [data-tab="options"]', '선택지 비교 탭으로'); await H.wait(900); }],
    // 마지막 질문: 고객에게 보낼 문자 초안. 긴 답은 채팅 안에서 천천히 내려 읽힙니다
    ['7', async function () { await ask(Q_MESSAGE, '질문: 고객 안내 문자'); }],
    ['7', async function () {
      await answered(); log('문자 초안 답변');
      var feed = $('#feed'), row = $('#feed > .row.ai:last-child');
      await rest('#report', 0.78, 0.86);
      await H.wait(1200);
      await glide(feed, row.offsetTop - feed.offsetTop - 8, 900);
      await H.wait(1200);
      await glide(feed, feed.scrollHeight, 5200);
      await H.wait(2200);
    }],
    ['7', async function () { if (params.get('ops') === '1') await tap('#ops', '운영 대시보드로 이동'); }]
  ];

  async function play() {
    t0 = performance.now();
    console.log('[driver] 시작 · speed', H.speed, '· type', H.typeRate);
    try {
      for (var i = 0; i < STEPS.length; i++) {
        if (stopped) throw new Error('중단');
        scene = 'Scene ' + STEPS[i][0];
        await STEPS[i][1]();
      }
      scene = 'Scene 7'; log('제품 화면 끝');
    } catch (e) {
      console.error('[driver] 멈춤:', e.message);
    }
    if (!sink) console.log('[driver] cue (Alt+C로 복사):\n' + JSON.stringify(cues));
    if (window.parent !== window) window.parent.postMessage({ type: 'rec-done', from: 'opti' }, location.origin);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { stopped = true; }
    else if (e.altKey && (e.key === 'c' || e.key === 'C')) {
      navigator.clipboard.writeText(JSON.stringify({ devicePixelRatio: window.devicePixelRatio, cues: sink ? sink.cues : cues }, null, 1))
        .then(function () { console.log('[driver] cue 복사됨'); });
    }
  });

  var mode = params.get('play');
  if (mode === '1') {
    window.addEventListener('load', function () { document.fonts.ready.then(play); });
  } else if (mode === 'wait') {
    window.addEventListener('message', function on(e) {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'rec-start') return;
      window.removeEventListener('message', on);
      play();
    });
  }
})();
