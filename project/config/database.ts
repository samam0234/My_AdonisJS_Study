import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/lucid'

const migrations = { naturalSort: true, paths: ['database/migrations'] }
const network = {
  host: env.get('DB_HOST') ?? '127.0.0.1',
  user: env.get('DB_USER'),
  password: env.get('DB_PASSWORD'),
  database: env.get('DB_DATABASE'),
  ssl: env.get('DB_SSL') ? { rejectUnauthorized: true } : undefined,
}

export default defineConfig({
  connection: env.get('DB_CONNECTION') ?? 'sqlite',
  connections: {
    sqlite: {
      client: 'better-sqlite3',
      connection: {
        filename:
          env.get('DB_DATABASE') === ':memory:' ? ':memory:' : app.tmpPath(env.get('DB_DATABASE')),
      },
      useNullAsDefault: true,
      migrations,
      schemaGeneration: {
        enabled: !app.inTest && !app.inProduction,
        rulesPaths: ['./database/schema_rules.js'],
      },
    },
    pg: {
      client: 'pg',
      connection: { ...network, port: env.get('DB_PORT') ?? 5432 },
      migrations,
      schemaGeneration: { enabled: false },
    },
    mysql: {
      client: 'mysql2',
      connection: { ...network, port: env.get('DB_PORT') ?? 3306, timezone: 'Z' },
      migrations,
      schemaGeneration: { enabled: false },
    },
  },
})
