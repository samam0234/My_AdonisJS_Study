# study12 · 프론트·UI 연동

## ① 목표

Edge의 UI 컴포넌트에 Alpine 상태와 Zod 폼 검증을 적용한다.

## ② 📖 이론

Edge는 서버에서 초기 마크업을 만들고 Alpine의 `x-data` 상태는 현재 화면의 값만 보관한다. Zod의 `safeParse`는 JS 요청 전에 입력 형태를 확인한다. 재사용 레이아웃은 같은 도면을 쓰는 공용 구조이며 `aria-live`는 화면 변경을 읽어주는 안내 방송과 같다.

[공식·원문 참고](https://alpinejs.dev/directives/model)

## ③ 🛠️ 실기

`/workbench`의 `documentQuestion` Alpine 상태와 `x-model`을 연결한다. 질문의 글자 수가 `x-text`에서 바뀌고, 제출 직전 Zod로 1~1000자를 확인한다. 서버의 Vine 검사도 유지한다. 게시판 화면은 Edge 레이아웃을 공유하고 `board.css`에서 모바일 너비와 포커스 스타일을 지정한다.

1. `npm run dev` 후 브라우저 폭을 줄이고 작업실 폼을 확인한다.

### [`demo/resources/views/pages/board/workbench.edge`](demo/resources/views/pages/board/workbench.edge)

```html
@component('components/layouts/board', { title: 'AI 작업실' })
  <h1>AI 작업실</h1>
  <p>게시글을 문서로 사용해 요약하거나 근거가 있는 답변을 확인합니다.</p>
  @if(auth.user)
    <form method="post" action="/workbench/upload" enctype="multipart/form-data">
      {{ csrfField() }}
      <label>게시판에 공개할 문서 <input type="file" name="document" accept=".txt,.md" required></label>
      <button>게시글로 가져오기</button>
    </form>
    <form action="/workbench/chat" method="post" data-chat x-data="documentQuestion">
      {{ csrfField() }}
      <label>글 번호 <input name="postId" type="number" min="1" required></label>
      <label>질문 <textarea name="question" maxlength="1000" required x-model="question"></textarea></label>
      <small><span x-text="question.length">0</span> / 1000자</small>
      <button>답변 받기</button>
    </form>
    <p data-answer role="status" class="study-body"></p>
    <a href="/workbench/history">내 질문 기록 (JSON)</a>
    <form method="post" action="/workbench/mail">
      {{ csrfField() }}
      <button>내 주소로 테스트 메일 예약</button>
    </form>
    <form method="post" action="/workbench/checkout">
      {{ csrfField() }}
      <button>Stripe 테스트 결제</button>
    </form>
  @else
    <a href="/login">작업실에 로그인하기</a>
    <a href="/oauth/github">GitHub 계정으로 로그인하기</a>
  @endif
@end
```

소스의 첫 줄을 1행으로 센다.

- 1행 이 파일에서 사용할 설정과 공용 구조를 선언한다.
- 2–3행 작업실의 역할과 입력 가능한 기능을 표시한다.
- 4–9행 로그인 상태에서 공개할 문서 폼과 CSRF를 제공한다.
- 10–17행 Alpine 상태와 질문 글자 수, 스트리밍 출력을 연결한다.
- 18행 현재 사용자의 기록 조회를 연결한다.
- 19–26행 메일 예약과 테스트 결제를 각각 별도 POST로 제출한다.
- 27–31행 게스트에게 세션 또는 GitHub 로그인 시작 링크를 표시한다.

### [`demo/resources/js/board.js`](demo/resources/js/board.js)

```js
import Alpine from 'alpinejs'
import { z } from 'zod'

Alpine.data('documentQuestion', () => ({ question: '' }))
Alpine.start()

const draft = document.querySelector('[data-draft]')
const draftKey = 'adonis-board-draft'

if (document.querySelector('[data-draft-saved]')) {
  try { localStorage.removeItem(draftKey) } catch { /* Optional browser storage. */ }
}

if (draft) {
  const fields = ['title', 'body'].map((name) => draft.elements.namedItem(name))
  try {
    const values = JSON.parse(localStorage.getItem(draftKey) ?? '[]')
    fields.forEach((field, index) => { field.value ||= values[index] ?? '' })
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
  draft.addEventListener('input', () => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(fields.map((field) => field.value)))
    } catch {
      // Form input remains available without draft persistence.
    }
  })
  draft.querySelector('[data-validate]').addEventListener('click', async () => {
    const output = draft.querySelector('output')
    try {
      const response = await fetch('/board/validate', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new URLSearchParams(new FormData(draft)),
      })
      const payload = await response.json()
      output.textContent = response.ok ? '입력값이 유효합니다.'
        : response.status === 422 ? payload.errors.map(({ message }) => message).join(' ')
          : '요청을 확인하세요.'
    } catch {
      output.textContent = '서버에 연결할 수 없습니다.'
    }
  })
}

const notice = document.querySelector('[data-board-notice]')
if (notice) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(protocol + '//' + location.host + '/board-events')
  socket.addEventListener('message', ({ data }) => {
    if (data === 'board.changed') notice.textContent = '게시판이 갱신되었습니다. 새로고침해 확인하세요.'
  })
}

const chat = document.querySelector('[data-chat]')
if (chat) {
  const question = z.string().trim().min(1).max(1000)
  chat.addEventListener('submit', async (event) => {
    event.preventDefault()
    const output = document.querySelector('[data-answer]')
    const button = chat.querySelector('button')
    if (button.disabled) return
    const form = new FormData(chat)
    if (!question.safeParse(form.get('question')).success) {
      output.textContent = '질문을 1~1,000자로 입력하세요.'
      return
    }
    button.disabled = true
    output.textContent = ''
    try {
      const response = await fetch(chat.action, {
        method: 'POST',
        headers: { Accept: 'text/event-stream, application/json' },
        body: new URLSearchParams(form),
        signal: AbortSignal.timeout(35_000),
      })
      if (!response.ok || !response.headers.get('content-type')?.startsWith('text/event-stream')) {
        throw new Error('글 번호, 로그인 상태 또는 한도를 확인하세요.')
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
      let pending = ''
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) throw new Error('AI 스트림이 일찍 종료되었습니다.')
          pending += value
          const frames = pending.split('\n\n')
          pending = frames.pop()
          for (const frame of frames) {
            const raw = frame.slice('data: '.length)
            if (raw === '[DONE]') return
            const payload = JSON.parse(raw)
            if (payload.error) throw new Error(payload.error.message)
            if (payload.text) output.textContent += payload.text
          }
        }
      } finally {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
    } catch (error) {
      output.textContent = error.message
    } finally {
      button.disabled = false
    }
  })
}

document.addEventListener('submit', (event) => {
  if (event.defaultPrevented || event.target.method !== 'post') return
  if (event.target.dataset.submitting) {
    event.preventDefault()
    return
  }
  event.target.dataset.submitting = 'true'
  if (event.submitter) event.submitter.disabled = true
})

window.addEventListener('pageshow', () => {
  document.querySelectorAll('form[data-submitting]').forEach((form) => {
    delete form.dataset.submitting
    form.querySelectorAll('button:disabled').forEach((button) => { button.disabled = false })
  })
})
```

소스의 첫 줄을 1행으로 센다.

- 1–3행 Vite의 브라우저 모듈에서 Alpine 상태와 Zod 검증을 불러온다.
- 4–6행 질문 문자열의 상태를 등록하고 페이지에서 Alpine을 시작한다.
- 7–9행 게시판 글 폼과 브라우저 초안 저장 키를 찾는다.
- 10–13행 등록 성공 화면에서 선택 기능인 저장소의 초안을 삭제한다.
- 14–21행 입력 필드를 찾고 서버의 기존 폼 값이 비어 있을 때 초안을 복원한다.
- 22–28행 입력할 때 제목과 본문을 브라우저 저장소에 갱신한다.
- 29–46행 폼을 세션 서버에 보내고 성공·422·연결 오류를 출력 영역에 표시한다.
- 47–55행 게시판 목록에서 같은 서버의 WebSocket에 연결해 변경 알림 문구를 표시한다.
- 56–71행 작업실의 폼과 글자 검증을 연결하고 중복 제출을 차단한다.
- 72–80행 CSRF가 포함된 폼을 URL 인코딩해 보내고 스트리밍 응답인지 확인한다.
- 81–98행 UTF-8 스트림의 프레임 경계를 복원해 [DONE], 오류, 부분 텍스트를 분리한다.
- 99–109행 완료·실패 시 스트림을 정리하고 버튼을 다시 활성화한다.
- 110–125행 일반 POST 폼의 제출 버튼을 한 번만 동작시키고 뒤로 가기 복원 시 다시 활성화한다.

### [`demo/resources/css/board.css`](demo/resources/css/board.css)

```css
.study { color: #202a35; background: #f4f6f8; font-family: system-ui, sans-serif; min-height: 100vh; }
.study-nav { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; padding: 1rem max(1rem, calc((100% - 50rem) / 2)); background: #173e3b; color: #fff; }
.study-nav nav { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; }
.study-nav a { color: inherit; }
.study-main { max-width: 50rem; margin: 2rem auto; padding: clamp(1rem, 4vw, 2rem); background: white; border: 1px solid #d8e2e1; border-radius: 0.8rem; }
.study-main h1 { font-size: 2rem; }
.study-main h2 { font-size: 1.3rem; }
.study-main form { display: grid; gap: 0.65rem; margin-block: 1rem; justify-items: start; }
.study-main form label { display: grid; width: min(100%, 36rem); gap: 0.25rem; }
.study-main input, .study-main textarea { color: inherit; width: 100%; border: 1px solid #879e9b; border-radius: 0.25rem; padding: 0.55rem; }
.study-main textarea { min-height: 6rem; }
.study button { border: 1px solid currentColor; color: inherit; background: transparent; border-radius: 0.25rem; padding: 0.35rem 0.7rem; cursor: pointer; }
.study button:disabled { cursor: wait; opacity: 0.55; }
.study-body { white-space: pre-wrap; overflow-wrap: anywhere; }
.study-main :is(p, ul) { margin-block: 0.7rem; }
.study-main :is([role='alert'], output) { color: #8f2c29; }
.study :focus-visible { outline: 3px solid #1c7dcb; outline-offset: 2px; }
```

소스의 첫 줄을 1행으로 센다.

- 1–7행 게시판의 기본 색·글꼴·레이아웃을 지정한다.
- 8–13행 좁은 화면에서 폼 너비와 입력·버튼 상태를 제어한다.
- 14–17행 긴 텍스트 줄바꿈과 오류 색, 키보드 포커스를 표현한다.

## ④ 🔗 연동 포인트

Edge의 세션 CSRF를 `FormData`로 전달하고 SSE를 받는다. 브라우저 폼 상태는 화면을 떠나면 사라지며 기록은 `/workbench/history`에서 SQL DB에 연결한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 문자 수가 멈춤 | Alpine 진입점이 로드되지 않음 | `@vite` 자산과 `Alpine.start()`를 확인한다. |
| 브라우저 통과 후 서버 거부 | 검증 제한 또는 JS 값이 다름 | Vine 응답과 스키마의 길이 설정을 맞춘다. |

## ⑥ 직접 해보기

1. 질문을 입력해 글자 수가 변하는지 확인한다.
2. 문서 폼을 키보드로 탐색하고 포커스와 결과 표시를 확인한다.

## ⑦ ☐ 체크리스트

- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

study13에서 작업실 폼을 업로드·결제·메일·OAuth에 연결한다. [study13.md](study13.md)
