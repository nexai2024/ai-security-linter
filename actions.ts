'use server'
import * as React from 'react';
import { prisma } from './db' // dummy import

export async function updateUser(data: any) {
  // No auth check!
  await prisma.user.update({ where: { id: data.id }, data })
}
4. Add a file named `queries.ts` containing an "N+1 Loop":
```typescript
import { prisma } from './db'

export async function getPosts(users: any[]) {
  const posts = await Promise.all(
    users.map(async (u) => {
      return await prisma.post.findMany({ where: { authorId: u.id } })
    })
  )
  return posts
}
5. Commit these files and open a Pull Request.
