import { beforeEach, describe, expect, it } from 'vitest';
import { api, auth, makeCategory, makeOffer, makeUser, resetDb } from './helpers.js';

const HOUR = 3_600_000;
const slotBody = (startInH: number, hours: number) => {
  const s = new Date(Date.now() + startInH * HOUR);
  return { startsAt: s.toISOString(), endsAt: new Date(s.getTime() + hours * HOUR).toISOString(), meetingUrl: 'https://meet.example.org/abc' };
};

describe('Publication et recherche', () => {
  beforeEach(resetDb);

  it('offre valide : création en brouillon, ajout de créneau, publication', async () => {
    const t = await makeUser();
    const cat = await makeCategory('Langues');
    const c = await api().post('/api/offers').set(auth(t)).send({ title: 'Anglais', categoryId: cat.id, skill: 'Anglais', description: 'Conversation', level: 'BEGINNER', durationHours: 1, mode: 'REMOTE' });
    expect(c.status).toBe(201);
    expect(c.body.offer.status).toBe('DRAFT');
    const id = c.body.offer.id;
    // sans créneau : publication refusée (offre incomplète)
    const early = await api().post(`/api/offers/${id}/publish`).set(auth(t));
    expect(early.status).toBe(400);
    expect(early.body.error.code).toBe('NO_FUTURE_SLOT');
    const s = await api().post(`/api/offers/${id}/slots`).set(auth(t)).send(slotBody(48, 1));
    expect(s.status).toBe(201);
    const pub = await api().post(`/api/offers/${id}/publish`).set(auth(t));
    expect(pub.status).toBe(200);
    expect(pub.body.offer.status).toBe('PUBLISHED');
  });

  it('offre incomplète : champs manquants, durée invalide (RG02), catégorie inconnue', async () => {
    const t = await makeUser();
    const cat = await makeCategory();
    const base = { title: 'X', categoryId: cat.id, skill: 'Y', description: 'Z', level: 'BEGINNER', durationHours: 1, mode: 'REMOTE' };
    expect((await api().post('/api/offers').set(auth(t)).send({ ...base, title: '' })).status).toBe(400);
    expect((await api().post('/api/offers').set(auth(t)).send({ ...base, durationHours: 3 })).status).toBe(400);
    expect((await api().post('/api/offers').set(auth(t)).send({ ...base, durationHours: 0 })).status).toBe(400);
    expect((await api().post('/api/offers').set(auth(t)).send({ ...base, categoryId: 'nope' })).status).toBe(400);
    expect((await api().post('/api/offers').set(auth(t)).send({ ...base, mode: 'AUTRE' })).status).toBe(400);
  });

  it('créneau : cohérent avec la durée, dans le futur, lien/lieu selon le mode, sans chevauchement', async () => {
    const t = await makeUser();
    const { offer } = await makeOffer(t, { hours: 2, status: 'DRAFT', slots: 0 });
    expect((await api().post(`/api/offers/${offer.id}/slots`).set(auth(t)).send(slotBody(48, 1))).status).toBe(400); // durée
    expect((await api().post(`/api/offers/${offer.id}/slots`).set(auth(t)).send(slotBody(-5, 2))).status).toBe(400); // passé
    const noLink = { ...slotBody(48, 2), meetingUrl: undefined };
    expect((await api().post(`/api/offers/${offer.id}/slots`).set(auth(t)).send(noLink)).status).toBe(400); // lien requis (REMOTE)
    expect((await api().post(`/api/offers/${offer.id}/slots`).set(auth(t)).send(slotBody(48, 2))).status).toBe(201);
    const overlap = await api().post(`/api/offers/${offer.id}/slots`).set(auth(t)).send(slotBody(49, 2));
    expect(overlap.status).toBe(409); // chevauche le créneau précédent
    expect(overlap.body.error.code).toBe('SLOT_OVERLAP');
    expect((await api().post(`/api/offers/${offer.id}/slots`).set(auth(t)).send(slotBody(50, 2))).status).toBe(201); // consécutif autorisé
  });

  it('seul le propriétaire modifie, publie ou archive son offre', async () => {
    const t = await makeUser();
    const other = await makeUser();
    const { offer } = await makeOffer(t);
    expect((await api().post(`/api/offers/${offer.id}/archive`).set(auth(other))).status).toBe(403);
    expect((await api().post(`/api/offers/${offer.id}/archive`).set(auth(t))).status).toBe(200);
  });

  it('catalogue : uniquement offres publiées d’autres étudiants avec créneau futur disponible', async () => {
    const t = await makeUser();
    const me = await makeUser();
    await makeOffer(t); // visible
    await makeOffer(t, { status: 'DRAFT' }); // brouillon
    await makeOffer(t, { status: 'ARCHIVED' }); // archivée
    await makeOffer(me); // la mienne
    const r = await api().get('/api/offers').set(auth(me));
    expect(r.status).toBe(200);
    expect(r.body.offers).toHaveLength(1);
    expect(r.body.offers[0].teacher.id).toBe(t.id);
  });

  it('catalogue : une offre sans créneau futur disponible n’apparaît pas', async () => {
    const t = await makeUser();
    const me = await makeUser();
    const { slot } = await makeOffer(t);
    const { prisma } = await import('../src/lib/prisma.js');
    await prisma.slot.update({ where: { id: slot.id }, data: { status: 'ASSIGNED' } });
    expect((await api().get('/api/offers').set(auth(me))).body.offers).toHaveLength(0);
  });

  it('recherche par compétence, catégorie, niveau, mode et date ; aucune correspondance', async () => {
    const t = await makeUser();
    const me = await makeUser();
    const { offer } = await makeOffer(t, { startInHours: 72 });
    const { prisma } = await import('../src/lib/prisma.js');
    const cat = await makeCategory('Langues');
    const o2 = (await makeOffer(t)).offer;
    await prisma.offer.update({ where: { id: o2.id }, data: { skill: 'Anglais', title: 'Anglais', categoryId: cat.id, level: 'ADVANCED', mode: 'ONSITE' } });

    expect((await api().get('/api/offers?skill=python').set(auth(me))).body.offers.map((o: any) => o.id)).toEqual([offer.id]);
    expect((await api().get(`/api/offers?categoryId=${cat.id}`).set(auth(me))).body.offers.map((o: any) => o.id)).toEqual([o2.id]);
    expect((await api().get('/api/offers?level=ADVANCED').set(auth(me))).body.offers).toHaveLength(1);
    expect((await api().get('/api/offers?mode=REMOTE').set(auth(me))).body.offers).toHaveLength(1);
    const day = new Date(Date.now() + 72 * HOUR).toISOString().slice(0, 10);
    expect((await api().get(`/api/offers?date=${day}`).set(auth(me))).body.offers.map((o: any) => o.id)).toContain(offer.id);
    const none = await api().get('/api/offers?skill=chinois').set(auth(me));
    expect(none.status).toBe(200);
    expect(none.body.offers).toEqual([]);
  });

  it('suggestions : correspondance sur la compétence recherchée du profil ou sa catégorie', async () => {
    const t = await makeUser();
    const me = await makeUser();
    await makeOffer(t);
    expect((await api().get('/api/offers/suggestions').set(auth(me))).body.reason).toBe('NO_WANTED_SKILLS');
    await api().put('/api/auth/me').set(auth(me)).send({ wantedSkills: ['Python'] });
    const r = await api().get('/api/offers/suggestions').set(auth(me));
    expect(r.body.offers).toHaveLength(1);
    await api().put('/api/auth/me').set(auth(me)).send({ wantedSkills: ['Programmation'] }); // par catégorie
    expect((await api().get('/api/offers/suggestions').set(auth(me))).body.offers).toHaveLength(1);
    await api().put('/api/auth/me').set(auth(me)).send({ wantedSkills: ['Cuisine'] });
    expect((await api().get('/api/offers/suggestions').set(auth(me))).body.offers).toHaveLength(0);
  });

  it('RG19 : le catalogue ne révèle jamais le lieu précis ni le lien de réunion', async () => {
    const t = await makeUser();
    const me = await makeUser();
    await makeOffer(t);
    const r = await api().get('/api/offers').set(auth(me));
    const slot = r.body.offers[0].slots[0];
    expect(slot.location).toBeNull();
    expect(slot.meetingUrl).toBeNull();
    expect(JSON.stringify(r.body)).not.toContain('meet.example.org');
    // le propriétaire les voit
    const mine = await api().get('/api/offers/mine').set(auth(t));
    expect(mine.body.offers[0].slots[0].meetingUrl).toContain('meet.example.org');
  });

  it('une offre en brouillon ou masquée est introuvable pour les autres', async () => {
    const t = await makeUser();
    const me = await makeUser();
    const { offer } = await makeOffer(t, { status: 'DRAFT' });
    expect((await api().get(`/api/offers/${offer.id}`).set(auth(me))).status).toBe(404);
    expect((await api().get(`/api/offers/${offer.id}`).set(auth(t))).status).toBe(200);
  });
});
