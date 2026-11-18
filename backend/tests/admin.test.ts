import { beforeEach, describe, expect, it } from 'vitest';
import { acceptedBooking, api, auth, makeCategory, makeOffer, makeUser, resetDb, wallet } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

describe('Administration', () => {
  beforeEach(resetDb);

  it('tableau de bord : comptes actifs, offres publiées, séances, crédits transférés, litiges ouverts', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const t = await makeUser();
    const l = await makeUser();
    await acceptedBooking(t, l);
    const r = await api().get('/api/admin/stats').set(auth(admin));
    expect(r.status).toBe(200);
    expect(r.body.stats).toMatchObject({ activeAccounts: 3, publishedOffers: 1, acceptedBookings: 1, completedBookings: 0, creditsTransferred: 0, openDisputes: 0, creditsBlocked: 1 });
  });

  it('catégories : création, doublon refusé, désactivation, suppression bloquée si utilisée', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const s = await makeUser();
    expect((await api().post('/api/categories').set(auth(s)).send({ name: 'Cuisine' })).status).toBe(403);
    const c = await api().post('/api/categories').set(auth(admin)).send({ name: 'Cuisine' });
    expect(c.status).toBe(201);
    expect((await api().post('/api/categories').set(auth(admin)).send({ name: 'Cuisine' })).status).toBe(409);
    expect((await api().post('/api/categories').set(auth(admin)).send({ name: 'x' })).status).toBe(400);
    const id = c.body.category.id;
    expect((await api().put(`/api/categories/${id}`).set(auth(admin)).send({ active: false })).status).toBe(200);
    // une catégorie inactive n'est plus proposée aux étudiants
    expect((await api().get('/api/categories').set(auth(s))).body.categories.find((x: any) => x.id === id)).toBeUndefined();
    expect((await api().get('/api/categories?all=1').set(auth(admin))).body.categories.find((x: any) => x.id === id)).toBeTruthy();
    const used = await makeCategory('Utilisée');
    await prisma.offer.create({ data: { teacherId: s.id, title: 't', categoryId: used.id, skill: 's', description: 'd', level: 'BEGINNER', durationHours: 1, mode: 'REMOTE' } });
    expect((await api().delete(`/api/categories/${used.id}`).set(auth(admin))).body.error.code).toBe('CATEGORY_IN_USE');
    expect((await api().delete(`/api/categories/${id}`).set(auth(admin))).status).toBe(200);
  });

  it('RG17 : masquer une offre empêche les nouvelles demandes, annule les demandes en attente, garde les séances acceptées', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const t = await makeUser();
    const l1 = await makeUser();
    const l2 = await makeUser();
    const { offer, slots } = await makeOffer(t, { slots: 2 });
    const accepted = (await api().post('/api/bookings').set(auth(l1)).send({ slotId: slots[0].id })).body.booking;
    await api().post(`/api/bookings/${accepted.id}/accept`).set(auth(t));
    const pending = (await api().post('/api/bookings').set(auth(l2)).send({ slotId: slots[1].id })).body.booking;

    expect((await api().post(`/api/admin/offers/${offer.id}/hide`).set(auth(l1)).send({ reason: 'abus' })).status).toBe(403);
    expect((await api().post(`/api/admin/offers/${offer.id}/hide`).set(auth(admin)).send({})).status).toBe(400);
    expect((await api().post(`/api/admin/offers/${offer.id}/hide`).set(auth(admin)).send({ reason: 'Contenu inapproprié' })).status).toBe(200);

    expect((await prisma.booking.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('CANCELLED');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: accepted.id } })).status).toBe('ACCEPTED');
    expect(await wallet(l1.id)).toEqual({ available: 1, blocked: 1 });
    const l3 = await makeUser();
    expect((await api().post('/api/bookings').set(auth(l3)).send({ slotId: slots[1].id })).body.error.code).toBe('OFFER_UNAVAILABLE');
    expect((await api().get('/api/offers').set(auth(l3))).body.offers).toHaveLength(0);
    // l'intervenant ne peut pas republier une offre masquée
    expect((await api().post(`/api/offers/${offer.id}/publish`).set(auth(t))).body.error.code).toBe('OFFER_HIDDEN');
    // la séance acceptée reste consultable
    expect((await api().get('/api/bookings/planning').set(auth(l1))).body.bookings).toHaveLength(1);
    expect(await prisma.notification.count({ where: { userId: t.id, title: 'Offre masquée' } })).toBe(1);
  });

  it('RG17 : archiver annule les demandes en attente ; durée non modifiable une fois des demandes reçues', async () => {
    const t = await makeUser();
    const l = await makeUser();
    const { offer, slot } = await makeOffer(t);
    const b = (await api().post('/api/bookings').set(auth(l)).send({ slotId: slot.id })).body.booking;
    const body = { title: 'T', categoryId: offer.categoryId, skill: 'Python', description: 'd', level: 'BEGINNER', durationHours: 2, mode: 'REMOTE' };
    expect((await api().put(`/api/offers/${offer.id}`).set(auth(t)).send(body)).body.error.code).toBe('DURATION_LOCKED');
    await api().post(`/api/offers/${offer.id}/archive`).set(auth(t));
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('CANCELLED');
  });

  it('RG18 : désactiver un compte annule ses demandes en attente, signale les séances acceptées, sans perdre de crédits', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const t = await makeUser();
    const l = await makeUser({ credits: 2 });
    const l2 = await makeUser();
    const ab = await acceptedBooking(t, l, { slots: 2 });
    const pending = (await api().post('/api/bookings').set(auth(l2)).send({ slotId: (await prisma.slot.findFirstOrThrow({ where: { offerId: ab.offer.id, status: 'AVAILABLE' } })).id })).body.booking;

    const r = await api().post(`/api/admin/users/${t.id}/active`).set(auth(admin)).send({ active: false });
    expect(r.status).toBe(200);
    expect(r.body.cancelledPending).toBe(1);
    expect(r.body.acceptedToTreat).toBe(1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('CANCELLED');
    // la réservation acceptée n'est PAS annulée automatiquement, les crédits restent bloqués
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: ab.bookingId } })).status).toBe('ACCEPTED');
    expect(await wallet(l.id)).toEqual({ available: 1, blocked: 1 });
    // le compte désactivé ne se connecte plus ; son offre n'est plus dans le catalogue
    expect((await api().post('/api/auth/login').send({ email: t.email, password: 'Passw0rd!' })).status).toBe(403);
    expect((await api().get('/api/auth/me').set(auth(t))).status).toBe(403);
    const other = await makeUser();
    expect((await api().get('/api/offers').set(auth(other))).body.offers).toHaveLength(0);

    // traitement admin : annulation, crédits libérés intégralement
    expect((await api().post(`/api/admin/bookings/${ab.bookingId}/cancel`).set(auth(admin)).send({})).status).toBe(400);
    expect((await api().post(`/api/admin/bookings/${ab.bookingId}/cancel`).set(auth(admin)).send({ reason: 'Compte désactivé' })).status).toBe(200);
    expect(await wallet(l.id)).toEqual({ available: 2, blocked: 0 });
    // pas de second traitement
    expect((await api().post(`/api/admin/bookings/${ab.bookingId}/cancel`).set(auth(admin)).send({ reason: 'bis' })).status).toBe(409);
    expect(await prisma.ledgerEntry.count({ where: { type: 'RELEASE' } })).toBe(1);
    // réactivation possible
    await api().post(`/api/admin/users/${t.id}/active`).set(auth(admin)).send({ active: true });
    expect((await api().post('/api/auth/login').send({ email: t.email, password: 'Passw0rd!' })).status).toBe(200);
  });

  it('RG18 : on ne peut pas désactiver son propre compte ni le dernier administrateur', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    expect((await api().post(`/api/admin/users/${admin.id}/active`).set(auth(admin)).send({ active: false })).body.error.code).toBe('SELF_DEACTIVATE');
    const admin2 = await makeUser({ role: 'ADMIN' });
    expect((await api().post(`/api/admin/users/${admin2.id}/active`).set(auth(admin)).send({ active: false })).status).toBe(200);
    const admin3 = await makeUser({ role: 'ADMIN' });
    await api().post(`/api/admin/users/${admin3.id}/active`).set(auth(admin)).send({ active: false });
    // admin est le seul actif restant : un autre admin actif ne peut pas le désactiver
    const s = await makeUser();
    expect((await api().post(`/api/admin/users/${admin.id}/active`).set(auth(s)).send({ active: false })).status).toBe(403);
  });

  it('liste des comptes avec recherche, et journal d’audit des actions admin', async () => {
    const admin = await makeUser({ role: 'ADMIN' });
    const s = await makeUser({ name: 'Zorglub' });
    const r = await api().get('/api/admin/users?q=zorglub').set(auth(admin));
    expect(r.body.users).toHaveLength(1);
    expect(r.body.users[0].passwordHash).toBeUndefined();
    await api().post(`/api/admin/users/${s.id}/active`).set(auth(admin)).send({ active: false });
    expect((await api().get('/api/admin/audit').set(auth(admin))).body.logs[0].action).toBe('USER_DEACTIVATED');
  });
});

describe('Portefeuille et notifications', () => {
  beforeEach(resetDb);

  it('affiche disponible, bloqué et historique (date, quantité, type, séance)', async () => {
    const t = await makeUser();
    const l = await makeUser();
    await prisma.ledgerEntry.create({ data: { userId: l.id, type: 'WELCOME_BONUS', amount: 2, availableAfter: 2, blockedAfter: 0 } });
    const ab = await acceptedBooking(t, l);
    const r = await api().get('/api/wallet').set(auth(l));
    expect(r.body).toMatchObject({ available: 1, blocked: 1 });
    const block = r.body.entries.find((e: any) => e.type === 'BLOCK');
    expect(block).toMatchObject({ amount: 1, availableAfter: 1, blockedAfter: 1 });
    expect(block.booking.id).toBe(ab.bookingId);
    expect(block.createdAt).toBeTruthy();
  });

  it('notifications : liste, compteur de non-lues, marquage comme lues, isolation entre utilisateurs', async () => {
    const t = await makeUser();
    const l = await makeUser();
    await acceptedBooking(t, l);
    const n = await api().get('/api/notifications').set(auth(l));
    expect(n.body.unread).toBeGreaterThan(0);
    await api().post('/api/notifications/read-all').set(auth(l));
    expect((await api().get('/api/notifications').set(auth(l))).body.unread).toBe(0);
    // un autre utilisateur ne peut pas marquer mes notifications
    const tn = (await api().get('/api/notifications').set(auth(t))).body.notifications[0];
    await api().post(`/api/notifications/${tn.id}/read`).set(auth(l));
    expect((await api().get('/api/notifications').set(auth(t))).body.unread).toBeGreaterThan(0);
  });
});
