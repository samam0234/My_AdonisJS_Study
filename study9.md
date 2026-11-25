# study9 · 테스트·디버깅

## ① 목표

Japa에서 순수 로직과 실제 HTTP 요청 경로를 분리해 검증한다.

## ② 📖 이론

단위 테스트는 자를 대는 검사이고 요청 테스트는 출입구부터 통과하는 검사다. 실제 라우터·미들웨어·DB를 쓰는 테스트는 통합 오류를 찾는다. 외부 모델 API는 생성기 의존성을 주입해 네트워크를 제어한다.

[공식·원문 참고](https://docs.adonisjs.com/guides/testing/introduction)

## ③ 🛠️ 실기

`npm test` 또는 `node ace test unit`으로 확인한다. 기본 테스트 DB는 `:memory:`이고 `testUtils.db().migrate()`가 시작/종료 시 마이그레이션을 관리한다. `prepareChat`에 가짜 async generator를 넣으면 토큰 수와 답변을 결정적으로 검증할 수 있다. VS Code에서 JavaScript Debug Terminal을 열고 `npm run dev`를 실행해 중단점을 둔다.

1. `npm test -- functional`로 실제 HTTP 요청 테스트만 실행한다.

### [`demo/tests/unit/course.spec.ts`](demo/tests/unit/course.spec.ts)

```ts
import { test } from '@japa/runner'
import { parseId, parseList } from '#services/board_contract'
import { evidencePrompt, excerpts } from '#services/ai_context'

test('정상적인 id와 v1 페이지 기본값을 사용한다', ({ assert }) => {
  assert.equal(parseId('42'), 42)
  assert.throws(() => parseId('12x'), 'id는 양의 정수여야 합니다.')
  assert.deepEqual(parseList({}), { page: 1, limit: 10, q: '', sort: '-createdAt' })
  assert.equal(parseList({ limit: '100', sort: '-commentCount' }).limit, 50)
})

test('AI 발췌는 일치하는 번호와 원문을 전달한다', ({ assert }) => {
  const selected = excerpts('Edge 템플릿은 서버에서 HTML을 렌더링합니다.', 'Edge 설명')
  assert.deepEqual(
    selected.map(({ number }) => number),
    [1]
  )
  assert.include(evidencePrompt('Edge 설명', selected), 'HTML')
  assert.deepEqual(excerpts('Edge만 설명합니다.', 'PostgreSQL'), [])
})
```

소스의 첫 줄을 1행으로 센다.

- 1–4행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 5–11행 양의 id와 기본 페이지·상한을 DB 없이 검증한다.
- 12–20행 키워드 검색 후 근거 번호와 근거 없는 상황을 검증한다.

### [`demo/tests/functional/board.spec.ts`](demo/tests/functional/board.spec.ts)

```ts
/* eslint-disable @unicorn/no-await-expression-member -- Assertions read the single expected HTTP field. */
import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { prepareChat } from '#services/ai_chat'

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

test('공통 API 인증·글·댓글·오류·캐시를 요청으로 검증한다', async ({ assert }) => {
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

test('AI SSE·근거·사용자별 기록과 주입한 모델 대역을 확인한다', async ({ assert }) => {
  const user = await account('질문자')
  const reader = await account('다른 질문자')
  const created = await api(
    '/api/posts',
    'POST',
    { title: '문서', body: 'AdonisJS와 Edge로 게시판을 만듭니다.' },
    user.token
  )
  const postId = created.json.data.id
  const input = { postId, question: 'Edge를 요약' }
  const mocked = await prepareChat(user.id, postId, input.question, async function* () {
    yield { text: '대역 응답 (발췌 1)', inputTokens: 10, outputTokens: 3 }
  })
  for await (const text of mocked.run(AbortSignal.timeout(2000))) assert.include(text, '대역 응답')
  const response = await fetch(url() + '/api/ai/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + user.token },
    body: JSON.stringify(input),
  })
  const stream = await response.text()
  assert.equal(response.status, 200)
  assert.include(response.headers.get('content-type')!, 'text/event-stream')
  assert.include(stream, '발췌 1')
  assert.include(stream, 'data: [DONE]')
  const unknown = await api('/api/ai/chat', 'POST', { postId, question: '코끼리' }, user.token)
  assert.equal(unknown.json.data.text, '찾을 수 없습니다.')
  const history = await api('/api/ai/history', 'GET', undefined, user.token)
  assert.equal(history.json.data.length, 3)
  assert.equal(history.json.data[2].inputTokens, 10)
  assert.equal((await api('/api/ai/history', 'GET', undefined, reader.token)).json.data.length, 0)
})

test('Edge 첫 화면, 게시판, 작업실, 오류 페이지와 OpenAPI를 HTTP로 제공한다', async ({
  assert,
}) => {
  for (const [path, text] of [
    ['/', 'Hello, AdonisJS!'],
    ['/board', '게시판'],
    ['/workbench', 'AI 작업실'],
    ['/api-docs', 'SwaggerUIBundle'],
  ]) {
    const page = await fetch(url() + path)
    assert.equal(page.status, 200, path)
    assert.include(await page.text(), text)
  }
  const missing = await fetch(url() + '/board/2147483647', { headers: { Accept: 'text/html' } })
  assert.equal(missing.status, 404)
  const docs = await api('/api-docs/openapi.json')
  assert.equal(docs.json.openapi, '3.0.3')
  assert.property(docs.json.paths, '/api/posts/{id}/comments')
})
```

소스의 첫 줄을 1행으로 센다.

- 1–5행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 6–22행 테스트 서버에 fetch 요청을 보내고 필요에 따라 요청 id·Bearer·JSON 본문을 구성한다.
- 23–35행 서로 다른 실습 회원을 가입시키고 Bearer를 얻는다.
- 36–110행 인증·검증 오류·게시글·댓글 인가·목록 스펙·캐시 무효화·로그아웃을 순서대로 검증한다.
- 111–143행 제어 가능한 AI 대역과 실제 SSE, 사용자별 기록의 격리를 검증한다.
- 144–162행 공개 HTML, 오류 페이지와 OpenAPI의 정상 응답을 검증한다.

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
3. 모델 대역의 토큰 값을 바꾸고 기록 검증이 잡아내는지 확인한다.

## ⑦ ☐ 체크리스트

- [ ] Japa로 기능 테스트
- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

study10에서 테스트한 앱을 빌드하고 운영 연결을 점검한다. [study10.md](study10.md)
