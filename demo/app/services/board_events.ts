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
