import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { wrap } from '../lib/async.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { decisionSchema } from '../lib/validation.js';
import { adminCancelBooking, cancelPendingForOffer, cancelPendingForUser, resolveDispute } from '../services/bookings.js';
import { audit, notify } from '../services/notify.js';
import { personSelect } from '../services/serializers.js';
import { disputeInclude } from './disputes.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));

/** Tableau de bord : comptes actifs, offres publiées, séances acceptées/réalisées, crédits transférés, litiges ouverts. */
adminRouter.get('/stats', wrap(async (_req, res) => {
  const [activeAccounts, totalAccounts, publishedOffers, acceptedBookings, completedBookings, openDisputes, transferred, pendingBookings, blocked] = await Promise.all([
    prisma.user.count({ where: { active: true } }),
    prisma.user.count(),
    prisma.offer.count({ where: { status: 'PUBLISHED', hidden: false } }),
    prisma.booking.count({ where: { status: 'ACCEPTED' } }),
    prisma.booking.count({ where: { status: 'COMPLETED' } }),
    prisma.dispute.count({ where: { status: 'OPEN' } }),
    prisma.ledgerEntry.aggregate({ where: { type: 'TRANSFER_IN' }, _sum: { amount: true } }),
    prisma.booking.count({ where: { status: 'PENDING' } }),
    prisma.user.aggregate({ _sum: { blockedCredits: true } }),
  ]);
  res.json({
    stats: {
      activeAccounts, totalAccounts, publishedOffers, acceptedBookings, completedBookings,
      acceptedOrCompleted: acceptedBookings + completedBookings,
      creditsTransferred: transferred._sum.amount ?? 0,
      openDisputes, pendingBookings,
      creditsBlocked: blocked._sum.blockedCredits ?? 0,
    },
  });
}));

/* ---------- Comptes ---------- */
adminRouter.get('/users', wrap(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const where: Prisma.UserWhereInput = q
    ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }] }
    : {};
  const users = await prisma.user.findMany({
    where, orderBy: { createdAt: 'desc' }, take: 200,
    select: {
      id: true, email: true, firstName: true, lastName: true, field: true, role: true, active: true,
      availableCredits: true, blockedCredits: true, createdAt: true,
      _count: { select: { bookingsAsTeacher: { where: { status: 'ACCEPTED' } }, bookingsAsLearner: { where: { status: 'ACCEPTED' } } } },
    },
  });
  res.json({ users: users.map(({ _count, ...u }) => ({ ...u, activeBookings: _count.bookingsAsTeacher + _count.bookingsAsLearner })) });
}));

/** RG18 : désactiver un compte annule ses demandes en attente. Les réservations acceptées exigent un traitement admin. */
adminRouter.post('/users/:id/active', wrap(async (req, res) => {
  const { active } = z.object({ active: z.boolean() }).parse(req.body);
  const id = String(req.params.id);
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw notFound('Compte introuvable.');
  if (id === req.user!.id && !active) throw badRequest('Vous ne pouvez pas désactiver votre propre compte.', 'SELF_DEACTIVATE');
  if (target.role === 'ADMIN' && !active) {
    const others = await prisma.user.count({ where: { role: 'ADMIN', active: true, id: { not: id } } });
    if (others === 0) throw conflict('Impossible de désactiver le dernier administrateur actif.', 'LAST_ADMIN');
  }
  const result = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id }, data: { active } });
    let cancelled = 0;
    if (!active) {
      cancelled = await cancelPendingForUser(tx, id, 'Le compte a été désactivé.');
      // Ses offres publiées ne reçoivent plus de demandes
      await tx.offer.updateMany({ where: { teacherId: id, status: 'PUBLISHED' }, data: { status: 'DRAFT' } });
    }
    await audit(tx, req.user!.id, active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', id);
    return { u, cancelled };
  });
  const toTreat = active ? 0 : await prisma.booking.count({ where: { status: { in: ['ACCEPTED', 'DISPUTED'] }, OR: [{ teacherId: id }, { learnerId: id }] } });
  res.json({ user: { id: result.u.id, active: result.u.active }, cancelledPending: result.cancelled, acceptedToTreat: toTreat });
}));

adminRouter.post('/users/:id/role', wrap(async (req, res) => {
  const { role } = z.object({ role: z.enum(['STUDENT', 'ADMIN']) }).parse(req.body);
  const id = String(req.params.id);
  if (id === req.user!.id) throw badRequest('Vous ne pouvez pas modifier votre propre rôle.', 'SELF_ROLE');
  const u = await prisma.user.update({ where: { id }, data: { role } });
  await audit(prisma, req.user!.id, 'USER_ROLE_CHANGED', id, role);
  res.json({ user: { id: u.id, role: u.role } });
}));

/* ---------- Modération des offres ---------- */
adminRouter.get('/offers', wrap(async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const offers = await prisma.offer.findMany({
    where: status === 'hidden' ? { hidden: true } : status && ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status) ? { status: status as 'DRAFT' } : {},
    include: { teacher: { select: personSelect }, category: true, _count: { select: { bookings: true } } },
    orderBy: { updatedAt: 'desc' }, take: 200,
  });
  res.json({ offers: offers.map(({ _count, ...o }) => ({ ...o, bookingCount: _count.bookings })) });
}));

/** RG17 : masquer une offre empêche les nouvelles demandes et annule les demandes en attente. */
adminRouter.post('/offers/:id/hide', wrap(async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(3, 'Motif requis.').max(500) }).parse(req.body);
  const id = String(req.params.id);
  const offer = await prisma.offer.findUnique({ where: { id } });
  if (!offer) throw notFound('Offre introuvable.');
  await prisma.$transaction(async (tx) => {
    await tx.offer.update({ where: { id }, data: { hidden: true, hiddenReason: reason } });
    await cancelPendingForOffer(tx, id, "L'offre a été masquée par l'administrateur.");
    await audit(tx, req.user!.id, 'OFFER_HIDDEN', id, reason);
    await notify(tx, offer.teacherId, 'Offre masquée', `Votre offre « ${offer.title} » a été masquée : ${reason}`, '/offers');
  });
  res.json({ ok: true });
}));

adminRouter.post('/offers/:id/unhide', wrap(async (req, res) => {
  const id = String(req.params.id);
  const offer = await prisma.offer.findUnique({ where: { id } });
  if (!offer) throw notFound('Offre introuvable.');
  await prisma.offer.update({ where: { id }, data: { hidden: false, hiddenReason: null } });
  await audit(prisma, req.user!.id, 'OFFER_UNHIDDEN', id);
  await notify(prisma, offer.teacherId, 'Offre rétablie', `Votre offre « ${offer.title} » n'est plus masquée.`, '/offers');
  res.json({ ok: true });
}));

/* ---------- Litiges ---------- */
adminRouter.get('/disputes', wrap(async (req, res) => {
  const status = req.query.status === 'RESOLVED' ? 'RESOLVED' : req.query.status === 'ALL' ? undefined : 'OPEN';
  const list = await prisma.dispute.findMany({ where: status ? { status } : {}, include: disputeInclude, orderBy: { createdAt: 'desc' }, take: 200 });
  const ids = [...new Set(list.flatMap((d) => d.comments.map((c) => c.authorId)))];
  const authors = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: personSelect })).map((a) => [a.id, a]));
  res.json({ disputes: list.map((d) => ({ ...d, comments: d.comments.map((c) => ({ ...c, author: authors.get(c.authorId) ?? null })) })) });
}));

/** RG13 / RG14 : transfert intégral ou restitution intégrale, motivés, une seule fois. */
adminRouter.post('/disputes/:id/resolve', wrap(async (req, res) => {
  const data = decisionSchema.parse(req.body);
  const d = await resolveDispute(req.user!.id, String(req.params.id), data.decision, data.note);
  res.json({ dispute: d });
}));

/** RG18 : annulation administrative d'une séance acceptée (crédits libérés intégralement). */
adminRouter.get('/bookings', wrap(async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'ACCEPTED';
  const bookings = await prisma.booking.findMany({
    where: ['PENDING', 'ACCEPTED', 'DISPUTED', 'COMPLETED', 'CANCELLED', 'REFUSED'].includes(status) ? { status: status as 'ACCEPTED' } : {},
    include: { offer: { select: { title: true } }, teacher: { select: { ...personSelect, active: true } }, learner: { select: { ...personSelect, active: true } } },
    orderBy: { startsAt: 'asc' }, take: 200,
  });
  res.json({ bookings });
}));

adminRouter.post('/bookings/:id/cancel', wrap(async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(3, 'Motif requis.').max(500) }).parse(req.body);
  const b = await adminCancelBooking(req.user!.id, String(req.params.id), reason);
  res.json({ booking: { id: b.id, status: b.status } });
}));

/** Journal d'audit des actions d'administration. */
adminRouter.get('/audit', wrap(async (_req, res) => {
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { actor: { select: personSelect } } });
  res.json({ logs });
}));
