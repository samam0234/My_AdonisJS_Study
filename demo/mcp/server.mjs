import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const boardUrl = process.env.BOARD_URL ?? 'http://localhost:3333'
const server = new McpServer({ name: 'adonis-board', version: '1.0.0' })
const content = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data) }] })

async function board(path) {
  const response = await fetch(new URL(path, boardUrl), { signal: AbortSignal.timeout(4000) })
  if (!response.ok) return { error: '게시판 응답을 읽을 수 없습니다.' }
  return response.json()
}

server.registerTool('search_posts', {
  description: '제목과 본문에서 공개 게시글을 읽기 전용으로 검색합니다.',
  inputSchema: { q: z.string().min(1).max(200), limit: z.number().int().min(1).max(10).default(5) },
}, async ({ q, limit }) => {
  const query = new URLSearchParams({ q, limit: String(limit) })
  return content(await board('/api/posts?' + query))
})

server.registerTool('get_post', {
  description: '공개 게시글의 본문을 읽습니다.',
  inputSchema: { id: z.number().int().min(1).max(2_147_483_647) },
}, async ({ id }) => content(await board('/api/posts/' + id)))

await server.connect(new StdioServerTransport())
