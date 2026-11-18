import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { wrap } from '../lib/async.js';
import { requireAuth } from '../middleware/auth.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { personSelect } from '../services/serializers.js';
import { notify } from '../services/notify.js';

export const disputesRouter = Router();
disputesRouter.use(requireAuth);

export const disputeInclude = {
  openedBy: { select: personSelect },
  comments: { orderBy: { createdAt: 'asc' } },
  booking: {
    include: {
      offer: { select: { id: true, title: true, skill: true } },
      teacher: { select: personSelect },
      learner: { select: personSelect },
      confirmations: { select: { userId: true, createdAt: true } },
      slot: { select: { location: true, meetingUrl: true } },
    },
  },
} as const;

/** RG19 : éléments du litige accessibles à ses participants et à l'administrateur uniquement. */
async function loadAllowed(id: string, userId: string, role: string) {
  const d = await prisma.dispute.findUnique({ where: { id }, include: disputeInclude });
  if (!d) throw notFound('Litige introuvable.');
  const participant = d.booking.teacherId === userId || d.booking.learnerId === userId;
  if (!participant && role !== 'ADMIN') throw forbidden();
  return d;
}

async function withAuthors<T extends { comments: { authorId: string }[] }>(d: T) {
  const ids = [...new Set(d.comments.map((c) => c.authorId))];
  const authors = await prisma.user.findMany({ where: { id: { in: ids } }, select: personSelect });
  const map = new Map(authors.map((a) => [a.id, a]));
  return { ...d, comments: d.comments.map((c) => ({ ...c, author: map.get(c.authorId) ?? null })) };
}

/** Mes litiges (participant). */
disputesRouter.get('/', wrap(async (req, res) => {
  const uid = req.user!.id;
  const list = await prisma.dispute.findMany({
    where: { booking: { OR: [{ teacherId: uid }, { learnerId: uid }] } },
    include: disputeInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ disputes: await Promise.all(list.map(withAuthors)) });
}));

disputesRouter.get('/:id', wrap(async (req, res) => {
  const d = await loadAllowed(String(req.params.id), req.user!.id, req.user!.role);
  res.json({ dispute: await withAuthors(d) });
}));

/** Chaque partie peut apporter ses éléments tant que le litige est ouvert (RG13). */
disputesRouter.post('/:id/comments', wrap(async (req, res) => {
  const { content } = z.object({ content: z.string().trim().min(1, 'Message requis.').max(2000) }).parse(req.body);
  const d = await loadAllowed(String(req.params.id), req.user!.id, req.user!.role);
  if (d.status !== 'OPEN') throw conflict('Ce litige est clôturé.', 'DISPUTE_CLOSED');
  await prisma.$transaction(async (tx) => {
    await tx.disputeComment.create({ data: { disputeId: d.id, authorId: req.user!.id, content } });
    const targets = [d.booking.teacherId, d.booking.learnerId].filter((x) => x !== req.user!.id);
    for (const t of targets) await notify(tx, t, 'Nouvel élément au litige', 'Une partie a ajouté un message à votre litige.', `/disputes/${d.id}`);
  });
  const fresh = await loadAllowed(d.id, req.user!.id, req.user!.role);
  res.status(201).json({ dispute: await withAuthors(fresh) });
}));
