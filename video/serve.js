// 영상 녹화용 정적 서버 (의존성 없음). n8n에는 연결하지 않습니다.
// index.html은 그대로 두고 <head> 맨 앞에 human.js(사람 같은 입력·커서)와 driver.js만 끼워 넣습니다. driver.js가 날짜를 고정하고 /api/chat을 고정 응답으로 대신합니다.
//   npm run video  →  http://localhost:4000/?play=1
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.VIDEO_PORT || 4000;
const ROOT = path.join(__dirname, '..');
const VIDEO = __dirname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}

http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); } catch (e) { return send(res, 400, 'text/plain', 'bad url'); }
  if (url === '/api/chat') return send(res, 503, 'text/plain; charset=utf-8', '녹화 서버는 n8n에 연결하지 않습니다 (driver.js 고정 응답을 씁니다)');
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain', 'method not allowed');
  if (url === '/' || url === '/index.html') {
    // 요청마다 다시 읽어 index.html 수정이 바로 반영되게 합니다
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace('<head>', '<head>\n<script src="/video/human.js"></script>\n<script src="/video/driver.js"></script>');
    return send(res, 200, TYPES['.html'], html);
  }
  if (url === '/operation-dashboard.html') return send(res, 200, TYPES['.html'], fs.readFileSync(path.join(ROOT, 'operation-dashboard.html')));
  if (url.startsWith('/video/')) {
    const file = path.resolve(VIDEO, '.' + url.slice('/video'.length));
    if (!file.startsWith(VIDEO + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'text/plain', 'not found');
    return send(res, 200, TYPES[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
  }
  send(res, 404, 'text/plain', 'not found');
}).listen(PORT, () => {
  console.log('녹화 서버: http://localhost:' + PORT);
  console.log('  Scene 3-7 단독:      http://localhost:' + PORT + '/?play=1');
  console.log('  Scene 1-8 전체 흐름: http://localhost:' + PORT + '/video/flow.html');
  console.log('  Scene 8 단독:        http://localhost:' + PORT + '/video/scene8-send.html?play=1');
});
