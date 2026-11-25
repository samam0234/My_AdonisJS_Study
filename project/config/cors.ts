import { defineConfig } from '@adonisjs/cors'
import env from '#start/env'

export default defineConfig({
  enabled: true,
  origin: env
    .get('CORS_ORIGIN')
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? ['http://localhost:5173'],
  methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  headers: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposeHeaders: ['X-Request-Id', 'Location'],
  credentials: false,
  maxAge: 90,
})
