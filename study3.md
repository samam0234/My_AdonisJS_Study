# study3 · 데이터 다루기

## ① 목표

서버 데이터와 브라우저 초안을 연결하고 저장 수명을 설명한다.

## ② 📖 이론

모델은 DB 레코드와 관계, View 데이터는 현재 응답, localStorage는 같은 origin의 브라우저 초안이다. 세 가지는 원본 게시글, 화면에 뽑은 사본, 책상 위 메모와 같다. 서버의 값은 Edge에서 HTML로 바인딩하고 입력 이벤트로 초안을 저장한다.

[공식·원문 참고](https://lucid.adonisjs.com/docs/models)

## ③ 🛠️ 실기

로그인한 게시판에서 제목·본문을 입력한 뒤 새로고침한다. 브라우저 저장소는 초안만 보존하고 글 등록 후 상세 화면의 `data-draft-saved`가 초안을 지운다. 태그 배열은 `tags_json`에 JSON 문자열로 저장하고 API에서 다시 배열로 변환한다.

1. `/board`에서 로그인 전후에 폼이 나타나는 조건을 확인한다.

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

### [`demo/app/models/comment.ts`](demo/app/models/comment.ts)

```ts
import { CommentSchema } from '#database/schema'
import User from '#models/user'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class Comment extends CommentSchema {
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
```

소스의 첫 줄을 1행으로 센다.

- 1–5행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 6행 스키마 클래스의 id, postId, userId, body를 상속한다.
- 7–9행 조회에서 댓글 작성자를 함께 가져오기 위한 User 관계를 설정한다.

## ④ 🔗 연동 포인트

DB에 글을 저장하는 경계는 POST다. 브라우저 초안은 자동으로 DB에 반영되지 않으며 환경 URL이나 포트가 달라지면 별도 저장소를 사용한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 새로고침 후 초안 없음 | origin이 다르거나 저장 권한 제한 | 같은 주소로 접속하고 DevTools Storage를 확인한다. |
| 댓글 작성자가 비어 있음 | 관계 preload가 누락됨 | 조회에 `preload('user')`를 추가한다. |

## ⑥ 직접 해보기

1. 초안을 작성하고 DevTools Application → Local Storage에서 저장값을 찾는다.
2. 게시글을 등록한 뒤 초안이 사라지고 `/api/posts/{id}`에 글이 남는지 확인한다.

## ⑦ ☐ 체크리스트

- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

study4에서 주소와 쿼리로 원하는 데이터를 찾아간다. [study4.md](study4.md)
