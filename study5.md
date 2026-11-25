# study5 · 폼·입력·검증

## ① 목표

폼과 JSON 요청을 검증하고 200·400·422 응답에 맞춰 화면을 바꾼다.

## ② 📖 이론

브라우저 제약은 입력을 돕고 VineJS는 서버에서 신뢰 경계를 지킨다. 같은 시험지를 브라우저가 미리 검사하고 서버가 정식으로 채점하는 흐름이다. 이 실습은 API v1 검증 실패를 400으로 반환하고 세션의 사전 검증은 필드 메시지와 422를 반환한다.

[공식·원문 참고](https://docs.adonisjs.com/guides/basics/validation)

## ③ 🛠️ 실기

`/board`에서 입력 확인 버튼은 CSRF 토큰과 현재 입력을 `POST /board/validate`로 보낸다. 서버는 성공 시 200, Vine 오류 시 422를 반환하고 JS는 메시지를 `textContent`에 넣는다. 실제 등록은 POST 후 상세로 이동한다. 버튼 잠금은 같은 페이지에서 연속 클릭을 줄인다. 결제 같은 재시도 경계는 서버에서 멱등 키를 사용해야 한다.

1. `/board/validate`의 응답과 `/api/posts`의 v1 오류를 DevTools에서 확인한다.

### [`demo/app/validators/board.ts`](demo/app/validators/board.ts)

```ts
import vine from '@vinejs/vine'

const title = () => vine.string().trim().minLength(1).maxLength(200)
const body = () => vine.string().trim().minLength(1).maxLength(20_000)
const tags = () => vine.array(vine.string().trim().minLength(1).maxLength(32)).maxLength(10)

export const createPost = vine.create({ title: title(), body: body(), tags: tags().optional() })
export const patchPost = vine.create({
  title: title().optional(),
  body: body().optional(),
  tags: tags().optional(),
})
export const createComment = vine.create({
  body: vine.string().trim().minLength(1).maxLength(2000),
})
export const signup = vine.create({
  email: vine
    .string()
    .trim()
    .email()
    .maxLength(254)
    .transform((email) => email.toLowerCase()),
  password: vine.string().minLength(8).maxLength(64),
  nickname: vine.string().trim().minLength(1).maxLength(80),
})
export const login = vine.create({
  email: vine
    .string()
    .trim()
    .email()
    .maxLength(254)
    .transform((email) => email.toLowerCase()),
  password: vine.string().maxLength(64),
})
```

소스의 첫 줄을 1행으로 센다.

- 1–2행 이 파일에서 사용하는 모듈과 데이터 타입을 불러오고 동작에 필요한 준비를 한다.
- 3–6행 제목과 본문은 공백을 제거하고 길이를 제한하며 태그도 개수와 길이를 검증한다.
- 7–15행 글 작성 필드에서 부분 수정 필드와 댓글 입력까지 스키마를 분리한다.
- 16–25행 가입 입력은 닉네임·비밀번호 제한과 소문자 이메일 정규화를 적용한다.
- 26–34행 로그인 요청에서 같은 이메일 정규화와 비밀번호 상한을 사용한다.

### [`demo/resources/views/pages/board/index.edge`](demo/resources/views/pages/board/index.edge)

```html
@component('components/layouts/board', { title: '게시판' })
  <h1>게시판</h1>
  <form action="/board" method="get" class="study-search">
    <label>검색 <input name="q" value="{{ meta.q ?? '' }}" maxlength="200"></label>
    <button>검색</button>
  </form>
  @if(auth.user)
    <form action="/board" method="post" data-draft data-find-errors>
      {{ csrfField() }}
      <label>제목 <input name="title" value="{{ old('title', '') }}" maxlength="200" required></label>
      @inputError('title')
        <p role="alert">{{ $message }}</p>
      @end
      <label>본문 <textarea name="body" maxlength="20000" required>{{ old('body', '') }}</textarea></label>
      @inputError('body')
        <p role="alert">{{ $message }}</p>
      @end
      <button type="button" data-validate>입력 확인</button>
      <button type="submit">글 등록</button>
      <output aria-live="polite"></output>
    </form>
  @endif
  <p data-board-notice role="status"></p>
  <p>전체 {{ meta.total }}개</p>
  <ul>
    @each(post in data)
      <li><a href="/board/{{ post.id }}">{{ post.title }}</a> · {{ post.author.nickname }} · 댓글 {{ post.commentCount }}</li>
    @end
  </ul>
  <nav aria-label="페이지 이동">
    @if(meta.page > 1)
      <a href="{{ urlFor('board.index', {}, { qs: { page: meta.page - 1, q: meta.q, limit: meta.limit } }) }}">이전</a>
    @endif
    @if(meta.page < meta.totalPages)
      <a href="{{ urlFor('board.index', {}, { qs: { page: meta.page + 1, q: meta.q, limit: meta.limit } }) }}">다음</a>
    @endif
  </nav>
@end
```

소스의 첫 줄을 1행으로 센다.

- 1–2행 이 파일에서 사용할 설정과 공용 구조를 선언한다.
- 3–6행 검색 문자열을 읽어서 GET으로 전달하고 현재 값을 다시 보여 준다.
- 7–22행 세션 사용자에게만 CSRF 보호된 글 폼과 기존 값·검증 메시지를 렌더링한다.
- 23–29행 실시간 변경 표시를 위한 상태 영역과 게시글 목록을 렌더링한다.
- 30–38행 총 페이지 수에 따라 검색 조건이 유지되는 이전·다음 링크를 만든다.

## ④ 🔗 연동 포인트

`/api/posts`에 Bearer로 빈 제목을 보내면 `error.fields.title`과 400을 받는다. 웹의 `old()`와 `@inputError`는 다시 입력을 이어가게 한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 422 | 공백 또는 누락된 입력 | 필드별 메시지에 따라 값을 수정한다. |
| 403 | 세션 폼에서 CSRF 토큰이 빠짐 | 페이지를 다시 로드하고 `csrfField()` 값을 포함한다. |
| 중복 글 | 두 탭에서 같은 제출 | 서버에서 업무별 고유 키가 필요한 상황인지 판단한다. |

## ⑥ 직접 해보기

1. 제목에 공백만 넣고 입력 확인 버튼을 누른다.
2. 로그인 토큰으로 빈 JSON을 API에 보내고 `error.fields`를 확인한다.
3. 등록 버튼을 연속 클릭하고 Network 요청 수를 관찰한다.

## ⑦ ☐ 체크리스트

- [ ] VineJS로 요청 검증
- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

study6에서 검증된 값을 저장하고 API로 조회한다. [study6.md](study6.md)
