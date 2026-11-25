import type { HttpContext } from '@adonisjs/core/http'
import { Bouncer } from '@adonisjs/bouncer'
import { errors } from '@vinejs/vine'
import { manageContent } from '#abilities/board'
import Post from '#models/post'
import Comment from '#models/comment'
import { parseId, parseList } from '#services/board_contract'
import { invalidatePostLists, listPosts, postQuery } from '#services/posts'
import { publishBoardChange } from '#services/board_events'
import { createComment, createPost } from '#validators/board'

export default class BoardController {
  async index({ request, view }: HttpContext) {
    const result = await listPosts(parseList(request.qs()))
    return view.render('pages/board/index', result)
  }

  async show({ params, view, auth }: HttpContext) {
    const post = await postQuery().where('id', parseId(params.id)).firstOrFail()
    const comments = await post.related('comments').query().preload('user').orderBy('id')
    const bouncer = new Bouncer(() => auth.user ?? null)
    return view.render('pages/board/show', {
      post,
      canEdit: await bouncer.allows(manageContent, post),
      comments: await Promise.all(
        comments.map(async (comment) => ({
          comment,
          canDelete: await bouncer.allows(manageContent, comment),
        }))
      ),
    })
  }

  async store({ auth, request, response, session }: HttpContext) {
    const { title, body } = await request.validateUsing(createPost)
    const post = await Post.create({
      title,
      body,
      tagsJson: '[]',
      userId: auth.getUserOrFail().id,
    })
    session.flash('draftSaved', true)
    invalidatePostLists()
    publishBoardChange()
    return response.redirect().toPath('/board/' + post.id)
  }

  async update({ auth, params, request, response }: HttpContext) {
    const post = await Post.findOrFail(parseId(params.id))
    await new Bouncer(() => auth.getUserOrFail()).authorize(manageContent, post)
    const { title, body } = await request.validateUsing(createPost)
    await post.merge({ title, body }).save()
    invalidatePostLists()
    publishBoardChange()
    return response.redirect().toPath('/board/' + post.id)
  }

  async destroy({ auth, params, response }: HttpContext) {
    const post = await Post.findOrFail(parseId(params.id))
    await new Bouncer(() => auth.getUserOrFail()).authorize(manageContent, post)
    await post.delete()
    invalidatePostLists()
    publishBoardChange()
    return response.redirect().toPath('/board')
  }

  async addComment({ auth, params, request, response }: HttpContext) {
    const post = await Post.findOrFail(parseId(params.id))
    const { body } = await request.validateUsing(createComment)
    await post.related('comments').create({ body, userId: auth.getUserOrFail().id })
    invalidatePostLists()
    publishBoardChange()
    return response.redirect().toPath('/board/' + post.id)
  }

  async destroyComment({ auth, params, response }: HttpContext) {
    const comment = await Comment.findOrFail(parseId(params.id))
    await new Bouncer(() => auth.getUserOrFail()).authorize(manageContent, comment)
    await comment.delete()
    invalidatePostLists()
    publishBoardChange()
    return response.redirect().toPath('/board/' + comment.postId)
  }

  async validate({ request, response }: HttpContext) {
    try {
      await request.validateUsing(createPost)
      return { data: { valid: true } }
    } catch (error) {
      if (!(error instanceof errors.E_VALIDATION_ERROR)) throw error
      return response.unprocessableEntity({ errors: error.messages })
    }
  }
}
