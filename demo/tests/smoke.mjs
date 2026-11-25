import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const base = new URL(process.env.BOARD_URL ?? 'http://localhost:3333')
const cookies = new Map()
let postLocation

async function request(path, options = {}) {
  const response = await fetch(new URL(path, base), {
    ...options,
    redirect: 'manual',
    headers: {
      Cookie: [...cookies].map(([name, value]) => name + '=' + value).join('; '),
      ...options.headers,
    },
  })
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0]
    const equal = pair.indexOf('=')
    cookies.set(pair.slice(0, equal), pair.slice(equal + 1))
  }
  return response
}

function csrf(html) {
  const token = html.match(/name=['"]_csrf['"]\s+value=['"]([^'"]+)['"]/)?.[1]
  assert.ok(token, '세션 폼에 CSRF 토큰이 있어야 합니다.')
  return token
}

try {
  assert.equal((await request('/health')).status, 200)
  const signup = await request('/signup')
  assert.equal(signup.status, 200)
  const password = 'board-smoke-2026'
  const registration = await request('/signup', {
    method: 'POST',
    body: new URLSearchParams({
      _csrf: csrf(await signup.text()),
      email: randomUUID() + '@example.test',
      fullName: '게시판 실습 회원',
      password,
      passwordConfirmation: password,
    }),
  })
  assert.equal(registration.status, 302)
  assert.equal(registration.headers.get('location'), '/board')
  const board = await request('/board')
  const token = csrf(await board.text())
  const noCsrf = await request('/board', { method: 'POST', body: new URLSearchParams() })
  assert.equal(noCsrf.status, 403)
  const validation = await request('/board/validate', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: new URLSearchParams({ _csrf: token, title: '', body: '테스트' }),
  })
  assert.equal(validation.status, 422)

  const title = 'Edge 게시판 스모크 ' + randomUUID()
  const created = await request('/board', {
    method: 'POST',
    body: new URLSearchParams({ _csrf: token, title, body: '등록한 본문' }),
  })
  assert.equal(created.status, 302)
  postLocation = created.headers.get('location')
  assert.match(postLocation, /^\/board\/\d+$/)
  const post = await request(postLocation)
  assert.equal(post.status, 200)
  assert.ok((await post.text()).includes(title))
  assert.equal((await request('/workbench', { headers: { Accept: 'text/html' } })).status, 404)
  console.log('기초 게시판 세션·CSRF·폼 검증·등록·상세 검증 완료')
} finally {
  if (postLocation) {
    const page = await request(postLocation)
    await request(postLocation + '/delete', {
      method: 'POST',
      body: new URLSearchParams({ _csrf: csrf(await page.text()) }),
    })
  }
}
