import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { config } from '../lib/config.js';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route introuvable.' } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION',
        message: err.issues[0]?.message ?? 'Données invalides.',
        details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Violation d'une contrainte d'unicité : course perdue (double clic, requêtes simultanées)
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: { code: 'DUPLICATE', message: 'Cette opération a déjà été effectuée ou est en conflit avec une autre.' },
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ressource introuvable.' } });
    }
    // Contrainte CHECK (ex. solde négatif)
    if (err.code === 'P2004' || /check constraint/i.test(err.message)) {
      return res.status(409).json({ error: { code: 'INTEGRITY', message: "Opération refusée : elle violerait une règle d'intégrité." } });
    }
  }
  if (!config.isProd || process.env.NODE_ENV !== 'test') console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Erreur interne du serveur.' } });
}
