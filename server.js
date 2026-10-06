// 정적 페이지 서빙 + n8n 채팅 프록시 (의존성 없음). Railway는 PORT를 주입합니다.
// 브라우저는 /api/chat만 호출하고, 실제 n8n 주소는 CHAT_URL / CHAT_STREAM_URL 환경 변수로만 존재합니다.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
// 한 번에 JSON({reply})으로 답하는 Webhook
const CHAT_URL = process.env.CHAT_URL || 'https://yuno-da.app.n8n.cloud/webhook/e23f1ef5-3711-4e17-ba3b-864d19a1c525';
// 생성 중인 답을 줄 단위 JSON으로 흘려보내는 Webhook (/api/chat?stream=1)
const CHAT_STREAM_URL = process.env.CHAT_STREAM_URL || 'https://yuno-da.app.n8n.cloud/webhook/2e5e385a-f064-4be6-9a2a-2bfb7068610b';
const CHAT_AUTH = process.env.CHAT_AUTH; // 선택: n8n Webhook에 인증을 켰을 때의 Authorization 헤더 값
const TIMEOUT_MS = 130000;               // 페이지의 timeoutMs(120초)보다 약간 길게. n8n Cloud도 약 100초면 끊습니다
const STREAM_TIMEOUT_MS = 610000;        // 페이지의 streamTimeoutMs(600초)보다 약간 길게
const MAX_BODY = 64 * 1024;

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
// 운영 대시보드: 상담 화면의 운영 버튼과 서로 오갑니다. n8n 운영 Webhook은 브라우저가 직접 부릅니다
const opsHtml = fs.readFileSync(path.join(__dirname, 'operation-dashboard.html'), 'utf8');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function proxyChat(req, res, stream) {
  // 브라우저가 연결을 끊으면 n8n 쪽 요청도 멈춥니다
  const ctrl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctrl.abort(); });
  try {
    const body = await readBody(req);
    const headers = { 'Content-Type': 'application/json' };
    if (CHAT_AUTH) headers.Authorization = CHAT_AUTH;
    const signal = AbortSignal.any([ctrl.signal, AbortSignal.timeout(stream ? STREAM_TIMEOUT_MS : TIMEOUT_MS)]);
    const upstream = await fetch(stream ? CHAT_STREAM_URL : CHAT_URL, { method: 'POST', headers, body, signal });
    const type = upstream.headers.get('content-type') || 'text/plain; charset=utf-8';
    if (!stream) {
      res.writeHead(upstream.status, { 'Content-Type': type });
      res.end(await upstream.text());
      return;
    }
    // 받은 조각을 그대로 바로 넘깁니다 (프록시가 모아 두지 않도록 버퍼링 끔)
    res.writeHead(upstream.status, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
    for await (const chunk of upstream.body) res.write(chunk);
    res.end();
  } catch (e) {
    if (ctrl.signal.aborted) return; // 브라우저가 먼저 끊음
    const status = e.status || (e.name === 'TimeoutError' ? 504 : 502);
    console.error('proxy error:', e.message);
    if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'text/plain' });
    res.end(res.headersSent && stream ? '\n{"type":"error","content":"upstream error"}\n' : 'upstream error');
  }
}

http.createServer((req, res) => {
  const [url, query = ''] = req.url.split('?');
  if (url === '/api/chat') {
    if (req.method === 'POST') return proxyChat(req, res, new URLSearchParams(query).get('stream') === '1');
    return res.writeHead(405).end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
  } else if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : html);
  } else if (url === '/operation-dashboard.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : opsHtml);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
  }
}).listen(PORT, () => console.log(`listening on ${PORT}`));
