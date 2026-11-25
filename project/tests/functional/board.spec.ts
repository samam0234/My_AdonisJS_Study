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
