import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { setTimeout } from 'node:timers/promises'

export default class MailWork extends BaseCommand {
  static commandName = 'mail:work'
  static description = 'Send queued board test messages'
  static options: CommandOptions = { startApp: true }

  @flags.boolean()
  declare watch: boolean

  async run() {
    const { deliverNextMail } = await import('#services/integrations')
    do {
      if (!(await deliverNextMail()) && this.watch) await setTimeout(2000)
    } while (this.watch)
  }
}
