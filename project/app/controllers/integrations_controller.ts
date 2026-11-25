import { readFile } from 'node:fs/promises'
import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import env from '#start/env'
import Post from '#models/post'
import { ApiError } from '#services/board_contract'
import {
  githubUser,
  mongoDraft,
  queueMail,
  receiveCheckout,
  stripeClient,
} from '#services/integrations'
import { publishBoardChange } from '#services/board_events'
import { invalidatePostLists } from '#services/posts'

const draft = vine.create({ text: vine.string().maxLength(20_000) })

export default class IntegrationsController {
  async upload({ request, auth, response }: HttpContext) {
    const file = request.file('document', { size: '1mb', extnames: ['txt', 'md'] })
    if (!file?.isValid || !file.tmpPath) {
      throw new ApiError(422, 'INVALID_DOCUMENT', '1MB 이하 TXT 또는 MD 파일을 선택하세요.')
    }
    let body: string
    try {
      const data = await readFile(file.tmpPath)
      body = new TextDecoder('utf-8', { fatal: true }).decode(data).trim()
      if (!body || body.includes('\0') || body.length > 20_000) throw new Error('Invalid text')
    } catch {
      throw new ApiError(422, 'INVALID_DOCUMENT', 'UTF-8 텍스트를 20,000자 이내로 입력하세요.')
    }
    const post = await Post.create({
      userId: auth.getUserOrFail().id,
      title: file.clientName.slice(0, 200),
      body,
      tagsJson: '["document"]',
    })
    invalidatePostLists()
    publishBoardChange()
    return response.redirect().toPath('/board/' + post.id)
  }

  async checkout({ auth, response }: HttpContext) {
    const price = env.get('STRIPE_PRICE_ID')
    if (!price) throw new ApiError(503, 'SERVICE_DISABLED', 'STRIPE_PRICE_ID를 설정하세요.')
    const url = new URL('/workbench', env.get('APP_URL')).href
    const session = await stripeClient().checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price, quantity: 1 }],
      client_reference_id: String(auth.getUserOrFail().id),
      success_url: url,
      cancel_url: url,
    })
    if (!session.url)
      throw new ApiError(502, 'PAYMENT_UNAVAILABLE', '결제 페이지를 열 수 없습니다.')
    return response.redirect().toPath(session.url)
  }

  async webhook({ request }: HttpContext) {
    const signature = request.header('stripe-signature')
    const secret = env.get('STRIPE_WEBHOOK_SECRET')
    const raw = request.raw()
    if (!secret || !signature || !raw)
      throw new ApiError(400, 'BAD_REQUEST', '웹훅 서명이 필요합니다.')
    const stripe = stripeClient()
    let event
    try {
      event = stripe.webhooks.constructEvent(raw, signature, secret)
    } catch {
      throw new ApiError(400, 'BAD_REQUEST', '웹훅 서명을 확인하세요.')
    }
    await receiveCheckout(event)
    return { received: true }
  }

  async mail({ auth, response }: HttpContext) {
    await queueMail(auth.getUserOrFail().id)
    return response.accepted({ data: { queued: true } })
  }

  async github({ ally }: HttpContext) {
    if (!env.get('GITHUB_CLIENT_ID') || !env.get('GITHUB_CLIENT_SECRET')) {
      throw new ApiError(503, 'SERVICE_DISABLED', 'GitHub OAuth 앱 정보를 설정하세요.')
    }
    return ally.use('github').redirect()
  }

  async githubCallback({ ally, auth, response }: HttpContext) {
    const github = ally.use('github')
    if (github.accessDenied() || github.stateMisMatch() || github.hasError()) {
      throw new ApiError(400, 'OAUTH_FAILED', 'GitHub 로그인을 다시 시작하세요.')
    }
    const identity = await github.user()
    const user = await githubUser(String(identity.id), identity.nickName || 'GitHub 사용자')
    await auth.use('web').login(user)
    return response.redirect().toPath('/workbench')
  }

  async showDraft({ auth }: HttpContext) {
    return { data: { text: await mongoDraft(auth.getUserOrFail().id) } }
  }

  async saveDraft({ auth, request }: HttpContext) {
    const { text } = await request.validateUsing(draft)
    return { data: { text: await mongoDraft(auth.getUserOrFail().id, text) } }
  }
}
