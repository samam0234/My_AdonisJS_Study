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
