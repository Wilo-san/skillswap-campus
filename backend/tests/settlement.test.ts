import { beforeEach, describe, expect, it } from 'vitest';
import { acceptedBooking, api, auth, makeUser, resetDb, shiftBooking, wallet } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

const confirm = (u: any, id: string) => api().post(`/api/bookings/${id}/confirm`).set(auth(u));

describe('Validation et transfert', () => {
  beforeEach(resetDb);

  it('RG11 : confirmation impossible avant l’heure de fin', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const ab = await acceptedBooking(t, l);
    const r = await confirm(l, ab.bookingId);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('NOT_FINISHED');
    await shiftBooking(ab.bookingId, -0.5, 1); // en cours, pas terminée
    expect((await confirm(l, ab.bookingId)).body.error.code).toBe('NOT_FINISHED');
  });

  it('RG11 : première confirmation (rien ne bouge), seconde confirmation (transfert unique)', async () => {
    const t = await makeUser({ credits: 0 });
    const l = await makeUser({ credits: 2 });
    const ab = await acceptedBooking(t, l, { hours: 2 }).catch(() => null);
    // t sans crédit est suffisant : il est intervenant
    const booking = ab!;
    await shiftBooking(booking.bookingId, -3, 2);

    const first = await confirm(t, booking.bookingId);
    expect(first.status).toBe(200);
    expect(first.body.settled).toBe(false);
    expect(await wallet(l.id)).toEqual({ available: 0, blocked: 2 });
    expect(await wallet(t.id)).toEqual({ available: 0, blocked: 0 });
    // notification à l'autre participant
    expect(await prisma.notification.count({ where: { userId: l.id, title: 'Confirmation reçue' } })).toBe(1);

    const second = await confirm(l, booking.bookingId);
    expect(second.status).toBe(200);
    expect(second.body.settled).toBe(true);
    expect(second.body.booking.status).toBe('COMPLETED');
    expect(await wallet(l.id)).toEqual({ available: 0, blocked: 0 });
    expect(await wallet(t.id)).toEqual({ available: 2, blocked: 0 });

    // traçabilité des deux côtés (date, quantité, type, séance concernée)
    const out = await prisma.ledgerEntry.findFirstOrThrow({ where: { userId: l.id, type: 'TRANSFER_OUT' } });
    const inn = await prisma.ledgerEntry.findFirstOrThrow({ where: { userId: t.id, type: 'TRANSFER_IN' } });
    expect(out).toMatchObject({ amount: 2, bookingId: booking.bookingId });
    expect(inn).toMatchObject({ amount: 2, bookingId: booking.bookingId, availableAfter: 2 });
  });

  it('RG11 : un participant ne confirme qu’une seule fois', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const ab = await acceptedBooking(t, l);
    await shiftBooking(ab.bookingId, -3, 1);
    expect((await confirm(t, ab.bookingId)).status).toBe(200);
    const again = await confirm(t, ab.bookingId);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_CONFIRMED');
    expect(await wallet(l.id)).toEqual({ available: 1, blocked: 1 });
  });

  it('RG11 : un tiers ne peut pas confirmer', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const x = await makeUser();
    const ab = await acceptedBooking(t, l);
    await shiftBooking(ab.bookingId, -3, 1);
    expect((await confirm(x, ab.bookingId)).status).toBe(403);
  });

  it('RG11/RG14 : confirmations simultanées des deux parties et doubles clics : un seul transfert', async () => {
    const t = await makeUser({ credits: 0 });
    const l = await makeUser({ credits: 2 });
    const ab = await acceptedBooking(t, l, { hours: 2 });
    await shiftBooking(ab.bookingId, -3, 2);
    const rs = await Promise.all([
      ...Array.from({ length: 5 }, () => confirm(t, ab.bookingId)),
      ...Array.from({ length: 5 }, () => confirm(l, ab.bookingId)),
    ]);
    expect(rs.filter((r) => r.status === 200)).toHaveLength(2); // une confirmation par participant
    expect(await prisma.ledgerEntry.count({ where: { type: 'TRANSFER_OUT' } })).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { type: 'TRANSFER_IN' } })).toBe(1);
    expect(await wallet(t.id)).toEqual({ available: 2, blocked: 0 });
    expect(await wallet(l.id)).toEqual({ available: 0, blocked: 0 });
  });

  it('RG12 : confirmation manquante : crédits bloqués, aucun transfert automatique', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const ab = await acceptedBooking(t, l);
    await shiftBooking(ab.bookingId, -100, 1); // très ancienne
    await confirm(t, ab.bookingId);
    expect(await wallet(l.id)).toEqual({ available: 1, blocked: 1 });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: ab.bookingId } })).status).toBe('ACCEPTED');
  });

  it('RG16 : le solde n’est jamais négatif (contrainte SQL en dernier rempart)', async () => {
    const u = await makeUser({ credits: 1 });
    await expect(prisma.user.update({ where: { id: u.id }, data: { availableCredits: { decrement: 2 } } })).rejects.toThrow();
    await expect(prisma.user.update({ where: { id: u.id }, data: { blockedCredits: -1 } })).rejects.toThrow();
  });

  it('cohérence globale : la somme des crédits est conservée après un parcours complet', async () => {
    const t = await makeUser({ credits: 2 });
    const l = await makeUser({ credits: 2 });
    const before = 4;
    const ab = await acceptedBooking(t, l);
    await shiftBooking(ab.bookingId, -3, 1);
    await confirm(t, ab.bookingId);
    await confirm(l, ab.bookingId);
    const agg = await prisma.user.aggregate({ _sum: { availableCredits: true, blockedCredits: true } });
    expect((agg._sum.availableCredits ?? 0) + (agg._sum.blockedCredits ?? 0)).toBe(before);
  });
});

describe('Litige et décision', () => {
  beforeEach(resetDb);

  async function disputed(hours: 1 | 2 = 1) {
    const t = await makeUser({ credits: 0 });
    const l = await makeUser({ credits: 2 });
    const admin = await makeUser({ role: 'ADMIN' });
    const ab = await acceptedBooking(t, l, { hours });
    await shiftBooking(ab.bookingId, -3, hours);
    const d = await api().post(`/api/bookings/${ab.bookingId}/dispute`).set(auth(l)).send({ reason: 'ABSENCE', description: 'Intervenant absent' });
    return { t, l, admin, ab, d };
  }

  it('RG12 : signalement ouvert : séance passe en litige, crédits conservés, parties et admins notifiés', async () => {
    const { t, l, admin, ab, d } = await disputed(2);
    expect(d.status).toBe(201);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: ab.bookingId } })).status).toBe('DISPUTED');
    expect(await wallet(l.id)).toEqual({ available: 0, blocked: 2 });
    expect(await prisma.notification.count({ where: { userId: t.id, title: 'Signalement ouvert' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: admin.id, title: 'Nouveau litige' } })).toBe(1);
  });

  it('signalement impossible avant le début (il faut annuler) et pour un tiers', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const x = await makeUser();
    const ab = await acceptedBooking(t, l);
    const early = await api().post(`/api/bookings/${ab.bookingId}/dispute`).set(auth(l)).send({ reason: 'OTHER', description: 'x' });
    expect(early.body.error.code).toBe('NOT_STARTED');
    await shiftBooking(ab.bookingId, -3, 1);
    expect((await api().post(`/api/bookings/${ab.bookingId}/dispute`).set(auth(x)).send({ reason: 'OTHER', description: 'x' })).status).toBe(403);
  });

  it('un seul litige ouvert par réservation, même en cas de doubles clics', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const ab = await acceptedBooking(t, l);
    await shiftBooking(ab.bookingId, -3, 1);
    const rs = await Promise.all(Array.from({ length: 5 }, () => api().post(`/api/bookings/${ab.bookingId}/dispute`).set(auth(l)).send({ reason: 'DISAGREEMENT', description: 'x' })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await prisma.dispute.count()).toBe(1);
  });

  it('RG11 : un litige empêche le transfert, même si les deux parties confirment', async () => {
    const { t, l, ab } = await disputed();
    const r = await confirm(t, ab.bookingId);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('DISPUTE_OPEN');
    expect(await prisma.ledgerEntry.count({ where: { type: 'TRANSFER_OUT' } })).toBe(0);
    expect(await wallet(l.id)).toEqual({ available: 1, blocked: 1 });
  });

  it('RG11 : litige ouvert après une première confirmation : la seconde ne déclenche aucun transfert', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const ab = await acceptedBooking(t, l);
    await shiftBooking(ab.bookingId, -3, 1);
    await confirm(t, ab.bookingId);
    await api().post(`/api/bookings/${ab.bookingId}/dispute`).set(auth(l)).send({ reason: 'DISAGREEMENT', description: 'Désaccord' });
    const r = await confirm(l, ab.bookingId);
    expect(r.status).toBe(409);
    expect(await prisma.ledgerEntry.count({ where: { type: 'TRANSFER_OUT' } })).toBe(0);
  });

  it('RG19 : éléments du litige accessibles aux participants et à l’administrateur seulement', async () => {
    const { t, l, admin, d } = await disputed();
    const id = d.body.dispute.id;
    const x = await makeUser();
    expect((await api().get(`/api/disputes/${id}`).set(auth(t))).status).toBe(200);
    expect((await api().get(`/api/disputes/${id}`).set(auth(l))).status).toBe(200);
    expect((await api().get(`/api/disputes/${id}`).set(auth(admin))).status).toBe(200);
    expect((await api().get(`/api/disputes/${id}`).set(auth(x))).status).toBe(403);
    expect((await api().post(`/api/disputes/${id}/comments`).set(auth(x)).send({ content: 'hop' })).status).toBe(403);
    // l'autre partie apporte sa version
    const c = await api().post(`/api/disputes/${id}/comments`).set(auth(t)).send({ content: 'J’étais présent.' });
    expect(c.status).toBe(201);
    expect(c.body.dispute.comments).toHaveLength(2);
  });

  it('RG13/RG14 : décision TRANSFER : transfert intégral, réservation réalisée, pas de second règlement', async () => {
    const { t, l, admin, ab, d } = await disputed(2);
    const id = d.body.dispute.id;
    expect((await api().post(`/api/admin/disputes/${id}/resolve`).set(auth(l)).send({ decision: 'TRANSFER', note: 'x' })).status).toBe(403); // non-admin
    expect((await api().post(`/api/admin/disputes/${id}/resolve`).set(auth(admin)).send({ decision: 'TRANSFER' })).status).toBe(400); // motivation obligatoire
    const r = await api().post(`/api/admin/disputes/${id}/resolve`).set(auth(admin)).send({ decision: 'TRANSFER', note: 'Séance bien réalisée selon les preuves.' });
    expect(r.status).toBe(200);
    expect(await wallet(t.id)).toEqual({ available: 2, blocked: 0 });
    expect(await wallet(l.id)).toEqual({ available: 0, blocked: 0 });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: ab.bookingId } })).status).toBe('COMPLETED');
    // second règlement refusé, dans les deux sens
    const again = await api().post(`/api/admin/disputes/${id}/resolve`).set(auth(admin)).send({ decision: 'REFUND', note: 'Changement d’avis' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_SETTLED');
    expect(await wallet(l.id)).toEqual({ available: 0, blocked: 0 });
    // les deux parties sont notifiées de la décision
    expect(await prisma.notification.count({ where: { title: 'Litige réglé' } })).toBe(2);
  });

  it('RG13/RG14 : décision REFUND : restitution intégrale, réservation clôturée comme annulée', async () => {
    const { t, l, admin, ab, d } = await disputed(2);
    const r = await api().post(`/api/admin/disputes/${d.body.dispute.id}/resolve`).set(auth(admin)).send({ decision: 'REFUND', note: 'Intervenant absent confirmé.' });
    expect(r.status).toBe(200);
    expect(await wallet(l.id)).toEqual({ available: 2, blocked: 0 });
    expect(await wallet(t.id)).toEqual({ available: 0, blocked: 0 });
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: ab.bookingId } });
    expect(booking.status).toBe('CANCELLED');
    expect(booking.settledAt).not.toBeNull();
    expect(await prisma.ledgerEntry.count({ where: { type: 'REFUND', userId: l.id, amount: 2 } })).toBe(1);
    expect((await api().post(`/api/admin/disputes/${d.body.dispute.id}/resolve`).set(auth(admin)).send({ decision: 'TRANSFER', note: 'bis' })).status).toBe(409);
  });

  it('RG14 : décisions simultanées (double clic / deux admins) : un seul règlement', async () => {
    const { t, l, admin, d } = await disputed(2);
    const admin2 = await makeUser({ role: 'ADMIN' });
    const id = d.body.dispute.id;
    const rs = await Promise.all([
      ...Array.from({ length: 4 }, () => api().post(`/api/admin/disputes/${id}/resolve`).set(auth(admin)).send({ decision: 'TRANSFER', note: 'ok' })),
      ...Array.from({ length: 4 }, () => api().post(`/api/admin/disputes/${id}/resolve`).set(auth(admin2)).send({ decision: 'REFUND', note: 'ok' })),
    ]);
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    const settlements = (await prisma.ledgerEntry.count({ where: { type: 'TRANSFER_OUT' } })) + (await prisma.ledgerEntry.count({ where: { type: 'REFUND' } }));
    expect(settlements).toBe(1);
    const total = (await wallet(t.id)).available + (await wallet(l.id)).available;
    expect(total).toBe(2);
  });
});

describe('Évaluation', () => {
  beforeEach(resetDb);

  async function completed() {
    const t = await makeUser();
    const l = await makeUser();
    const ab = await acceptedBooking(t, l);
    await shiftBooking(ab.bookingId, -3, 1);
    await confirm(t, ab.bookingId);
    await confirm(l, ab.bookingId);
    return { t, l, ab };
  }
  const review = (u: any, id: string, body: any) => api().post(`/api/bookings/${id}/review`).set(auth(u)).send(body);

  it('RG15 : succès pour chaque participant ; note moyenne et commentaires sur le profil', async () => {
    const { t, l, ab } = await completed();
    expect((await review(l, ab.bookingId, { rating: 5, comment: 'Excellent' })).status).toBe(201);
    expect((await review(t, ab.bookingId, { rating: 4 })).status).toBe(201);
    const p = await api().get(`/api/profiles/${t.id}`).set(auth(l));
    expect(p.body.profile.averageRating).toBe(5);
    expect(p.body.profile.reviewCount).toBe(1);
    expect(p.body.reviews[0].comment).toBe('Excellent');
    expect(p.body.profile.email).toBeUndefined(); // profil public : pas de données privées
    expect(p.body.profile.availableCredits).toBeUndefined();
  });

  it('RG15 : évaluation déjà déposée, doubles clics inclus', async () => {
    const { l, ab } = await completed();
    const rs = await Promise.all(Array.from({ length: 5 }, () => review(l, ab.bookingId, { rating: 3 })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await prisma.review.count()).toBe(1);
    expect((await review(l, ab.bookingId, { rating: 3 })).body.error.code).toBe('ALREADY_REVIEWED');
  });

  it('RG15 : note hors de 1 à 5 refusée', async () => {
    const { l, ab } = await completed();
    for (const rating of [0, 6, 2.5, 'a']) expect((await review(l, ab.bookingId, { rating })).status).toBe(400);
  });

  it('RG15 : pas d’évaluation pour une séance non réalisée (acceptée, refusée, annulée) ni par un tiers', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const x = await makeUser();
    const ab = await acceptedBooking(t, l);
    expect((await review(l, ab.bookingId, { rating: 5 })).body.error.code).toBe('NOT_COMPLETED');
    await api().post(`/api/bookings/${ab.bookingId}/cancel`).set(auth(l));
    expect((await review(l, ab.bookingId, { rating: 5 })).body.error.code).toBe('NOT_COMPLETED');
    const done = await completed();
    expect((await review(x, done.ab.bookingId, { rating: 5 })).status).toBe(403);
  });
});
