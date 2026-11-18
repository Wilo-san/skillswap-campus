import type { Booking } from '@prisma/client';
import { prisma, type Tx } from '../lib/prisma.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { blockCredits, lockUsers, refundCredits, releaseCredits, transferCredits } from './wallet.js';
import { audit, notify } from './notify.js';

/** Verrouille une réservation (FOR UPDATE) et la recharge : sérialise toutes les opérations concurrentes sur elle. */
async function lockBooking(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${id} FOR UPDATE`;
  const b = await tx.booking.findUnique({ where: { id }, include: { offer: true, slot: true } });
  if (!b) throw notFound('Réservation introuvable.');
  return b;
}

/** RG08 : deux séances acceptées ne se chevauchent pas (intervenant ou bénéficiaire). Des séances consécutives sont autorisées. */
async function assertNoOverlap(tx: Tx, userId: string, startsAt: Date, endsAt: Date, excludeId: string) {
  const clash = await tx.booking.findFirst({
    where: {
      id: { not: excludeId },
      status: { in: ['ACCEPTED', 'DISPUTED'] },
      OR: [{ teacherId: userId }, { learnerId: userId }],
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });
  if (clash) {
    throw conflict('Conflit de planning : une autre séance acceptée chevauche ce créneau.', 'SCHEDULE_CONFLICT');
  }
}

/** RG03, RG04, RG05 : demande de séance. Aucun crédit n'est bloqué. */
export async function requestBooking(learnerId: string, slotId: string): Promise<Booking> {
  return prisma.$transaction(async (tx) => {
    const slot = await tx.slot.findUnique({ where: { id: slotId }, include: { offer: { include: { teacher: true } } } });
    if (!slot) throw notFound('Créneau introuvable.');
    const offer = slot.offer;

    if (offer.teacherId === learnerId) {
      throw badRequest('Vous ne pouvez pas réserver votre propre offre.', 'OWN_OFFER');
    }
    if (offer.status !== 'PUBLISHED' || offer.hidden) {
      throw conflict("Cette offre n'est pas disponible à la réservation.", 'OFFER_UNAVAILABLE');
    }
    if (!offer.teacher.active) {
      throw conflict("L'intervenant n'est plus actif.", 'TEACHER_INACTIVE');
    }
    if (slot.startsAt <= new Date()) {
      throw conflict('Ce créneau est déjà passé.', 'SLOT_PAST');
    }
    if (slot.status !== 'AVAILABLE') {
      throw conflict('Ce créneau est déjà attribué.', 'SLOT_TAKEN');
    }

    const duplicate = await tx.booking.findFirst({
      where: { slotId, learnerId, status: { in: ['PENDING', 'ACCEPTED'] } },
    });
    if (duplicate) {
      throw conflict('Vous avez déjà une demande en cours pour ce créneau.', 'DUPLICATE_REQUEST');
    }

    // RG05 : vérification du solde à la demande (sans blocage)
    const learner = await tx.user.findUniqueOrThrow({ where: { id: learnerId } });
    const cost = offer.durationHours;
    if (learner.availableCredits < cost) {
      throw conflict(
        `Solde insuffisant : ${learner.availableCredits} crédit(s) disponible(s), ${cost} nécessaire(s).`,
        'INSUFFICIENT_CREDITS',
      );
    }

    const booking = await tx.booking.create({
      data: {
        offerId: offer.id,
        slotId,
        teacherId: offer.teacherId,
        learnerId,
        cost,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      },
    });
    await notify(
      tx,
      offer.teacherId,
      'Nouvelle demande de séance',
      `${learner.firstName} ${learner.lastName} demande la séance « ${offer.title} ».`,
      '/requests',
    );
    return booking;
  });
}

/** RG09 : le bénéficiaire retire une demande en attente. */
export async function withdrawBooking(userId: string, bookingId: string) {
  return prisma.$transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.learnerId !== userId) throw forbidden();
    if (b.status !== 'PENDING') throw conflict('Seule une demande en attente peut être retirée.', 'BAD_STATE');
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED', cancelReason: 'Demande retirée par le bénéficiaire' },
    });
    await notify(tx, b.teacherId, 'Demande retirée', `Une demande pour « ${b.offer.title} » a été retirée.`, '/requests');
    return updated;
  });
}

/** RG09 : refus motivé par l'intervenant. */
export async function refuseBooking(teacherId: string, bookingId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.teacherId !== teacherId) throw forbidden();
    if (b.status !== 'PENDING') throw conflict('Seule une demande en attente peut être refusée.', 'BAD_STATE');
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: { status: 'REFUSED', refusalReason: reason },
    });
    await notify(tx, b.learnerId, 'Demande refusée', `Votre demande pour « ${b.offer.title} » a été refusée : ${reason}`, '/bookings');
    return updated;
  });
}

/**
 * RG05-RG08 : acceptation. Vérifie à nouveau solde et planning, bloque les crédits,
 * attribue le créneau et refuse automatiquement les autres demandes en attente.
 */
export async function acceptBooking(teacherId: string, bookingId: string) {
  return prisma.$transaction(async (tx) => {
    // Ordre de verrouillage global (évite les interblocages) : créneau -> réservation -> comptes.
    // Le créneau est le point de sérialisation unique de toutes les demandes concurrentes (RG07).
    const pre = await tx.booking.findUnique({ where: { id: bookingId }, select: { slotId: true } });
    if (!pre) throw notFound('Réservation introuvable.');
    await tx.$queryRaw`SELECT id FROM "Slot" WHERE id = ${pre.slotId} FOR UPDATE`;

    const b = await lockBooking(tx, bookingId);
    if (b.teacherId !== teacherId) throw forbidden();
    if (b.status !== 'PENDING') throw conflict('Seule une demande en attente peut être acceptée.', 'BAD_STATE');

    const slot = await tx.slot.findUniqueOrThrow({ where: { id: b.slotId } });
    if (slot.status !== 'AVAILABLE') throw conflict('Ce créneau est déjà attribué.', 'SLOT_TAKEN');
    if (slot.startsAt <= new Date()) throw conflict('Ce créneau est déjà passé.', 'SLOT_PAST');
    if (b.offer.status !== 'PUBLISHED' || b.offer.hidden) {
      throw conflict("L'offre n'est plus disponible.", 'OFFER_UNAVAILABLE');
    }

    await lockUsers(tx, [b.teacherId, b.learnerId]);
    const [teacher, learner] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: b.teacherId } }),
      tx.user.findUniqueOrThrow({ where: { id: b.learnerId } }),
    ]);
    if (!teacher.active) throw conflict('Votre compte est désactivé.', 'TEACHER_INACTIVE');
    if (!learner.active) throw conflict("Le compte du bénéficiaire est désactivé.", 'LEARNER_INACTIVE');

    // RG08 : contrôle de chevauchement des deux participants
    await assertNoOverlap(tx, b.teacherId, b.startsAt, b.endsAt, b.id);
    await assertNoOverlap(tx, b.learnerId, b.startsAt, b.endsAt, b.id);

    // RG05 : nouvelle vérification du solde, puis RG06 : blocage
    await blockCredits(tx, b.learnerId, b.id, b.cost);

    await tx.slot.update({ where: { id: b.slotId }, data: { status: 'ASSIGNED' } });
    const updated = await tx.booking.update({ where: { id: b.id }, data: { status: 'ACCEPTED' } });

    // RG07 : les autres demandes en attente sur ce créneau sont refusées avec un motif explicite
    // (mise à jour groupée : pas de verrous supplémentaires pris un par un)
    const others = await tx.booking.findMany({ where: { slotId: b.slotId, status: 'PENDING', id: { not: b.id } } });
    if (others.length) {
      await tx.booking.updateMany({
        where: { id: { in: others.map((o) => o.id) }, status: 'PENDING' },
        data: { status: 'REFUSED', refusalReason: 'Le créneau a été attribué à une autre demande.' },
      });
      await tx.notification.createMany({
        data: others.map((o) => ({
          userId: o.learnerId,
          title: 'Demande refusée',
          message: `Le créneau de « ${b.offer.title} » a été attribué à un autre étudiant.`,
          link: '/bookings',
        })),
      });
    }

    await notify(
      tx,
      b.learnerId,
      'Demande acceptée',
      `Votre séance « ${b.offer.title} » est confirmée. ${b.cost} crédit(s) ont été bloqués.`,
      '/planning',
    );
    return updated;
  });
}

/** RG10 : annulation d'une réservation acceptée, avant son début uniquement. Libère les crédits. */
export async function cancelBooking(userId: string, bookingId: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.teacherId !== userId && b.learnerId !== userId) throw forbidden();
    if (b.status !== 'ACCEPTED') throw conflict('Seule une réservation acceptée peut être annulée.', 'BAD_STATE');
    if (b.startsAt <= new Date()) {
      throw conflict(
        "La séance a déjà commencé : l'annulation directe est impossible. Ouvrez un signalement.",
        'ALREADY_STARTED',
      );
    }
    await lockUsers(tx, [b.teacherId, b.learnerId]);
    await releaseCredits(tx, b.learnerId, b.id, b.blockedAmount);
    const updated = await tx.booking.update({
      where: { id: b.id },
      data: { status: 'CANCELLED', cancelReason: reason ?? 'Annulée par un participant', settledAt: new Date() },
    });
    // Le créneau redevient réservable s'il reste futur (déjà garanti ici)
    await tx.slot.update({ where: { id: b.slotId }, data: { status: 'AVAILABLE' } });
    const otherId = userId === b.teacherId ? b.learnerId : b.teacherId;
    await notify(tx, otherId, 'Séance annulée', `La séance « ${b.offer.title} » a été annulée. Les crédits bloqués ont été libérés.`, '/planning');
    return updated;
  });
}

/**
 * RG11 : confirmation de réalisation (après l'heure de fin, une seule fois par participant).
 * Après les deux confirmations et sans litige ouvert : transfert unique des crédits à l'intervenant.
 */
export async function confirmBooking(userId: string, bookingId: string) {
  return prisma.$transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.teacherId !== userId && b.learnerId !== userId) throw forbidden();
    if (b.status === 'DISPUTED') throw conflict('Un litige est ouvert : la confirmation est suspendue.', 'DISPUTE_OPEN');
    if (b.status !== 'ACCEPTED') throw conflict("Cette réservation n'est pas en attente de confirmation.", 'BAD_STATE');
    if (b.endsAt > new Date()) {
      throw conflict("La séance n'est pas terminée : la confirmation n'est possible qu'après l'heure de fin.", 'NOT_FINISHED');
    }
    const already = await tx.confirmation.findUnique({ where: { bookingId_userId: { bookingId, userId } } });
    if (already) throw conflict('Vous avez déjà confirmé cette séance.', 'ALREADY_CONFIRMED');

    await tx.confirmation.create({ data: { bookingId, userId } });
    const count = await tx.confirmation.count({ where: { bookingId } });
    const otherId = userId === b.teacherId ? b.learnerId : b.teacherId;

    if (count < 2) {
      await notify(tx, otherId, 'Confirmation reçue', `L'autre participant a confirmé la séance « ${b.offer.title} ». À votre tour de confirmer.`, '/bookings');
      return { booking: b, settled: false };
    }

    // Absence de litige ouvert (RG11)
    const openDispute = await tx.dispute.findFirst({ where: { bookingId, status: 'OPEN' } });
    if (openDispute) throw conflict('Un litige est ouvert : le transfert est impossible.', 'DISPUTE_OPEN');
    if (b.settledAt) throw conflict('Cette réservation a déjà été réglée.', 'ALREADY_SETTLED');

    await lockUsers(tx, [b.teacherId, b.learnerId]);
    await transferCredits(tx, b.learnerId, b.teacherId, b.id, b.blockedAmount);
    const updated = await tx.booking.update({
      where: { id: b.id },
      data: { status: 'COMPLETED', settledAt: new Date() },
    });
    await notify(tx, b.teacherId, 'Crédits reçus', `${b.cost} crédit(s) ont été transférés pour « ${b.offer.title} ».`, '/wallet');
    await notify(tx, b.learnerId, 'Séance réalisée', `La séance « ${b.offer.title} » est clôturée. Vous pouvez laisser une évaluation.`, '/bookings');
    return { booking: updated, settled: true };
  });
}

/** RG12 / RG13 : signalement (absence, désaccord, confirmation manquante). Les crédits restent bloqués. */
export async function openDispute(
  userId: string,
  bookingId: string,
  reason: 'ABSENCE' | 'DISAGREEMENT' | 'MISSING_CONFIRMATION' | 'OTHER',
  description: string,
) {
  return prisma.$transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.teacherId !== userId && b.learnerId !== userId) throw forbidden();
    if (b.settledAt || !['ACCEPTED', 'DISPUTED'].includes(b.status)) {
      throw conflict('Cette réservation ne peut plus faire l’objet d’un signalement.', 'BAD_STATE');
    }
    if (b.startsAt > new Date()) {
      throw conflict("La séance n'a pas commencé : utilisez l'annulation.", 'NOT_STARTED');
    }
    const existing = await tx.dispute.findFirst({ where: { bookingId, status: 'OPEN' } });
    if (existing) throw conflict('Un litige est déjà ouvert pour cette réservation.', 'DISPUTE_OPEN');

    const dispute = await tx.dispute.create({
      data: { bookingId, openedById: userId, reason, description },
    });
    await tx.disputeComment.create({ data: { disputeId: dispute.id, authorId: userId, content: description } });
    await tx.booking.update({ where: { id: bookingId }, data: { status: 'DISPUTED' } });

    const otherId = userId === b.teacherId ? b.learnerId : b.teacherId;
    await notify(tx, otherId, 'Signalement ouvert', `Un signalement a été ouvert sur « ${b.offer.title} ». Vous pouvez apporter votre version.`, `/disputes/${dispute.id}`);
    const admins = await tx.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
    for (const a of admins) {
      await notify(tx, a.id, 'Nouveau litige', `Un litige est à examiner pour « ${b.offer.title} ».`, '/admin/disputes');
    }
    return dispute;
  });
}

/** RG13, RG14 : règlement du litige par l'administrateur. Transfert intégral ou restitution intégrale, une seule fois. */
export async function resolveDispute(
  adminId: string,
  disputeId: string,
  decision: 'TRANSFER' | 'REFUND',
  note: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Dispute" WHERE id = ${disputeId} FOR UPDATE`;
    const d = await tx.dispute.findUnique({ where: { id: disputeId } });
    if (!d) throw notFound('Litige introuvable.');
    if (d.status !== 'OPEN') throw conflict('Ce litige est déjà réglé : aucun second règlement n’est autorisé.', 'ALREADY_SETTLED');

    const b = await lockBooking(tx, d.bookingId);
    if (b.settledAt) throw conflict('Cette réservation a déjà été réglée.', 'ALREADY_SETTLED');

    await lockUsers(tx, [b.teacherId, b.learnerId]);
    if (decision === 'TRANSFER') {
      await transferCredits(tx, b.learnerId, b.teacherId, b.id, b.blockedAmount);
      await tx.booking.update({ where: { id: b.id }, data: { status: 'COMPLETED', settledAt: new Date() } });
    } else {
      await refundCredits(tx, b.learnerId, b.id, b.blockedAmount);
      await tx.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED', settledAt: new Date(), cancelReason: 'Restitution décidée par l’administrateur' } });
    }
    const updated = await tx.dispute.update({
      where: { id: disputeId },
      data: { status: 'RESOLVED', decision, decisionNote: note, decidedById: adminId, decidedAt: new Date() },
    });
    await audit(tx, adminId, 'DISPUTE_RESOLVED', disputeId, `${decision} : ${note}`);
    const msg =
      decision === 'TRANSFER'
        ? `Décision : transfert des ${b.cost} crédit(s) à l'intervenant. Motif : ${note}`
        : `Décision : restitution des ${b.cost} crédit(s) au bénéficiaire. Motif : ${note}`;
    await notify(tx, b.teacherId, 'Litige réglé', msg, `/disputes/${disputeId}`);
    await notify(tx, b.learnerId, 'Litige réglé', msg, `/disputes/${disputeId}`);
    return updated;
  });
}

/**
 * RG17 / RG18 : annule les demandes en attente (offre archivée/masquée, compte désactivé).
 * Les séances déjà acceptées ne sont jamais touchées : aucun crédit bloqué ne disparaît.
 */
export async function cancelPendingForOffer(tx: Tx, offerId: string, reason: string) {
  const pending = await tx.booking.findMany({ where: { offerId, status: 'PENDING' }, include: { offer: true } });
  for (const p of pending) {
    await tx.booking.update({ where: { id: p.id }, data: { status: 'CANCELLED', cancelReason: reason } });
    await notify(tx, p.learnerId, 'Demande annulée', `Votre demande pour « ${p.offer.title} » a été annulée : ${reason}`, '/bookings');
  }
  return pending.length;
}

export async function cancelPendingForUser(tx: Tx, userId: string, reason: string) {
  const pending = await tx.booking.findMany({
    where: { status: 'PENDING', OR: [{ teacherId: userId }, { learnerId: userId }] },
    include: { offer: true },
  });
  for (const p of pending) {
    await tx.booking.update({ where: { id: p.id }, data: { status: 'CANCELLED', cancelReason: reason } });
    const other = p.learnerId === userId ? p.teacherId : p.learnerId;
    await notify(tx, other, 'Demande annulée', `La demande pour « ${p.offer.title} » a été annulée : ${reason}`, '/bookings');
  }
  return pending.length;
}

/**
 * RG18 : annulation administrative d'une réservation acceptée (ex. compte désactivé).
 * Les crédits bloqués sont intégralement libérés : aucun crédit ne disparaît.
 */
export async function adminCancelBooking(adminId: string, bookingId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.settledAt || b.status !== 'ACCEPTED') {
      throw conflict("Seule une réservation acceptée et non réglée peut être annulée par l'administrateur.", 'BAD_STATE');
    }
    await lockUsers(tx, [b.teacherId, b.learnerId]);
    await releaseCredits(tx, b.learnerId, b.id, b.blockedAmount);
    const updated = await tx.booking.update({
      where: { id: b.id },
      data: { status: 'CANCELLED', cancelReason: reason, settledAt: new Date() },
    });
    if (b.startsAt > new Date()) await tx.slot.update({ where: { id: b.slotId }, data: { status: 'AVAILABLE' } });
    await audit(tx, adminId, 'BOOKING_CANCELLED_BY_ADMIN', bookingId, reason);
    for (const id of [b.teacherId, b.learnerId]) {
      await notify(tx, id, 'Séance annulée', `La séance « ${b.offer.title} » a été annulée par l'administrateur : ${reason}`, '/bookings');
    }
    return updated;
  });
}
