# AdonisJS 학습 저장소

AdonisJS v7·Node.js 24에서 SQLite 로그인 게시판을 만들고 문서 AI 작업실로 확장한다. 두 앱은 각자 설치하고 실행할 수 있다. [Notion 학습 문서](https://app.notion.com/p/41fd7dec5e2e81b1a18fcf3a82d793d4)

| 앱 | 학습 범위 | 기능 | 기본 주소 |
| --- | --- | --- | --- |
| [demo/](demo/) | study0~10, studyMidpoint | Edge 로그인 게시판, 글·댓글 CRUD, 작성자 권한, API v1 | [localhost:3333](http://localhost:3333/board) |
| [project/](project/) | study11~18, studyFinal | 게시판, DB 선택, 문서 업로드·AI·MCP, 실시간 알림, 외부 연동, Docker·CI/CD | [localhost:3334](http://localhost:3334/workbench) |

## 실행

저장소 루트를 연 PowerShell에서 원하는 앱의 명령을 실행한다. 각 앱의 `.env`를 처음 만들 때 설정과 키를 생성한다. 이미 파일이 있다면 복사와 키 생성은 건너뛴다.

### 중간 게시판

```powershell
cd demo
npm ci
Copy-Item .env.example .env
node ace generate:key
node ace migration:run
npm run dev
```

### 심화 완성본

```powershell
cd project
npm ci
Copy-Item .env.example .env
node ace generate:key
node ace migration:run
npm run dev
```

두 앱의 환경 파일과 SQLite DB는 앱 폴더 안에 각각 저장된다. 게시판의 `/signup`·`/login`은 웹 세션을, `/api/auth/login`은 1시간 Bearer 토큰을 쓴다. 완성본의 [Swagger UI](http://localhost:3334/api-docs)에서 [OpenAPI v1 계약](project/contracts/openapi.json)을 확인한다. 프로젝트 기본 AI는 mock이며 외부 연동은 [예제 환경 파일](project/.env.example)에서 설정한다.

분리 전에 만든 `demo/tmp/db.sqlite3`의 데이터와 마이그레이션 기록은 그대로 사용할 수 있다. 새 중간 앱 DB에는 게시판에 필요한 테이블만 생성된다.

## 학습 순서

- 기초 · [study0](study0.md) → [study1](study1.md) → [study2](study2.md) → [study3](study3.md) → [study4](study4.md) → [study5](study5.md) → [study6](study6.md) → [study7](study7.md) → [study8](study8.md) → [study9](study9.md) → [study10](study10.md)
- 중간 응용 · [studyMidpoint](studyMidpoint.md)
- 심화 · [study11](study11.md) → [study12](study12.md) → [study13](study13.md) → [study14](study14.md) → [study15](study15.md) → [study16](study16.md) → [study17](study17.md) → [study18](study18.md)
- 최종 응용 · [studyFinal](studyFinal.md)

원문의 11개 체크 항목은 [study0](study0.md), [study1](study1.md), [study2](study2.md), [study5](study5.md), [study6](study6.md), [study7](study7.md), [study9](study9.md)에 옮겼다.

## 검증

두 앱의 폴더에서 각각 실행한다.

```powershell
npm run lint
npm run build
npm test
```

서버가 실행 중일 때 해당 앱에서 `npm run test:smoke`를 실행한다. `demo`는 세션·CSRF·폼 검증·등록·상세를, `project`는 세션·문서 업로드·WebSocket·SSE·Swagger를 검증한다. `BOARD_URL`로 대상 주소를 바꿀 수 있다. `project/`에서 `node mcp/client.mjs Edge`로 MCP 검색을 실행한다.

| 범위 | 검증 |
| --- | --- |
| 두 앱 | 린트·TypeScript/Vite 빌드·Japa·HTTP 스모크 테스트 |
| 완성본의 PostgreSQL·MariaDB | Japa와 Docker Compose·백업 복원 |
| 완성본의 MongoDB·Mailpit | 사용자별 초안 저장·조회, 메일 예약 중복 방지·수신 |
| 완성본의 Stripe·GitHub OAuth | 로컬 웹훅 서명 검증과 영수증 중복 방지, OAuth 리다이렉트·state 확인 |
| 완성본의 AI·MCP | 대역 SSE, 발췌·기록 격리, stdio 도구 목록·글 검색 |

실제 Stripe 결제, GitHub OAuth 콜백, Anthropic/Ollama 실모델 응답과 외부 호스트 배포는 실제 환경에서 확인한다.

## 컨테이너

`project/.env`를 준비한 뒤 루트에서 완성본 이미지를 빌드한다. Compose가 PostgreSQL과 마이그레이션을 실행한다.

```powershell
docker build -t adonis-study:local project
docker compose up -d --wait --pull never
curl.exe http://localhost:3360/health
```

CI는 두 앱을 검증한 뒤 `project/`를 GHCR 이미지로 발행한다. 운영 HTTPS·메일 워커·외부 배포와 백업 복원은 [study16](study16.md)을 따른다.
