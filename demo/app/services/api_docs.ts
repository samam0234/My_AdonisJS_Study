import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import type { HttpContext } from '@adonisjs/core/http'

type Response = HttpContext['response']
const require = createRequire(import.meta.url)
const assets = {
  'swagger-ui.css': 'text/css; charset=utf-8',
  'swagger-ui-bundle.js': 'text/javascript; charset=utf-8',
} as const

export async function serveOpenApi(response: Response) {
  const contract = await readFile(new URL('../../contracts/openapi.json', import.meta.url), 'utf-8')
  return response.type('application/json').send(contract)
}

export function serveContract(response: Response) {
  return response.type('text/html').send(`<!doctype html><html lang="ko"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width">
    <title>AdonisJS API 문서</title><link rel="stylesheet" href="/api-docs/assets/swagger-ui.css">
    </head><body><main id="swagger"></main>
    <script src="/api-docs/assets/swagger-ui-bundle.js"></script>
    <script>SwaggerUIBundle({ url: '/api-docs/openapi.json', dom_id: '#swagger', validatorUrl: null })</script>
    </body></html>`)
}

export async function serveDocsAsset(response: Response, name: string) {
  if (!Object.hasOwn(assets, name)) return response.notFound()
  const asset = name as keyof typeof assets
  response.header('Content-Type', assets[asset])
  response.header('Cache-Control', 'public, max-age=3600')
  return response.send(await readFile(require.resolve('swagger-ui-dist/' + asset)))
}
