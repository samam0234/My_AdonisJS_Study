# study7 · 인증·보안 기초

## ① 목표

브라우저 세션과 API 토큰을 구분하고 글·댓글 작성자만 변경을 허용한다.

## ② 📖 이론

세션은 브라우저가 쿠키를 자동 전송하는 구조이고 API 액세스 토큰은 호출자가 `Authorization: Bearer`에 넣는 자격 증명이다. 인증은 사원증으로 신원을 증명하고 Bouncer 인가는 그 사원증에 특정 문을 열 권한이 있는지 확인한다. 비밀번호는 모델의 `withAuthFinder` 훅으로 해시한다.

[공식·원문 참고](https://docs.adonisjs.com/guides/auth/access-tokens-guard)

## ③ 🛠️ 실기

`/signup`과 `/login`은 Edge 세션, `/api/auth/login`은 DB에 해시를 저장하는 1시간 opaque 토큰을 발급한다. API 로그아웃은 현재 토큰을 폐기한다. 웹 폼은 Shield의 CSRF를 사용하고 브라우저 현황은 `auth.user`로 읽는다. CORS는 `CORS_ORIGIN`의 출처만 허용한다. Edge `{{ }}`와 브라우저 `textContent`로 XSS 노출을 줄인다.

1. 브라우저 Cookies에서 세션 설정을 확인하고 Network에서 API Bearer 흐름을 관찰한다.

### [`demo/app/models/user.ts`](demo/app/models/user.ts)

```ts
import { UserSchema } from '#database/schema'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'

/**
 * User model represents a user in the application.
 * It extends UserSchema and includes authentication capabilities
 * through the withAuthFinder mixin.
 */
export default class User extends compose(UserSchema, withAuthFinder(hash)) {
  static accessTokens = DbAccessTokensProvider.forModel(User, { expiresIn: '1 hour' })

  /**
   * Get the user's initials from their full name or email.
   * Returns the first letter of first and last name if available,
   * otherwise returns the first two characters of the email username.
   */
  get initials() {
    const [first, last] = this.fullName ? this.fullName.split(' ') : this.email.split('@')
    if (first && last) {
      return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
    }
    return `${first.slice(0, 2)}`.toUpperCase()
  }
}
```

소스의 첫 줄을 1행으로 센다.

- 1–11행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 12행 인증 믹스인이 가입 시 비밀번호를 해시하고 로그인 시 검증한다.
- 13–19행 DB에 해시를 저장하는 토큰 공급자와 한 시간 만료를 설정한다.
- 20–27행 화면에서 표시하는 이니셜을 이름 또는 이메일로 계산한다.

### [`demo/app/abilities/board.ts`](demo/app/abilities/board.ts)

```ts
import { Bouncer } from '@adonisjs/bouncer'
import type User from '#models/user'

export const manageContent = Bouncer.ability((user: User, content: { userId: number }) => {
  return user.id === content.userId
})
```

소스의 첫 줄을 1행으로 센다.

- 1–3행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 4–6행 현재 사용자 id와 콘텐츠의 작성자 id가 같은지를 Bouncer 규칙으로 정의한다.

### [`demo/app/controllers/api_auth_controller.ts`](demo/app/controllers/api_auth_controller.ts)

```ts
import type { HttpContext } from '@adonisjs/core/http'
import { errors } from '@adonisjs/auth'
import User from '#models/user'
import { login, signup } from '#validators/board'
import { account, ApiError } from '#services/board_contract'

export default class ApiAuthController {
  async signup({ request, response }: HttpContext) {
    const { nickname, email, password } = await request.validateUsing(signup)
    try {
      const user = await User.create({ email, password, fullName: nickname })
      return response.created({ data: account(user) })
    } catch (error) {
      const { code } = error as { code?: string }
      if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === '23505' || code === 'ER_DUP_ENTRY') {
        throw new ApiError(409, 'EMAIL_TAKEN', '이미 등록된 이메일입니다.')
      }
      throw error
    }
  }

  async login({ request }: HttpContext) {
    const { email, password } = await request.validateUsing(login)
    let user: User
    try {
      user = await User.verifyCredentials(email, password)
    } catch (error) {
      if (!(error instanceof errors.E_INVALID_CREDENTIALS)) throw error
      throw new ApiError(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호를 확인하세요.')
    }
    const token = await User.accessTokens.create(user)
    return { data: { user: account(user), accessToken: token.value!.release() } }
  }

  async me({ auth }: HttpContext) {
    return { data: account(auth.use('api').getUserOrFail()) }
  }

  async logout({ auth, response }: HttpContext) {
    const user = auth.use('api').getUserOrFail()
    await User.accessTokens.delete(user, user.currentAccessToken.identifier)
    return response.noContent()
  }
}
```

소스의 첫 줄을 1행으로 센다.

- 1–7행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 8–21행 Vine 입력으로 회원을 생성하고 DB의 이메일 유일성 위반을 409로 바꾼다.
- 22–34행 로그인 실패를 공통 401로 바꾸고 성공 시 1시간 토큰의 실제 값을 한 번 전달한다.
- 35–38행 API Guard를 통과한 현재 회원의 공개 계정 값을 읽는다.
- 39–44행 현재 토큰 식별자로 토큰을 폐기하고 본문 없는 성공을 응답한다.

### [`demo/config/cors.ts`](demo/config/cors.ts)

```ts
import { defineConfig } from '@adonisjs/cors'
import env from '#start/env'

export default defineConfig({
  enabled: true,
  origin: env
    .get('CORS_ORIGIN')
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? ['http://localhost:5173'],
  methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  headers: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposeHeaders: ['X-Request-Id', 'Location'],
  credentials: false,
  maxAge: 90,
})
```

소스의 첫 줄을 1행으로 센다.

- 1–3행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 4–12행 명시적으로 허용할 Origin, 메서드, 헤더로 preflight 응답을 설정한다.
- 13–16행 Location과 요청 id를 공개하고 쿠키 자격 증명은 허용하지 않는다.

## ④ 🔗 연동 포인트

동일 출처의 Edge는 세션을 사용하고 API 호출자는 Bearer를 명시한다. `/api`의 CSRF 예외는 세션 쿠키를 API 쓰기 인증으로 받지 않는 구성과 짝을 이룬다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 401 | 토큰 누락·만료·폐기 | 새 로그인에서 발급한 토큰을 확인한다. |
| 403 | 다른 작성자의 글 | Bouncer가 요청자 id와 `userId`를 비교한다. |
| 브라우저만 호출 실패 | CORS preflight가 출처 거부 | scheme·host·port를 CORS_ORIGIN과 맞춘다. |

## ⑥ 직접 해보기

1. 사용자 A 글을 B 토큰으로 수정하고 403을 확인한다.
2. API 로그아웃 직후 같은 토큰으로 `/api/auth/me`를 호출한다.
3. 글 본문에 `<b>문자</b>`를 입력하고 태그가 텍스트로 보이는지 확인한다.

## ⑦ ☐ 체크리스트

- [ ] 세션 인증 또는 액세스 토큰 인증 (`@adonisjs/auth`)
- [ ] Bouncer로 작성자 권한 검사 (Laravel Policy와 같은 자리)
- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

study8에서 공유 코드와 환경별 설정을 정리한다. [study8.md](study8.md)
