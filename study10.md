# study10 · 배포·정리

## ① 목표

빌드 결과를 Node.js에서 실행하고 도메인·HTTPS·DB 연결을 점검한다.

## ② 📖 이론

Vite는 브라우저 자산을 만들고 `node ace build`는 서버 TypeScript를 JavaScript로 바꾼다. 도메인은 방문할 주소, HTTPS는 전송 암호화, 프록시는 HTTPS를 받아 내부 Node 프로세스에 연결하는 접수 창구다. 환경 변수는 같은 빌드의 실행 환경을 결정한다.

[공식·원문 참고](https://docs.adonisjs.com/deployment)

## ③ 🛠️ 실기

`demo`에서 `npm run lint`, `npm test`, `npm run build`를 실행한다. `demo/build`로 이동해 `npm ci --omit=dev` 후 운영용 변수를 inject하고 `node ace migration:run --force`, `node bin/server.js`로 배포한다. 프로세스 관리 도구와 역방향 프록시를 사용하고 TLS는 프록시에서 종료한다. `APP_URL=https://실제도메인`과 CORS 출처는 실제 HTTPS 주소로 설정한다.

1. 배포에 사용할 DB 백업 및 이전 앱 이미지 경로를 미리 기록한다.

### [`demo/bin/server.ts`](demo/bin/server.ts)

```ts
/*
|--------------------------------------------------------------------------
| HTTP server entrypoint
|--------------------------------------------------------------------------
|
| The "server.ts" file is the entrypoint for starting the AdonisJS HTTP
| server. Either you can run this file directly or use the "serve"
| command to run this file and monitor file changes
|
*/

await import('reflect-metadata')
const { Ignitor, prettyPrintError } = await import('@adonisjs/core/ignitor')

/**
 * URL to the application root. AdonisJS need it to resolve
 * paths to file and directories for scaffolding commands
 */
const APP_ROOT = new URL('../', import.meta.url)

/**
 * The importer is used to import files in context of the
 * application.
 */
const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, APP_ROOT).href)
  }
  return import(filePath)
}

new Ignitor(APP_ROOT, { importer: IMPORTER })
  .tap((app) => {
    app.booting(async () => {
      await import('#start/env')
    })
    app.listen('SIGTERM', () => app.terminate())
    app.listenIf(app.managedByPm2, 'SIGINT', () => app.terminate())
  })
  .httpServer()
  .start()
  .catch((error) => {
    process.exitCode = 1
    prettyPrintError(error)
  })
```

소스의 첫 줄을 1행으로 센다.

- 1–18행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 19–31행 서버 루트 및 상대 import 해석 규칙을 초기화한다.
- 32–45행 환경 스키마를 초기화하고 종료 시 시그널에 대응하며 HTTP 서버를 시작한다.

### [`demo/config/session.ts`](demo/config/session.ts)

```ts
import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig, stores } from '@adonisjs/session'

/**
 * Session configuration.
 * Defines how user sessions are managed, stored, and secured.
 */
const sessionConfig = defineConfig({
  /**
   * Enable or disable session management globally.
   */
  enabled: true,

  /**
   * The name of the cookie used to store the session ID.
   */
  cookieName: 'adonis-session',

  /**
   * When set to true, the session id cookie will be deleted
   * once the user closes the browser.
   */
  clearWithBrowser: false,

  /**
   * Define how long to keep the session data alive without
   * any activity.
   */
  age: '2h',

  /**
   * Configuration for session cookie and the
   * cookie store
   */
  cookie: {
    /**
     * The path for which the cookie is valid.
     * The cookie is accessible for all routes when the value is '/'.
     */
    path: '/',

    /**
     * When true, the cookie is only accessible via HTTP(S) and not
     * by client-side JavaScript, helping prevent XSS attacks.
     */
    httpOnly: true,

    /**
     * When true, the cookie is only sent over HTTPS connections.
     * Enabled in production for security.
     */
    secure: app.inProduction,

    /**
     * Controls when cookies are sent with cross-site requests.
     * This setting provides reasonable security while allowing some cross-site
     * usage (value: 'lax').
     */
    sameSite: 'lax',
  },

  /**
   * The store to use. Make sure to validate the environment
   * variable in order to infer the store name without any
   * errors.
   */
  store: env.get('SESSION_DRIVER'),

  /**
   * List of configured stores. Refer documentation to see
   * list of available stores and their config.
   */
  stores: {
    /**
     * Cookie store saves session data in encrypted cookies.
     * Suitable for small session data that doesn't exceed cookie size limits.
     */
    cookie: stores.cookie(),
    /**
     * Database store persists sessions in the configured SQL database.
     */
    database: stores.database(),
  },
})

export default sessionConfig
```

소스의 첫 줄을 1행으로 센다.

- 1–8행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 9–35행 쿠키 이름, 수명과 세션 활성 여부를 정한다.
- 36–67행 SSR 세션 쿠키의 경로, HttpOnly, Secure, SameSite를 설정한다.
- 68–87행 환경에 맞춘 세션 저장소를 선택한다.

## ④ 🔗 연동 포인트

서버는 24+, DB는 마이그레이션 완료, 세션은 HTTPS 쿠키를 사용한다. `/health`, `/board`, `/api/posts`, 로그인, 작성자 권한, 롤백 경로를 배포 후 확인한다. 기초에서 배운 경로→검증→인증→Lucid→Edge를 하나의 요청으로 다시 연결한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 빌드 뒤 DB 없음 | SQLite가 빌드에 포함되지 않음 | 운영 DB를 연결하고 migration:run을 실행한다. |
| 배포 후 로그인 반복 | HTTPS·쿠키 설정 불일치 | 브라우저 주소와 APP_URL·프록시 전달 헤더를 확인한다. |
| 500 페이지 자산 누락 | Vite 결과 경로가 없음 | 전체 build 디렉터리를 복사한다. |

## ⑥ 직접 해보기

1. 빌드 서버에서 `/health`와 `/api/posts`를 확인한다.
2. 도메인을 올린 경우 HTTPS 인증서와 로그인 후 Secure/HttpOnly 쿠키를 확인한다.

## ⑦ ☐ 체크리스트

- [ ] 운영용 환경 변수 주입과 DB 마이그레이션 확인
- [ ] 배포 후 상태·로그인·권한·정적 자산 응답 확인
- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

studyMidpoint에서 기초 코드를 로그인 게시판 기능으로 묶는다. [studyMidpoint.md](studyMidpoint.md)
