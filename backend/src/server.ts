import { createApp } from './app.js';
import { config } from './lib/config.js';
import { prisma } from './lib/prisma.js';

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`SkillSwap API prête sur http://localhost:${config.port}`);
});

const stop = async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
