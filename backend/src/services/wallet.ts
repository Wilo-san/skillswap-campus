import type { LedgerType } from '@prisma/client';
import type { Tx } from '../lib/prisma.js';
import { conflict } from '../lib/errors.js';

/**
 * Service de portefeuille. TOUTES les opérations de crédits passent ici, toujours dans une transaction
 * fournie par l'appelant. Les lignes utilisateur sont verrouillées (FOR UPDATE) dans l'ordre des identifiants
 * pour éviter les interblocages et les doubles opérations (RG16).
 */

/** Verrouille un ou plusieurs comptes dans un ordre déterministe. */
export async function lockUsers(tx: Tx, ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  for (const id of sorted) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
  }
}

async function record(
  tx: Tx,
  userId: string,
  type: LedgerType,
  amount: number,
  bookingId: string | null,
  note: string,
) {
  const u = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { availableCredits: true, blockedCredits: true },
  });
  await tx.ledgerEntry.create({
    data: {
      userId,
      bookingId,
      type,
      amount,
      availableAfter: u.availableCredits,
      blockedAfter: u.blockedCredits,
      note,
    },
  });
}

/** RG01 : crédits de bienvenue (une seule fois, garanti aussi par un index unique partiel). */
export async function grantWelcome(tx: Tx, userId: string, amount: number) {
  await tx.user.update({ where: { id: userId }, data: { availableCredits: { increment: amount } } });
  await record(tx, userId, 'WELCOME_BONUS', amount, null, 'Crédits de bienvenue');
}

/** RG06 : blocage du coût sur le compte du bénéficiaire (disponible -> bloqué). */
export async function blockCredits(tx: Tx, learnerId: string, bookingId: string, amount: number) {
  const u = await tx.user.findUniqueOrThrow({ where: { id: learnerId }, select: { availableCredits: true } });
  if (u.availableCredits < amount) {
    throw conflict(
      `Solde insuffisant : ${u.availableCredits} crédit(s) disponible(s), ${amount} nécessaire(s).`,
      'INSUFFICIENT_CREDITS',
    );
  }
  await tx.user.update({
    where: { id: learnerId },
    data: { availableCredits: { decrement: amount }, blockedCredits: { increment: amount } },
  });
  await tx.booking.update({ where: { id: bookingId }, data: { blockedAmount: amount } });
  await record(tx, learnerId, 'BLOCK', amount, bookingId, 'Blocage des crédits à l’acceptation');
}

/** RG10 : libération (bloqué -> disponible) lors d'une annulation avant le début. */
export async function releaseCredits(tx: Tx, learnerId: string, bookingId: string, amount: number) {
  await tx.user.update({
    where: { id: learnerId },
    data: { availableCredits: { increment: amount }, blockedCredits: { decrement: amount } },
  });
  await tx.booking.update({ where: { id: bookingId }, data: { blockedAmount: 0 } });
  await record(tx, learnerId, 'RELEASE', amount, bookingId, 'Libération des crédits bloqués');
}

/** RG11 / RG13 : transfert intégral des crédits bloqués vers l'intervenant (une seule fois, RG14). */
export async function transferCredits(
  tx: Tx,
  learnerId: string,
  teacherId: string,
  bookingId: string,
  amount: number,
) {
  await tx.user.update({ where: { id: learnerId }, data: { blockedCredits: { decrement: amount } } });
  await tx.user.update({ where: { id: teacherId }, data: { availableCredits: { increment: amount } } });
  await tx.booking.update({ where: { id: bookingId }, data: { blockedAmount: 0 } });
  await record(tx, learnerId, 'TRANSFER_OUT', amount, bookingId, 'Transfert à l’intervenant');
  await record(tx, teacherId, 'TRANSFER_IN', amount, bookingId, 'Crédits reçus pour la séance animée');
}

/** RG13 : restitution intégrale au bénéficiaire après décision de l'administrateur. */
export async function refundCredits(tx: Tx, learnerId: string, bookingId: string, amount: number) {
  await tx.user.update({
    where: { id: learnerId },
    data: { availableCredits: { increment: amount }, blockedCredits: { decrement: amount } },
  });
  await tx.booking.update({ where: { id: bookingId }, data: { blockedAmount: 0 } });
  await record(tx, learnerId, 'REFUND', amount, bookingId, 'Restitution après décision de l’administrateur');
}
