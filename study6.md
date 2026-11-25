# study6 · DB·API 연동

## ① 목표

Lucid 마이그레이션과 모델을 사용해 게시글·댓글의 공통 API v1을 실행한다.

## ② 📖 이론

Migration은 DB 구조의 변경 기록이고 Lucid 모델은 행과 관계의 인터페이스다. ORM은 주소록에서 사람과 전화번호를 연결하듯 게시글과 작성자·댓글을 함께 조회한다. API는 SQL 열 이름이나 패스워드 해시가 포함되지 않게 필요한 값만 직렬화한다.

[공식·원문 참고](https://lucid.adonisjs.com/docs/migrations)

## ③ 🛠️ 실기

`node ace migration:run`으로 SQLite를 준비하고 `/api/auth/signup`→`/api/auth/login`→`POST /api/posts`→목록·상세→PATCH→DELETE로 실행한다. `POST /api/posts/{id}/comments`로 댓글을 만들고 댓글 삭제 권한을 별도로 확인한다. 목록은 검색·한 페이지 최대 50개·지정 정렬을 지원한다.

1. `node ace migration:status`로 적용 여부를 확인하고 아래 PowerShell 요청을 실행한다.

```powershell
node ace migration:status
$api = 'http://localhost:3333/api'
$email = 'study-' + [guid]::NewGuid().ToString('N') + '@example.test'
$credentials = @{ email = $email; password = 'board-study-password'; nickname = 'study' }
Invoke-RestMethod "$api/auth/signup" -Method Post -ContentType 'application/json' -Body ($credentials | ConvertTo-Json)
$login = Invoke-RestMethod "$api/auth/login" -Method Post -ContentType 'application/json' -Body ($credentials | ConvertTo-Json)
$headers = @{ Authorization = 'Bearer ' + $login.data.accessToken }
$created = Invoke-RestMethod "$api/posts" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"title":"Edge","body":"Lucid CRUD","tags":["intro"]}'
$id = $created.data.id
Invoke-RestMethod "$api/posts?q=Edge"
Invoke-RestMethod "$api/posts/$id"
Invoke-RestMethod "$api/posts/$id" -Method Patch -Headers $headers -ContentType 'application/json' -Body '{"title":"Updated Edge"}'
Invoke-RestMethod "$api/posts/$id" -Method Delete -Headers $headers
```

### [`demo/database/migrations/1760000000000_create_board_tables.ts`](demo/database/migrations/1760000000000_create_board_tables.ts)

```ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('posts', (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table.string('title', 200).notNullable()
      table.text('body').notNullable()
      table.text('tags_json').notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.index(['created_at', 'id'])
    })
    this.schema.createTable('comments', (table) => {
      table.increments('id')
      table.integer('post_id').unsigned().notNullable().references('posts.id').onDelete('CASCADE')
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table.text('body').notNullable()
      table.timestamp('created_at').notNullable()
      table.index(['post_id', 'id'])
    })
    this.schema.createTable('auth_access_tokens', (table) => {
      table.increments('id')
      table
        .integer('tokenable_id')
        .unsigned()
        .notNullable()
        .references('users.id')
        .onDelete('CASCADE')
      table.string('type').notNullable()
      table.string('name').nullable()
      table.string('hash').notNullable()
      table.text('abilities').notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.timestamp('last_used_at').nullable()
      table.timestamp('expires_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable('auth_access_tokens')
    this.schema.dropTable('comments')
    this.schema.dropTable('posts')
  }
}
```

소스의 첫 줄을 1행으로 센다.

- 1–4행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 5–14행 게시글 PK, 작성자 FK, 제목·본문·태그·시각과 정렬 인덱스를 만든다.
- 15–22행 댓글 PK와 글의 FK를 만들고 부모 삭제 시 댓글이 함께 정리되게 한다.
- 23–41행 토큰 해시·종류·만료·최근 사용 시각을 기록하는 테이블을 만든다.
- 42–47행 FK 종속을 고려해 토큰·댓글·글을 역순으로 정리한다.

### [`demo/app/controllers/api_posts_controller.ts`](demo/app/controllers/api_posts_controller.ts)

```ts
import type { HttpContext } from '@adonisjs/core/http'
import { Bouncer } from '@adonisjs/bouncer'
import Post from '#models/post'
import Comment from '#models/comment'
import { manageContent } from '#abilities/board'
import { ApiError, commentJson, parseId, parseList, postJson } from '#services/board_contract'
import { listPosts, postQuery } from '#services/posts'
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
    return { data: postJson(post) }
  }

  async destroy({ auth, params, response }: HttpContext) {
    const post = await Post.findOrFail(parseId(params.id))
    await new Bouncer(() => auth.getUserOrFail()).authorize(manageContent, post)
    await post.delete()
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
    return response.created({ data: commentJson(comment, user) })
  }

  async destroyComment({ auth, params, response }: HttpContext) {
    const comment = await Comment.findOrFail(parseId(params.id))
    await new Bouncer(() => auth.getUserOrFail()).authorize(manageContent, comment)
    await comment.delete()
    return response.noContent()
  }
}
```

소스의 첫 줄을 1행으로 센다.

- 1–10행 프레임워크 모듈과 이 파일에서 쓰는 타입을 불러온다.
- 11–14행 쿼리를 검증한 후 목록과 페이지 메타를 반환한다.
- 15–19행 id를 파싱하고 작성자와 댓글 수가 포함된 한 글을 반환한다.
- 20–27행 로그인 사용자의 검증된 글을 201, Location과 함께 반환한다.
- 28–40행 작성자 권한을 확인하고 PATCH에 포함된 값만 병합한다.
- 41–47행 권한이 있는 글을 삭제하고 본문 없는 204를 반환한다.
- 48–53행 글의 존재 확인 뒤 작성자가 포함된 댓글 목록을 읽는다.
- 54–61행 검증된 본문으로 댓글을 만들고 201을 반환한다.
- 62–68행 댓글의 실제 작성자를 확인한 뒤 204로 응답한다.

## ④ 🔗 연동 포인트

`demo/.env`의 `DB_DATABASE`로 SQLite 파일을 지정한다. 네트워크 DB는 완성 앱 `project/`의 [study11](study11.md)에서 연결한다. DB의 `user_id`는 내부 FK이며 API의 `author` 및 camelCase 시간 문자열로 매핑한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| no such table | 마이그레이션 대상 DB가 다름 | `DB_DATABASE`와 `node ace migration:status`를 확인한다. |
| 목록에서 댓글 수가 0 | withCount 호출 또는 집계 alias 누락 | `$extras.comments_count`를 확인한다. |
| 201 이후 상세 URL 누락 | Location 미설정 | 생성한 id로 헤더를 구성한다. |

## ⑥ 직접 해보기

1. 빈 SQLite DB에서 마이그레이션을 실행하고 글·댓글을 생성해 본다.
2. `sort=-commentCount&limit=100` 요청에서 `limit`이 50인지 확인한다.
3. 작성자 토큰으로 PATCH 요청에 제목만 보내고 본문이 유지되는지 확인한다.

## ⑦ ☐ 체크리스트

- [ ] Lucid 모델과 마이그레이션 (`node ace make:model Post -m`)
- [ ] 목록 응답을 `data`와 `meta.page/limit/total/totalPages`로
- [ ] 필드 이름 camelCase
- [ ] 오류 응답을 `error.code/message/fields`로 (예외 핸들러)
- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

study7에서 세션·토큰과 작성자 권한을 연결한다. [study7.md](study7.md)
