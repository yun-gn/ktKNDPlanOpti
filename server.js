// 정적 페이지 서빙 + n8n 채팅 프록시 (의존성 없음). Railway는 PORT를 주입합니다.
// 브라우저는 /api/chat만 호출하고, 실제 n8n 주소는 CHAT_URL 환경 변수로만 존재합니다.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const CHAT_URL = process.env.CHAT_URL || 'https://yuno-da.app.n8n.cloud/webhook/e23f1ef5-3711-4e17-ba3b-864d19a1c525';
const CHAT_AUTH = process.env.CHAT_AUTH; // 선택: n8n 채팅 트리거에 인증을 켰을 때의 Authorization 헤더 값
const TIMEOUT_MS = 130000;               // 페이지의 timeoutMs(120초)보다 약간 길게
const MAX_BODY = 64 * 1024;

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

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

async function proxyChat(req, res) {
  try {
    const body = await readBody(req);
    const headers = { 'Content-Type': 'application/json' };
    if (CHAT_AUTH) headers.Authorization = CHAT_AUTH;
    const upstream = await fetch(CHAT_URL, { method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8' });
    res.end(await upstream.text());
  } catch (e) {
    const status = e.status || (e.name === 'TimeoutError' ? 504 : 502);
    console.error('proxy error:', e.message);
    res.writeHead(status, { 'Content-Type': 'text/plain' }).end('upstream error');
  }
}

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/chat') {
    if (req.method === 'POST') return proxyChat(req, res);
    return res.writeHead(405).end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
  } else if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : html);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
  }
}).listen(PORT, () => console.log(`listening on ${PORT}`));
