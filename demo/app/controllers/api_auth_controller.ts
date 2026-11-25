import type { HttpContext } from '@adonisjs/core/http'
import { errors } from '@adonisjs/auth'
import User from '#models/user'
import { login, signup } from '#validators/board'
import { account, ApiError } from '#services/board_contract'

export default class ApiAuthController {
  async signup({ request, response }: HttpContext) {
    const { nickname, email, password } = await request.validateUsing(signup)
    try {
      const user = await User.create({ email, password, fullName: nickname })
      return response.created({ data: account(user) })
    } catch (error) {
      const { code } = error as { code?: string }
      if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === '23505' || code === 'ER_DUP_ENTRY') {
        throw new ApiError(409, 'EMAIL_TAKEN', '이미 등록된 이메일입니다.')
      }
      throw error
    }
  }

  async login({ request }: HttpContext) {
    const { email, password } = await request.validateUsing(login)
    let user: User
    try {
      user = await User.verifyCredentials(email, password)
    } catch (error) {
      if (!(error instanceof errors.E_INVALID_CREDENTIALS)) throw error
      throw new ApiError(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호를 확인하세요.')
    }
    const token = await User.accessTokens.create(user)
    return { data: { user: account(user), accessToken: token.value!.release() } }
  }

  async me({ auth }: HttpContext) {
    return { data: account(auth.use('api').getUserOrFail()) }
  }

  async logout({ auth, response }: HttpContext) {
    const user = auth.use('api').getUserOrFail()
    await User.accessTokens.delete(user, user.currentAccessToken.identifier)
    return response.noContent()
  }
}
