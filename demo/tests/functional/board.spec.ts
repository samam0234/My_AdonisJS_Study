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
