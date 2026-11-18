import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { wrap } from '../lib/async.js';
import { requireAuth } from '../middleware/auth.js';
import { forbidden, notFound } from '../lib/errors.js';
import { disputeSchema, reasonSchema, reviewSchema } from '../lib/validation.js';
import { personSelect } from '../services/serializers.js';
import {
  acceptBooking, cancelBooking, confirmBooking, openDispute, refuseBooking, requestBooking, withdrawBooking,
} from '../services/bookings.js';
import { z } from 'zod';
import { conflict } from '../lib/errors.js';
import { notify } from '../services/notify.js';

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

const include = {
  offer: { select: { id: true, title: true, skill: true, mode: true, durationHours: true, level: true } },
  slot: true,
  teacher: { select: personSelect },
  learner: { select: personSelect },
  confirmations: { select: { userId: true, createdAt: true } },
  reviews: { select: { reviewerId: true, rating: true } },
  disputes: { select: { id: true, status: true, decision: true } },
} satisfies Prisma.BookingInclude;
type BookingFull = Prisma.BookingGetPayload<{ include: typeof include }>;

/** RG19 : lieu précis et lien privé visibles uniquement des participants, et seulement une fois la demande acceptée. */
export function viewBooking(b: BookingFull, viewerId: string, isAdmin = false) {
  const participant = b.teacherId === viewerId || b.learnerId === viewerId;
  const revealed = participant && ['ACCEPTED', 'COMPLETED', 'DISPUTED'].includes(b.status);
  const now = new Date();
  const finished = b.endsAt <= now;
  const started = b.startsAt <= now;
  const myConfirmed = b.confirmations.some((c) => c.userId === viewerId);
  const myRole = b.teacherId === viewerId ? 'TEACHER' : b.learnerId === viewerId ? 'LEARNER' : null;
  const openDisputeObj = b.disputes.find((d) => d.status === 'OPEN');
  return {
    id: b.id,
    status: b.status,
    cost: b.cost,
    blockedAmount: b.blockedAmount,
    refusalReason: b.refusalReason,
    cancelReason: b.cancelReason,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    createdAt: b.createdAt,
    settledAt: b.settledAt,
    offer: b.offer,
    teacher: b.teacher,
    learner: b.learner,
    myRole,
    location: revealed || isAdmin ? b.slot.location : null,
    meetingUrl: revealed || isAdmin ? b.slot.meetingUrl : null,
    confirmedBy: b.confirmations.map((c) => c.userId),
    can: {
      withdraw: b.status === 'PENDING' && b.learnerId === viewerId,
      accept: b.status === 'PENDING' && b.teacherId === viewerId,
      refuse: b.status === 'PENDING' && b.teacherId === viewerId,
      cancel: b.status === 'ACCEPTED' && participant && !started,
      confirm: b.status === 'ACCEPTED' && participant && finished && !myConfirmed,
      report: ['ACCEPTED', 'DISPUTED'].includes(b.status) && participant && started && !b.settledAt && !openDisputeObj,
      review: b.status === 'COMPLETED' && participant && !b.reviews.some((r) => r.reviewerId === viewerId),
    },
    myReview: b.reviews.find((r) => r.reviewerId === viewerId)?.rating ?? null,
    disputeId: b.disputes[0]?.id ?? null,
    disputeStatus: openDisputeObj ? 'OPEN' : b.disputes[0]?.status ?? null,
  };
}

/** Liste : ?box=sent (demandes envoyées) | received (demandes reçues) | all */
bookingsRouter.get(
  '/',
  wrap(async (req, res) => {
    const uid = req.user!.id;
    const box = String(req.query.box ?? 'all');
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const where: Prisma.BookingWhereInput =
      box === 'sent' ? { learnerId: uid } : box === 'received' ? { teacherId: uid } : { OR: [{ learnerId: uid }, { teacherId: uid }] };
    if (status && ['PENDING', 'REFUSED', 'ACCEPTED', 'CANCELLED', 'COMPLETED', 'DISPUTED'].includes(status)) {
      Object.assign(where, { status });
    }
    const bookings = await prisma.booking.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ bookings: bookings.map((b) => viewBooking(b, uid)) });
  }),
);

/** Planning personnel : séances acceptées (et en litige), intervenant ou bénéficiaire. */
bookingsRouter.get(
  '/planning',
  wrap(async (req, res) => {
    const uid = req.user!.id;
    const bookings = await prisma.booking.findMany({
      where: { status: { in: ['ACCEPTED', 'DISPUTED', 'COMPLETED'] }, OR: [{ learnerId: uid }, { teacherId: uid }] },
      include,
      orderBy: { startsAt: 'asc' },
    });
    res.json({ bookings: bookings.map((b) => viewBooking(b, uid)) });
  }),
);

bookingsRouter.get(
  '/:id',
  wrap(async (req, res) => {
    const b = await prisma.booking.findUnique({ where: { id: String(req.params.id) }, include });
    if (!b) throw notFound('Réservation introuvable.');
    const admin = req.user!.role === 'ADMIN';
    if (!admin && b.teacherId !== req.user!.id && b.learnerId !== req.user!.id) throw forbidden();
    res.json({ booking: viewBooking(b, req.user!.id, admin) });
  }),
);

async function respond(id: string, uid: string) {
  const b = await prisma.booking.findUniqueOrThrow({ where: { id }, include });
  return viewBooking(b, uid);
}

bookingsRouter.post(
  '/',
  wrap(async (req, res) => {
    const { slotId } = z.object({ slotId: z.string().min(1, 'Créneau requis.') }).parse(req.body);
    const b = await requestBooking(req.user!.id, slotId);
    res.status(201).json({ booking: await respond(b.id, req.user!.id) });
  }),
);

bookingsRouter.post('/:id/withdraw', wrap(async (req, res) => {
  const b = await withdrawBooking(req.user!.id, String(req.params.id));
  res.json({ booking: await respond(b.id, req.user!.id) });
}));

bookingsRouter.post('/:id/accept', wrap(async (req, res) => {
  const b = await acceptBooking(req.user!.id, String(req.params.id));
  res.json({ booking: await respond(b.id, req.user!.id) });
}));

bookingsRouter.post('/:id/refuse', wrap(async (req, res) => {
  const { reason } = reasonSchema.parse(req.body);
  const b = await refuseBooking(req.user!.id, String(req.params.id), reason);
  res.json({ booking: await respond(b.id, req.user!.id) });
}));

bookingsRouter.post('/:id/cancel', wrap(async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : undefined;
  const b = await cancelBooking(req.user!.id, String(req.params.id), reason);
  res.json({ booking: await respond(b.id, req.user!.id) });
}));

bookingsRouter.post('/:id/confirm', wrap(async (req, res) => {
  const r = await confirmBooking(req.user!.id, String(req.params.id));
  res.json({ settled: r.settled, booking: await respond(r.booking.id, req.user!.id) });
}));

bookingsRouter.post('/:id/dispute', wrap(async (req, res) => {
  const data = disputeSchema.parse(req.body);
  const d = await openDispute(req.user!.id, String(req.params.id), data.reason, data.description);
  res.status(201).json({ dispute: d, booking: await respond(d.bookingId, req.user!.id) });
}));

/** RG15 : évaluation après une réservation réalisée, une seule par participant. */
bookingsRouter.post('/:id/review', wrap(async (req, res) => {
  const data = reviewSchema.parse(req.body);
  const uid = req.user!.id;
  const id = String(req.params.id);
  const b = await prisma.booking.findUnique({ where: { id } });
  if (!b) throw notFound('Réservation introuvable.');
  if (b.teacherId !== uid && b.learnerId !== uid) throw forbidden();
  if (b.status !== 'COMPLETED') throw conflict("Une évaluation n'est possible qu'après une séance réalisée.", 'NOT_COMPLETED');
  const already = await prisma.review.findUnique({ where: { bookingId_reviewerId: { bookingId: id, reviewerId: uid } } });
  if (already) throw conflict('Vous avez déjà évalué cette séance.', 'ALREADY_REVIEWED');
  const revieweeId = uid === b.teacherId ? b.learnerId : b.teacherId;
  const review = await prisma.$transaction(async (tx) => {
    const r = await tx.review.create({ data: { bookingId: id, reviewerId: uid, revieweeId, rating: data.rating, comment: data.comment } });
    await notify(tx, revieweeId, 'Nouvelle évaluation', `Vous avez reçu une note de ${data.rating}/5.`, `/profiles/${revieweeId}`);
    return r;
  });
  res.status(201).json({ review });
}));
