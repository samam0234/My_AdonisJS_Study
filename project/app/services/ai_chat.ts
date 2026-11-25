import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import Post from '#models/post'
import { ApiError } from '#services/board_contract'
import { evidencePrompt, excerpts, noEvidence, systemPrompt } from '#services/ai_context'
import { modelParts, type Part } from '#services/ai_provider'

export async function prepareChat(
  userId: number,
  postId: number,
  question: string,
  generate = modelParts
) {
  const post = await Post.findOrFail(postId)
  const sources = excerpts(post.body, question)
  const prompt = evidencePrompt(question, sources)
  const day = new Date().toISOString().slice(0, 10)
  const reservation = sources.length ? Buffer.byteLength(prompt + systemPrompt) + 768 : 1
  const limit = env.get('AI_DAILY_TOKEN_LIMIT') ?? 12_000
  const reserved = await db.transaction(async (trx) => {
    await trx
      .table('ai_budgets')
      .insert({ user_id: userId, day })
      .onConflict(['user_id', 'day'])
      .ignore()
    return trx
      .from('ai_budgets')
      .where({ user_id: userId, day })
      .where('reserved_tokens', '<=', limit - reservation)
      .increment('reserved_tokens', reservation)
  })
  if (!reserved) throw new ApiError(429, 'AI_QUOTA_EXCEEDED', '오늘의 AI 사용량 한도를 넘겼습니다.')

  return {
    sources,
    async *run(signal: AbortSignal) {
      let answer = ''
      const usage: Part = {}
      const parts: AsyncIterable<Part> | Part[] = sources.length
        ? generate(systemPrompt, prompt, signal)
        : [{ text: noEvidence }]
      for await (const part of parts) {
        if (part.inputTokens !== undefined) usage.inputTokens = part.inputTokens
        if (part.outputTokens !== undefined) usage.outputTokens = part.outputTokens
        if (!part.text) continue
        answer += part.text
        if (answer.length > 6000) throw new Error('Model output too large')
        yield part.text
      }
      await db.table('ai_histories').insert({
        user_id: userId,
        post_id: postId,
        question,
        answer,
        sources_json: JSON.stringify(sources),
        input_tokens: usage.inputTokens ?? null,
        output_tokens: usage.outputTokens ?? null,
      })
    },
  }
}
