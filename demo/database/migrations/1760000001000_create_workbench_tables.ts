import { BaseSchema } from '@adonisjs/lucid/schema'
import { legacyWorkbenchTables } from '#database/legacy_workbench_tables'

export default class extends BaseSchema {
  async up() {
    // Keep this migration ID for SQLite files created before the apps were split.
  }

  async down() {
    for (const table of legacyWorkbenchTables) {
      this.schema.dropTableIfExists(table)
    }
  }
}
