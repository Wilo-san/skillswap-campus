import { beforeEach, describe, expect, it } from 'vitest';
import { acceptedBooking, api, auth, makeOffer, makeUser, resetDb, wallet } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

const request = (u: any, slotId: string) => api().post('/api/bookings').set(auth(u)).send({ slotId });

describe('Demande et acceptation', () => {
  beforeEach(resetDb);

  it('RG05 : une demande réussie ne bloque aucun crédit', async () => {
    const t = await makeUser();
    const l = await makeUser({ credits: 2 });
    const { slot } = await makeOffer(t);
    const r = await request(l, slot.id);
    expect(r.status).toBe(201);
    expect(r.body.booking.status).toBe('PENDING');
    expect(await wallet(l.id)).toEqual({ available: 2, blocked: 0 });
    // notification réelle pour l'intervenant
    expect(await prisma.notification.count({ where: { userId: t.id } })).toBe(1);
  });

  it('RG03 : on ne peut pas réserver sa propre offre', async () => {
    const t = await makeUser();
    const { slot } = await makeOffer(t);
    const r = await request(t, slot.id);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('OWN_OFFER');
  });

  it('RG03 : pas de doublon de demande en attente pour le même créneau', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const { slot } = await makeOffer(t);
    expect((await request(l, slot.id)).status).toBe(201);
    const dup = await request(l, slot.id);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_REQUEST');
  });

  it('RG03 : doubles clics simultanés sur la demande : une seule demande créée', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const { slot } = await makeOffer(t);
    const rs = await Promise.all(Array.from({ length: 8 }, () => request(l, slot.id)));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await prisma.booking.count({ where: { learnerId: l.id } })).toBe(1);
  });

  it('RG05 : solde insuffisant à la demande (offre de 2 h, 1 crédit)', async () => {
    const t = await makeUser();
    const l = await makeUser({ credits: 1 });
    const { slot } = await makeOffer(t, { hours: 2 });
    const r = await request(l, slot.id);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('INSUFFICIENT_CREDITS');
  });

  it('RG04 : offre non publiée, masquée, intervenant inactif ou créneau passé : demande refusée', async () => {
    const l = await makeUser();
    const t1 = await makeUser();
    const draft = await makeOffer(t1, { status: 'DRAFT' });
    expect((await request(l, draft.slot.id)).body.error.code).toBe('OFFER_UNAVAILABLE');

    const hidden = await makeOffer(t1);
    await prisma.offer.update({ where: { id: hidden.offer.id }, data: { hidden: true } });
    expect((await request(l, hidden.slot.id)).body.error.code).toBe('OFFER_UNAVAILABLE');

    const t2 = await makeUser({ active: false });
    const inactive = await makeOffer(t2);
    expect((await request(l, inactive.slot.id)).body.error.code).toBe('TEACHER_INACTIVE');

    const past = await makeOffer(t1, { startInHours: -3 });
    expect((await request(l, past.slot.id)).body.error.code).toBe('SLOT_PAST');
  });

  it('RG06 : l’acceptation bloque le coût sur le compte du bénéficiaire et trace le mouvement', async () => {
    const t = await makeUser();
    const l = await makeUser({ credits: 2 });
    const { slot } = await makeOffer(t, { hours: 2 });
    const b = (await request(l, slot.id)).body.booking;
    const a = await api().post(`/api/bookings/${b.id}/accept`).set(auth(t));
    expect(a.status).toBe(200);
    expect(a.body.booking.status).toBe('ACCEPTED');
    expect(await wallet(l.id)).toEqual({ available: 0, blocked: 2 });
    const entry = await prisma.ledgerEntry.findFirstOrThrow({ where: { userId: l.id, type: 'BLOCK' } });
    expect(entry).toMatchObject({ amount: 2, bookingId: b.id, availableAfter: 0, blockedAfter: 2 });
    expect((await prisma.slot.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe('ASSIGNED');
  });

  it('RG05 : le solde est revérifié à l’acceptation (le bénéficiaire a dépensé entre-temps)', async () => {
    const t1 = await makeUser();
    const t2 = await makeUser();
    const l = await makeUser({ credits: 2 });
    const o1 = await makeOffer(t1, { hours: 2, startInHours: 48 });
    const o2 = await makeOffer(t2, { hours: 2, startInHours: 100 });
    const b1 = (await request(l, o1.slot.id)).body.booking;
    const b2 = (await request(l, o2.slot.id)).body.booking; // 2 demandes en attente, aucun blocage
    expect((await api().post(`/api/bookings/${b1.id}/accept`).set(auth(t1))).status).toBe(200);
    const second = await api().post(`/api/bookings/${b2.id}/accept`).set(auth(t2));
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('INSUFFICIENT_CREDITS');
    expect(await wallet(l.id)).toEqual({ available: 0, blocked: 2 });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b2.id } })).status).toBe('PENDING');
  });

  it('RG07 : une seule acceptation par créneau, les autres demandes sont refusées avec motif', async () => {
    const t = await makeUser();
    const [l1, l2, l3] = await Promise.all([makeUser(), makeUser(), makeUser()]);
    const { slot } = await makeOffer(t);
    const b1 = (await request(l1, slot.id)).body.booking;
    const b2 = (await request(l2, slot.id)).body.booking;
    const b3 = (await request(l3, slot.id)).body.booking;
    expect((await api().post(`/api/bookings/${b2.id}/accept`).set(auth(t))).status).toBe(200);
    for (const id of [b1.id, b3.id]) {
      const row = await prisma.booking.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('REFUSED');
      expect(row.refusalReason).toMatch(/attribué/);
    }
    // créneau déjà attribué : acceptation tardive impossible
    const late = await api().post(`/api/bookings/${b1.id}/accept`).set(auth(t));
    expect(late.status).toBe(409);
    // et nouvelle demande impossible
    const l4 = await makeUser();
    expect((await request(l4, slot.id)).body.error.code).toBe('SLOT_TAKEN');
    expect(await prisma.notification.count({ where: { userId: l1.id, title: 'Demande refusée' } })).toBe(1);
  });

  it('RG07 : acceptations simultanées de plusieurs demandes : une seule réussit, pas de double blocage', async () => {
    const t = await makeUser();
    const learners = await Promise.all(Array.from({ length: 6 }, () => makeUser({ credits: 2 })));
    const { slot } = await makeOffer(t);
    const ids: string[] = [];
    for (const l of learners) ids.push((await request(l, slot.id)).body.booking.id);
    const rs = await Promise.all(ids.map((id) => api().post(`/api/bookings/${id}/accept`).set(auth(t))));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await prisma.booking.count({ where: { slotId: slot.id, status: 'ACCEPTED' } })).toBe(1);
    const totalBlocked = (await prisma.user.aggregate({ _sum: { blockedCredits: true } }))._sum.blockedCredits;
    expect(totalBlocked).toBe(1);
  });

  it('RG07 : double clic sur « Accepter » : un seul blocage', async () => {
    const t = await makeUser();
    const l = await makeUser({ credits: 2 });
    const { slot } = await makeOffer(t);
    const b = (await request(l, slot.id)).body.booking;
    const rs = await Promise.all(Array.from({ length: 6 }, () => api().post(`/api/bookings/${b.id}/accept`).set(auth(t))));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await wallet(l.id)).toEqual({ available: 1, blocked: 1 });
    expect(await prisma.ledgerEntry.count({ where: { type: 'BLOCK' } })).toBe(1);
  });

  it('RG08 : conflit de planning (bénéficiaire ou intervenant), séances consécutives autorisées', async () => {
    const t1 = await makeUser();
    const t2 = await makeUser();
    const l = await makeUser({ credits: 2 });
    // même heure de début pour deux offres de deux intervenants différents
    const o1 = await makeOffer(t1, { startInHours: 48 });
    const o2 = await makeOffer(t2, { startInHours: 48 });
    const b1 = (await request(l, o1.slot.id)).body.booking;
    const b2 = (await request(l, o2.slot.id)).body.booking;
    expect((await api().post(`/api/bookings/${b1.id}/accept`).set(auth(t1))).status).toBe(200);
    const clash = await api().post(`/api/bookings/${b2.id}/accept`).set(auth(t2));
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('SCHEDULE_CONFLICT');

    // consécutif : commence exactement à la fin de la première
    const t3 = await makeUser();
    const o3 = await makeOffer(t3, { startInHours: 49 });
    const b3 = (await request(l, o3.slot.id)).body.booking;
    expect((await api().post(`/api/bookings/${b3.id}/accept`).set(auth(t3))).status).toBe(200);

    // l'intervenant t1 en tant que bénéficiaire ailleurs au même moment : conflit côté intervenant
    const t4 = await makeUser();
    const o4 = await makeOffer(t4, { startInHours: 48 });
    const b4 = (await request(t1, o4.slot.id)).body.booking;
    const c2 = await api().post(`/api/bookings/${b4.id}/accept`).set(auth(t4));
    expect(c2.body.error.code).toBe('SCHEDULE_CONFLICT');
  });

  it('un autre étudiant ne peut ni accepter ni refuser une demande', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const x = await makeUser();
    const { slot } = await makeOffer(t);
    const b = (await request(l, slot.id)).body.booking;
    expect((await api().post(`/api/bookings/${b.id}/accept`).set(auth(l))).status).toBe(403);
    expect((await api().post(`/api/bookings/${b.id}/accept`).set(auth(x))).status).toBe(403);
    expect((await api().post(`/api/bookings/${b.id}/refuse`).set(auth(x)).send({ reason: 'non' })).status).toBe(403);
    expect((await api().get(`/api/bookings/${b.id}`).set(auth(x))).status).toBe(403);
  });
});

describe('Refus et annulation', () => {
  beforeEach(resetDb);

  it('RG09 : refus motivé (motif obligatoire) sans mouvement de crédits', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const { slot } = await makeOffer(t);
    const b = (await request(l, slot.id)).body.booking;
    expect((await api().post(`/api/bookings/${b.id}/refuse`).set(auth(t)).send({})).status).toBe(400);
    const r = await api().post(`/api/bookings/${b.id}/refuse`).set(auth(t)).send({ reason: 'Indisponible ce jour-là' });
    expect(r.status).toBe(200);
    expect(r.body.booking.status).toBe('REFUSED');
    expect(r.body.booking.refusalReason).toBe('Indisponible ce jour-là');
    expect(await wallet(l.id)).toEqual({ available: 2, blocked: 0 });
    // le bénéficiaire est notifié avec le motif
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: l.id } });
    expect(n.message).toContain('Indisponible');
    // le créneau reste disponible
    expect((await prisma.slot.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe('AVAILABLE');
  });

  it('RG09 : le bénéficiaire retire sa demande en attente ; l’intervenant ne peut pas la retirer', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const { slot } = await makeOffer(t);
    const b = (await request(l, slot.id)).body.booking;
    expect((await api().post(`/api/bookings/${b.id}/withdraw`).set(auth(t))).status).toBe(403);
    const r = await api().post(`/api/bookings/${b.id}/withdraw`).set(auth(l));
    expect(r.body.booking.status).toBe('CANCELLED');
    // une fois retirée, il peut redemander
    expect((await request(l, slot.id)).status).toBe(201);
  });

  it('RG10 : annulation avant le début : crédits libérés, créneau à nouveau réservable', async () => {
    const t = await makeUser();
    const l = await makeUser({ credits: 2 });
    const ab = await acceptedBooking(t, l);
    expect(await wallet(l.id)).toEqual({ available: 1, blocked: 1 });
    const r = await api().post(`/api/bookings/${ab.bookingId}/cancel`).set(auth(l)).send({ reason: 'Imprévu' });
    expect(r.status).toBe(200);
    expect(r.body.booking.status).toBe('CANCELLED');
    expect(await wallet(l.id)).toEqual({ available: 2, blocked: 0 });
    expect(await prisma.ledgerEntry.count({ where: { userId: l.id, type: 'RELEASE' } })).toBe(1);
    expect((await prisma.slot.findUniqueOrThrow({ where: { id: ab.slot.id } })).status).toBe('AVAILABLE');
    const l2 = await makeUser();
    expect((await request(l2, ab.slot.id)).status).toBe(201);
    // l'intervenant peut aussi annuler
    const t2 = await makeUser();
    const l3 = await makeUser();
    const ab2 = await acceptedBooking(t2, l3);
    expect((await api().post(`/api/bookings/${ab2.bookingId}/cancel`).set(auth(t2))).status).toBe(200);
    expect(await wallet(l3.id)).toEqual({ available: 2, blocked: 0 });
  });

  it('RG10 : annulation directe interdite après le début, passage par un signalement', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const ab = await acceptedBooking(t, l);
    const { shiftBooking } = await import('./helpers.js');
    await shiftBooking(ab.bookingId, -0.5, 1); // séance en cours
    const r = await api().post(`/api/bookings/${ab.bookingId}/cancel`).set(auth(l));
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('ALREADY_STARTED');
    expect(await wallet(l.id)).toEqual({ available: 1, blocked: 1 });
  });

  it('RG10 : doubles clics sur « Annuler » : une seule libération', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const ab = await acceptedBooking(t, l);
    const rs = await Promise.all(Array.from({ length: 6 }, () => api().post(`/api/bookings/${ab.bookingId}/cancel`).set(auth(l))));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await wallet(l.id)).toEqual({ available: 2, blocked: 0 });
    expect(await prisma.ledgerEntry.count({ where: { type: 'RELEASE' } })).toBe(1);
  });

  it('RG10 : un tiers ne peut pas annuler', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const x = await makeUser();
    const ab = await acceptedBooking(t, l);
    expect((await api().post(`/api/bookings/${ab.bookingId}/cancel`).set(auth(x))).status).toBe(403);
  });

  it('planning : séances acceptées de l’intervenant et du bénéficiaire ; RG19 : lieu et lien visibles des participants seulement', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const x = await makeUser();
    const ab = await acceptedBooking(t, l);
    const p1 = await api().get('/api/bookings/planning').set(auth(l));
    const p2 = await api().get('/api/bookings/planning').set(auth(t));
    expect(p1.body.bookings).toHaveLength(1);
    expect(p2.body.bookings).toHaveLength(1);
    expect(p1.body.bookings[0].meetingUrl).toContain('meet.example.org');
    expect(p1.body.bookings[0].location).toBe('Salle B12');
    expect((await api().get('/api/bookings/planning').set(auth(x))).body.bookings).toHaveLength(0);
    expect((await api().get(`/api/bookings/${ab.bookingId}`).set(auth(x))).status).toBe(403);
  });

  it('RG19 : lieu et lien masqués tant que la demande n’est pas acceptée', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const { slot } = await makeOffer(t);
    const b = (await request(l, slot.id)).body.booking;
    expect(b.meetingUrl).toBeNull();
    expect(b.location).toBeNull();
  });
});
