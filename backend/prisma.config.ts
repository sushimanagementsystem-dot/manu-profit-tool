import { defineConfig } from 'prisma/config';

// Prisma doesn't load .env by itself; Node 22's built-in loader does, when the file exists.
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment (CI, production).
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
