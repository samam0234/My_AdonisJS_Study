# study17 · 실시간·확장

## ① 목표

WebSocket으로 게시판 갱신을 알리고 업로드 텍스트를 안전하게 처리한다.

## ② 📖 이론

WebSocket은 한 연결에서 계속 신호를 받는 통로다. 이 실습의 이벤트는 공개 게시판이 바뀌었다는 작은 알림만 보낸다. 안내 방송이 새 문서의 존재만 알려주면, 참가자는 기존 HTTP 경로로 내용을 확인한다.

[공식·원문 참고](https://github.com/websockets/ws)

## ③ 🛠️ 실기

`/board`를 브라우저 두 탭에 열고 한 탭에서 글이나 댓글을 변경한다. WebSocket은 `APP_URL`의 Origin을 확인하며 소켓에서 들어온 메시지는 1008로 종료한다. 파일은 서버의 임시 경로에서 읽고 확장자·크기·UTF-8을 검증한 뒤 DB에 본문만 저장한다.

1. DevTools Network의 WS에서 `board.changed` 메시지를 확인한다.

### [`project/app/services/board_events.ts`](project/app/services/board_events.ts)

```ts
import { WebSocket, WebSocketServer } from 'ws'
import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'

const sockets = new WebSocketServer({ noServer: true, maxPayload: 512 })

export function attachBoardEvents(server: Server, origin: string) {
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (
      request.url !== '/board-events' ||
      request.headers.origin !== origin ||
      sockets.clients.size >= 200
    ) {
      socket.destroy()
      return
    }
    sockets.handleUpgrade(request, socket, head, (client) => {
      client.on('error', () => client.terminate())
      client.on('message', () => client.close(1008))
    })
  }
  server.on('upgrade', upgrade)
  return () => {
    server.off('upgrade', upgrade)
    for (const client of sockets.clients) client.terminate()
  }
}

export function publishBoardChange() {
  for (const client of sockets.clients) {
    if (client.readyState === WebSocket.OPEN && client.bufferedAmount < 8192) {
      client.send('board.changed')
    }
  }
}
```

소스의 첫 줄을 1행으로 센다.

- 1–4행 프레임워크 모듈과 이 파일에서 쓰는 타입을 불러온다.
- 5–6행 HTTP 서버를 재사용하는 WebSocket 서버와 수신 메시지 크기 상한을 정한다.
- 7–22행 경로·Origin·최대 연결 수를 확인한 뒤 연결을 업그레이드한다.
- 23–28행 종료 시 업그레이드 리스너를 제거하고 소켓을 닫는다.
- 29–35행 전송 가능한 소켓에 비식별 공개 변경 신호만 보낸다.

### [`project/providers/board_events_provider.ts`](project/providers/board_events_provider.ts)

```ts
import type { ApplicationService } from '@adonisjs/core/types'
import server from '@adonisjs/core/services/server'
import env from '#start/env'
import { attachBoardEvents } from '#services/board_events'

export default class BoardEventsProvider {
  #detach?: () => void
  constructor(protected app: ApplicationService) {}

  ready() {
    const nodeServer = server.getNodeServer()
    if (nodeServer) this.#detach = attachBoardEvents(nodeServer, new URL(env.get('APP_URL')).origin)
  }

  shutdown() {
    this.#detach?.()
  }
}
```

소스의 첫 줄을 1행으로 센다.

- 1–5행 프레임워크 모듈과 이 파일에서 쓰는 타입을 불러온다.
- 6–14행 AdonisJS HTTP 서버가 준비된 시점에 소켓을 붙인다.
- 15–18행 애플리케이션 종료 때 소켓 리소스를 정리한다.

## ④ 🔗 연동 포인트

프록시에서 `/board-events` 연결 업그레이드를 통과시키고 HTTPS에서는 브라우저가 `wss:`를 쓴다. 다른 인스턴스에 변경 이벤트를 전달해야 할 때는 공유 pub/sub이 필요하다. 업로드 팁은 작업실 AI 실습과 연결된다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| WebSocket 연결 실패 | Origin 또는 프록시 업그레이드 불일치 | APP_URL과 실제 브라우저 출처를 비교한다. |
| 텍스트 422 | 확장자·길이·인코딩이 기준을 넘음 | UTF-8의 TXT·MD를 2만자 이내로 저장한다. |

## ⑥ 직접 해보기

1. 같은 출처 두 탭에서 알림을 비교한다.
2. 허용 출처를 바꿔 연결이 종료되는지 확인한다.
3. TXT를 가져온 뒤 파일 원문이 링크로 공개되지 않고 글 본문만 남는지 확인한다.

## ⑦ ☐ 체크리스트

- [ ] 이 단계의 핵심 동작을 직접 확인했다.
- [ ] 오류 상황 하나를 재현하고 원인과 해결을 기록했다.

## ⑧ 다음 단계

study18에서 업로드한 텍스트를 AI 발췌와 MCP 도구에 연결한다. [study18.md](study18.md)
