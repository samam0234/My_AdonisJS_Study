import type { HttpContext } from '@adonisjs/core/http'
import { Bouncer } from '@adonisjs/bouncer'
import Post from '#models/post'
import Comment from '#models/comment'
import { manageContent } from '#abilities/board'
import { ApiError, commentJson, parseId, parseList, postJson } from '#services/board_contract'
import { invalidatePostLists, listPosts, postQuery } from '#services/posts'
import { publishBoardChange } from '#services/board_events'
import { createComment, createPost, patchPost } from '#validators/board'

export default class ApiPostsController {
  index({ request }: HttpContext) {
    return listPosts(parseList(request.qs()))
  }

  async show({ params }: HttpContext) {
    const post = await postQuery().where('id', parseId(params.id)).firstOrFail()
    return { data: postJson(post) }
  }

  async store({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { title, body, tags = [] } = await request.validateUsing(createPost)
    const post = await Post.create({ title, body, tagsJson: JSON.stringify(tags), userId: user.id })
    invalidatePostLists()
    publishBoardChange()
    response.header('Location', `/api/posts/${post.id}`)
    return response.created({ data: postJson(post, true, user) })
  }

  async update({ auth, params, request }: HttpContext) {
    const post = await postQuery().where('id', parseId(params.id)).firstOrFail()
    await new Bouncer(() => auth.getUserOrFail()).authorize(manageContent, post)
    const { tags, ...payload } = await request.validateUsing(patchPost)
    if (tags === undefined && Object.keys(payload).length === 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', '수정할 필드를 입력하세요.')
    }
    post.merge(payload)
    if (tags !== undefined) post.tagsJson = JSON.stringify(tags)
    await post.save()
    invalidatePostLists()
    publishBoardChange()
    return { data: postJson(post) }
  }

  async destroy({ auth, params, response }: HttpContext) {
    const post = await Post.findOrFail(parseId(params.id))
    await new Bouncer(() => auth.getUserOrFail()).authorize(manageContent, post)
    await post.delete()
    invalidatePostLists()
    publishBoardChange()
    return response.noContent()
  }

  async comments({ params }: HttpContext) {
    const post = await Post.findOrFail(parseId(params.id))
    const comments = await Comment.query().where('postId', post.id).preload('user').orderBy('id')
    return { data: comments.map((comment) => commentJson(comment)) }
  }

  async addComment({ auth, params, request, response }: HttpContext) {
    const post = await Post.findOrFail(parseId(params.id))
    const user = auth.getUserOrFail()
    const { body } = await request.validateUsing(createComment)
    const comment = await Comment.create({ postId: post.id, userId: user.id, body })
    invalidatePostLists()
    publishBoardChange()
    return response.created({ data: commentJson(comment, user) })
  }

  async destroyComment({ auth, params, response }: HttpContext) {
    const comment = await Comment.findOrFail(parseId(params.id))
    await new Bouncer(() => auth.getUserOrFail()).authorize(manageContent, comment)
    await comment.delete()
    invalidatePostLists()
    publishBoardChange()
    return response.noContent()
  }
}
