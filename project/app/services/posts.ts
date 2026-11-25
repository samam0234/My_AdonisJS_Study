import Post from '#models/post'
import { type parseList, postJson } from '#services/board_contract'
import env from '#start/env'

type ListResult = Awaited<ReturnType<typeof loadPosts>>
const lists = new Map<string, { until: number; result: ListResult }>()
let generation = 0

export function invalidatePostLists() {
  generation++
  lists.clear()
}

export function postQuery() {
  return Post.query().preload('user').withCount('comments')
}

export async function listPosts(filters: ReturnType<typeof parseList>) {
  const ttl = env.get('POST_CACHE_MS') ?? 0
  if (ttl <= 0) return loadPosts(filters)
  const key = JSON.stringify(filters)
  const hit = lists.get(key)
  if (hit && hit.until > Date.now()) return hit.result
  const before = generation
  const result = await loadPosts(filters)
  if (before === generation) {
    if (lists.size >= 100) lists.delete(lists.keys().next().value!)
    lists.set(key, { until: Date.now() + ttl, result })
  }
  return result
}

async function loadPosts(filters: ReturnType<typeof parseList>) {
  const { q, sort, page, limit } = filters
  const query = postQuery()
  if (q) {
    const escaped = q.toLowerCase().replace(/[!%_]/g, '!$&')
    const pattern = `%${escaped}%`
    query.whereRaw(
      "(LOWER(posts.title) LIKE ? ESCAPE '!' OR LOWER(posts.body) LIKE ? ESCAPE '!')",
      [pattern, pattern]
    )
  }
  if (sort === '-commentCount') query.orderBy('comments_count', 'desc')
  query.orderBy('created_at', sort === 'createdAt' ? 'asc' : 'desc')
  query.orderBy('id', sort === 'createdAt' ? 'asc' : 'desc')
  const posts = await query.paginate(page, limit)
  return {
    data: posts.all().map((post) => postJson(post, false)),
    meta: {
      page,
      limit,
      total: posts.total,
      totalPages: Math.ceil(posts.total / limit),
      ...(q ? { q } : {}),
    },
  }
}
