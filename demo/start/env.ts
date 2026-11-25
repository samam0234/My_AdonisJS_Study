/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),

  // Database
  DB_DATABASE: Env.schema.string(),
  CORS_ORIGIN: Env.schema.string.optional(),
  DB_CONNECTION: Env.schema.enum.optional(['sqlite', 'pg', 'mysql'] as const),
  DB_HOST: Env.schema.string.optional(),
  DB_PORT: Env.schema.number.optional(),
  DB_USER: Env.schema.string.optional(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_SSL: Env.schema.boolean.optional(),
  MONGO_URL: Env.schema.string.optional(),
  GITHUB_CLIENT_ID: Env.schema.string.optional(),
  GITHUB_CLIENT_SECRET: Env.schema.string.optional(),
  STRIPE_SECRET_KEY: Env.schema.string.optional(),
  STRIPE_PRICE_ID: Env.schema.string.optional(),
  STRIPE_WEBHOOK_SECRET: Env.schema.string.optional(),
  SMTP_URL: Env.schema.string.optional(),
  MAIL_FROM: Env.schema.string.optional(),
  AI_PROVIDER: Env.schema.enum.optional(['mock', 'ollama', 'anthropic'] as const),
  AI_MODEL: Env.schema.string.optional(),
  OLLAMA_URL: Env.schema.string.optional(),
  ANTHROPIC_API_KEY: Env.schema.string.optional(),
  AI_DAILY_TOKEN_LIMIT: Env.schema.number.optional(),
  POST_CACHE_MS: Env.schema.number.optional(),
})
