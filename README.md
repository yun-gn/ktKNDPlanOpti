# ktKNDPlanOpti

KT 요금제 상담 직원용 화면입니다. 고객 한 명의 요금제를 검토하는 **상담** 화면과 고객 전체를 집계해 보는 **운영 대시보드**로 이루어져 있고, 분석은 n8n 워크플로우 `요금제 개인화 워크플로우`가 합니다.

```
브라우저 ── index.html (상담) ── /api/chat ── server.js ── n8n JSON Webhook ── 요금제 검토 / 후속 질문
         └─ operation-dashboard.html (운영) ───────────────── n8n dashbord Webhook (브라우저가 직접 호출)
```

## 파일

| 파일 | 역할 |
|---|---|
| `index.html` | 상담 화면. 고객 선택, 분석 기간, 채팅, 추천 질문 |
| `operation-dashboard.html` | 운영 대시보드. 집계·가명 데이터를 OPS 쿼리로 조회 |
| `server.js` | 두 페이지를 제공하고 `/api/chat`을 n8n으로 전달합니다 (의존성 없음) |
| `package.json`, `railway.json` | `npm start`로 실행. Railway가 같은 명령으로 배포합니다 |
| `kt-chat-connected.html` | 예전 발표용 데모 (현재 사용하지 않음) |

## 실행

```bash
npm start
```

`http://localhost:3000`에서 상담 화면이, `/operation-dashboard.html`에서 운영 대시보드가 열립니다. `file://`로 직접 열면 `/api/chat`이 없어 답변을 받지 못합니다.

| 환경 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3000` | Railway가 넣어 줍니다 |
| `CHAT_URL` | n8n `Recommendation Webhook1` (JSON) | 상담 화면이 실제로 쓰는 주소 |
| `CHAT_STREAM_URL` | n8n `Webhook (stream)1` | `/api/chat?stream=1`용. 현재 화면은 쓰지 않습니다 (아래 참고) |
| `CHAT_AUTH` | 없음 | n8n Webhook에 인증을 켰을 때의 `Authorization` 헤더 값 |

`server.js`는 시작할 때 두 HTML을 읽어 둡니다. HTML을 고친 뒤에는 서버를 다시 시작하세요.

## 상담 화면 (`index.html`)

1. **고객 선택**: 고객 ID(`U` + 숫자 5자리)를 입력하고 확인하거나, 후보 고객 카드 4장(적정 유지 / 업셀 / 다운셀 / 결합 후보) 중 하나를 누릅니다. 카드는 ID를 채우고 바로 확인합니다. 후보 고객 4명은 왼쪽 패널에 2026-10-02에 조회한 정보를 보여 주고, 그 밖의 ID는 ID만 표시합니다.
2. **분석 기간**: 1·3·6·12개월 버튼이나 날짜로 정합니다 (데이터는 2025-10-24부터). 고객을 확인해야 켜집니다.
3. **질문**: 첫 질문은 요금제 검토 보고서를 만들고, 이어지는 질문은 그 보고서를 바탕으로 답합니다.
4. **추천 질문**: 답변 아래에 다음 질문 버튼이 붙습니다. 보고서의 값(현재 혜택, 최대 사용량, 선택지, 분석 제외 월, 주의점, 참고 최적화 결과와 표의 불일치)에서 규칙으로 만들고, n8n이 답변 끝에 ` ```suggestions ` 블록(한 줄에 질문 하나)을 보내면 그것을 우선합니다.
5. **운영** 버튼은 같은 탭에서 운영 대시보드로 이동합니다. 이 페이지를 떠나면 화면의 대화는 사라집니다.

n8n으로 보내는 요청 본문:

```json
{ "action": "sendMessage", "sessionId": "<고객별 상담 ID>", "chatInput": "...", "userMessage": "...",
  "userId": "U00603", "startDate": "2026-04-06", "endDate": "2026-10-06", "intent": "" }
```

- `sessionId`는 고객마다 따로 만들고, **새 대화**를 누르면 새로 만듭니다.
- `intent`는 "이 고객의 요금제가 적정한지 검토해줘" 시작 버튼만 `review`이고 나머지는 비워 둡니다. 비어 있으면 n8n이 저장된 분석이 있는지로 판단합니다.

## n8n 워크플로우

`요금제 개인화 워크플로우`의 상담 흐름:

```
Recommendation Webhook1 / Webhook (stream)1
  → Normalize Request1          (userId·기간 검증, sessionId·intent 보존)
  → Find Saved Analysis         (Data Table analysis_cache: 같은 sessionId·같은 기간)
  → Decide Route → Follow-up?
      ├─ 후속 질문 → Follow-up Agent → Respond to Webhook1
      └─ 새 분석   → Collect Required Evidence1 → … → Compose Review Output
                        ├→ Respond to Webhook1
                        └→ Prepare Cache Row → Save Analysis (analysis_cache)
```

- **새 분석**이 되는 경우: 그 상담의 첫 질문, 분석 기간을 바꾼 뒤의 질문, `intent: "review"`, 새 대화.
- **Follow-up Agent**는 도구 없이 저장된 분석(보고서와 월별·서비스별·콘텐츠별 사용량, 선택지 데이터)과 이전 대화만으로 답합니다. 분석에 없는 값은 지어내지 않고 없다고 답합니다. 답변 하나에 Gemini 호출 한 번, 2초 안팎입니다.
- **기간 제한**: 달력 기준 최대 13개월까지 받습니다 (완전한 12개월 + 진행 중인 이번 달). 이번 달은 분석에서 빠집니다.
- **스트리밍을 쓰지 않는 이유**: 보고서를 보내는 `Respond to Webhook1`(v1.4)은 스트리밍 응답에 쓰지 못합니다. 스트리밍으로 받으면 보고서 대신 중간 Agent의 JSON만 옵니다. 그래서 화면은 `stream: false`로 JSON Webhook을 씁니다. 검토는 10초 안팎이라 n8n Cloud의 약 100초 제한에 걸리지 않습니다.

## 운영 대시보드 (`operation-dashboard.html`)

n8n `dashbord` Webhook에 `{ query_id, parameters }`를 POST해 OPS 쿼리 결과(`{ ok, query_id, rows }`)를 받습니다. 브라우저가 n8n을 직접 부르며, Webhook에 `allowedOrigins: *`가 설정돼 있습니다. 오른쪽 위 **상담** 버튼으로 상담 화면에 돌아갑니다.

## 2026-10-06 변경 내역

- 상담 화면: 고객 ID 입력 단계를 넣고, 후보 고객 카드 4장을 설명과 함께 되살렸습니다. 스트리밍·마케팅 토글을 없앴습니다.
- 추천 질문 버튼을 추가했습니다.
- n8n: 모든 질문이 전체 분석을 다시 돌리던 것을, 저장된 분석을 다시 쓰는 후속 질문 경로로 나눴습니다 (`analysis_cache`, `Follow-up Agent`).
- 보고서 대신 JSON이 보이던 문제를 고쳤습니다: 화면을 JSON 응답으로 되돌렸습니다.
- 12개월 기간이 항상 실패하던 문제를 고쳤습니다 (13개월까지 허용).
- 운영 대시보드를 저장소에 넣고 상담 화면과 서로 오가게 연결했습니다.

## 알려진 제한과 남은 일

- 후속 질문은 저장된 분석에 있는 값만 답합니다. 최근 7일·30일 사용량, 할인·결합 상태처럼 분석에 없는 값은 "분석에 없다"고 답합니다. 조회가 필요하면 별도 단계로 추가해야 합니다.
- 분석은 상담(sessionId)별로 저장됩니다. 같은 고객·같은 기간이라도 새 대화에서는 다시 분석합니다.
- 데이터가 2025-10-24부터라 12개월 분석의 2025-10은 실제로는 일부만 있는 달인데, 보고서는 완전한 달로 셉니다 (분석 파이프라인에서 확인 필요).
- 추천 질문 버튼에 마우스를 올리면 보이는 "근거 조회: PERS_…"는 데이터 출처를 가리킬 뿐, 후속 질문이 그 쿼리를 실행하지는 않습니다.
- 사용하지 않는 n8n 테스트 자료: `요금제 개인화 · 후속 질문 라우팅 (테스트)`, `요금제 개인화 · 카탈로그 쿼리 실행 (Tool)` 워크플로우(둘 다 비활성), `analysis_cache`의 테스트 행 몇 개. 정리해도 됩니다.
