# study15 · 성능·캐시

## ① 목표

공개 목록 캐시와 SMTP 백그라운드 작업을 적용하고 지연을 측정한다.

## ② 📖 이론

캐시는 요청 결과의 사본을 잠깐 재사용해 DB 비용을 줄인다. 백그라운드 워커는 HTTP 응답 시점과 외부 메일 전송을 분리한다. 빠른 안내 창구에서 접수 번호를 받은 다음 대기열에서 순서대로 처리하는 흐름과 같다.

[공식·원문 참고](https://lucid.adonisjs.com/docs/select-query-builder)

## ③ 🛠️ 실기

`POST_CACHE_MS=5000`으로 설정하고 동일 쿼리를 연속 요청한다. 쓰기 뒤 캐시를 모두 비우고 세대 번호로 이전 조회가 다시 캐시되는 시점을 차단한다. SMTP 요청은 202 후 DB `mail_jobs`에 남고 워커가 상태를 pending→sending→sent로 바꾼다. 실패는 최대 3회 시도한다. 발송 중 프로세스 중단으로 `sending`에 남은 작업은 메일 공급사의 전달 결과를 확인한 뒤 운영자가 복구한다.

1. 측정 중 같은 데이터·프로세스·쿼리를 사용하고 결과 시간을 회고에 적는다.

### [`project/app/services/posts.ts`](project/app/services/posts.ts)

```ts
import Post from '#models/post'
import { type parseList, postJson } from '#services/board_contract'
import env from '#start/env'

type ListResult = Awaited<ReturnType<typeof loadPosts>>
const lists = new Map<string, { until: number; result: ListResult }>()
let generation = 0

export function invalidatePostLists() {
  generation++
  lists.clear()
}

export function postQuery() {
  return Post.query().preload('user').withCount('comments')
}

export async function listPosts(filters: ReturnType<typeof parseList>) {
  const ttl = env.get('POST_CACHE_MS') ?? 0
  if (ttl <= 0) return loadPosts(filters)
  const key = JSON.stringify(filters)
  const hit = lists.get(key)
  if (hit && hit.until > Date.now()) return hit.result
  const before = generation
  const result = await loadPosts(filters)
  if (before === generation) {
    if (lists.size >= 100) lists.delete(lists.keys().next().value!)
    lists.set(key, { until: Date.now() + ttl, result })
  }
  return result
}

async function loadPosts(filters: ReturnType<typeof parseList>) {
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
```

소스의 첫 줄을 1행으로 센다.

- 1–4행 프레임워크 모듈과 이 파일에서 쓰는 타입을 불러온다.
- 5–8행 메모리 캐시의 결과 타입과 무효화 세대 변수를 정의한다.
- 9–13행 성공한 변경 뒤 세대 번호를 갱신하고 목록 사본을 지운다.
- 14–17행 DB에 작성자와 댓글 개수를 포함해 조회한다.
- 18–32행 캐시를 적용할 환경에서만 키·TTL·최대 개수와 무효화 세대를 검사한다.
- 33–58행 LIKE 검색에 특수문자를 이스케이프하고 안정적인 정렬과 메타를 만들어 반환한다.

### [`project/commands/mail_work.ts`](project/commands/mail_work.ts)

```ts
import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { setTimeout } from 'node:timers/promises'

export default class MailWork extends BaseCommand {
  static commandName = 'mail:work'
  static description = 'Send queued board test messages'
  static options: CommandOptions = { startApp: true }

  @flags.boolean()
  declare watch: boolean

  async run() {
    const { deliverNextMail } = await import('#services/integrations')
    do {
      if (!(await deliverNextMail()) && this.watch) await setTimeout(2000)
    } while (this.watch)
  }
}
```

소스의 첫 줄을 1행으로 센다.

- 1–4행 프레임워크 모듈과 이 파일에서 쓰는 타입을 불러온다.
- 5–9행 Ace 명령어를 만들고 실행 때 앱 컨테이너를 부팅하게 한다.
- 10–12행 워커의 지속 실행 여부를 옵션으로 받는다.
- 13–19행 처리할 메일이 없는 경우 기다리며 단발 또는 워커로 작동한다.

## ④ 🔗 연동 포인트

프로세스 메모리 캐시는 단일 인스턴스에서 동작한다. 복수 인스턴스에서는 `POST_CACHE_MS=0`을 유지하거나 공유 캐시와 무효화 전파를 연결한다. `curl.exe -o NUL -s -w '%{time_total}' 'http://localhost:3334/api/posts'`를 캐시 전후 반복하고 p50/p95를 기록한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 글 직후 오래된 목록 | 프로세스마다 별도 캐시 | 여러 프로세스에서 로컬 캐시를 끈다. |
| 메일이 계속 pending | 워커, SMTP 또는 재시도 시간이 맞지 않음 | 메일 job 상태 및 워커 로그를 확인한다. |

## ⑥ 직접 해보기

1. 같은 URL 20회에서 TTL 켜기 전후 p50과 p95를 비교한다.
2. 목록을 워밍업한 뒤 글을 추가해 새 결과가 보이는지 확인한다.
3. SMTP가 꺼져 있을 때 실패 횟수와 다음 작업 시간을 확인한다.

## ⑦ ☐ 체크리스트

- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

study16에서 앱과 워커를 컨테이너와 CI에 올린다. [study16.md](study16.md)
