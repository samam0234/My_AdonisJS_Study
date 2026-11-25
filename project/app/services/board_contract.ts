import { Exception } from '@adonisjs/core/exceptions'
import type User from '#models/user'
import type Post from '#models/post'
import type Comment from '#models/comment'

export class ApiError extends Exception {
  constructor(status: number, code: string, message: string) {
    super(message, { status, code })
  }
}

export function parseId(value: string) {
  const id = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) {
    throw new ApiError(400, 'BAD_REQUEST', 'id는 양의 정수여야 합니다.')
  }
  return id
}

function queryInteger(value: unknown, fallback: number) {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : fallback
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new ApiError(400, 'BAD_REQUEST', 'page와 limit은 양의 정수여야 합니다.')
  }
  return number
}

export function parseList(query: Record<string, unknown>) {
  const page = queryInteger(query.page, 1)
  const limit = Math.min(queryInteger(query.limit, 10), 50)
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 200) : ''
  const sort = query.sort ?? '-createdAt'
  if (sort !== 'createdAt' && sort !== '-createdAt' && sort !== '-commentCount') {
    throw new ApiError(400, 'BAD_REQUEST', '지원하지 않는 정렬입니다.')
  }
  return { page, limit, q, sort }
}

export function author(user: User) {
  return { id: user.id, nickname: user.fullName ?? user.email.split('@')[0] }
}

export function account(user: User) {
  return { ...author(user), email: user.email }
}

export function postJson(post: Post, detail = true, user: User = post.user) {
  return {
    id: post.id,
    title: post.title,
    ...(detail ? { body: post.body, tags: JSON.parse(post.tagsJson) as string[] } : {}),
    author: author(user),
    commentCount: Number(post.$extras.comments_count ?? 0),
    createdAt: post.createdAt.toUTC().toISO(),
    ...(detail ? { updatedAt: (post.updatedAt ?? post.createdAt).toUTC().toISO() } : {}),
  }
}

export function commentJson(comment: Comment, user: User = comment.user) {
  return {
    id: comment.id,
    body: comment.body,
    author: author(user),
    createdAt: comment.createdAt.toUTC().toISO(),
  }
}
