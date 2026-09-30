// 정적 페이지 하나를 서빙하는 최소 서버 (의존성 없음). Railway는 PORT를 주입합니다.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DEFAULT_CHAT_URL = 'https://yuno-da.app.n8n.cloud/webhook/3cee75b8-cd0d-40cf-b3d6-fd8da945b7ad/chat';

// CHAT_URL 환경 변수가 있으면 HTML 안의 n8n 주소를 바꿔서 내보냅니다.
let html = fs.readFileSync(path.join(__dirname, 'kt-chat-connected.html'), 'utf8');
if (process.env.CHAT_URL) html = html.split(DEFAULT_CHAT_URL).join(process.env.CHAT_URL);

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
  } else if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
  } else if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : html);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
  }
}).listen(PORT, () => console.log(`listening on ${PORT}`));
