# study4 · 라우팅과 요청 처리

## ① 목표

동적 경로, 검색·페이지 이동, HTML 오류와 JSON 오류를 확인한다.

## ② 📖 이론

요청은 메서드와 경로로 라우터에 들어온다. `:id`는 신분증 번호처럼 한 자원을 고르고 쿼리는 검색 조건을 덧붙인다. 컨트롤러가 `request.qs()`와 `params`를 읽고 뷰나 API 응답을 선택한다.

[공식·원문 참고](https://docs.adonisjs.com/guides/basics/routing)

## ③ 🛠️ 실기

`/board`는 HTML 목록, `/board/1`은 HTML 상세, `/api/posts/1`은 JSON 상세다. 목록 쿼리의 `q/page/limit/sort`는 API에서도 동일한 키를 쓴다. 유효한 번호의 글이 없으면 404, 형식이 틀린 API id는 400이다.

1. `curl.exe -i -H 'X-Request-Id: route-study' http://localhost:3333/api/posts/no-id`를 실행한다.

### [`demo/start/routes.ts`](demo/start/routes.ts)

```ts
/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

const BoardController = () => import('#controllers/board_controller')
const ApiAuthController = () => import('#controllers/api_auth_controller')
const ApiPostsController = () => import('#controllers/api_posts_controller')
const NewAccountController = () => import('#controllers/new_account_controller')
const SessionController = () => import('#controllers/session_controller')
router
  .on('/')
  .render('pages/board/hello', { title: 'Hello, AdonisJS!', topics: ['Edge', 'Ace'] })
  .as('home')
router.get('/health', () => ({ status: 'ok' }))
router.get('/board', [BoardController, 'index']).as('board.index')
router.get('/board/:id', [BoardController, 'show']).as('board.show')

router
  .group(() => {
    router.get('signup', [NewAccountController, 'create']).as('new_account.create')
    router.post('signup', [NewAccountController, 'store']).as('new_account.store')

    router.get('login', [SessionController, 'create']).as('session.create')
    router.post('login', [SessionController, 'store']).as('session.store')
  })
  .use(middleware.guest())

router
  .group(() => {
    router.get('/dashboard', ({ response }) => response.redirect().toPath('/board')).as('dashboard')
    router.post('logout', [SessionController, 'destroy']).as('session.destroy')
    router.post('/board', [BoardController, 'store'])
    router.post('/board/:id/edit', [BoardController, 'update'])
    router.post('/board/:id/delete', [BoardController, 'destroy'])
    router.post('/board/:id/comments', [BoardController, 'addComment'])
    router.post('/board/comments/:id/delete', [BoardController, 'destroyComment'])
    router.post('/board/validate', [BoardController, 'validate'])
  })
  .use(middleware.auth())

router
  .group(() => {
    router.post('/auth/signup', [ApiAuthController, 'signup'])
    router.post('/auth/login', [ApiAuthController, 'login'])
    router.get('/posts', [ApiPostsController, 'index'])
    router.get('/posts/:id', [ApiPostsController, 'show'])
    router.get('/posts/:id/comments', [ApiPostsController, 'comments'])

    router
      .group(() => {
        router.get('/auth/me', [ApiAuthController, 'me'])
        router.post('/auth/logout', [ApiAuthController, 'logout'])
        router.post('/posts', [ApiPostsController, 'store'])
        router.patch('/posts/:id', [ApiPostsController, 'update'])
        router.delete('/posts/:id', [ApiPostsController, 'destroy'])
        router.post('/posts/:id/comments', [ApiPostsController, 'addComment'])
        router.delete('/comments/:id', [ApiPostsController, 'destroyComment'])
      })
      .use(middleware.auth({ guards: ['api'] }))
  })
  .prefix('/api')
```

소스의 첫 줄을 1행으로 센다.

- 1–12행 프레임워크 모듈과 이 파일에서 쓰는 타입을 불러온다.
- 13–18행 웹 게시판, JSON API와 계정·세션 컨트롤러를 요청 시 불러온다.
- 19–22행 Edge 첫 화면과 상태 확인 경로를 등록한다.
- 23–27행 공개 목록과 글 번호가 있는 동적 상세 경로를 정의한다.
- 28–37행 게스트 전용 가입·로그인 경로에 템플릿에서 사용할 이름을 붙인다.
- 38–50행 세션 회원만 글과 댓글을 쓰고 입력을 검증할 수 있게 한다.
- 51–58행 공개 API의 가입, 로그인, 게시판 조회를 등록한다.
- 59–69행 Bearer 인증을 요구하는 계정과 글·댓글 변경 경로를 묶는다.

### [`demo/app/middleware/request_id_middleware.ts`](demo/app/middleware/request_id_middleware.ts)

```ts
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class RequestIdMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    if (request.id()) response.header('X-Request-Id', request.id()!)
    return next()
  }
}
```

소스의 첫 줄을 1행으로 센다.

- 1–3행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 4–9행 AdonisJS 요청 id를 응답 헤더로 전달하고 다음 미들웨어를 실행한다.

## ④ 🔗 연동 포인트

Edge의 이름 있는 라우트와 페이지 링크는 쿼리를 유지한다. DevTools Network에서 메서드·경로·상태·요청 ID를 함께 본다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 404 | 이름과 URL 또는 id가 다름 | `node ace list:routes` 및 `/api/posts`의 id를 확인한다. |
| 라우트 이름 중복 | 둘 이상의 라우트가 같은 이름 사용 | `.as(...)`로 겹치지 않는 이름을 지정한다. |

## ⑥ 직접 해보기

1. `/board?page=2&limit=1&q=Edge`에서 이전·다음 이동 시 검색어를 확인한다.
2. `/api/posts/no-id`와 `/api/missing`의 상태 코드를 비교한다.

## ⑦ ☐ 체크리스트

- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

study5에서 요청 본문을 검증하고 오류를 폼에 보여 준다. [study5.md](study5.md)
