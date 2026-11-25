import Post from '#models/post'
import { type parseList, postJson } from '#services/board_contract'

export function postQuery() {
  return Post.query().preload('user').withCount('comments')
}

export async function listPosts(filters: ReturnType<typeof parseList>) {
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
