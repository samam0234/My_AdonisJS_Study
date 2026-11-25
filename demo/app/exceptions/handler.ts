import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import type { StatusPageRange, StatusPageRenderer } from '@adonisjs/core/types/http'
import { errors as vineErrors } from '@vinejs/vine'
import { ApiError } from '#services/board_contract'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * Status pages are used to display a custom HTML pages for certain error
   * codes. You might want to enable them in production only, but feel
   * free to enable them in development as well.
   */
  protected renderStatusPages = true

  /**
   * Status pages is a collection of error code range and a callback
   * to return the HTML contents to send as a response.
   */
  protected statusPages: Record<StatusPageRange, StatusPageRenderer> = {
    '404': (error, { view }) => {
      return view.render('pages/errors/not_found', { error })
    },
    '500..599': (error, { view }) => {
      return view.render('pages/errors/server_error', { error })
    },
  }

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    const exception = error as { status?: number; code?: string }
    if (/^\/api(?:\/|$)/.test(ctx.request.url())) {
      const status =
        error instanceof vineErrors.E_VALIDATION_ERROR ? 400 : (exception?.status ?? 500)
      const fields: Record<string, string[]> = Object.create(null)
      if (error instanceof vineErrors.E_VALIDATION_ERROR && Array.isArray(error.messages)) {
        for (const { field, message } of error.messages) (fields[field] ??= []).push(message)
      }
      const defaults: Record<number, [string, string]> = {
        400: ['BAD_REQUEST', '요청 형식을 확인하세요.'],
        401: ['UNAUTHORIZED', '로그인이 필요합니다.'],
        403: ['FORBIDDEN', '이 작업을 수행할 권한이 없습니다.'],
        404: ['NOT_FOUND', '요청한 자원을 찾을 수 없습니다.'],
        409: ['CONFLICT', '요청이 현재 데이터와 충돌합니다.'],
        413: ['PAYLOAD_TOO_LARGE', '요청 크기가 제한을 초과했습니다.'],
        429: ['RATE_LIMITED', '잠시 뒤 다시 요청하세요.'],
        500: ['INTERNAL', '서버 오류가 발생했습니다.'],
      }
      const [code, message] =
        error instanceof vineErrors.E_VALIDATION_ERROR
          ? ['VALIDATION_ERROR', '입력값을 확인하세요.']
          : error instanceof ApiError
            ? [error.code!, error.message]
            : (defaults[status] ?? defaults[500])
      return ctx.response
        .status(status)
        .send({ error: { code, message, fields, requestId: ctx.request.id() } })
    }
    if (exception?.code === 'E_BAD_CSRF_TOKEN') {
      return ctx.response.forbidden(
        '유효하지 않은 폼입니다. 페이지를 새로고침하고 다시 제출하세요.'
      )
    }
    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
