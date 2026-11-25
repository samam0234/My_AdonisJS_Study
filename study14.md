# study14 · API 설계

## ① 목표

공통 API v1을 OpenAPI 3.0 문서로 검색하고 시험한다.

## ② 📖 이론

REST의 자원 이름과 메서드는 서비스의 문법이다. `/api/posts`는 복수 자원, `/api/posts/{id}`는 한 글, PATCH는 바뀐 필드만 전달한다. OpenAPI는 주문서 견본처럼 인증·경로·입출력·오류 예제를 문서의 같은 구조로 설명한다.

[공식·원문 참고](https://spec.openapis.org/oas/v3.0.3)

## ③ 🛠️ 실기

`/api-docs`는 로컬 Swagger UI를, `/api-docs/openapi.json`은 명세 파일을 제공한다. 게시판 v1의 기존 접두어는 `/api`이며 향후 호환되지 않는 변경에는 새 버전 경로를 둘 수 있다. 목록의 page는 1부터, limit은 최대 50, 정렬은 createdAt/-createdAt/-commentCount이고 동일 시각에는 id로 순서를 고정한다.

1. 전체 버전 계약은 [openapi.json](project/contracts/openapi.json)에서 확인한다.
2. 학습 기준은 [HTTP · REST · API 설계](https://app.notion.com/p/3d6d7dec5e2e8139adbfd36dd506c65e)다.

### [`project/app/services/api_docs.ts`](project/app/services/api_docs.ts)

```ts
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import type { HttpContext } from '@adonisjs/core/http'

type Response = HttpContext['response']
const require = createRequire(import.meta.url)
const assets = {
  'swagger-ui.css': 'text/css; charset=utf-8',
  'swagger-ui-bundle.js': 'text/javascript; charset=utf-8',
} as const

export async function serveOpenApi(response: Response) {
  const contract = await readFile(new URL('../../contracts/openapi.json', import.meta.url), 'utf-8')
  return response.type('application/json').send(contract)
}

export function serveContract(response: Response) {
  return response.type('text/html').send(`<!doctype html><html lang="ko"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width">
    <title>AdonisJS API 문서</title><link rel="stylesheet" href="/api-docs/assets/swagger-ui.css">
    </head><body><main id="swagger"></main>
    <script src="/api-docs/assets/swagger-ui-bundle.js"></script>
    <script>SwaggerUIBundle({ url: '/api-docs/openapi.json', dom_id: '#swagger', validatorUrl: null })</script>
    </body></html>`)
}

export async function serveDocsAsset(response: Response, name: string) {
  if (!Object.hasOwn(assets, name)) return response.notFound()
  const asset = name as keyof typeof assets
  response.header('Content-Type', assets[asset])
  response.header('Cache-Control', 'public, max-age=3600')
  return response.send(await readFile(require.resolve('swagger-ui-dist/' + asset)))
}
```

소스의 첫 줄을 1행으로 센다.

- 1–6행 프레임워크 모듈과 이 파일에서 쓰는 타입을 불러온다.
- 7–11행 다운로드 가능한 Swagger 자산의 허용 목록과 MIME을 지정한다.
- 12–16행 배포 빌드의 원본 OpenAPI JSON을 읽어 응답한다.
- 17–26행 Swagger UI에 JSON 명세 경로와 로컬 자산을 연결한다.
- 27–33행 허용된 패키지 자산만 읽고 응답 캐시와 Content-Type을 설정한다.

### [`project/app/services/board_contract.ts`](project/app/services/board_contract.ts)

```ts
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
```

소스의 첫 줄을 1행으로 센다.

- 1–5행 프레임워크 모듈과 이 파일에서 쓰는 타입을 불러온다.
- 6–11행 HTTP 코드와 공통 오류 이름을 가진 예외를 정의한다.
- 12–19행 자원 id의 양의 정수·범위를 검증한다.
- 20–27행 목록 요청 정수의 기본값과 유효 범위를 정한다.
- 28–38행 검색·정렬·페이지의 정규화된 값을 조합한다.
- 39–46행 작성자 공개 필드와 현재 사용자의 계정 직렬화를 구분한다.
- 47–58행 글의 상세 또는 목록 필드, UTC 시간과 댓글 수를 만든다.
- 59–66행 댓글의 공개 본문·작성자·UTC 시간을 만든다.

## ④ 🔗 연동 포인트

클라이언트는 `data`, `meta`, 공통 오류인 `error.code/message/fields/requestId`를 파싱한다. 운영 로그의 X-Request-Id와 오류 본문을 맞춘다. OpenAPI의 버전은 계약 버전이며 URL 접두어는 v1의 `/api`다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| JSON 파싱 실패 | 204 응답 본문 읽기 | 204는 `json()`을 호출하지 않는다. |
| Swagger는 성공하지만 UI 오류 | CORS 또는 인증 헤더 불일치 | Network에서 OPTIONS와 실제 요청을 확인한다. |
| 문서와 런타임 필드 차이 | 계약과 컨트롤러 갱신 누락 | 명세와 Japa 응답 테스트를 같이 갱신한다. |

## ⑥ 직접 해보기

1. Swagger에서 공개 목록을 검색하고 페이지 메타를 본다.
2. Bearer를 입력하고 POST 응답의 Location으로 상세를 요청한다.
3. 없는 id와 잘못된 id의 오류 코드를 비교한다.

## ⑦ ☐ 체크리스트

- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

study15에서 목록 지연과 작업 완료 시간을 측정한다. [study15.md](study15.md)
