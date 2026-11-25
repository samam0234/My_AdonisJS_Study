import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/lucid'
import { legacyWorkbenchTables } from '#database/legacy_workbench_tables'

const filename = env.get('DB_DATABASE')

export default defineConfig({
  connection: 'sqlite',
  connections: {
    sqlite: {
      client: 'better-sqlite3',
      connection: { filename: filename === ':memory:' ? filename : app.tmpPath(filename) },
      useNullAsDefault: true,
      migrations: { naturalSort: true, paths: ['database/migrations'] },
      schemaGeneration: {
        enabled: !app.inTest && !app.inProduction,
        rulesPaths: ['./database/schema_rules.js'],
        excludeTables: legacyWorkbenchTables,
      },
    },
  },
})
