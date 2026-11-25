import { test } from '@japa/runner'
import { parseId, parseList } from '#services/board_contract'

test('정상적인 id와 v1 페이지 기본값을 사용한다', ({ assert }) => {
  assert.equal(parseId('42'), 42)
  assert.throws(() => parseId('12x'), 'id는 양의 정수여야 합니다.')
  assert.deepEqual(parseList({}), { page: 1, limit: 10, q: '', sort: '-createdAt' })
  assert.equal(parseList({ limit: '100', sort: '-commentCount' }).limit, 50)
})

test('잘못된 정렬 값과 0페이지를 거절한다', ({ assert }) => {
  assert.throws(() => parseList({ sort: 'title' }), '지원하지 않는 정렬입니다.')
  assert.throws(() => parseList({ page: '0' }), 'page와 limit은 양의 정수여야 합니다.')
})
