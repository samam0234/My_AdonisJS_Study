# study11 · DB 확장

## ① 목표

게시판 SQL 연결을 PostgreSQL 또는 MariaDB로 바꾸고 MongoDB에 사용자 초안을 저장한다.

## ② 📖 이론

Lucid의 관계와 DB 마이그레이션은 SQL 연결에서 사용된다. PostgreSQL은 `pg`, MariaDB는 MySQL 프로토콜의 `mysql2`, MongoDB는 전용 드라이버로 문서 컬렉션을 사용한다. SQL의 표와 FK는 서류의 공통 장부, MongoDB 초안은 사용자별 개별 파일에 해당한다.

[공식·원문 참고](https://lucid.adonisjs.com/docs/configuration)

## ③ 🛠️ 실기

빈 PostgreSQL DB에 `DB_CONNECTION=pg`, `DB_HOST`, `DB_PORT=5432`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE`를 설정하고 `node ace migration:run`을 실행한다. MariaDB도 빈 DB를 만들고 `DB_CONNECTION=mysql`, `DB_PORT=3306`으로 같은 마이그레이션을 실행한다. SQLite의 기존 데이터는 마이그레이션 명령으로 이동하지 않으므로 스키마 생성 뒤 별도 데이터 이관·검증이 필요하다. `MONGO_URL`을 설정하면 `/api/draft`의 GET/PATCH로 로그인 사용자 `_id`의 문서를 조회/저장한다.

1. 루트 `docker compose up -d db`는 운영 예제용 PostgreSQL을 준비한다. `/api/draft`를 호출할 때는 하나의 사용자 토큰으로 GET/PATCH를 실행한다.

### [`demo/config/database.ts`](demo/config/database.ts)

```ts
import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/lucid'

const migrations = { naturalSort: true, paths: ['database/migrations'] }
const network = {
  host: env.get('DB_HOST') ?? '127.0.0.1',
  user: env.get('DB_USER'),
  password: env.get('DB_PASSWORD'),
  database: env.get('DB_DATABASE'),
  ssl: env.get('DB_SSL') ? { rejectUnauthorized: true } : undefined,
}

export default defineConfig({
  connection: env.get('DB_CONNECTION') ?? 'sqlite',
  connections: {
    sqlite: {
      client: 'better-sqlite3',
      connection: {
        filename:
          env.get('DB_DATABASE') === ':memory:' ? ':memory:' : app.tmpPath(env.get('DB_DATABASE')),
      },
      useNullAsDefault: true,
      migrations,
      schemaGeneration: {
        enabled: !app.inTest && !app.inProduction,
        rulesPaths: ['./database/schema_rules.js'],
      },
    },
    pg: {
      client: 'pg',
      connection: { ...network, port: env.get('DB_PORT') ?? 5432 },
      migrations,
      schemaGeneration: { enabled: false },
    },
    mysql: {
      client: 'mysql2',
      connection: { ...network, port: env.get('DB_PORT') ?? 3306, timezone: 'Z' },
      migrations,
      schemaGeneration: { enabled: false },
    },
  },
})
```

소스의 첫 줄을 1행으로 센다.

- 1–4행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 5–14행 DB 종류에 관계없이 같은 마이그레이션 경로와 네트워크 옵션을 재사용한다.
- 15–16행 환경 기본값 SQLite 또는 지정한 SQL 연결을 선택한다.
- 17–29행 로컬 파일 또는 메모리 SQLite를 열고 개발에서만 스키마를 재생성한다.
- 30–35행 PostgreSQL에 드라이버와 기본 포트를 지정한다.
- 36–43행 MariaDB의 mysql2 연결과 UTC 설정을 지정한다.

### [`demo/app/services/integrations.ts`](demo/app/services/integrations.ts)

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

- 1–10행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 11–18행 서버 환경에서 Stripe 테스트 키를 읽어 클라이언트를 만든다.
- 19–47행 결제 성공 세션만 DB의 멱등 키로 한 번 기록한다.
- 48–71행 외부 id를 기존 사용자에 연결하고 신규 계정 생성은 트랜잭션으로 처리한다.
- 72–87행 사용자 id로 본인 초안을 읽거나 갱신하고 Mongo 연결을 닫는다.
- 88–98행 SMTP 설정을 검사하고 사용자별 하루 한 건의 작업을 예약한다.
- 99–144행 대기 작업을 조건부 갱신으로 획득하고 발송 성공 또는 지연 재시도를 저장한다.

## ④ 🔗 연동 포인트

서버 전환 뒤 `/api/posts` 계약, 작성자 FK, 날짜·정렬을 확인한다. MongoDB 실습은 초안 컬렉션으로 연결된다. `DB_SSL=true`는 신뢰 가능한 TLS 설정과 함께 쓴다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| ECONNREFUSED | host/port 또는 DB 컨테이너가 다름 | 실행 중인 컨테이너의 매핑과 서비스 이름을 확인한다. |
| relation does not exist | 대상 DB에 스키마 누락 | 연결값 확인 후 migration:run을 실행한다. |
| Mongo 503 | MONGO_URL 미설정 | DB 이름이 포함된 연결 문자열을 넣는다. |

## ⑥ 직접 해보기

1. 동일 API 요청 테스트를 SQLite와 MariaDB에서 실행한다.
2. Mongo에 저장한 초안을 두 사용자 토큰으로 각각 조회한다.

## ⑦ ☐ 체크리스트

- [ ] PostgreSQL과 MariaDB에서 스키마·CRUD 확인
- [ ] MongoDB 문서 저장을 Lucid SQL 마이그레이션과 구분
- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

study12에서 DB 데이터를 보여 주는 Edge 작업실의 사용성을 높인다. [study12.md](study12.md)
