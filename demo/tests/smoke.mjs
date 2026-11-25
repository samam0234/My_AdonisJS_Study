import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import WebSocket from 'ws'

const base = new URL(process.env.BOARD_URL ?? 'http://localhost:3333')
const cookieJar = new Map()
const jsonHeaders = { Accept: 'application/json', 'Content-Type': 'application/json' }
const identity = {
  email: randomUUID() + '@example.test',
  fullName: '브라우저 실습',
  password: 'board-smoke-2026',
  passwordConfirmation: 'board-smoke-2026',
}
let token
let postId
let socket

async function web(path, options = {}) {
  const response = await fetch(new URL(path, base), {
    ...options,
    redirect: 'manual',
    headers: {
      Cookie: [...cookieJar].map(([name, value]) => name + '=' + value).join('; '),
      ...options.headers,
    },
  })
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0]
    const equal = pair.indexOf('=')
    cookieJar.set(pair.slice(0, equal), pair.slice(equal + 1))
  }
  return response
}

async function json(path, method = 'GET', body, authenticated = true) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: { ...jsonHeaders, ...(authenticated && token && { Authorization: 'Bearer ' + token }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { response, body: response.status === 204 ? null : await response.json() }
}

function csrf(html) {
  return html.match(/name=['"]_csrf['"]\s+value=['"]([^'"]+)['"]/)?.[1]
}

try {
  assert.equal((await web('/health')).status, 200)
  const signup = await web('/signup')
  assert.equal(signup.status, 200)
  const formToken = csrf(await signup.text())
  assert.ok(formToken, '회원가입 CSRF 폼 필요')
  const registration = await web('/signup', {
    method: 'POST', body: new URLSearchParams({ ...identity, _csrf: formToken }),
  })
  assert.equal(registration.status, 302)
  let page = await web('/workbench')
  assert.equal(page.status, 200)
  const workbench = await page.text()
  const uploadToken = csrf(workbench)
  assert.ok(uploadToken, '로그인된 작업실 CSRF 폼 필요')
  assert.match(workbench, /data-chat/)
  assert.equal((await web('/workbench/upload', { method: 'POST', body: new URLSearchParams() })).status, 403)

  socket = new WebSocket(base.origin.replace(/^http/, 'ws') + '/board-events', { origin: base.origin })
  await once(socket, 'open', { signal: AbortSignal.timeout(4000) })
  const notification = once(socket, 'message', { signal: AbortSignal.timeout(4000) })
  const upload = new FormData()
  upload.set('_csrf', uploadToken)
  upload.set('document', new Blob(['AdonisJS Edge 문서 실습입니다.'], { type: 'text/plain' }), 'edge.txt')
  const uploaded = await web('/workbench/upload', { method: 'POST', body: upload })
  assert.equal(uploaded.status, 302, await uploaded.clone().text())
  postId = Number(uploaded.headers.get('location').split('/').at(-1))
  assert.ok(postId > 0)
  const [message] = await notification
  assert.equal(String(message), 'board.changed')

  page = await web('/board/' + postId)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /Edge 문서 실습/)
  const stream = await web('/workbench/chat', {
    method: 'POST', body: new URLSearchParams({ _csrf: uploadToken, postId, question: 'Edge 요약' }),
  })
  assert.equal(stream.status, 200)
  assert.match(await stream.text(), /발췌 1/)
  const auth = await json('/api/auth/login', 'POST', { email: identity.email, password: identity.password })
  assert.equal(auth.response.status, 200)
  token = auth.body.data.accessToken
  assert.match((await json('/api/ai/history')).body.data[0].answer, /발췌 1/)
  assert.equal((await json('/api/posts/' + postId)).body.data.author.nickname, identity.fullName)

  if (process.env.CHECK_MONGO === '1') {
    assert.equal((await json('/api/draft', 'PATCH', { text: 'MongoDB 초안' })).body.data.text, 'MongoDB 초안')
    assert.equal((await json('/api/draft')).body.data.text, 'MongoDB 초안')
  }

  const invalidJson = await web('/api/auth/signup', {
    method: 'POST', headers: jsonHeaders, body: '{',
  })
  assert.equal(invalidJson.status, 400)
  assert.equal((await invalidJson.json()).error.code, 'BAD_REQUEST')
  assert.equal((await web('/api-docs/assets/swagger-ui.css')).status, 200)
  console.log('세션·CSRF·업로드·WebSocket·SSE·Swagger 검증 완료')
} finally {
  if (socket) socket.terminate()
  if (token && postId) await json('/api/posts/' + postId, 'DELETE')
  if (token) await json('/api/auth/logout', 'POST')
}
