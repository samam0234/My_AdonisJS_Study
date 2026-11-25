# studyFinal · 최종 응용 · 게시판과 문서 AI 작업실

## ① 목표

로그인 게시판을 PostgreSQL·외부 서비스·AI·자동 배포가 포함된 서비스로 완성한다.

## ② 📖 이론

기능은 게시글·댓글 CRUD, 권한 검사, 문서 업로드와 발췌 기반 답변, 개인 질문 기록, Mongo 초안, 공개 변경 알림, 테스트 결제·메일·OAuth다. 서버의 경계는 화면·API·작업·외부 자격 증명으로 나뉜다. 공통 API는 사용자와 호출 환경이 바뀌어도 같은 입력·출력 계약을 사용한다.

[공식·원문 참고](https://app.notion.com/p/41fd7dec5e2e81b1a18fcf3a82d793d4)

## ③ 🛠️ 실기

구현 순서는 ① midpoint 게시판과 테스트 준비 ② PostgreSQL 환경으로 바꾸고 새 DB 마이그레이션 ③ SMTP·Stripe 테스트 키·GitHub OAuth 연결 ④ 문서 업로드·검색·AI 기록 및 MCP 실행 ⑤ Docker 이미지와 GitHub Actions 배포 구성 ⑥ API, 보안, 백업 복원 점검이다. 환경별 시크릿은 [study16](study16.md), API·AI 요청은 [study14](study14.md)와 [study18](study18.md)을 따른다.

1. 릴리스 점검을 완료하면 [README](README.md)의 검증 명령으로 재현할 수 있다.
2. Notion 원문 체크를 모두 번호별 문서에 반영했다. 비교하며 학습하기와 다른 프레임워크 예제를 옮겨 나란히 두는 활동은 사용자 지정 범위에 따라 이번 실습에서 제외했다.

### [`demo/app/services/ai_chat.ts`](demo/app/services/ai_chat.ts)

```ts
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import Post from '#models/post'
import { ApiError } from '#services/board_contract'
import { evidencePrompt, excerpts, noEvidence, systemPrompt } from '#services/ai_context'
import { modelParts, type Part } from '#services/ai_provider'

export async function prepareChat(
  userId: number,
  postId: number,
  question: string,
  generate = modelParts
) {
  const post = await Post.findOrFail(postId)
  const sources = excerpts(post.body, question)
  const prompt = evidencePrompt(question, sources)
  const day = new Date().toISOString().slice(0, 10)
  const reservation = sources.length ? Buffer.byteLength(prompt + systemPrompt) + 768 : 1
  const limit = env.get('AI_DAILY_TOKEN_LIMIT') ?? 12_000
  const reserved = await db.transaction(async (trx) => {
    await trx
      .table('ai_budgets')
      .insert({ user_id: userId, day })
      .onConflict(['user_id', 'day'])
      .ignore()
    return trx
      .from('ai_budgets')
      .where({ user_id: userId, day })
      .where('reserved_tokens', '<=', limit - reservation)
      .increment('reserved_tokens', reservation)
  })
  if (!reserved) throw new ApiError(429, 'AI_QUOTA_EXCEEDED', '오늘의 AI 사용량 한도를 넘겼습니다.')

  return {
    sources,
    async *run(signal: AbortSignal) {
      let answer = ''
      const usage: Part = {}
      const parts: AsyncIterable<Part> | Part[] = sources.length
        ? generate(systemPrompt, prompt, signal)
        : [{ text: noEvidence }]
      for await (const part of parts) {
        if (part.inputTokens !== undefined) usage.inputTokens = part.inputTokens
        if (part.outputTokens !== undefined) usage.outputTokens = part.outputTokens
        if (!part.text) continue
        answer += part.text
        if (answer.length > 6000) throw new Error('Model output too large')
        yield part.text
      }
      await db.table('ai_histories').insert({
        user_id: userId,
        post_id: postId,
        question,
        answer,
        sources_json: JSON.stringify(sources),
        input_tokens: usage.inputTokens ?? null,
        output_tokens: usage.outputTokens ?? null,
      })
    },
  }
}
```

소스의 첫 줄을 1행으로 센다.

- 1–7행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 8–16행 문서를 조회하고 질문에 쓸 인용 근거와 모델 입력을 구성한다.
- 17–33행 사용자와 UTC 날짜별로 예상 토큰을 조건부 DB 증가시킨다.
- 34–41행 발췌를 반환하고 async iterator로 답변을 전달할 준비를 한다.
- 42–49행 출력과 사용량을 모으고 크기를 제한하며 부분 문자열을 내보낸다.
- 50–61행 완료된 답변, 발췌 번호, 토큰 수를 사용자별 히스토리로 저장한다.

### [`demo/Dockerfile`](demo/Dockerfile)

```dockerfile
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
ENV npm_config_nodedir=/usr/local
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3333
COPY --from=build --chown=node:node /app/build/ ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
RUN mkdir -p tmp && chown node:node tmp
USER node
EXPOSE 3333
CMD ["node", "bin/server.js"]
```

소스의 첫 줄을 1행으로 센다.

- 1–4행 빌드 전용 베이스에 SQLite 네이티브 빌드 도구를 설치한다.
- 5–8행 잠금 파일로 의존성을 설치한 후 소스와 자산을 빌드한다.
- 9–10행 운영에 불필요한 devDependencies를 빌드 결과에서 제거한다.
- 11–19행 런타임 이미지에는 빌드와 운영 의존성을 복사하고 비루트 사용자로 시작한다.

### [`compose.yaml`](compose.yaml)

```yaml
name: adonis-study
x-app: &app
  image: ${APP_IMAGE:-adonis-study:local}
  env_file: demo/.env
  environment:
    NODE_ENV: production
    HOST: 0.0.0.0
    PORT: 3333
    APP_URL: ${PUBLIC_URL:-http://localhost:3360}
    DB_CONNECTION: pg
    DB_HOST: db
    DB_PORT: 5432
    DB_DATABASE: adonis
    DB_USER: adonis
    DB_PASSWORD: ${POSTGRES_PASSWORD:-adonis-local-only}
    DB_SSL: 'false'
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: adonis
      POSTGRES_USER: adonis
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-adonis-local-only}
    volumes: [pg-data:/var/lib/postgresql/data]
    healthcheck:
      test: [CMD-SHELL, 'pg_isready -U adonis -d adonis']
      interval: 3s
      timeout: 3s
      retries: 15
  migrate:
    <<: *app
    command: [node, ace, 'migration:run', --force]
    depends_on:
      db:
        condition: service_healthy
  web:
    <<: *app
    depends_on:
      migrate:
        condition: service_completed_successfully
    ports: ['127.0.0.1:3360:3333']
    healthcheck:
      test: [CMD, node, -e, "fetch('http://127.0.0.1:3333/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 4s
      retries: 5
    restart: unless-stopped
  mail-worker:
    <<: *app
    profiles: [mail]
    command: [node, ace, 'mail:work', --watch]
    depends_on:
      migrate:
        condition: service_completed_successfully
    restart: unless-stopped
volumes:
  pg-data:
```

소스의 첫 줄을 1행으로 센다.

- 1–16행 로컬 Docker 리소스 이름과 공통 운영 환경을 정의한다.
- 17–23행 PostgreSQL 볼륨과 준비 확인을 구성한다.
- 24–29행 DB 데이터를 컨테이너 교체 이후에도 보존한다.
- 30–35행 DB가 준비되면 운영 마이그레이션을 한 번 실행한다.
- 36–47행 마이그레이션 성공 이후 앱을 띄우고 헬스를 확인한다.
- 48–57행 메일 프로필을 켤 때 처리 워커가 별도 프로세스로 실행된다.

## ④ 🔗 연동 포인트

구성도

    Edge/Alpine ↔ AdonisJS → Lucid → PostgreSQL
    브라우저 ← WebSocket 알림 · SSE 답변 → AdonisJS → Anthropic/Ollama
    MCP 클라이언트 → stdio 서버 → AdonisJS 공개 API
    Stripe → 서명 웹훅 → 결제 영수증 / 워커 → SMTP
    GitHub Actions → GHCR SHA 이미지 → Docker Compose

최종 회고는 데이터 저장소 교체 뒤 유지된 API 계약, 웹 세션과 Bearer의 인증 경계, 외부 계정 점검과 로컬에서 재현한 범위를 기록한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 배포는 성공했지만 DB 쓰기 실패 | 연결 또는 스키마 권한 누락 | migrate 로그와 같은 앱 계정으로 연결을 검증한다. |
| AI 응답 근거가 부족함 | 원문에 질문 키워드 없음 | 충분한 원문을 등록한 뒤 요약과 질문을 구분한다. |
| 보안 점검 실패 | 테스트 토큰이 운영 값과 섞임 | 환경별 비밀을 분리하고 시크릿이 번들에 없는지 확인한다. |

## ⑥ 직접 해보기

1. Docker 실행에서 회원가입부터 문서 업로드·근거 답변까지 실행한다.
2. 다른 사용자 권한, CSRF 누락, 미인증 API 요청을 확인한다.
3. 백업을 새 DB에 복원하고 기록과 통계를 비교한다.

## ⑦ ☐ 체크리스트

- [ ] PostgreSQL·HTTPS·시크릿·수명·백업 복원 확인
- [ ] 배포 SHA 버전, 헬스, OpenAPI, 로그인·API·WS·SSE 검증
- [ ] Stripe 테스트 모드·SMTP·OAuth 계정·실모델 검증 범위를 기록
- [ ] 최종 회고에서 다음 운영 개선 항목 기록
- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

### 최종 회고

게시판의 v1 계약과 작성자 확인을 유지하면서 데이터베이스와 모델 제공자를 교체할 수 있었다. 메일 발송의 외부 전달 보장과 다중 프로세스의 알림 전파는 운영 규모가 커질 때 보강한다.

### 미반영 항목

원문 체크리스트 11개를 각 단계에 모두 옮겼다. 원문의 프레임워크 비교 표, 여러 프레임워크의 코드를 나란히 실행하는 활동은 사용자 지정 범위에서 제외했다. Edge를 선택해 게시판 화면을 구현했다.

## ⑧ 다음 단계

다음 릴리스는 최종 회고와 README의 검증 절차에서 시작한다. [README.md](README.md)

[AdonisJS 학습 원문](https://app.notion.com/p/41fd7dec5e2e81b1a18fcf3a82d793d4)
