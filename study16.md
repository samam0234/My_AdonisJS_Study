# study16 · 운영·CI/CD

## ① 목표

Docker와 GitHub Actions로 재현 가능한 빌드와 배포·백업 절차를 만든다.

## ② 📖 이론

멀티 스테이지 Dockerfile은 빌드 도구와 운영 런타임을 나눈다. CI는 검증과 이미지 발행, CD는 그 이미지의 운영 반영이다. 릴리스 SHA는 배송 상자의 추적 번호처럼 어떤 코드가 실행 중인지 확인하게 한다.

[공식·원문 참고](https://docs.adonisjs.com/deployment)

## ③ 🛠️ 실기

루트에서 `docker build -t adonis-study:local demo` 뒤 `docker compose up -d --wait`를 실행한다. HTTPS 리버스 프록시는 호스트 `127.0.0.1:3360`으로 연결한다. 운영 서버의 `~/adonis-study`에 compose와 `demo/.env`를 준비하고, GitHub 변수 `DEPLOY_HOST/DEPLOY_USER` 및 시크릿 `DEPLOY_SSH_KEY/DEPLOY_KNOWN_HOSTS`를 설정한다. 이미지가 비공개라면 운영 서버의 GHCR pull 권한도 준비한다. `main`의 CI는 테스트→SHA 이미지 발행→설정된 SSH 서버에 배포한다.

1. `docker compose ps`에서 DB 및 웹 health, `docker compose logs migrate`에서 종료 코드 0을 확인한다.

### [`demo/Dockerfile`](demo/Dockerfile)

```dockerfile
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
ENV npm_config_nodedir=/usr/local
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3333
COPY --from=build --chown=node:node /app/build/ ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
RUN mkdir -p tmp && chown node:node tmp
USER node
EXPOSE 3333
CMD ["node", "bin/server.js"]
```

소스의 첫 줄을 1행으로 센다.

- 1–4행 빌드 전용 베이스에 SQLite 네이티브 빌드 도구를 설치한다.
- 5–8행 잠금 파일로 의존성을 설치한 후 소스와 자산을 빌드한다.
- 9–10행 운영에 불필요한 devDependencies를 빌드 결과에서 제거한다.
- 11–19행 런타임 이미지에는 빌드와 운영 의존성을 복사하고 비루트 사용자로 시작한다.

### [`compose.yaml`](compose.yaml)

```yaml
name: adonis-study
x-app: &app
  image: ${APP_IMAGE:-adonis-study:local}
  env_file: demo/.env
  environment:
    NODE_ENV: production
    HOST: 0.0.0.0
    PORT: 3333
    APP_URL: ${PUBLIC_URL:-http://localhost:3360}
    DB_CONNECTION: pg
    DB_HOST: db
    DB_PORT: 5432
    DB_DATABASE: adonis
    DB_USER: adonis
    DB_PASSWORD: ${POSTGRES_PASSWORD:-adonis-local-only}
    DB_SSL: 'false'
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: adonis
      POSTGRES_USER: adonis
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-adonis-local-only}
    volumes: [pg-data:/var/lib/postgresql/data]
    healthcheck:
      test: [CMD-SHELL, 'pg_isready -U adonis -d adonis']
      interval: 3s
      timeout: 3s
      retries: 15
  migrate:
    <<: *app
    command: [node, ace, 'migration:run', --force]
    depends_on:
      db:
        condition: service_healthy
  web:
    <<: *app
    depends_on:
      migrate:
        condition: service_completed_successfully
    ports: ['127.0.0.1:3360:3333']
    healthcheck:
      test: [CMD, node, -e, "fetch('http://127.0.0.1:3333/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 4s
      retries: 5
    restart: unless-stopped
  mail-worker:
    <<: *app
    profiles: [mail]
    command: [node, ace, 'mail:work', --watch]
    depends_on:
      migrate:
        condition: service_completed_successfully
    restart: unless-stopped
volumes:
  pg-data:
```

소스의 첫 줄을 1행으로 센다.

- 1–16행 로컬 Docker 리소스 이름과 공통 운영 환경을 정의한다.
- 17–23행 PostgreSQL 볼륨과 준비 확인을 구성한다.
- 24–29행 DB 데이터를 컨테이너 교체 이후에도 보존한다.
- 30–35행 DB가 준비되면 운영 마이그레이션을 한 번 실행한다.
- 36–47행 마이그레이션 성공 이후 앱을 띄우고 헬스를 확인한다.
- 48–57행 메일 프로필을 켤 때 처리 워커가 별도 프로세스로 실행된다.

### [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

```yaml
name: AdonisJS CI and deployment
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: demo
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
          cache-dependency-path: demo/package-lock.json
      - run: npm ci
      - run: cp .env.example .env && node ace generate:key
      - run: npm run lint
      - run: npm run build
      - run: npm test

  image:
    needs: test
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image: ${{ steps.image.outputs.ref }}
    steps:
      - uses: actions/checkout@v4
      - id: image
        run: echo "ref=ghcr.io/${GITHUB_REPOSITORY,,}:$GITHUB_SHA" >> "$GITHUB_OUTPUT"
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: demo
          push: true
          tags: ${{ steps.image.outputs.ref }}

  deploy:
    needs: image
    if: vars.DEPLOY_HOST != ''
    runs-on: ubuntu-latest
    environment: production
    concurrency: production
    steps:
      - name: Deploy pinned image
        env:
          DEPLOY_HOST: ${{ vars.DEPLOY_HOST }}
          DEPLOY_USER: ${{ vars.DEPLOY_USER }}
          SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          SSH_HOST_KEYS: ${{ secrets.DEPLOY_KNOWN_HOSTS }}
          APP_IMAGE: ${{ needs.image.outputs.image }}
        run: |
          install -d -m 700 ~/.ssh
          printf '%s\n' "$SSH_KEY" > ~/.ssh/key
          chmod 600 ~/.ssh/key
          printf '%s\n' "$SSH_HOST_KEYS" > ~/.ssh/known_hosts
          ssh -o BatchMode=yes -i ~/.ssh/key "$DEPLOY_USER@$DEPLOY_HOST" \
            "cd ~/adonis-study && APP_IMAGE='$APP_IMAGE' docker compose pull && APP_IMAGE='$APP_IMAGE' docker compose up -d --wait"
```

소스의 첫 줄을 1행으로 센다.

- 1행 이 파일에서 사용할 설정과 공용 구조를 선언한다.
- 2–10행 PR과 main push에서 실행하고 기본 읽기 권한을 설정한다.
- 11–28행 Node 24의 잠금 버전 설치 후 린트·빌드·테스트를 실행한다.
- 29–52행 테스트가 끝난 main push에 한해 SHA 태그로 GHCR 이미지를 발행한다.
- 53–73행 지정된 운영 호스트에서 known_hosts로 인증하고 Compose가 동일한 이미지를 실행한다.

## ④ 🔗 연동 포인트

`docker compose logs -f web migrate`로 기동·마이그레이션을 보고 헬스·외부 응답 지연·오류율을 감시한다. `docker compose exec -T db pg_dump -U adonis -d adonis -Fc -f /tmp/adonis.backup`과 `docker compose cp db:/tmp/adonis.backup ./adonis.backup`으로 스냅샷을 받아 테스트 DB에 `pg_restore`한다. 이전 SHA로 롤백할 때 스키마의 하위 호환을 확인한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 마이그레이션 오류 | DB 접속 또는 이미 실행 중인 작업 | migrate 로그와 DB health를 확인한다. |
| 배포 잡 생략 | DEPLOY_HOST 미설정 | 운영 환경 변수와 SSH 설정을 확인한다. |
| 백업 복원 실패 | 대상 DB·dump 형식 불일치 | 별도 DB와 pg_restore의 대상 및 버전을 확인한다. |

## ⑥ 직접 해보기

1. Compose가 기동하면 `/health`와 Swagger 응답을 확인한다.
2. 백업을 별도 DB에 복원해 `posts` 행 수를 비교한다.
3. CI에서 어느 단계에 컨테이너 이미지 SHA가 정해지는지 찾는다.

## ⑦ ☐ 체크리스트

- [ ] 운영 APP_KEY·DB 암호·TLS 프록시·배포 SSH known_hosts 설정
- [ ] CI 린트·빌드·Japa 이후 이미지 릴리스
- [ ] DB 백업 복구·헬스·요청 로그 점검
- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

study17에서 HTTP 서버에 실시간 게시판 알림을 연결한다. [study17.md](study17.md)
