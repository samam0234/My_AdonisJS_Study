import { Bouncer } from '@adonisjs/bouncer'
import type User from '#models/user'

export const manageContent = Bouncer.ability((user: User, content: { userId: number }) => {
  return user.id === content.userId
})
