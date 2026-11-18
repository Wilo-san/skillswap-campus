import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { wrap } from '../lib/async.js';
import { conflict, forbidden, unauthorized, badRequest } from '../lib/errors.js';
import { changePasswordSchema, loginSchema, profileSchema, registerSchema } from '../lib/validation.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { config } from '../lib/config.js';
import { grantWelcome } from '../services/wallet.js';
import { publicUser, userInclude } from '../services/serializers.js';

export const authRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 10_000 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Trop de tentatives. Réessayez dans quelques minutes.' } },
});

// Inscription : RG01 (email unique, crédits de bienvenue une seule fois)
authRouter.post(
  '/register',
  limiter,
  wrap(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw conflict('Cette adresse électronique est déjà utilisée.', 'EMAIL_TAKEN');
    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          field: data.field,
          availableCredits: 0,
        },
      });
      await grantWelcome(tx, u.id, config.welcomeCredits);
      return tx.user.findUniqueOrThrow({ where: { id: u.id }, include: userInclude });
    });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  }),
);

authRouter.post(
  '/login',
  limiter,
  wrap(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email }, include: userInclude });
    // Même message pour email inconnu et mot de passe erroné : pas d'énumération de comptes
    const ok = user ? await bcrypt.compare(data.password, user.passwordHash) : await bcrypt.compare(data.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    if (!user || !ok) throw unauthorized('Adresse électronique ou mot de passe incorrect.');
    if (!user.active) throw forbidden('Ce compte a été désactivé. Contactez un administrateur.');
    res.json({ token: signToken(user), user: publicUser(user) });
  }),
);

// La déconnexion est portée par le client (jeton sans état) ; l'endpoint existe pour la traçabilité.
authRouter.post('/logout', requireAuth, (_req, res) => {
  res.json({ ok: true });
});

authRouter.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, include: userInclude });
    res.json({ user: publicUser(user) });
  }),
);

authRouter.put(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const data = profileSchema.parse(req.body);
    const id = req.user!.id;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { firstName: data.firstName, lastName: data.lastName, field: data.field, bio: data.bio },
      });
      for (const [kind, list] of [
        ['OFFERED', data.offeredSkills],
        ['WANTED', data.wantedSkills],
      ] as const) {
        if (!list) continue;
        const unique = [...new Set(list.map((s) => s.trim()).filter(Boolean))];
        await tx.userSkill.deleteMany({ where: { userId: id, kind } });
        if (unique.length) await tx.userSkill.createMany({ data: unique.map((name) => ({ userId: id, kind, name })) });
      }
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id }, include: userInclude });
    res.json({ user: publicUser(user) });
  }),
);

authRouter.put(
  '/password',
  requireAuth,
  wrap(async (req, res) => {
    const data = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await bcrypt.compare(data.currentPassword, user.passwordHash))) {
      throw badRequest('Le mot de passe actuel est incorrect.', 'BAD_PASSWORD');
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(data.newPassword, 12) } });
    res.json({ ok: true });
  }),
);
