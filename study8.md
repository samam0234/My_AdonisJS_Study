# study8 · 구조화·재사용

## ① 목표

환경 설정과 비즈니스 규칙을 분리해 화면·API가 같은 코드 경로를 사용한다.

## ② 📖 이론

환경 변수는 운영에서 바뀌는 값, 설정은 환경값을 서비스 계약으로 변환하는 곳, 서비스는 Controller와 독립된 업무 규칙이다. 배전반의 스위치처럼 `config/`에서 연결을 정하면 나머지 코드는 같은 모델을 쓸 수 있다. 공유 조회·직렬화의 변경이 Edge와 JSON에 같이 적용된다.

[공식·원문 참고](https://docs.adonisjs.com/guides/getting-started/environment-variables)

## ③ 🛠️ 실기

`demo/start/env.ts`에 타입을 정하고 `demo/config/database.ts`에서 SQLite 파일의 위치를 지정한다. `services/posts.ts`는 페이지와 API에서 함께 사용하고 `services/board_contract.ts`에는 입력 경계와 직렬화가 있다. 운영은 NODE_ENV=production과 HTTPS APP_URL, 별도 APP_KEY와 DB 자격 증명을 설정한다.

1. 환경값을 비교할 때 비밀 값은 출력하지 않고 변수명과 연결 상태를 기록한다.

### [`demo/config/database.ts`](demo/config/database.ts)

```ts
import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/lucid'
import { legacyWorkbenchTables } from '#database/legacy_workbench_tables'

const filename = env.get('DB_DATABASE')

export default defineConfig({
  connection: 'sqlite',
  connections: {
    sqlite: {
      client: 'better-sqlite3',
      connection: { filename: filename === ':memory:' ? filename : app.tmpPath(filename) },
      useNullAsDefault: true,
      migrations: { naturalSort: true, paths: ['database/migrations'] },
      schemaGeneration: {
        enabled: !app.inTest && !app.inProduction,
        rulesPaths: ['./database/schema_rules.js'],
        excludeTables: legacyWorkbenchTables,
      },
    },
  },
})
```

소스의 첫 줄을 1행으로 센다.

- 1–5행 프레임워크 모듈과 기존 DB에서 스키마 생성 대상에서 제외할 테이블 목록을 가져온다.
- 6–8행 환경 스키마에서 DB 파일 이름을 읽는다.
- 9–11행 SQLite 연결을 등록한다.
- 12–14행 테스트 메모리 DB와 tmp 아래 저장되는 로컬 파일을 구분한다.
- 15–23행 마이그레이션 위치와 스키마 생성 옵션을 설정한다. 기존 DB에서 심화 테이블은 생성된 모델 스키마의 대상에서 빠진다.

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
})
```

소스의 첫 줄을 1행으로 센다.

- 1–13행 프레임워크 모듈과 이 파일에서 쓰는 타입을 불러온다.
- 14–25행 실행 모드, 포트, 비밀 키와 외부 접속 URL을 시작 시 검증한다.
- 26–28행 세션 저장 방식의 허용 목록을 선언한다.
- 29–31행 SQLite 파일 이름과 선택 CORS 출처를 선언한다.

## ④ 🔗 연동 포인트

`npm ci`는 잠금 파일을 사용한다. 테스트는 `demo/bin/test.ts`에서 기본 SQLite 메모리 DB를 사용해 개발 데이터를 분리한다.

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
