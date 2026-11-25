# study1 · Hello World와 기본 문법

## ① 목표

Edge 템플릿으로 접속 가능한 첫 화면을 표시한다.

## ② 📖 이론

라우트는 URL과 동작의 연결이고 Edge는 전달된 값을 서버에서 HTML로 만든다. `const`로 바뀌지 않는 참조를 만들고 문자열·배열·객체를 콜백이나 템플릿 인자에 넘긴다. 레이아웃은 양식, View 데이터는 양식에 채우는 값이다. `{{ }}` 표현은 HTML을 이스케이프하고 `@each`는 배열을 반복한다.

[공식·원문 참고](https://docs.adonisjs.com/guides/frontend/edgejs)

## ③ 🛠️ 실기

`/`로 접속하고 Hello 제목과 Edge/Ace 목록을 확인한다. `start/routes.ts`의 `router.on('/').render(...)`가 제목과 주제 배열을 전달하므로 `topics`의 배열 항목을 하나 바꿔 본다.

1. `curl.exe -i http://localhost:3333/health`로 첫 JSON 응답을 보고 `/`에서는 HTML을 확인한다.

### [`demo/resources/views/pages/board/hello.edge`](demo/resources/views/pages/board/hello.edge)

```html
@component('components/layouts/board', { title })
  <h1>{{ title }}</h1>
  <p>이 페이지는 AdonisJS가 서버에서 렌더링합니다.</p>
  <ul>
    @each(topic in topics)
      <li>{{ topic }}</li>
    @end
  </ul>
  <a href="/board">게시판 실습 열기</a>
@end
```

소스의 첫 줄을 1행으로 센다.

- 1행 공유 레이아웃을 열고 라우트에서 전달된 제목을 넘긴다.
- 2–4행 제목과 설명을 서버에서 HTML로 치환한다.
- 5–8행 배열을 순서대로 순회하며 항목을 이스케이프한다.
- 9–10행 기존 게시판 경로로 이동한다.

### [`demo/resources/views/components/layouts/board.edge`](demo/resources/views/components/layouts/board.edge)

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ $props.get('title') }} · AdonisJS</title>
  @vite(['resources/css/app.css', 'resources/css/board.css', 'resources/js/board.js'])
</head>
<body class="study">
  <header class="study-nav">
    <a href="/"><strong>AdonisJS</strong></a>
    <nav aria-label="주 메뉴">
      <a href="/board">게시판</a>
      @if(auth.user)
        <form action="/logout" method="post">{{ csrfField() }}<button>로그아웃</button></form>
      @else
        <a href="/login">로그인</a>
        <a href="/signup">회원가입</a>
      @endif
    </nav>
  </header>
  <main class="study-main">
    {{{ await $slots.main() }}}
  </main>
</body>
</html>
```

소스의 첫 줄을 1행으로 센다.

- 1–8행 HTML 문서 언어, 인코딩, 반응형 너비와 Vite 진입점을 정한다.
- 9–13행 공유 내비게이션에 게시판과 작업실 이동을 배치한다.
- 14–21행 세션 사용자는 CSRF가 있는 로그아웃 폼을, 손님은 로그인·회원가입 링크를 받는다.
- 22–26행 이 레이아웃을 호출한 페이지의 슬롯을 본문으로 렌더링한다.

## ④ 🔗 연동 포인트

Vite의 Edge 파일 감시와 Ace의 HMR이 수정 확인을 빠르게 한다. DevTools Network에서 Document 응답을, Elements에서 생성된 목록과 링크를 확인한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 빈 제목 | 라우트 키와 템플릿 변수 불일치 | `title`을 양쪽에서 확인한다. |
| 수정 미반영 | 서버가 빌드본을 실행 중 | `npm run dev`로 실행 중인지 확인한다. |

## ⑥ 직접 해보기

1. Edge/Ace 사이에 `Lucid`를 추가하고 `<li>` 세 개를 확인한다.
2. 제목에 `<strong>실습</strong>`을 넣고 문자가 그대로 표시되는지 확인한다.

## ⑦ ☐ 체크리스트

- [ ] Edge 템플릿으로 게시판 화면, 또는 Inertia로 Vue·React 화면 연결
- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

study2에서 첫 화면의 라우트와 컨트롤러 책임을 나눈다. [study2.md](study2.md)
