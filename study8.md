# study8 · 구조화·재사용

## ① 목표

환경 설정과 비즈니스 규칙을 분리해 화면·API가 같은 코드 경로를 사용한다.

## ② 📖 이론

환경 변수는 운영에서 바뀌는 값, 설정은 환경값을 서비스 계약으로 변환하는 곳, 서비스는 Controller와 독립된 업무 규칙이다. 배전반의 스위치처럼 `config/`에서 연결을 정하면 나머지 코드는 같은 모델을 쓸 수 있다. 공유 조회·직렬화의 변경이 Edge와 JSON에 같이 적용된다.

[공식·원문 참고](https://docs.adonisjs.com/guides/getting-started/environment-variables)

## ③ 🛠️ 실기

`start/env.ts`에 타입을 정하고 `config/database.ts`에서 연결을 선택한다. `services/posts.ts`는 페이지와 API에서 함께 사용하고 `services/board_contract.ts`에는 입력 경계와 직렬화가 있다. 운영은 NODE_ENV=production과 HTTPS APP_URL, 별도 APP_KEY와 DB 자격 증명을 설정한다.

1. 환경값을 비교할 때 비밀 값은 출력하지 않고 변수명과 연결 상태를 기록한다.

### [`demo/config/database.ts`](demo/config/database.ts)

```ts
import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/lucid'

const migrations = { naturalSort: true, paths: ['database/migrations'] }
const network = {
  host: env.get('DB_HOST') ?? '127.0.0.1',
  user: env.get('DB_USER'),
  password: env.get('DB_PASSWORD'),
  database: env.get('DB_DATABASE'),
  ssl: env.get('DB_SSL') ? { rejectUnauthorized: true } : undefined,
}

export default defineConfig({
  connection: env.get('DB_CONNECTION') ?? 'sqlite',
  connections: {
    sqlite: {
      client: 'better-sqlite3',
      connection: {
        filename:
          env.get('DB_DATABASE') === ':memory:' ? ':memory:' : app.tmpPath(env.get('DB_DATABASE')),
      },
      useNullAsDefault: true,
      migrations,
      schemaGeneration: {
        enabled: !app.inTest && !app.inProduction,
        rulesPaths: ['./database/schema_rules.js'],
      },
    },
    pg: {
      client: 'pg',
      connection: { ...network, port: env.get('DB_PORT') ?? 5432 },
      migrations,
      schemaGeneration: { enabled: false },
    },
    mysql: {
      client: 'mysql2',
      connection: { ...network, port: env.get('DB_PORT') ?? 3306, timezone: 'Z' },
      migrations,
      schemaGeneration: { enabled: false },
    },
  },
})
```

소스의 첫 줄을 1행으로 센다.

- 1–4행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 5–14행 DB 종류에 관계없이 같은 마이그레이션 경로와 네트워크 옵션을 재사용한다.
- 15–16행 환경 기본값 SQLite 또는 지정한 SQL 연결을 선택한다.
- 17–29행 로컬 파일 또는 메모리 SQLite를 열고 개발에서만 스키마를 재생성한다.
- 30–35행 PostgreSQL에 드라이버와 기본 포트를 지정한다.
- 36–43행 MariaDB의 mysql2 연결과 UTC 설정을 지정한다.

### [`demo/start/env.ts`](demo/start/env.ts)

```ts
/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),

  // Database
  DB_DATABASE: Env.schema.string(),
  CORS_ORIGIN: Env.schema.string.optional(),
  DB_CONNECTION: Env.schema.enum.optional(['sqlite', 'pg', 'mysql'] as const),
  DB_HOST: Env.schema.string.optional(),
  DB_PORT: Env.schema.number.optional(),
  DB_USER: Env.schema.string.optional(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_SSL: Env.schema.boolean.optional(),
  MONGO_URL: Env.schema.string.optional(),
  GITHUB_CLIENT_ID: Env.schema.string.optional(),
  GITHUB_CLIENT_SECRET: Env.schema.string.optional(),
  STRIPE_SECRET_KEY: Env.schema.string.optional(),
  STRIPE_PRICE_ID: Env.schema.string.optional(),
  STRIPE_WEBHOOK_SECRET: Env.schema.string.optional(),
  SMTP_URL: Env.schema.string.optional(),
  MAIL_FROM: Env.schema.string.optional(),
  AI_PROVIDER: Env.schema.enum.optional(['mock', 'ollama', 'anthropic'] as const),
  AI_MODEL: Env.schema.string.optional(),
  OLLAMA_URL: Env.schema.string.optional(),
  ANTHROPIC_API_KEY: Env.schema.string.optional(),
  AI_DAILY_TOKEN_LIMIT: Env.schema.number.optional(),
  POST_CACHE_MS: Env.schema.number.optional(),
})
```

소스의 첫 줄을 1행으로 센다.

- 1–13행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 14–25행 앱 시작 시 Node 환경과 필수 시크릿을 검증한다.
- 26–36행 세션 방식과 데이터베이스 파일·출처·네트워크 DB 키를 검증한다.
- 37–44행 선택 서비스의 URI·OAuth/Stripe/SMTP 설정 키를 정의한다.
- 45–51행 허용 모델 제공자·모델·토큰 예산·캐시 TTL 값을 검증한다.

## ④ 🔗 연동 포인트

`npm ci`는 잠금 파일을 사용한다. 테스트는 `bin/test.ts`에서 기본 SQLite 메모리 DB와 mock AI를 강제해 개발 데이터와 분리한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 환경값 읽기 실패 | DB_PORT 등에 문자열이 잘못 입력됨 | 환경 스키마와 예제를 확인한다. |
| API에는 검색되지만 화면에는 누락 | 조회 로직을 양쪽에 복제함 | 두 컨트롤러에서 listPosts를 사용한다. |

## ⑥ 직접 해보기

1. `.env`의 `LOG_LEVEL`을 바꾸고 서버를 다시 실행한다.
2. `listPosts`의 기본 정렬을 바꾸고 두 표면에서 같이 반영되는지 확인한 뒤 원복한다.

## ⑦ ☐ 체크리스트

- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

study9에서 분리한 책임을 단위 및 HTTP 테스트로 검증한다. [study9.md](study9.md)
