import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email('Adresse électronique invalide.').max(200);

export const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères.')
  .max(100)
  .regex(/[A-Za-z]/, 'Le mot de passe doit contenir au moins une lettre.')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre.');

const nonEmpty = (label: string, max = 100) =>
  z.string({ error: `${label} requis.` }).trim().min(1, `${label} requis.`).max(max, `${label} trop long.`);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nonEmpty('Prénom'),
  lastName: nonEmpty('Nom'),
  field: nonEmpty('Filière'),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Mot de passe requis.'),
});

const skillList = z.array(z.string().trim().min(1).max(80)).max(30);

export const profileSchema = z.object({
  firstName: nonEmpty('Prénom').optional(),
  lastName: nonEmpty('Nom').optional(),
  field: nonEmpty('Filière').optional(),
  bio: z.string().trim().max(1000).optional(),
  offeredSkills: skillList.optional(),
  wantedSkills: skillList.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis.'),
  newPassword: passwordSchema,
});

export const offerSchema = z.object({
  title: nonEmpty('Titre', 150),
  categoryId: z.string().min(1, 'Catégorie requise.'),
  skill: nonEmpty('Compétence', 100),
  description: nonEmpty('Description', 3000),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED'], { error: 'Niveau invalide.' }),
  durationHours: z.union([z.literal(1), z.literal(2)], { error: 'La durée doit être de 1 ou 2 heures.' }),
  mode: z.enum(['ONSITE', 'REMOTE'], { error: 'Mode de déroulement invalide.' }),
});

export const slotSchema = z
  .object({
    startsAt: z.coerce.date({ error: 'Date de début invalide.' }),
    endsAt: z.coerce.date({ error: 'Date de fin invalide.' }),
    location: z.string().trim().max(300).optional().nullable(),
    meetingUrl: z.string().trim().url('Lien de réunion invalide.').max(500).optional().nullable().or(z.literal('')),
  })
  .refine((s) => s.endsAt > s.startsAt, { message: "L'heure de fin doit suivre l'heure de début.", path: ['endsAt'] });

export const reasonSchema = z.object({ reason: nonEmpty('Motif', 500) });

export const disputeSchema = z.object({
  reason: z.enum(['ABSENCE', 'DISAGREEMENT', 'MISSING_CONFIRMATION', 'OTHER']),
  description: nonEmpty('Description', 2000),
});

export const reviewSchema = z.object({
  rating: z.number({ error: 'Note requise.' }).int('La note doit être entière.').min(1, 'Note minimale : 1.').max(5, 'Note maximale : 5.'),
  comment: z.string().trim().max(1000).optional().default(''),
});

export const decisionSchema = z.object({
  decision: z.enum(['TRANSFER', 'REFUND'], { error: 'Décision invalide.' }),
  note: nonEmpty('Motivation', 2000),
});
