/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

const BoardController = () => import('#controllers/board_controller')
const ApiAuthController = () => import('#controllers/api_auth_controller')
const ApiPostsController = () => import('#controllers/api_posts_controller')
const NewAccountController = () => import('#controllers/new_account_controller')
const SessionController = () => import('#controllers/session_controller')
router
  .on('/')
  .render('pages/board/hello', { title: 'Hello, AdonisJS!', topics: ['Edge', 'Ace'] })
  .as('home')
router.get('/health', () => ({ status: 'ok' }))
router.get('/board', [BoardController, 'index']).as('board.index')
router.get('/board/:id', [BoardController, 'show']).as('board.show')

router
  .group(() => {
    router.get('signup', [NewAccountController, 'create']).as('new_account.create')
    router.post('signup', [NewAccountController, 'store']).as('new_account.store')

    router.get('login', [SessionController, 'create']).as('session.create')
    router.post('login', [SessionController, 'store']).as('session.store')
  })
  .use(middleware.guest())

router
  .group(() => {
    router.get('/dashboard', ({ response }) => response.redirect().toPath('/board')).as('dashboard')
    router.post('logout', [SessionController, 'destroy']).as('session.destroy')
    router.post('/board', [BoardController, 'store'])
    router.post('/board/:id/edit', [BoardController, 'update'])
    router.post('/board/:id/delete', [BoardController, 'destroy'])
    router.post('/board/:id/comments', [BoardController, 'addComment'])
    router.post('/board/comments/:id/delete', [BoardController, 'destroyComment'])
    router.post('/board/validate', [BoardController, 'validate'])
  })
  .use(middleware.auth())

router
  .group(() => {
    router.post('/auth/signup', [ApiAuthController, 'signup'])
    router.post('/auth/login', [ApiAuthController, 'login'])
    router.get('/posts', [ApiPostsController, 'index'])
    router.get('/posts/:id', [ApiPostsController, 'show'])
    router.get('/posts/:id/comments', [ApiPostsController, 'comments'])

    router
      .group(() => {
        router.get('/auth/me', [ApiAuthController, 'me'])
        router.post('/auth/logout', [ApiAuthController, 'logout'])
        router.post('/posts', [ApiPostsController, 'store'])
        router.patch('/posts/:id', [ApiPostsController, 'update'])
        router.delete('/posts/:id', [ApiPostsController, 'destroy'])
        router.post('/posts/:id/comments', [ApiPostsController, 'addComment'])
        router.delete('/comments/:id', [ApiPostsController, 'destroyComment'])
      })
      .use(middleware.auth({ guards: ['api'] }))
  })
  .prefix('/api')
