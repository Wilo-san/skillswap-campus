import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const CATEGORIES = ['Programmation', 'Langues', 'Mathématiques', 'Communication', 'Design', 'Réseaux et systèmes', 'Bureautique', 'Méthodologie'];

const day = (offsetDays: number, hour: number, hours = 1) => {
  const s = new Date();
  s.setDate(s.getDate() + offsetDays);
  s.setHours(hour, 0, 0, 0);
  return { startsAt: s, endsAt: new Date(s.getTime() + hours * 3_600_000) };
};

async function main() {
  const pwd = await bcrypt.hash(process.env.SEED_PASSWORD ?? 'Demo1234', 10);

  for (const name of CATEGORIES) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }
  const cat = async (n: string) => (await prisma.category.findUniqueOrThrow({ where: { name: n } })).id;

  // Administrateur
  await prisma.user.upsert({
    where: { email: 'admin@skillswap.ma' },
    update: {},
    create: { email: 'admin@skillswap.ma', passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD ?? 'Admin1234', 10), firstName: 'Admin', lastName: 'Campus', field: 'Administration', role: 'ADMIN', availableCredits: 0 },
  });

  const students = [
    { email: 'sara@skillswap.ma', firstName: 'Sara', lastName: 'El Idrissi', field: 'DUT Génie Informatique', credits: 2, offered: ['Python', 'JavaScript'], wanted: ['Anglais'] },
    { email: 'amine@skillswap.ma', firstName: 'Amine', lastName: 'Benali', field: 'DUT Génie Informatique', credits: 2, offered: ['Mathématiques'], wanted: ['Python'] },
    { email: 'yasmine@skillswap.ma', firstName: 'Yasmine', lastName: 'Tazi', field: 'DUT Techniques de Management', credits: 2, offered: ['Anglais', 'Prise de parole'], wanted: ['Excel'] },
    { email: 'omar@skillswap.ma', firstName: 'Omar', lastName: 'Chraibi', field: 'DUT Réseaux et Télécoms', credits: 2, offered: ['Linux', 'Réseaux'], wanted: ['Design'] },
  ];
  const ids: Record<string, string> = {};
  for (const s of students) {
    // Seed idempotent : un compte déjà présent est conservé tel quel.
    const existing = await prisma.user.findUnique({ where: { email: s.email } });
    if (existing) {
      ids[s.firstName] = existing.id;
      continue;
    }
    const u = await prisma.user.create({
      data: { email: s.email, passwordHash: pwd, firstName: s.firstName, lastName: s.lastName, field: s.field, availableCredits: s.credits },
    });
    ids[s.firstName] = u.id;
    await prisma.ledgerEntry.create({ data: { userId: u.id, type: 'WELCOME_BONUS', amount: 2, availableAfter: 2, blockedAfter: 0, note: 'Crédits de bienvenue' } });
    await prisma.userSkill.createMany({
      data: [
        ...s.offered.map((name) => ({ userId: u.id, kind: 'OFFERED' as const, name })),
        ...s.wanted.map((name) => ({ userId: u.id, kind: 'WANTED' as const, name })),
      ],
    });
  }

  const offers = [
    { who: 'Sara', title: 'Initiation à Python', category: 'Programmation', skill: 'Python', level: 'BEGINNER', hours: 1, mode: 'REMOTE', desc: 'Variables, boucles, fonctions : on écrit vos premiers scripts ensemble.', slots: [day(2, 14), day(3, 16), day(5, 10)] },
    { who: 'Sara', title: 'Débuter avec JavaScript et le DOM', category: 'Programmation', skill: 'JavaScript', level: 'INTERMEDIATE', hours: 2, mode: 'ONSITE', desc: 'Manipuler le DOM, gérer les événements et appeler une API.', slots: [day(4, 9, 2)] },
    { who: 'Yasmine', title: 'Conversation en anglais', category: 'Langues', skill: 'Anglais', level: 'INTERMEDIATE', hours: 1, mode: 'REMOTE', desc: "Pratique orale guidée pour gagner en aisance, avec correction bienveillante.", slots: [day(1, 17), day(3, 11), day(6, 15)] },
    { who: 'Yasmine', title: 'Réussir sa présentation orale', category: 'Communication', skill: 'Prise de parole', level: 'BEGINNER', hours: 1, mode: 'ONSITE', desc: 'Structurer son discours, gérer le stress et capter son auditoire.', slots: [day(2, 11)] },
    { who: 'Amine', title: 'Mathématiques : suites et dérivées', category: 'Mathématiques', skill: 'Mathématiques', level: 'INTERMEDIATE', hours: 2, mode: 'ONSITE', desc: 'Révision méthodique avec exercices corrigés.', slots: [day(3, 14, 2)] },
    { who: 'Omar', title: 'Administration Linux de base', category: 'Réseaux et systèmes', skill: 'Linux', level: 'BEGINNER', hours: 1, mode: 'REMOTE', desc: 'Terminal, droits, processus et services : les indispensables.', slots: [day(2, 18), day(7, 18)] },
  ] as const;

  for (const o of offers) {
    const already = await prisma.offer.findFirst({ where: { teacherId: ids[o.who], title: o.title } });
    if (already) continue;
    const offer = await prisma.offer.create({
      data: {
        teacherId: ids[o.who], title: o.title, categoryId: await cat(o.category), skill: o.skill, description: o.desc,
        level: o.level, durationHours: o.hours, mode: o.mode, status: 'PUBLISHED',
      },
    });
    for (const s of o.slots) {
      await prisma.slot.create({
        data: { offerId: offer.id, ...s, location: o.mode === 'ONSITE' ? 'EST Béni Mellal, salle B12' : null, meetingUrl: o.mode === 'REMOTE' ? 'https://meet.example.org/skillswap-demo' : null },
      });
    }
  }
  console.log('Données de démonstration prêtes.');
  console.log('  Admin    : admin@skillswap.ma / Admin1234');
  console.log('  Étudiant : sara@skillswap.ma / Demo1234 (idem amine, yasmine, omar)');
}

main().finally(() => prisma.$disconnect());
