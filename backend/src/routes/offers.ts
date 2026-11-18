import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { wrap } from '../lib/async.js';
import { requireAuth } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { offerSchema, slotSchema } from '../lib/validation.js';
import { personSelect } from '../services/serializers.js';
import { cancelPendingForOffer } from '../services/bookings.js';

export const offersRouter = Router();
offersRouter.use(requireAuth);

const offerInclude = {
  teacher: { select: personSelect },
  category: true,
  slots: { orderBy: { startsAt: 'asc' } },
} satisfies Prisma.OfferInclude;
type OfferFull = Prisma.OfferGetPayload<{ include: typeof offerInclude }>;

/** RG19 : lieu précis et lien privé masqués pour les non-participants. */
function viewOffer(o: OfferFull, viewerId: string, rating?: { avg: number | null; count: number }) {
  const mine = o.teacherId === viewerId;
  const now = new Date();
  return {
    id: o.id,
    title: o.title,
    skill: o.skill,
    description: o.description,
    level: o.level,
    durationHours: o.durationHours,
    cost: o.durationHours,
    mode: o.mode,
    status: o.status,
    hidden: o.hidden,
    hiddenReason: mine ? o.hiddenReason : undefined,
    category: o.category,
    teacher: o.teacher,
    teacherRating: rating,
    mine,
    createdAt: o.createdAt,
    slots: o.slots
      // Les non-propriétaires ne voient que les créneaux futurs
      .filter((s) => mine || s.startsAt > now)
      .map((s) => ({
        id: s.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        status: s.status,
        // Les informations de lieu ne sont jamais exposées dans le catalogue
        location: mine ? s.location : null,
        meetingUrl: mine ? s.meetingUrl : null,
        hasPrivateDetails: Boolean(s.location || s.meetingUrl),
      })),
  };
}

async function ratingsFor(ids: string[]) {
  const rows = await prisma.review.groupBy({
    by: ['revieweeId'],
    where: { revieweeId: { in: ids } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.revieweeId, { avg: r._avg.rating ? Math.round(r._avg.rating * 10) / 10 : null, count: r._count._all }]));
}

const publicWhere = (viewerId: string): Prisma.OfferWhereInput => ({
  status: 'PUBLISHED',
  hidden: false,
  teacherId: { not: viewerId },
  teacher: { active: true },
  // au moins un créneau futur disponible
  slots: { some: { status: 'AVAILABLE', startsAt: { gt: new Date() } } },
});

/** Catalogue + recherche (compétence, catégorie, niveau, date, mode). */
offersRouter.get(
  '/',
  wrap(async (req, res) => {
    const q = req.query;
    const where: Prisma.OfferWhereInput = publicWhere(req.user!.id);
    const and: Prisma.OfferWhereInput[] = [];
    if (typeof q.q === 'string' && q.q.trim()) {
      const t = q.q.trim();
      and.push({ OR: [{ title: { contains: t, mode: 'insensitive' } }, { skill: { contains: t, mode: 'insensitive' } }, { description: { contains: t, mode: 'insensitive' } }] });
    }
    if (typeof q.skill === 'string' && q.skill.trim()) and.push({ skill: { contains: q.skill.trim(), mode: 'insensitive' } });
    if (typeof q.categoryId === 'string' && q.categoryId) and.push({ categoryId: q.categoryId });
    if (typeof q.level === 'string' && ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].includes(q.level)) and.push({ level: q.level as 'BEGINNER' });
    if (typeof q.mode === 'string' && ['ONSITE', 'REMOTE'].includes(q.mode)) and.push({ mode: q.mode as 'ONSITE' });
    if (typeof q.date === 'string' && q.date) {
      const d = new Date(q.date);
      if (!Number.isNaN(d.getTime())) {
        const start = new Date(d); start.setUTCHours(0, 0, 0, 0);
        const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
        and.push({ slots: { some: { status: 'AVAILABLE', startsAt: { gte: start > new Date() ? start : new Date(), lt: end } } } });
      }
    }
    const offers = await prisma.offer.findMany({ where: { ...where, AND: and }, include: offerInclude, orderBy: { createdAt: 'desc' }, take: 100 });
    const ratings = await ratingsFor(offers.map((o) => o.teacherId));
    res.json({ offers: offers.map((o) => viewOffer(o, req.user!.id, ratings.get(o.teacherId) ?? { avg: null, count: 0 })) });
  }),
);

/** Suggestions : correspondance sur la compétence ou la catégorie recherchée dans le profil. */
offersRouter.get(
  '/suggestions',
  wrap(async (req, res) => {
    const wanted = await prisma.userSkill.findMany({ where: { userId: req.user!.id, kind: 'WANTED' } });
    if (wanted.length === 0) return res.json({ offers: [], reason: 'NO_WANTED_SKILLS' });
    const categories = await prisma.category.findMany({ where: { active: true } });
    const names = wanted.map((w) => w.name.toLowerCase());
    const categoryIds = categories.filter((c) => names.some((n) => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase()))).map((c) => c.id);
    const matchers: Prisma.OfferWhereInput[] = [
      ...wanted.map((w) => ({ skill: { contains: w.name, mode: 'insensitive' as const } })),
      ...wanted.map((w) => ({ title: { contains: w.name, mode: 'insensitive' as const } })),
      ...(categoryIds.length ? [{ categoryId: { in: categoryIds } }] : []),
    ];
    const offers = await prisma.offer.findMany({
      where: { ...publicWhere(req.user!.id), OR: matchers },
      include: offerInclude,
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    const ratings = await ratingsFor(offers.map((o) => o.teacherId));
    res.json({ offers: offers.map((o) => viewOffer(o, req.user!.id, ratings.get(o.teacherId) ?? { avg: null, count: 0 })) });
  }),
);

/** Mes offres. */
offersRouter.get(
  '/mine',
  wrap(async (req, res) => {
    const offers = await prisma.offer.findMany({
      where: { teacherId: req.user!.id },
      include: { ...offerInclude, _count: { select: { bookings: { where: { status: 'PENDING' } } } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ offers: offers.map((o) => ({ ...viewOffer(o, req.user!.id), pendingRequests: o._count.bookings })) });
  }),
);

/** Fiche d'une offre. */
offersRouter.get(
  '/:id',
  wrap(async (req, res) => {
    const o = await prisma.offer.findUnique({ where: { id: String(req.params.id) }, include: offerInclude });
    if (!o) throw notFound('Offre introuvable.');
    const isOwner = o.teacherId === req.user!.id;
    const isAdmin = req.user!.role === 'ADMIN';
    if (!isOwner && !isAdmin && (o.status !== 'PUBLISHED' || o.hidden)) throw notFound('Offre introuvable.');
    const ratings = await ratingsFor([o.teacherId]);
    res.json({ offer: viewOffer(o, req.user!.id, ratings.get(o.teacherId) ?? { avg: null, count: 0 }) });
  }),
);

async function ownedOffer(id: string, userId: string) {
  const o = await prisma.offer.findUnique({ where: { id } });
  if (!o) throw notFound('Offre introuvable.');
  if (o.teacherId !== userId) throw forbidden();
  return o;
}

offersRouter.post(
  '/',
  wrap(async (req, res) => {
    const data = offerSchema.parse(req.body);
    const cat = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!cat || !cat.active) throw badRequest('Catégorie invalide.', 'BAD_CATEGORY');
    const offer = await prisma.offer.create({ data: { ...data, teacherId: req.user!.id }, include: offerInclude });
    res.status(201).json({ offer: viewOffer(offer, req.user!.id) });
  }),
);

/** RG17 : durée modifiable seulement s'il n'existe aucune séance acceptée. */
offersRouter.put(
  '/:id',
  wrap(async (req, res) => {
    const data = offerSchema.parse(req.body);
    const id = String(req.params.id);
    const current = await ownedOffer(id, req.user!.id);
    if (data.durationHours !== current.durationHours) {
      const locked = await prisma.booking.count({ where: { offerId: id, status: { in: ['ACCEPTED', 'DISPUTED', 'PENDING'] } } });
      if (locked > 0) throw conflict("La durée ne peut plus être modifiée : des demandes ou séances existent déjà.", 'DURATION_LOCKED');
    }
    const cat = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!cat) throw badRequest('Catégorie invalide.', 'BAD_CATEGORY');
    const offer = await prisma.offer.update({ where: { id }, data, include: offerInclude });
    res.json({ offer: viewOffer(offer, req.user!.id) });
  }),
);

/** RG04 : publication. Une offre incomplète (sans créneau futur) ne peut pas être publiée. */
offersRouter.post(
  '/:id/publish',
  wrap(async (req, res) => {
    const id = String(req.params.id);
    const current = await ownedOffer(id, req.user!.id);
    if (current.hidden) throw conflict("Cette offre a été masquée par l'administrateur.", 'OFFER_HIDDEN');
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!owner.active) throw forbidden('Compte désactivé.');
    const futureSlots = await prisma.slot.count({ where: { offerId: id, startsAt: { gt: new Date() } } });
    if (futureSlots === 0) throw badRequest('Ajoutez au moins un créneau futur avant de publier cette offre.', 'NO_FUTURE_SLOT');
    const offer = await prisma.offer.update({ where: { id }, data: { status: 'PUBLISHED' }, include: offerInclude });
    res.json({ offer: viewOffer(offer, req.user!.id) });
  }),
);

offersRouter.post(
  '/:id/unpublish',
  wrap(async (req, res) => {
    const id = String(req.params.id);
    await ownedOffer(id, req.user!.id);
    const offer = await prisma.$transaction(async (tx) => {
      await cancelPendingForOffer(tx, id, "L'offre a été retirée de la publication.");
      return tx.offer.update({ where: { id }, data: { status: 'DRAFT' }, include: offerInclude });
    });
    res.json({ offer: viewOffer(offer, req.user!.id) });
  }),
);

/** RG17 : l'archivage annule les demandes en attente ; les séances acceptées suivent leur cours. */
offersRouter.post(
  '/:id/archive',
  wrap(async (req, res) => {
    const id = String(req.params.id);
    await ownedOffer(id, req.user!.id);
    const offer = await prisma.$transaction(async (tx) => {
      await cancelPendingForOffer(tx, id, "L'offre a été archivée par l'intervenant.");
      return tx.offer.update({ where: { id }, data: { status: 'ARCHIVED' }, include: offerInclude });
    });
    res.json({ offer: viewOffer(offer, req.user!.id) });
  }),
);

offersRouter.delete(
  '/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id);
    await ownedOffer(id, req.user!.id);
    const used = await prisma.booking.count({ where: { offerId: id } });
    if (used > 0) throw conflict("Cette offre a déjà reçu des demandes : archivez-la plutôt que la supprimer.", 'OFFER_HAS_BOOKINGS');
    await prisma.offer.delete({ where: { id } });
    res.json({ ok: true });
  }),
);

/* ---------------- Créneaux ---------------- */

offersRouter.post(
  '/:id/slots',
  wrap(async (req, res) => {
    const id = String(req.params.id);
    const offer = await ownedOffer(id, req.user!.id);
    const data = slotSchema.parse(req.body);
    if (data.startsAt <= new Date()) throw badRequest('Le créneau doit être dans le futur.', 'SLOT_PAST');
    // Cohérence avec la durée de l'offre (RG02)
    const hours = (data.endsAt.getTime() - data.startsAt.getTime()) / 3_600_000;
    if (Math.abs(hours - offer.durationHours) > 0.001) {
      throw badRequest(`La durée du créneau doit être de ${offer.durationHours} heure(s), comme l'offre.`, 'SLOT_DURATION');
    }
    if (offer.mode === 'REMOTE' && !data.meetingUrl) throw badRequest('Un lien de réunion est requis pour une séance à distance.', 'MEETING_URL_REQUIRED');
    if (offer.mode === 'ONSITE' && !data.location) throw badRequest('Un lieu est requis pour une séance en présentiel.', 'LOCATION_REQUIRED');
    // L'intervenant ne peut pas avoir deux créneaux qui se chevauchent sur ses offres
    const overlap = await prisma.slot.findFirst({
      where: { offer: { teacherId: req.user!.id }, startsAt: { lt: data.endsAt }, endsAt: { gt: data.startsAt } },
    });
    if (overlap) throw conflict('Ce créneau chevauche un autre de vos créneaux.', 'SLOT_OVERLAP');
    const slot = await prisma.slot.create({
      data: { offerId: id, startsAt: data.startsAt, endsAt: data.endsAt, location: data.location || null, meetingUrl: data.meetingUrl || null },
    });
    res.status(201).json({ slot });
  }),
);

offersRouter.delete(
  '/:id/slots/:slotId',
  wrap(async (req, res) => {
    const id = String(req.params.id);
    await ownedOffer(id, req.user!.id);
    const slot = await prisma.slot.findFirst({ where: { id: String(req.params.slotId), offerId: id } });
    if (!slot) throw notFound('Créneau introuvable.');
    if (slot.status === 'ASSIGNED') throw conflict('Ce créneau est attribué : il ne peut plus être supprimé.', 'SLOT_ASSIGNED');
    const bookings = await prisma.booking.count({ where: { slotId: slot.id } });
    if (bookings > 0) {
      await prisma.$transaction(async (tx) => {
        const pending = await tx.booking.findMany({ where: { slotId: slot.id, status: 'PENDING' }, include: { offer: true } });
        for (const p of pending) {
          await tx.booking.update({ where: { id: p.id }, data: { status: 'CANCELLED', cancelReason: 'Le créneau a été supprimé.' } });
          await tx.notification.create({ data: { userId: p.learnerId, title: 'Demande annulée', message: `Le créneau demandé pour « ${p.offer.title} » a été supprimé.`, link: '/bookings' } });
        }
      });
      // Le créneau reste en base (historique) mais plus réservable
      return res.status(409).json({ error: { code: 'SLOT_HAS_HISTORY', message: 'Ce créneau a un historique de demandes : les demandes en attente ont été annulées, mais le créneau est conservé pour la traçabilité.' } });
    }
    await prisma.slot.delete({ where: { id: slot.id } });
    res.json({ ok: true });
  }),
);
