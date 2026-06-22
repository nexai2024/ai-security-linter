'use server'
import { prisma } from './db' // dummy import
import * as React from 'react';

export async function updateUser(data: any) {
  // No auth check!
  await prisma.user.update({ where: { id: data.id }, data })
}
