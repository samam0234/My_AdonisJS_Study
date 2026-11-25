import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const client = new Client({ name: 'adonis-study-cli', version: '1.0.0' })
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('./server.mjs', import.meta.url))],
  env: { ...(process.env.BOARD_URL ? { BOARD_URL: process.env.BOARD_URL } : {}) },
})

try {
  await client.connect(transport)
  const { tools } = await client.listTools()
  console.log(tools.map((tool) => tool.name))
  const result = await client.callTool({
    name: 'search_posts',
    arguments: { q: process.argv[2] || 'AdonisJS', limit: 3 },
  })
  if (result.isError) throw new Error(JSON.stringify(result.content))
  const data = JSON.parse(result.content[0].text)
  if (!Array.isArray(data.data)) throw new Error('게시판 목록이 없습니다.')
  console.log(data)
} finally {
  await client.close()
}
