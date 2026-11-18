import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/middleware/auth.js';

export const app = createApp();
export const api = () => request(app);

let counter = 0;

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "AuditLog","Notification","DisputeComment","Dispute","Review","Confirmation","LedgerEntry","Booking","Slot","Offer","UserSkill","Category","User" RESTART IDENTITY CASCADE`,
  );
}

export async function makeUser(opts: { role?: 'STUDENT' | 'ADMIN'; credits?: number; active?: boolean; name?: string } = {}) {
  counter++;
  const u = await prisma.user.create({
    data: {
      email: `user${counter}-${Date.now()}@test.ma`,
      passwordHash: await bcrypt.hash('Passw0rd!', 4),
      firstName: opts.name ?? `Prenom${counter}`,
      lastName: `Nom${counter}`,
      field: 'GI',
      role: opts.role ?? 'STUDENT',
      active: opts.active ?? true,
      availableCredits: opts.credits ?? 2,
    },
  });
  return { ...u, token: signToken(u) };
}
export type TestUser = Awaited<ReturnType<typeof makeUser>>;

export const auth = (u: { token: string }) => ({ Authorization: `Bearer ${u.token}` });

export async function makeCategory(name = 'Programmation') {
  return prisma.category.upsert({ where: { name }, update: {}, create: { name } });
}

const HOUR = 3_600_000;

/** Crée une offre publiée avec un créneau. `startInHours` peut être négatif pour simuler le passé (insertion directe). */
export async function makeOffer(
  teacher: TestUser,
  opts: { hours?: 1 | 2; startInHours?: number; status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; slots?: number } = {},
) {
  const cat = await makeCategory();
  const hours = opts.hours ?? 1;
  const offer = await prisma.offer.create({
    data: {
      teacherId: teacher.id, title: 'Initiation Python', categoryId: cat.id, skill: 'Python', description: 'desc',
      level: 'BEGINNER', durationHours: hours, mode: 'REMOTE', status: opts.status ?? 'PUBLISHED',
    },
  });
  const slots = [];
  for (let i = 0; i < (opts.slots ?? 1); i++) {
    const startsAt = new Date(Date.now() + ((opts.startInHours ?? 48) + i * 24) * HOUR);
    slots.push(
      await prisma.slot.create({
        data: { offerId: offer.id, startsAt, endsAt: new Date(startsAt.getTime() + hours * HOUR), meetingUrl: 'https://meet.example.org/x', location: 'Salle B12' },
      }),
    );
  }
  return { offer, slots, slot: slots[0] };
}

/** Déplace une réservation dans le passé (séance terminée) pour tester les confirmations. */
export async function shiftBooking(bookingId: string, startHoursFromNow: number, hours = 1) {
  const startsAt = new Date(Date.now() + startHoursFromNow * HOUR);
  const endsAt = new Date(startsAt.getTime() + hours * HOUR);
  const b = await prisma.booking.update({ where: { id: bookingId }, data: { startsAt, endsAt } });
  await prisma.slot.update({ where: { id: b.slotId }, data: { startsAt, endsAt } });
}

export async function wallet(id: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id } });
  return { available: u.availableCredits, blocked: u.blockedCredits };
}

/** Parcours complet jusqu'à l'acceptation. */
export async function acceptedBooking(teacher: TestUser, learner: TestUser, opts: Parameters<typeof makeOffer>[1] = {}) {
  const o = await makeOffer(teacher, opts);
  const r = await api().post('/api/bookings').set(auth(learner)).send({ slotId: o.slot.id });
  const id = r.body.booking.id as string;
  const a = await api().post(`/api/bookings/${id}/accept`).set(auth(teacher));
  if (a.status !== 200) throw new Error('accept failed ' + JSON.stringify(a.body));
  return { ...o, bookingId: id };
}
