# study13 · 외부 서비스 연동

## ① 목표

테스트 결제·메일·텍스트 업로드·GitHub OAuth를 작업실에서 연결한다.

## ② 📖 이론

외부 서비스는 네트워크나 계정 문제로 실패할 수 있으므로 환경 설정과 업무 결과를 분리한다. Stripe Checkout은 결제 화면으로 이동시키고 서버가 서명된 웹훅으로 완료를 확인한다. SMTP는 메일 전달이고 OAuth는 제3자의 식별자를 로그인에 연결한다. 계산대 영수증처럼 같은 checkout session ID는 DB에 한 번만 기록한다.

[공식·원문 참고](https://docs.stripe.com/webhooks)

## ③ 🛠️ 실기

Stripe 테스트 모드 가격을 만들고 `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`을 설정한다. `stripe listen --forward-to localhost:3334/api/webhooks/stripe`의 서명 키를 사용한다. SMTP는 `SMTP_URL`과 `MAIL_FROM`을 설정하고 작업실에서 메일을 예약한 뒤 `node ace mail:work`를 실행한다. GitHub OAuth 앱 콜백은 `APP_URL`의 `/oauth/github/callback`이며 두 자격 증명을 넣고 작업실 링크에서 시작한다. 텍스트 업로드는 최대 1MB, UTF-8, 본문 2만자로 제한된다.

1. Mailpit을 쓸 때 `SMTP_URL=smtp://localhost:1025`를 설정한 뒤 UI의 받은 편지함을 연다.

### [`project/app/controllers/integrations_controller.ts`](project/app/controllers/integrations_controller.ts)

```ts
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
```

소스의 첫 줄을 1행으로 센다.

- 1–16행 프레임워크 모듈과 이 파일에서 쓰는 타입을 불러온다.
- 17–19행 MongoDB 초안의 텍스트 상한을 검증한다.
- 20–43행 첨부를 검증한 뒤 UTF-8 원문을 게시글로 저장하고 페이지를 이동한다.
- 44–59행 미리 정해 둔 테스트 가격과 로그인한 사용자의 참조로 결제 화면을 만든다.
- 60–76행 Stripe 서명 헤더와 요청 원문을 검증하고 영수증 처리를 호출한다.
- 77–81행 사용자의 발송 작업을 예약하고 HTTP 202를 반환한다.
- 82–88행 설정된 OAuth 자격 증명으로 외부 로그인을 시작한다.
- 89–99행 state와 공급자 오류를 검사하고 외부 id에서 세션 계정을 찾는다.
- 100–108행 현재 API 사용자의 Mongo 초안을 읽거나 검증해 저장한다.

### [`project/app/services/integrations.ts`](project/app/services/integrations.ts)

```ts
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
```

소스의 첫 줄을 1행으로 센다.

- 1–10행 프레임워크 모듈과 이 파일에서 쓰는 타입을 불러온다.
- 11–18행 서버 환경에서 Stripe 테스트 키를 읽어 클라이언트를 만든다.
- 19–47행 결제 성공 세션만 DB의 멱등 키로 한 번 기록한다.
- 48–71행 외부 id를 기존 사용자에 연결하고 신규 계정 생성은 트랜잭션으로 처리한다.
- 72–87행 사용자 id로 본인 초안을 읽거나 갱신하고 Mongo 연결을 닫는다.
- 88–98행 SMTP 설정을 검사하고 사용자별 하루 한 건의 작업을 예약한다.
- 99–144행 대기 작업을 조건부 갱신으로 획득하고 발송 성공 또는 지연 재시도를 저장한다.

## ④ 🔗 연동 포인트

서명 검증에는 JSON을 재직렬화한 값 대신 원문 바이트를 사용한다. OAuth는 GitHub 사용자 id로 새 계정을 연결하고, 업로드한 글은 Lucid에 저장되어 AI가 발췌를 검색한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 서명 실패 400 | 시크릿 또는 원문이 다름 | Stripe CLI가 발급한 secret과 `request.raw()`를 확인한다. |
| redirect_uri 오류 | OAuth 앱의 콜백 URL 불일치 | APP_URL과 콜백을 동일하게 설정한다. |
| 메일 미발송 | 예약 상태이고 워커 미실행 | `node ace mail:work --watch`와 SMTP 연결을 확인한다. |

## ⑥ 직접 해보기

1. UTF-8 TXT를 가져와 글 상세로 연결되는지 확인한다.
2. 테스트 웹훅을 재전송하고 receipt가 한 행인지 확인한다.
3. Mailpit 등 테스트 SMTP에서 예약 메일을 확인한다.

## ⑦ ☐ 체크리스트

- [ ] Stripe 테스트 모드에서 웹훅 서명과 중복 방지 점검
- [ ] OAuth state 검증 및 서버 전용 키 확인
- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

study14에서 공개 API 계약을 OpenAPI로 문서화한다. [study14.md](study14.md)
