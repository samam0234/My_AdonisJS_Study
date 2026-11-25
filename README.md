# AdonisJS 학습 저장소

AdonisJS v7·Node.js 24를 사용해 Edge 로그인 게시판과 문서 AI 작업실을 만든다. 학습 문서와 실행 가능한 코드가 같은 저장소에 있다. [Notion 학습 페이지](https://app.notion.com/p/41fd7dec5e2e81b1a18fcf3a82d793d4)

## 실행

Windows PowerShell에서 실행한다. 기존 `.env`가 있다면 복사 및 앱 키 생성은 처음 한 번만 한다.

```powershell
cd demo
npm ci
Copy-Item .env.example .env
node ace generate:key
node ace migration:run
npm run dev
```

- [첫 화면](http://localhost:3333) · [게시판](http://localhost:3333/board) · [AI 작업실](http://localhost:3333/workbench)
- [API v1 Swagger](http://localhost:3333/api-docs) · [OpenAPI 3.0 계약](demo/contracts/openapi.json)
- `/signup`과 `/login`은 웹 세션, `/api/auth/login`은 1시간 Bearer 토큰을 사용한다.
- 로컬 기본 DB는 SQLite이며 AI 제공자는 mock이다. 선택 기능의 서버 환경 키는 [예제 환경 파일](demo/.env.example)에 있다.

## 학습 순서

- 기초 · [study0](study0.md) → [study1](study1.md) → [study2](study2.md) → [study3](study3.md) → [study4](study4.md) → [study5](study5.md) → [study6](study6.md) → [study7](study7.md) → [study8](study8.md) → [study9](study9.md) → [study10](study10.md)
- 중간 응용 · [studyMidpoint](studyMidpoint.md)
- 심화 · [study11](study11.md) → [study12](study12.md) → [study13](study13.md) → [study14](study14.md) → [study15](study15.md) → [study16](study16.md) → [study17](study17.md) → [study18](study18.md)
- 최종 응용 · [studyFinal](studyFinal.md)

## 검증

```powershell
cd demo
npm run lint
npm run build
npm test
```

개발 서버를 띄운 다음 다른 터미널에서 `npm run test:smoke`를 실행해 세션·CSRF·문서 업로드·WebSocket·SSE·Swagger를 검증한다. `BOARD_URL`로 서버 주소를 바꿀 수 있다. `node mcp/client.mjs Edge`로 MCP 로컬 서버의 도구 목록과 검색 결과를 확인한다.

### 실행 기록

| 범위 | 결과 |
| --- | --- |
| 린트·TypeScript/Vite 빌드 | 통과 |
| SQLite·MariaDB 11.4·PostgreSQL 17 | 엔진별 Japa 5개 통과 |
| Docker Compose·PostgreSQL 백업 | 마이그레이션과 HTTP 스모크 테스트 통과. 별도 DB에 글과 결제 영수증 복원 확인 |
| MongoDB 8·Mailpit | 사용자 초안 저장·조회, 예약 중복 방지, 메일 1건 수신 |
| Stripe·GitHub OAuth | 로컬 서명 웹훅 재전송에서 영수증 1건, OAuth 리다이렉트 및 잘못된 state 거부 |
| 문서 AI·MCP | 대역 SSE·발췌·기록 격리, stdio 도구 목록·글 검색 검증 |

실계정 Stripe 결제와 GitHub OAuth 콜백, Anthropic/Ollama 실모델 응답, 외부 호스트 배포는 실제 환경에서 검증한다.

## 컨테이너

루트에서 PostgreSQL과 앱 이미지를 실행한다. Compose가 DB 준비 이후 마이그레이션을 실행한다.

```powershell
docker build -t adonis-study:local demo
docker compose up -d --wait --pull never
curl.exe http://localhost:3360/health
```

운영 HTTPS·메일 워커·이미지 배포와 백업 복원은 [study16](study16.md)을 따른다. 실제 모델·결제·OAuth는 각각의 계정 설정이 필요하다.

## Notion 체크리스트 반영

원문의 11개 체크 항목을 [study0](study0.md), [study1](study1.md), [study2](study2.md), [study5](study5.md), [study6](study6.md), [study7](study7.md), [study9](study9.md)에 원문대로 옮겼다. 문서의 학습 체크박스는 직접 학습할 때 체크할 수 있도록 비워 두었다.
