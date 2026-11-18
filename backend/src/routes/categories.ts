import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { wrap } from '../lib/async.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { conflict, notFound } from '../lib/errors.js';
import { audit } from '../services/notify.js';

export const categoriesRouter = Router();

const nameSchema = z.object({ name: z.string().trim().min(2, 'Nom trop court.').max(60, 'Nom trop long.') });

categoriesRouter.get(
  '/',
  requireAuth,
  wrap(async (req, res) => {
    const all = req.user!.role === 'ADMIN' && req.query.all === '1';
    const categories = await prisma.category.findMany({
      where: all ? {} : { active: true },
      orderBy: { name: 'asc' },
    });
    res.json({ categories });
  }),
);

categoriesRouter.post(
  '/',
  requireAuth,
  requireRole('ADMIN'),
  wrap(async (req, res) => {
    const { name } = nameSchema.parse(req.body);
    const exists = await prisma.category.findUnique({ where: { name } });
    if (exists) throw conflict('Cette catégorie existe déjà.', 'CATEGORY_EXISTS');
    const category = await prisma.category.create({ data: { name } });
    await audit(prisma, req.user!.id, 'CATEGORY_CREATED', category.id, name);
    res.status(201).json({ category });
  }),
);

categoriesRouter.put(
  '/:id',
  requireAuth,
  requireRole('ADMIN'),
  wrap(async (req, res) => {
    const body = z.object({ name: nameSchema.shape.name.optional(), active: z.boolean().optional() }).parse(req.body);
    const id = String(req.params.id);
    const current = await prisma.category.findUnique({ where: { id } });
    if (!current) throw notFound('Catégorie introuvable.');
    if (body.name && body.name !== current.name) {
      const dup = await prisma.category.findUnique({ where: { name: body.name } });
      if (dup) throw conflict('Cette catégorie existe déjà.', 'CATEGORY_EXISTS');
    }
    const category = await prisma.category.update({ where: { id }, data: body });
    await audit(prisma, req.user!.id, 'CATEGORY_UPDATED', id, JSON.stringify(body));
    res.json({ category });
  }),
);

categoriesRouter.delete(
  '/:id',
  requireAuth,
  requireRole('ADMIN'),
  wrap(async (req, res) => {
    const id = String(req.params.id);
    const used = await prisma.offer.count({ where: { categoryId: id } });
    if (used > 0) throw conflict('Cette catégorie est utilisée par des offres : désactivez-la plutôt que la supprimer.', 'CATEGORY_IN_USE');
    await prisma.userSkill.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
    await prisma.category.delete({ where: { id } });
    await audit(prisma, req.user!.id, 'CATEGORY_DELETED', id);
    res.json({ ok: true });
  }),
);
