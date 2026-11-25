/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'
import router from '@adonisjs/core/services/router'

const BoardController = () => import('#controllers/board_controller')
const ApiAuthController = () => import('#controllers/api_auth_controller')
const ApiPostsController = () => import('#controllers/api_posts_controller')
const IntegrationsController = () => import('#controllers/integrations_controller')
const AiController = () => import('#controllers/ai_controller')
router
  .on('/')
  .render('pages/board/hello', { title: 'Hello, AdonisJS!', topics: ['Edge', 'Ace'] })
  .as('home')
router.get('/health', () => ({ status: 'ok' }))
router.on('/workbench').render('pages/board/workbench')
router.get('/oauth/github', [IntegrationsController, 'github']).use(middleware.guest())
router
  .get('/oauth/github/callback', [IntegrationsController, 'githubCallback'])
  .use(middleware.guest())
router.get('/api-docs', async ({ response }) => {
  const { serveContract } = await import('#services/api_docs')
  return serveContract(response)
})
router.get('/api-docs/openapi.json', async ({ response }) => {
  const { serveOpenApi } = await import('#services/api_docs')
  return serveOpenApi(response)
})
router.get('/api-docs/assets/:name', async ({ params, response }) => {
  const { serveDocsAsset } = await import('#services/api_docs')
  return serveDocsAsset(response, params.name)
})
router.get('/board', [BoardController, 'index']).as('board.index')
router.get('/board/:id', [BoardController, 'show']).as('board.show')

router
  .group(() => {
    router.get('signup', [controllers.NewAccount, 'create'])
    router.post('signup', [controllers.NewAccount, 'store'])

    router.get('login', [controllers.Session, 'create'])
    router.post('login', [controllers.Session, 'store'])
  })
  .use(middleware.guest())

router
  .group(() => {
    router.get('/dashboard', ({ response }) => response.redirect().toPath('/board')).as('dashboard')
    router.post('logout', [controllers.Session, 'destroy'])
    router.post('/board', [BoardController, 'store'])
    router.post('/board/:id/edit', [BoardController, 'update'])
    router.post('/board/:id/delete', [BoardController, 'destroy'])
    router.post('/board/:id/comments', [BoardController, 'addComment'])
    router.post('/board/comments/:id/delete', [BoardController, 'destroyComment'])
    router.post('/board/validate', [BoardController, 'validate'])
    router.post('/workbench/upload', [IntegrationsController, 'upload'])
    router.post('/workbench/mail', [IntegrationsController, 'mail'])
    router.post('/workbench/checkout', [IntegrationsController, 'checkout'])
    router.post('/workbench/chat', [AiController, 'stream']).as('workbench.chat')
    router.get('/workbench/history', [AiController, 'history']).as('workbench.history')
  })
  .use(middleware.auth())

router
  .group(() => {
    router.post('/auth/signup', [ApiAuthController, 'signup'])
    router.post('/auth/login', [ApiAuthController, 'login'])
    router.get('/posts', [ApiPostsController, 'index'])
    router.get('/posts/:id', [ApiPostsController, 'show'])
    router.get('/posts/:id/comments', [ApiPostsController, 'comments'])
    router.post('/webhooks/stripe', [IntegrationsController, 'webhook'])

    router
      .group(() => {
        router.get('/auth/me', [ApiAuthController, 'me'])
        router.post('/auth/logout', [ApiAuthController, 'logout'])
        router.post('/posts', [ApiPostsController, 'store'])
        router.patch('/posts/:id', [ApiPostsController, 'update'])
        router.delete('/posts/:id', [ApiPostsController, 'destroy'])
        router.post('/posts/:id/comments', [ApiPostsController, 'addComment'])
        router.delete('/comments/:id', [ApiPostsController, 'destroyComment'])
        router.get('/draft', [IntegrationsController, 'showDraft'])
        router.patch('/draft', [IntegrationsController, 'saveDraft'])
        router.post('/ai/chat', [AiController, 'chat'])
        router.post('/ai/chat/stream', [AiController, 'stream'])
        router.get('/ai/history', [AiController, 'history'])
      })
      .use(middleware.auth({ guards: ['api'] }))
  })
  .prefix('/api')
