# studyFinal · 최종 응용 · 게시판과 문서 AI 작업실

## ① 목표

`project/`에서 PostgreSQL·외부 서비스·AI·자동 배포가 포함된 최종 앱을 완성한다.

## ② 📖 이론

### 기능 목록

- 로그인 게시판, 게시글·댓글 CRUD, 작성자 인가와 공통 API v1
- 문서 업로드와 발췌 기반 AI 답변, 사용자별 기록, MongoDB 초안
- WebSocket 변경 알림, Stripe 테스트 결제, 메일 작업, GitHub OAuth
- 린트·빌드·테스트·Docker 이미지·SHA 기반 자동 배포

### 연동 구성도

    Edge/Alpine ↔ AdonisJS → Lucid → PostgreSQL
    브라우저 ← WebSocket 알림 · SSE 답변 → AdonisJS → Anthropic/Ollama
    MCP 클라이언트 → stdio 서버 → AdonisJS 공개 API
    Stripe → 서명 웹훅 → 결제 영수증 / 워커 → SMTP
    GitHub Actions → GHCR SHA 이미지 → Docker Compose

UI, API, 데이터베이스, 외부 제공자의 책임을 분리해 사용자는 같은 게시판 계약으로 접속할 수 있다.

[공식·원문 참고](https://app.notion.com/p/41fd7dec5e2e81b1a18fcf3a82d793d4)

## ③ 🛠️ 실기

### 구현 순서

1. [studyMidpoint](studyMidpoint.md)의 `demo/`에서 게시판의 동작을 확인한다. 루트에서 `cd project`로 이동해 [README](README.md)의 심화 완성본 실행 순서로 의존성, 별도 환경 파일·키, 마이그레이션을 준비한다. 기본 주소는 `http://localhost:3334`다.
2. [study11](study11.md)에서 PostgreSQL 연결로 바꾸고 새 DB에 마이그레이션을 적용한다.
3. [study13](study13.md)에 따라 Stripe 테스트 키, SMTP, GitHub OAuth를 환경 변수로 연결한다.
4. [study17](study17.md)의 문서 업로드 및 알림을 확인하고 [study18](study18.md)의 AI 기록과 MCP를 실행한다.
5. [study16](study16.md)의 Docker 이미지 및 GitHub Actions를 준비한다.
6. [study14](study14.md) API 계약과 인증·보안, 백업 복원을 확인한다.

### [`project/app/services/ai_chat.ts`](project/app/services/ai_chat.ts)

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

- 1–7행 프레임워크 모듈과 이 파일에서 쓰는 타입을 불러온다.
- 8–16행 문서를 조회하고 질문에 쓸 인용 근거와 모델 입력을 구성한다.
- 17–33행 사용자와 UTC 날짜별로 예상 토큰을 조건부 DB 증가시킨다.
- 34–41행 발췌를 반환하고 async iterator로 답변을 전달할 준비를 한다.
- 42–49행 출력과 사용량을 모으고 크기를 제한하며 부분 문자열을 내보낸다.
- 50–61행 완료된 답변, 발췌 번호, 토큰 수를 사용자별 히스토리로 저장한다.

### [`project/Dockerfile`](project/Dockerfile)

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
  env_file: project/.env
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

- 1–16행 Compose 이름과 project/.env, 운영 DB 연결을 설정한다.
- 17–29행 PostgreSQL 볼륨과 준비 확인을 선언한다.
- 30–35행 DB가 준비되면 운영 마이그레이션을 한 번 실행한다.
- 36–47행 마이그레이션이 완료되면 완성 앱을 띄우고 헬스를 확인한다.
- 48–55행 선택 프로필에서 SMTP 발송 워커를 실행한다.
- 56–57행 DB 데이터를 컨테이너 밖에 보관한다.

## ④ 🔗 연동 포인트

Edge와 공개 API는 같은 Lucid 데이터에 연결된다. 앱이 운영 이미지로 이동해도 브라우저 세션, Bearer, 웹훅 검증은 각각의 요청 경계를 지킨다. 이미지 배포 뒤 DB 마이그레이션과 `/health`를 확인하고 외부 계정과 모델은 환경별로 연결한다.

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

### 배포 체크리스트

- [ ] PostgreSQL·HTTPS·시크릿·수명·백업 복원 확인
- [ ] 배포 SHA 버전, 헬스, OpenAPI, 로그인·API·WS·SSE 검증
- [ ] Stripe 테스트 모드·SMTP·OAuth 계정·실모델 검증 범위를 기록
- [ ] 최종 회고에서 다음 운영 개선 항목 기록
- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

### 최종 회고

`project/`를 별도로 실행하면서 게시판의 v1 계약과 작성자 확인을 유지하고 데이터베이스와 모델 제공자를 전환할 수 있었다. 메일 발송의 외부 전달 보장과 다중 프로세스의 알림 전파는 운영 규모가 커질 때 보강한다.

### 미반영 항목

원문 체크리스트 11개를 각 단계에 모두 옮겼다. 원문의 프레임워크 비교 표, 여러 프레임워크의 코드를 나란히 실행하는 활동은 사용자 지정 범위에서 제외했다. Edge를 선택해 게시판 화면을 구현했다.

## ⑧ 다음 단계

다음 릴리스는 최종 회고와 README의 검증 절차에서 시작한다. [README.md](README.md)

[AdonisJS 학습 원문](https://app.notion.com/p/41fd7dec5e2e81b1a18fcf3a82d793d4)
