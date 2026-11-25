# study2 · 핵심 구조

## ① 목표

라우트·컨트롤러·서비스·뷰로 요청의 책임을 나눈다.

## ② 📖 이론

Route가 요청을 골라 Controller에 건네면 Service가 조회 규칙을 적용하고 Model이 데이터를 가져온다. Controller는 View에 전달하는 데이터 계약을 정한다. 택배의 접수·분류·전달 단계처럼 책임을 나누면 검색 규칙 하나를 바꾸고 화면·JSON에서도 사용할 수 있다.

[공식·원문 참고](https://docs.adonisjs.com/guides/basics/controllers)

## ③ 🛠️ 실기

`node ace make:controller Posts`를 별도 연습 앱에서 실행해 생성 위치를 확인한다. 실습 코드의 `BoardController.index`는 `request.qs()`를 `parseList`에 넘기고 `listPosts` 결과를 Edge에 넘긴다. JSON API는 같은 조회 서비스를 호출한다.

1. VS Code의 중단점을 `index`에 두고 `/board`를 요청한다.

### [`demo/app/controllers/board_controller.ts`](demo/app/controllers/board_controller.ts)

```ts
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
```

소스의 첫 줄을 1행으로 센다.

- 1–12행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 13–17행 목록 쿼리를 해석하고 공용 서비스 결과를 Edge로 렌더링한다.
- 18–33행 동적 id로 글과 댓글을 조회하고 Bouncer로 버튼의 표시 조건을 판단한다.
- 34–47행 Vine 검사 후 로그인 사용자의 글을 저장하고 초안 삭제 신호를 설정한다.
- 48–57행 DB에서 글을 찾고 작성자 권한이 허용되면 내용을 갱신한다.
- 58–66행 작성자 권한을 확인한 글을 삭제하고 목록으로 이동한다.
- 67–75행 존재하는 글의 관계에 로그인 사용자가 새 댓글을 추가한다.
- 76–84행 댓글 작성자 확인 후 삭제하고 해당 글로 돌아간다.
- 85–94행 실제 저장 없이 같은 Vine 스키마를 적용해 200 또는 422를 준다.

### [`demo/app/models/post.ts`](demo/app/models/post.ts)

```ts
import { PostSchema } from '#database/schema'
import User from '#models/user'
import Comment from '#models/comment'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'

export default class Post extends PostSchema {
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasMany(() => Comment)
  declare comments: HasMany<typeof Comment>
}
```

소스의 첫 줄을 1행으로 센다.

- 1–6행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 7행 생성된 PostSchema의 열 타입과 BaseModel 동작을 상속한다.
- 8–10행 글의 userId가 가리키는 User를 관계로 정의한다.
- 11–13행 글 하나에서 여러 댓글로 접근할 수 있게 정의한다.

## ④ 🔗 연동 포인트

`{ data, meta }`가 서비스→컨트롤러→템플릿 사이를 오간다. 모델의 `hasMany`와 `belongsTo`는 다음 데이터 실습의 연결 기준이다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 컨트롤러가 불리지 않음 | 라우트 배열 메서드명이 코드와 다름 | `node ace list:routes`로 경로를 확인한다. |
| View에서 값이 undefined | render의 두 번째 인자에 키가 없음 | 서비스 반환값과 Edge 변수 이름을 맞춘다. |

## ⑥ 직접 해보기

1. `GET /board`와 `GET /api/posts`에서 제목이 일치하는지 확인한다.
2. `BoardController.index`에서 `request.qs()`를 디버깅하고 `?q=Edge` 값을 관찰한다.

## ⑦ ☐ 체크리스트

- [ ] `start/routes.ts` 라우팅과 컨트롤러 (`node ace make:controller`)
- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

study3에서 뷰에 전달한 값과 저장할 데이터를 다룬다. [study3.md](study3.md)
