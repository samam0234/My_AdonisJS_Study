import vine from '@vinejs/vine'

const title = () => vine.string().trim().minLength(1).maxLength(200)
const body = () => vine.string().trim().minLength(1).maxLength(20_000)
const tags = () => vine.array(vine.string().trim().minLength(1).maxLength(32)).maxLength(10)

export const createPost = vine.create({ title: title(), body: body(), tags: tags().optional() })
export const patchPost = vine.create({
  title: title().optional(),
  body: body().optional(),
  tags: tags().optional(),
})
export const createComment = vine.create({
  body: vine.string().trim().minLength(1).maxLength(2000),
})
export const signup = vine.create({
  email: vine
    .string()
    .trim()
    .email()
    .maxLength(254)
    .transform((email) => email.toLowerCase()),
  password: vine.string().minLength(8).maxLength(64),
  nickname: vine.string().trim().minLength(1).maxLength(80),
})
export const login = vine.create({
  email: vine
    .string()
    .trim()
    .email()
    .maxLength(254)
    .transform((email) => email.toLowerCase()),
  password: vine.string().maxLength(64),
})
