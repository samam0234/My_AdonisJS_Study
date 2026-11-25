import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class RequestIdMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    if (request.id()) response.header('X-Request-Id', request.id()!)
    return next()
  }
}
