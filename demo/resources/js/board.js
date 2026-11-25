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
