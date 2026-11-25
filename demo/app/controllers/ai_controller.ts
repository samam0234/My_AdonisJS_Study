import { Readable } from 'node:stream'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import vine from '@vinejs/vine'
import { prepareChat } from '#services/ai_chat'
import { ApiError } from '#services/board_contract'

const chat = vine.create({
  postId: vine.number().withoutDecimals().min(1).max(2_147_483_647),
  question: vine.string().trim().minLength(1).maxLength(1000),
})
const unavailable = { code: 'AI_UNAVAILABLE', message: 'AI 응답을 가져오지 못했습니다.' }
const event = (payload: object | '[DONE]') =>
  'data: ' + (typeof payload === 'string' ? payload : JSON.stringify(payload)) + '\n\n'

export default class AiController {
  async chat({ request, auth, logger }: HttpContext) {
    const { postId, question } = await request.validateUsing(chat)
    const session = await prepareChat(auth.getUserOrFail().id, postId, question)
    const chunks = []
    try {
      for await (const part of session.run(AbortSignal.timeout(30_000))) chunks.push(part)
    } catch {
      logger.warn({ postId }, 'AI generation failed')
      throw new ApiError(502, unavailable.code, unavailable.message)
    }
    return { data: { text: chunks.join(''), sources: session.sources } }
  }

  async stream({ request, response, auth, logger }: HttpContext) {
    const { postId, question } = await request.validateUsing(chat)
    const session = await prepareChat(auth.getUserOrFail().id, postId, question)
    response.header('Content-Type', 'text/event-stream; charset=utf-8')
    response.header('Cache-Control', 'no-cache, no-transform')
    response.header('X-Accel-Buffering', 'no')

    const controller = new AbortController()
    const connection = response.response
    const abort = () => controller.abort()
    connection.once('close', abort)
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)])
    async function* data() {
      try {
        for await (const text of session.run(signal)) yield event({ text })
        yield event({ sources: session.sources })
        yield event('[DONE]')
      } catch {
        if (!controller.signal.aborted) {
          logger.warn({ postId }, 'AI stream failed')
          yield event({ error: unavailable })
        }
      } finally {
        connection.off('close', abort)
      }
    }
    response.stream(Readable.from(data()))
  }

  async history({ auth }: HttpContext) {
    const rows = await db
      .from('ai_histories')
      .where('user_id', auth.getUserOrFail().id)
      .orderBy('id', 'desc')
      .limit(20)
    return {
      data: rows.map((row) => ({
        id: row.id,
        postId: row.post_id,
        question: row.question,
        answer: row.answer,
        sources: JSON.parse(row.sources_json),
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
      })),
    }
  }
}
