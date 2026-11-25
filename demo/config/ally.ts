import { defineConfig, services } from '@adonisjs/ally'
import type { InferSocialProviders } from '@adonisjs/ally/types'
import env from '#start/env'

const config = defineConfig({
  github: services.github({
    clientId: env.get('GITHUB_CLIENT_ID') ?? '',
    clientSecret: env.get('GITHUB_CLIENT_SECRET') ?? '',
    callbackUrl: new URL('/oauth/github/callback', env.get('APP_URL')).href,
    scopes: ['read:user'],
  }),
})

export default config

declare module '@adonisjs/ally/types' {
  interface SocialProviders extends InferSocialProviders<typeof config> {}
}
