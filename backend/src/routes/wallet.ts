import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { wrap } from '../lib/async.js';
import { requireAuth } from '../middleware/auth.js';

export const walletRouter = Router();
walletRouter.use(requireAuth);

/** Portefeuille : disponible, bloqué, historique (date, quantité, type, séance concernée). */
walletRouter.get(
  '/',
  wrap(async (req, res) => {
    const uid = req.user!.id;
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = 25;
    const [user, entries, total] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: uid }, select: { availableCredits: true, blockedCredits: true } }),
      prisma.ledgerEntry.findMany({
        where: { userId: uid },
        include: { booking: { select: { id: true, status: true, offer: { select: { title: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.ledgerEntry.count({ where: { userId: uid } }),
    ]);
    res.json({
      available: user.availableCredits,
      blocked: user.blockedCredits,
      total,
      page,
      pageSize,
      entries: entries.map((e) => ({
        id: e.id,
        type: e.type,
        amount: e.amount,
        availableAfter: e.availableAfter,
        blockedAfter: e.blockedAfter,
        note: e.note,
        createdAt: e.createdAt,
        booking: e.booking ? { id: e.booking.id, title: e.booking.offer.title, status: e.booking.status } : null,
      })),
    });
  }),
);
