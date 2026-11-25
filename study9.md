# study9 · 테스트·디버깅

## ① 목표

Japa에서 순수 로직과 실제 HTTP 요청 경로를 분리해 검증한다.

## ② 📖 이론

단위 테스트는 자를 대는 검사이고 요청 테스트는 출입구부터 통과하는 검사다. 실제 라우터·미들웨어·DB를 쓰는 테스트는 통합 오류를 찾는다. 외부 API는 호출 함수를 인자로 받아 테스트에서 제어할 수 있다.

[공식·원문 참고](https://docs.adonisjs.com/guides/testing/introduction)

## ③ 🛠️ 실기

`npm test` 또는 `node ace test unit`으로 확인한다. 기본 테스트 DB는 `:memory:`이고 `testUtils.db().migrate()`가 시작/종료 시 마이그레이션을 관리한다. `demo/`에서는 실제 HTTP 라우트와 메모리 DB를 검증한다. 외부 요청 대역의 기본 방식은 아래 예제처럼 호출 함수만 바꾸는 것이다. VS Code에서 JavaScript Debug Terminal을 열고 `npm run dev`를 실행해 중단점을 둔다.

1. `npm test -- functional`로 실제 HTTP 요청 테스트만 실행한다.

### [`demo/tests/unit/course.spec.ts`](demo/tests/unit/course.spec.ts)

```ts
import { test } from '@japa/runner'
import { parseId, parseList } from '#services/board_contract'

test('정상적인 id와 v1 페이지 기본값을 사용한다', ({ assert }) => {
  assert.equal(parseId('42'), 42)
  assert.throws(() => parseId('12x'), 'id는 양의 정수여야 합니다.')
  assert.deepEqual(parseList({}), { page: 1, limit: 10, q: '', sort: '-createdAt' })
  assert.equal(parseList({ limit: '100', sort: '-commentCount' }).limit, 50)
})

test('잘못된 정렬 값과 0페이지를 거절한다', ({ assert }) => {
  assert.throws(() => parseList({ sort: 'title' }), '지원하지 않는 정렬입니다.')
  assert.throws(() => parseList({ page: '0' }), 'page와 limit은 양의 정수여야 합니다.')
})
```

소스의 첫 줄을 1행으로 센다.

- 1–3행 프레임워크 모듈과 이 파일에서 쓰는 타입을 불러온다.
- 4–10행 id와 기본 목록 조건, 최대 페이지 크기를 검증한다.
- 11–14행 잘못된 정렬과 0페이지 거절 규칙을 독립적으로 확인한다.

### [`demo/tests/functional/board.spec.ts`](demo/tests/functional/board.spec.ts)

```ts
/* eslint-disable @unicorn/no-await-expression-member -- Assertions read the single expected HTTP field. */
import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'

const url = () => 'http://127.0.0.1:' + process.env.PORT
async function api(path: string, method = 'GET', body?: unknown, token?: string) {
  const response = await fetch(url() + path, {
    method,
    headers: {
      'Accept': 'application/json',
      'X-Request-Id': 'course-http-test',
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: 'Bearer ' + token }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  // The HTTP contract assertions below examine different JSON shapes.
  const json = response.status === 204 ? null : JSON.parse(await response.text())
  return { response, json }
}

async function account(nickname: string) {
  const input = { email: randomUUID() + '@example.test', password: 'board-test-2026', nickname }
  const signup = await api('/api/auth/signup', 'POST', input)
  if (signup.response.status !== 201) throw new Error(JSON.stringify(signup.json))
  const login = await api('/api/auth/login', 'POST', input)
  if (login.response.status !== 200) throw new Error(JSON.stringify(login.json))
  return {
    ...input,
    token: login.json.data.accessToken as string,
    id: signup.json.data.id as number,
  }
}

test('공통 API 인증·글·댓글·오류를 요청으로 검증한다', async ({ assert }) => {
  assert.deepEqual((await api('/health')).json, { status: 'ok' })
  const main = await account('작성자')
  const other = await account('다른 회원')

  assert.equal((await api('/api/auth/signup', 'POST', main)).response.status, 409)
  assert.equal(
    (await api('/api/auth/login', 'POST', { ...main, password: 'wrong' })).json.error.code,
    'INVALID_CREDENTIALS'
  )
  assert.deepEqual((await api('/api/auth/me', 'GET', undefined, main.token)).json.data, {
    id: main.id,
    email: main.email,
    nickname: main.nickname,
  })
  assert.equal((await api('/api/posts', 'POST', {})).response.status, 401)
  const missing = await api('/api/posts', 'POST', {}, main.token)
  assert.equal(missing.response.status, 400)
  assert.equal(missing.json.error.code, 'VALIDATION_ERROR')
  assert.equal(missing.response.headers.get('x-request-id'), missing.json.error.requestId)
  assert.property(missing.json.error.fields, 'title')

  const yearTag = randomUUID()
  const listPath = '/api/posts?q=' + yearTag + '&limit=100&sort=-commentCount'
  assert.equal((await api(listPath)).json.meta.total, 0)
  const created = await api(
    '/api/posts',
    'POST',
    {
      title: 'Adonis ' + yearTag,
      body: 'Edge renders HTML.',
      tags: ['edge'],
    },
    main.token
  )
  assert.equal(created.response.status, 201)
  const path = created.response.headers.get('location')!
  assert.match(path, /^\/api\/posts\/\d+$/)
  assert.equal(created.json.data.author.nickname, '작성자')
  assert.deepEqual(created.json.data.tags, ['edge'])
  assert.match(created.json.data.createdAt, /Z$/)
  const list = await api(
    listPath
      .toUpperCase()
      .replace('/API/POSTS?Q=', '/api/posts?q=')
      .replace('&LIMIT=100&SORT=-COMMENTCOUNT', '&limit=100&sort=-commentCount')
  )
  assert.deepEqual(list.json.meta, {
    page: 1,
    limit: 50,
    total: 1,
    totalPages: 1,
    q: yearTag.toUpperCase(),
  })
  assert.equal((await api(listPath)).json.meta.total, 1)
  assert.equal((await api(path, 'PATCH', { title: '변경' }, other.token)).response.status, 403)
  assert.equal((await api(path, 'PATCH', { title: '변경' }, main.token)).json.data.title, '변경')
  assert.equal((await api('/api/posts/no-id')).response.status, 400)

  const comment = await api(path + '/comments', 'POST', { body: '댓글' }, other.token)
  assert.equal(comment.response.status, 201)
  assert.equal((await api(path)).json.data.commentCount, 1)
  assert.equal((await api(path + '/comments')).json.data.length, 1)
  const commentPath = '/api/comments/' + comment.json.data.id
  assert.equal((await api(commentPath, 'DELETE', undefined, main.token)).response.status, 403)
  assert.equal((await api(commentPath, 'DELETE', undefined, other.token)).response.status, 204)
  assert.equal((await api(path, 'DELETE', undefined, main.token)).response.status, 204)
  assert.equal((await api(path)).json.error.code, 'NOT_FOUND')
  assert.equal((await api('/api/unknown')).json.error.code, 'NOT_FOUND')

  const logout = await api('/api/auth/logout', 'POST', undefined, main.token)
  assert.equal(logout.response.status, 204)
  assert.equal((await api('/api/auth/me', 'GET', undefined, main.token)).response.status, 401)
})

test('Edge 첫 화면·게시판·오류 페이지를 HTTP로 제공한다', async ({ assert }) => {
  for (const [path, text] of [
    ['/', 'Hello, AdonisJS!'],
    ['/board', '게시판'],
  ]) {
    const page = await fetch(url() + path)
    assert.equal(page.status, 200, path)
    assert.include(await page.text(), text)
  }
  const missing = await fetch(url() + '/board/2147483647', { headers: { Accept: 'text/html' } })
  assert.equal(missing.status, 404)
})

test('중간 앱에는 기본 게시판 경로가 등록되어 있다', async ({ assert }) => {
  const board = await api('/api/posts')
  assert.equal(board.response.status, 200)
  assert.isArray(board.json.data)
  const ai = await api('/api/ai/history')
  assert.equal(ai.response.status, 404)
  assert.equal(ai.json.error.code, 'NOT_FOUND')
})
```

소스의 첫 줄을 1행으로 센다.

- 1–4행 프레임워크 모듈과 이 파일에서 쓰는 타입을 불러온다.
- 5–21행 HTTP 테스트 서버와 JSON 요청 헤더·Bearer 토큰을 구성한다.
- 22–34행 서로 다른 게시판 사용자를 가입시키고 토큰을 발급한다.
- 35–109행 인증·글·댓글 CRUD·소유권·v1 오류·로그아웃을 실제 라우트에서 확인한다.
- 110–122행 Edge 첫 화면, 게시판, HTML 404 응답을 확인한다.
- 123–130행 API v1 목록을 읽고 심화 전용 경로가 중간 게시판에 없음을 확인한다.

### HTTP 함수로 API 대역 주입하기

```js
import assert from 'node:assert/strict'

async function readPosts(fetcher = fetch) {
  const response = await fetcher('http://localhost:3333/api/posts')
  assert.ok(response.ok)
  return (await response.json()).data
}

const fakeFetch = async () => Response.json({ data: [{ id: 1, title: 'Edge 실습' }] })
const posts = await readPosts(fakeFetch)
assert.equal(posts[0].title, 'Edge 실습')
```

- 1행 Node의 assert를 불러온다.
- 3–7행 조회 함수에서 기본 HTTP 호출을 사용하고 성공 응답의 data를 읽는다.
- 9–11행 지정한 JSON을 반환하는 함수를 주입하고 네트워크 없이 조회 결과를 확인한다.

## ④ 🔗 연동 포인트

`X-Request-Id`로 브라우저 Network 요청과 Pino 로그를 잇는다. CI에서도 동일한 Japa 명령을 실행하고 로그 출력에서 DB 경로와 실패한 assertion을 확인한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| EADDRINUSE | 테스트 포트 충돌 | TEST_PORT를 변경한다. |
| Unsupported engine | Node 24 미만 | node -v를 확인한다. |
| Cannot find package | 의존성 설치 누락 | npm ci를 실행한다. |
| E_INVALID_ENV | 필수 환경값 누락 | 예제 파일과 APP_KEY를 확인한다. |
| SQLite table 오류 | 마이그레이션 미적용 | DB 경로와 migration:status를 확인한다. |
| 401 | 토큰 누락·폐기 | 테스트 로그인에서 발급한 토큰을 넘긴다. |
| 403 | 작성자 불일치 또는 CSRF 실패 | Bouncer·CSRF 정보를 따로 점검한다. |
| 404 | 경로나 id가 틀림 | list:routes와 생성 Location을 확인한다. |
| 400/422 | Vine 검증 실패 | 표면별 오류 본문에서 필드를 읽는다. |
| 500 | 예상 외 서버 오류 | 동일 request id 로그와 스택을 본다. |

## ⑥ 직접 해보기

1. 단위 테스트에 `page=0` 케이스를 더한다.
2. 다른 회원이 내 글을 수정할 때 403을 기대하는 요청 테스트를 실행한다.
3. HTTP 대역이 반환하는 제목을 다르게 정해 응답 검증을 추가한다.

## ⑦ ☐ 체크리스트

- [ ] Japa로 기능 테스트
- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

study10에서 테스트한 앱을 빌드하고 운영 연결을 점검한다. [study10.md](study10.md)
