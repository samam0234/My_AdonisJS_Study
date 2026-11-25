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
