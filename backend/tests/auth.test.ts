import { beforeEach, describe, expect, it } from 'vitest';
import { api, auth, makeUser, resetDb } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

const valid = { email: 'sara@test.ma', password: 'Passw0rd!', firstName: 'Sara', lastName: 'El Idrissi', field: 'GI' };

describe('Authentification et inscription', () => {
  beforeEach(resetDb);

  it('RG01 : inscription réussie avec 2 crédits de bienvenue tracés dans l’historique', async () => {
    const r = await api().post('/api/auth/register').send(valid);
    expect(r.status).toBe(201);
    expect(r.body.token).toBeTruthy();
    expect(r.body.user.availableCredits).toBe(2);
    expect(r.body.user.blockedCredits).toBe(0);
    expect(r.body.user.passwordHash).toBeUndefined();
    const ledger = await prisma.ledgerEntry.findMany({ where: { userId: r.body.user.id } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: 'WELCOME_BONUS', amount: 2 });
  });

  it('RG01 : le mot de passe est haché', async () => {
    await api().post('/api/auth/register').send(valid);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: valid.email } });
    expect(u.passwordHash).not.toContain('Passw0rd');
    expect(u.passwordHash.startsWith('$2')).toBe(true);
  });

  it('RG01 : courriel déjà utilisé (insensible à la casse), pas de second bonus', async () => {
    await api().post('/api/auth/register').send(valid);
    const r = await api().post('/api/auth/register').send({ ...valid, email: 'SARA@test.ma' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('EMAIL_TAKEN');
    expect(await prisma.ledgerEntry.count({ where: { type: 'WELCOME_BONUS' } })).toBe(1);
  });

  it('RG01 : inscriptions simultanées avec le même courriel : un seul compte', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => api().post('/api/auth/register').send(valid)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await prisma.user.count({ where: { email: valid.email } })).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { type: 'WELCOME_BONUS' } })).toBe(1);
  });

  it('valide les saisies (courriel, mot de passe faible, champs vides)', async () => {
    const bad = await api().post('/api/auth/register').send({ ...valid, email: 'pas-un-mail' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION');
    const weak = await api().post('/api/auth/register').send({ ...valid, password: 'abc' });
    expect(weak.status).toBe(400);
    const empty = await api().post('/api/auth/register').send({ ...valid, firstName: '  ' });
    expect(empty.status).toBe(400);
  });

  it('connexion réussie, puis identifiants incorrects (même message pour courriel inconnu)', async () => {
    await api().post('/api/auth/register').send(valid);
    const ok = await api().post('/api/auth/login').send({ email: valid.email, password: valid.password });
    expect(ok.status).toBe(200);
    const badPwd = await api().post('/api/auth/login').send({ email: valid.email, password: 'Mauvais123' });
    const unknown = await api().post('/api/auth/login').send({ email: 'inconnu@test.ma', password: 'Mauvais123' });
    expect(badPwd.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(badPwd.body.error.message).toBe(unknown.body.error.message);
  });

  it('RG18 : un compte désactivé ne peut plus se connecter ni utiliser un jeton existant', async () => {
    const r = await api().post('/api/auth/register').send(valid);
    await prisma.user.update({ where: { email: valid.email }, data: { active: false } });
    const login = await api().post('/api/auth/login').send({ email: valid.email, password: valid.password });
    expect(login.status).toBe(403);
    const me = await api().get('/api/auth/me').set({ Authorization: `Bearer ${r.body.token}` });
    expect(me.status).toBe(403);
  });

  it('routes privées : refus sans jeton ou avec un jeton invalide', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
    expect((await api().get('/api/wallet').set({ Authorization: 'Bearer faux' })).status).toBe(401);
  });

  it('modification du profil et des compétences proposées/recherchées', async () => {
    const u = await makeUser();
    const r = await api().put('/api/auth/me').set(auth(u)).send({ field: 'Réseaux', bio: 'Salut', offeredSkills: ['Python', 'python ', 'Linux'], wantedSkills: ['Anglais'] });
    expect(r.status).toBe(200);
    expect(r.body.user.field).toBe('Réseaux');
    expect(r.body.user.offeredSkills.sort()).toEqual(['Linux', 'Python', 'python']);
    expect(r.body.user.wantedSkills).toEqual(['Anglais']);
    const again = await api().put('/api/auth/me').set(auth(u)).send({ wantedSkills: [] });
    expect(again.body.user.wantedSkills).toEqual([]);
    expect(again.body.user.offeredSkills.length).toBe(3);
  });

  it('un étudiant ne peut pas accéder à l’espace administrateur', async () => {
    const u = await makeUser();
    expect((await api().get('/api/admin/stats').set(auth(u))).status).toBe(403);
    const admin = await makeUser({ role: 'ADMIN' });
    expect((await api().get('/api/admin/stats').set(auth(admin))).status).toBe(200);
  });
});
