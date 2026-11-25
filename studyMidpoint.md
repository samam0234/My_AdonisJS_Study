# studyMidpoint · 중간 응용 · 로그인 게시판

## ① 목표

기초 단계의 라우팅·검증·인증·DB를 묶어 글과 댓글을 관리한다.

## ② 📖 이론

기능은 회원가입·로그인·로그아웃, 글 목록·검색·상세·등록·수정·삭제, 댓글 목록·작성·삭제, 작성자 권한, v1 API다. 이 시점의 구현 순서는 SQLite 마이그레이션 → 세션과 Bearer → 입력 검증 → Edge/JSON 라우트 → 테스트와 빌드다. 로그인 여부와 데이터의 변경 권한을 분리하면 공개 화면과 보호된 관리 동작을 같은 앱에서 구성할 수 있다.

[공식·원문 참고](https://app.notion.com/p/41fd7dec5e2e81b1a18fcf3a82d793d4)

## ③ 🛠️ 실기

폴더 구조는 `demo/start/routes.ts` → `demo/app/controllers/` → `demo/app/services/`와 `demo/app/models/` → `demo/database/migrations/`이며 화면은 `demo/resources/views/pages/board/`다. `study0`으로 실행한 다음 로그인·글·댓글을 두 사용자로 실습한다. 이 단계는 `/board`와 `/api/posts`를 완성하는 데 필요한 초기 DB·인증·화면만 사용한다.

1. 1차 배포 순서는 APP_KEY 준비 → SQLite 또는 운영 DB 마이그레이션 → Vite/TS 빌드 → HTTPS → 실측 점검이다.
2. 회고에서는 데이터 공유로 줄어든 중복과 브라우저 폼/JSON API의 서로 다른 오류 처리를 기록한다.

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

### [`demo/resources/views/pages/board/show.edge`](demo/resources/views/pages/board/show.edge)

```html
@component('components/layouts/board', { title: post.title })
  <h1>{{ post.title }}</h1>
  @if(flashMessages.has('draftSaved'))
    <p data-draft-saved role="status">글을 등록했습니다.</p>
  @end
  <p>{{ post.user.fullName ?? post.user.email.split('@')[0] }}</p>
  <p class="study-body">{{ post.body }}</p>
  @if(canEdit)
    <form action="/board/{{ post.id }}/edit" method="post">
      {{ csrfField() }}
      <label>제목 <input name="title" value="{{ old('title', post.title) }}" maxlength="200" required></label>
      @inputError('title')
        <p role="alert">{{ $message }}</p>
      @end
      <label>본문 <textarea name="body" maxlength="20000" required>{{ old('body', post.body) }}</textarea></label>
      @inputError('body')
        <p role="alert">{{ $message }}</p>
      @end
      <button>수정</button>
    </form>
    <form action="/board/{{ post.id }}/delete" method="post">{{ csrfField() }}<button>글 삭제</button></form>
  @endif
  <h2>댓글</h2>
  <ul>
    @each(item in comments)
      <li>
        <p>{{ item.comment.user.fullName ?? item.comment.user.email.split('@')[0] }} · {{ item.comment.body }}</p>
        @if(item.canDelete)
          <form action="/board/comments/{{ item.comment.id }}/delete" method="post">{{ csrfField() }}<button>댓글 삭제</button></form>
        @endif
      </li>
    @end
  </ul>
  @if(auth.user)
    <form action="/board/{{ post.id }}/comments" method="post">
      {{ csrfField() }}
      <label>댓글 <textarea name="body" maxlength="2000" required></textarea></label>
      @inputError('body')
        <p role="alert">{{ $message }}</p>
      @end
      <button>댓글 등록</button>
    </form>
  @endif
@end
```

소스의 첫 줄을 1행으로 센다.

- 1행 이 파일에서 사용할 설정과 공용 구조를 선언한다.
- 2–7행 조회한 글의 제목·작성자·본문을 표시한다.
- 8–22행 인가 결과에 따라 글 수정 및 삭제 폼을 렌더링한다.
- 23–33행 댓글과 각 댓글의 삭제 가능 여부를 표시한다.
- 34–44행 로그인 사용자가 CSRF와 함께 댓글을 등록할 수 있게 한다.

## ④ 🔗 연동 포인트

구성도

    브라우저 → Edge /board → web 세션·Shield → Controller → Lucid → SQLite
    API 사용자 → /api/posts → Bearer·Bouncer → Controller → Lucid → SQLite

동일한 글과 댓글은 Edge와 API에서 조회된다. 테스트 DB는 앱 DB와 분리하고 앱 빌드에는 환경 비밀을 포함하지 않는다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 이용자가 수정 버튼을 못 봄 | 작성자 권한이 적용됨 | 작성자 계정으로 로그인한다. |
| 검색이 다음 페이지에서 초기화 | 페이지 링크에 q 누락 | 쿼리 전달을 확인한다. |

## ⑥ 직접 해보기

1. 두 계정으로 글과 댓글의 변경 권한을 실제로 확인한다.
2. 게시판 글을 API에서 찾고 목록과 상세의 필드를 구분한다.
3. 기초 단계 기능의 성공·실패 시나리오를 각각 하나씩 기록한다.

## ⑦ ☐ 체크리스트

- [ ] 1차 배포에서 APP_KEY·DB 값과 마이그레이션 확인
- [ ] 1차 배포에서 /health, 로그인, 글/댓글 작성자 권한 확인
- [ ] 회고에서 화면과 API의 공통 조회 및 서로 다른 인증 경계를 설명
- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

### 1차 배포 회고

읽기 조회를 공유하면서 화면과 API의 반환 형식을 분리했다. 배포 전 권한 실패의 기대 상태를 별도로 검증한다.

## ⑧ 다음 단계

study11에서 같은 게시판을 PostgreSQL·MariaDB에 연결해 본다. [study11.md](study11.md)
