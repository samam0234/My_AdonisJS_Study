import { randomUUID } from 'node:crypto'
import { MongoClient } from 'mongodb'
import Stripe from 'stripe'
import nodemailer from 'nodemailer'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { ApiError } from '#services/board_contract'
import User from '#models/user'

export function stripeClient() {
  const key = env.get('STRIPE_SECRET_KEY')
  if (!key) throw new ApiError(503, 'SERVICE_DISABLED', 'Stripe 테스트 키를 설정하세요.')
  if (!key.startsWith('sk_test_'))
    throw new ApiError(503, 'SERVICE_DISABLED', 'Stripe 테스트 키만 허용합니다.')
  return new Stripe(key, { timeout: 8000, maxNetworkRetries: 1 })
}

export async function receiveCheckout(event: Stripe.Event) {
  if (
    !['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)
  )
    return
  const session = event.data.object as Stripe.Checkout.Session
  const userId = Number(session.client_reference_id)
  if (
    session.mode !== 'payment' ||
    session.payment_status !== 'paid' ||
    !Number.isSafeInteger(userId) ||
    userId < 1 ||
    session.amount_total === null ||
    !session.currency
  )
    return

  await db
    .table('payment_receipts')
    .insert({
      session_id: session.id,
      user_id: userId,
      amount: session.amount_total,
      currency: session.currency,
    })
    .onConflict('session_id')
    .ignore()
}

export async function githubUser(providerId: string, nickname: string) {
  const email = `github-${randomUUID()}@oauth.invalid`
  async function existing() {
    const row = await db.from('oauth_identities').where('provider_id', providerId).first()
    return row ? User.findOrFail(row.user_id) : null
  }
  const user = await existing()
  if (user) return user
  try {
    return await db.transaction(async (trx) => {
      const created = await User.create(
        { email, fullName: nickname.slice(0, 80), password: randomUUID() },
        { client: trx }
      )
      await trx.table('oauth_identities').insert({ provider_id: providerId, user_id: created.id })
      return created
    })
  } catch (error) {
    const concurrent = await existing()
    if (concurrent) return concurrent
    throw error
  }
}

export async function mongoDraft(userId: number, text?: string) {
  const url = env.get('MONGO_URL')
  if (!url) throw new ApiError(503, 'SERVICE_DISABLED', 'MONGO_URL을 설정하세요.')
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 3000 })
  try {
    const drafts = client.db().collection<{ _id: number; text: string }>('drafts')
    if (text !== undefined) {
      await drafts.updateOne({ _id: userId }, { $set: { text } }, { upsert: true })
    }
    const row = await drafts.findOne({ _id: userId })
    return row?.text ?? ''
  } finally {
    await client.close()
  }
}

export async function queueMail(userId: number) {
  if (!env.get('SMTP_URL') || !env.get('MAIL_FROM')) {
    throw new ApiError(503, 'SERVICE_DISABLED', 'SMTP_URL과 MAIL_FROM을 설정하세요.')
  }
  await db
    .table('mail_jobs')
    .insert({ user_id: userId, day: new Date().toISOString().slice(0, 10) })
    .onConflict(['user_id', 'day'])
    .ignore()
}

export async function deliverNextMail() {
  const smtpUrl = env.get('SMTP_URL')
  const from = env.get('MAIL_FROM')
  if (!smtpUrl || !from) return false

  const now = new Date()
  const job = await db
    .from('mail_jobs')
    .where('status', 'pending')
    .where('available_at', '<=', now)
    .orderBy('id')
    .first()
  if (!job) return false

  const claimed = await db
    .from('mail_jobs')
    .where('id', job.id)
    .where('status', 'pending')
    .update({ status: 'sending', attempts: job.attempts + 1 })
  if (!claimed) return false

  try {
    const user = await User.findOrFail(job.user_id)
    const transport = nodemailer.createTransport(smtpUrl)
    await transport.sendMail({
      from,
      to: user.email,
      messageId: `<board-study-${job.id}@study.invalid>`,
      subject: 'AdonisJS 게시판 테스트',
      text: '게시판의 백그라운드 메일 발송 실습입니다.',
    })
  } catch {
    const status = job.attempts >= 2 ? 'failed' : 'pending'
    await db
      .from('mail_jobs')
      .where('id', job.id)
      .update({
        status,
        available_at: new Date(Date.now() + 60_000 * (job.attempts + 1)),
      })
    logger.warn({ jobId: job.id, status }, 'Mail delivery failed')
    return true
  }
  await db.from('mail_jobs').where('id', job.id).update({ status: 'sent' })
  return true
}
