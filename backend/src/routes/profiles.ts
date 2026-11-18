import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { wrap } from '../lib/async.js';
import { requireAuth } from '../middleware/auth.js';
import { notFound } from '../lib/errors.js';
import { personSelect } from '../services/serializers.js';

export const profilesRouter = Router();
profilesRouter.use(requireAuth);

/** Profil public : identité, compétences, note moyenne et évaluations reçues. Pas d'email ni de solde. */
profilesRouter.get(
  '/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id);
    const user = await prisma.user.findUnique({ where: { id }, include: { skills: true } });
    if (!user || (!user.active && req.user!.role !== 'ADMIN')) throw notFound('Profil introuvable.');
    const [agg, reviews, sessionsTaught, sessionsAttended, offers] = await Promise.all([
      prisma.review.aggregate({ where: { revieweeId: id }, _avg: { rating: true }, _count: { _all: true } }),
      prisma.review.findMany({
        where: { revieweeId: id },
        include: { reviewer: { select: personSelect }, booking: { select: { offer: { select: { title: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.booking.count({ where: { teacherId: id, status: 'COMPLETED' } }),
      prisma.booking.count({ where: { learnerId: id, status: 'COMPLETED' } }),
      prisma.offer.count({ where: { teacherId: id, status: 'PUBLISHED', hidden: false } }),
    ]);
    res.json({
      profile: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        field: user.field,
        bio: user.bio,
        offeredSkills: user.skills.filter((s) => s.kind === 'OFFERED').map((s) => s.name),
        wantedSkills: user.skills.filter((s) => s.kind === 'WANTED').map((s) => s.name),
        memberSince: user.createdAt,
        averageRating: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
        reviewCount: agg._count._all,
        sessionsTaught,
        sessionsAttended,
        publishedOffers: offers,
      },
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        reviewer: r.reviewer,
        offerTitle: r.booking.offer.title,
      })),
    });
  }),
);
