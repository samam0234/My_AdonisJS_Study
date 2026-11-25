import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('posts', (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table.string('title', 200).notNullable()
      table.text('body').notNullable()
      table.text('tags_json').notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.index(['created_at', 'id'])
    })
    this.schema.createTable('comments', (table) => {
      table.increments('id')
      table.integer('post_id').unsigned().notNullable().references('posts.id').onDelete('CASCADE')
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table.text('body').notNullable()
      table.timestamp('created_at').notNullable()
      table.index(['post_id', 'id'])
    })
    this.schema.createTable('auth_access_tokens', (table) => {
      table.increments('id')
      table
        .integer('tokenable_id')
        .unsigned()
        .notNullable()
        .references('users.id')
        .onDelete('CASCADE')
      table.string('type').notNullable()
      table.string('name').nullable()
      table.string('hash').notNullable()
      table.text('abilities').notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.timestamp('last_used_at').nullable()
      table.timestamp('expires_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable('auth_access_tokens')
    this.schema.dropTable('comments')
    this.schema.dropTable('posts')
  }
}
