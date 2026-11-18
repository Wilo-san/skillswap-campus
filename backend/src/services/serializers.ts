import type { Prisma } from '@prisma/client';

export const userInclude = { skills: true } satisfies Prisma.UserInclude;
type UserWithSkills = Prisma.UserGetPayload<{ include: typeof userInclude }>;

/** Représentation privée du profil de l'utilisateur connecté (jamais de hash de mot de passe). */
export function publicUser(u: UserWithSkills) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    field: u.field,
    bio: u.bio,
    role: u.role,
    active: u.active,
    availableCredits: u.availableCredits,
    blockedCredits: u.blockedCredits,
    offeredSkills: u.skills.filter((s) => s.kind === 'OFFERED').map((s) => s.name),
    wantedSkills: u.skills.filter((s) => s.kind === 'WANTED').map((s) => s.name),
    createdAt: u.createdAt,
  };
}

export const personSelect = { id: true, firstName: true, lastName: true, field: true } satisfies Prisma.UserSelect;
