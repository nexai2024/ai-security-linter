import { prisma } from './db'

export async function getPosts(users: any[]) {
  const posts = await Promise.all(
    users.map(async (u) => {
      return await prisma.post.findMany({ where: { authorId: u.id } })
    })
  )
  return posts
}
