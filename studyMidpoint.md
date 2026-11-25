# studyMidpoint · 중간 응용 · 로그인 게시판

## ① 목표

독립 실행되는 `demo/`에서 기초 단계의 라우팅·검증·인증·SQLite를 묶어 글과 댓글을 관리한다.

## ② 📖 이론

### 기능 목록

- 회원가입·로그인·로그아웃
- 게시글 목록·검색·상세·등록·수정·삭제
- 댓글 목록·작성·삭제와 콘텐츠별 작성자 권한
- 공통 API v1의 게시글·댓글 응답과 세션 기반 Edge 화면

로그인 여부와 데이터의 변경 권한을 분리하면 공개 화면과 보호된 관리 동작을 같은 앱에서 구성할 수 있다.

[공식·원문 참고](https://app.notion.com/p/41fd7dec5e2e81b1a18fcf3a82d793d4)

## ③ 🛠️ 실기

### 폴더 구조

```text
demo/
├── start/                    라우트와 HTTP 미들웨어
├── app/controllers/          게시글 화면·API·회원 인증
├── app/models/               글·댓글·사용자
├── database/migrations/      초기 SQLite 스키마
└── resources/views/          Edge 게시판과 인증 폼
```

### 단계별 구현 순서

1. [study0](study0.md)의 명령으로 SQLite 앱을 준비하고 [study6](study6.md)의 마이그레이션으로 게시글·댓글 테이블을 만든다.
2. [study2](study2.md)의 MVC 구조대로 Post와 Comment를 만들고, [study4](study4.md)의 `/board`, `/board/:id`, `/api/posts` 경로를 연결한다.
3. [study5](study5.md)의 Vine 검증으로 글과 댓글을 검증하고, [study7](study7.md)의 세션·Bearer와 Bouncer 권한을 붙인다.
4. 아래 Edge 상세 뷰를 렌더링하고 두 사용자로 글·댓글 CRUD를 점검한다. [study9](study9.md)의 요청 테스트를 실행한다.
5. [study10](study10.md)의 명령으로 빌드한다. `http://localhost:3333/board`와 같은 포트의 공통 v1 API에서 중간 앱을 확인한다.

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

- 1–5행 Lucid가 생성한 스키마 클래스와 관계 선언에 필요한 모듈을 가져온다.
- 7행 Post 모델은 마이그레이션의 열을 가진 PostSchema를 상속한다.
- 8–9행 User 관계를 작성자에 연결한다.
- 11–12행 댓글의 목록을 hasMany 관계로 연결한다.

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

분리 전 demo에 적용된 마이그레이션 ID는 호환을 위해 유지한다. 새 demo DB에는 게시판 테이블만 생성되며 심화 기능은 project의 별도 DB에서 동작한다.

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

### 1차 배포 체크리스트

- [ ] 1차 배포에서 APP_KEY·DB 값과 마이그레이션 확인
- [ ] 1차 배포에서 /health, 로그인, 글/댓글 작성자 권한 확인
- [ ] 회고에서 화면과 API의 공통 조회 및 서로 다른 인증 경계를 설명
- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

### 1차 배포 회고

1차 배포 순서는 APP_KEY 준비 → DB 마이그레이션 → Vite/TS 빌드 → HTTPS → 요청 점검이다. 읽기 조회를 공유하면서 화면과 API의 반환 형식을 분리했다. 배포 전 권한 실패의 기대 상태를 별도로 검증한다.

## ⑧ 다음 단계

study11부터 별도 앱 `project/`를 실행하고 게시판을 PostgreSQL·MariaDB에 연결한다. [study11.md](study11.md)
