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
