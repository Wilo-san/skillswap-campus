import type { Tx } from '../lib/prisma.js';
import { prisma } from '../lib/prisma.js';

type Client = Tx | typeof prisma;

export async function notify(
  db: Client,
  userId: string,
  title: string,
  message: string,
  link?: string,
) {
  await db.notification.create({ data: { userId, title, message, link } });
}

export async function audit(db: Client, actorId: string | null, action: string, target?: string, details?: string) {
  await db.auditLog.create({ data: { actorId, action, target, details } });
}
