import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('oauth_identities', (table) => {
      table.string('provider_id', 100).primary()
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
    })
    this.schema.createTable('payment_receipts', (table) => {
      table.string('session_id').primary()
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table.integer('amount').unsigned().notNullable()
      table.string('currency', 10).notNullable()
      table.timestamp('created_at').defaultTo(this.now())
    })
    this.schema.createTable('mail_jobs', (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table.string('day', 10).notNullable()
      table.string('status', 20).defaultTo('pending')
      table.integer('attempts').unsigned().defaultTo(0)
      table.timestamp('available_at').defaultTo(this.now())
      table.unique(['user_id', 'day'])
      table.index(['status', 'available_at'])
    })
    this.schema.createTable('ai_budgets', (table) => {
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table.string('day', 10).notNullable()
      table.integer('reserved_tokens').unsigned().defaultTo(0)
      table.primary(['user_id', 'day'])
    })
    this.schema.createTable('ai_histories', (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table.integer('post_id').unsigned().notNullable().references('posts.id').onDelete('CASCADE')
      table.text('question').notNullable()
      table.text('answer').notNullable()
      table.text('sources_json').notNullable()
      table.integer('input_tokens').unsigned().nullable()
      table.integer('output_tokens').unsigned().nullable()
      table.timestamp('created_at').defaultTo(this.now())
      table.index(['user_id', 'id'])
    })
  }

  async down() {
    for (const table of [
      'ai_histories',
      'ai_budgets',
      'mail_jobs',
      'payment_receipts',
      'oauth_identities',
    ]) {
      this.schema.dropTable(table)
    }
  }
}
