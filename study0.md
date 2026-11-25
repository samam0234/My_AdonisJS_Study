# study0 · 환경 설정

## ① 목표

AdonisJS v7 실습 앱을 설치하고 Edge 화면을 개발 서버에서 열 수 있다.

## ② 📖 이론

AdonisJS는 Node.js에서 TypeScript로 HTTP 요청, HTML 화면, 데이터 접근을 관리한다. Ace는 작업 명령을 실행하는 도구이고 루트 폴더는 라우트·미들웨어 시작점(`start/`), 모델·컨트롤러(`app/`), 설정(`config/`), 스키마 변경 기록(`database/migrations/`), Edge·Vite 소스(`resources/`), 실행 진입점(`bin/`)으로 나뉜다. Ace는 공구함, 라우터는 접수 창구, 마이그레이션은 DB 구조 변경 일지에 해당한다.

[공식·원문 참고](https://docs.adonisjs.com/installation)

## ③ 🛠️ 실기

기초·중간 실습 앱은 `demo/`에서 시작한다. AdonisJS 7, Node.js 24+, npm 11+를 사용한다. 설치 전 `node -v`, `npm -v`, `git --version`을 확인한다. 새 앱을 시험할 때는 이 저장소 밖에서 `npm init adonisjs@latest scratch -- --kit=hypermedia --pkg=npm`을 실행한다. v7에서 Edge가 포함된 스타터는 `hypermedia`이며 JSON 전용 스타터는 `--kit=api`다. 프로젝트 파일을 받은 경우 루트 Git은 이미 있으므로 `git status --short`만 실행한다. 초기 폴더에 Git이 없을 때 `git init -b main`을 실행한다. `code --install-extension adonisjs.vscode-edge`로 Edge 문법 지원을 설치하고 VS Code에서 작업 영역 TypeScript 버전을 고른다.

1. `cd demo`에서 `npm ci`로 잠금 버전을 설치하고 `Copy-Item .env.example .env`로 처음 한 번 파일을 복사한다.
2. `node ace generate:key`로 앱 키를 생성하고 `node ace migration:run`으로 DB를 준비한다.
3. `npm run dev` 또는 `node ace serve --hmr`로 실행한 후 `http://localhost:3333`을 연다.
4. `npm ls @adonisjs/core`로 실습 저장소에 설치된 버전을 확인한다.

```powershell
cd demo
npm ci
Copy-Item .env.example .env
node ace generate:key
node ace migration:run
npm run dev
```

### [`demo/.env.example`](demo/.env.example)

```text
# Node
TZ=UTC
PORT=3333
HOST=localhost
NODE_ENV=development

# App
LOG_LEVEL=info
APP_KEY=
APP_URL=http://${HOST}:${PORT}

# Session
SESSION_DRIVER=cookie

# Database (file name inside ./tmp)
DB_DATABASE=db.sqlite3
CORS_ORIGIN=http://localhost:5173
```

소스의 첫 줄을 1행으로 센다.

- 1행 이 파일의 첫 선언과 공통 설정을 정의한다.
- 2–7행 Node 프로세스의 시간대, IP, 포트와 실행 환경을 정한다.
- 8–12행 로그 수준, 생성할 APP_KEY, 브라우저가 접속하는 주소를 설정한다.
- 13–15행 웹 세션의 기본 저장 방식을 쿠키로 선택한다.
- 16행 demo/tmp 아래 SQLite 파일 이름을 정한다.
- 17행 로컬 API가 허용할 브라우저 출처를 설정한다.

### [`.gitignore`](.gitignore)

```text
**/node_modules/
**/.adonisjs/
**/build/
**/.env
**/.env.*
!**/.env.example
**/coverage/
**/*.log
```

소스의 첫 줄을 1행으로 센다.

- 1행 어느 하위 앱에서도 npm이 내려받은 의존성을 추적하지 않는다.
- 2–3행 자동 생성된 AdonisJS 인덱스와 빌드 출력은 재생성할 수 있다.
- 4–5행 실제 환경 파일·파생 환경 파일을 제외한다.
- 6행 비밀 값 없는 환경변수 예제는 Git으로 공유한다.
- 7–8행 테스트 산출물과 로컬 로그를 제외한다.

## ④ 🔗 연동 포인트

개발 서버는 `.env`의 `APP_URL`과 DB 경로를 사용한다. `.env.example`은 커밋하고 키와 생성된 SQLite 파일은 Git에서 제외한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| Unsupported engine | Node 버전 불일치 | Node 24에서 npm을 다시 실행한다. |
| EADDRINUSE | 개발 포트가 이미 열림 | PORT와 APP_URL의 포트를 함께 변경한다. |
| APP_KEY 누락 | 예제 파일만 복사함 | `node ace generate:key`로 키를 만든다. |

## ⑥ 직접 해보기

1. `node ace list`에서 `serve`, `migration:run`을 찾는다.
2. `git check-ignore .env`를 demo에서 실행하고 `.env.example`은 추적 가능한지 확인한다.

## ⑦ ☐ 체크리스트

- [ ] `npm init adonisjs@latest`로 프로젝트 생성 (web 또는 api 스타터 킷)
- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

개발 서버가 준비되면 study1에서 Edge 첫 화면을 띄운다. [study1.md](study1.md)
