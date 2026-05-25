import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MikroORM } from '@mikro-orm/core';
import { getMigrations } from 'better-auth/db/migration';
import { BETTER_AUTH_TOKEN, type AuthInstance } from './infrastructure/auth/better-auth.factory';
import type { AuthKysely } from './infrastructure/auth/auth-database.factory';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'error', 'warn'] });

  // 1. MikroORM domain migrations (users, idempotency_keys tables)
  if (process.env['RUN_MIGRATIONS'] === 'true' || process.env['NODE_ENV'] !== 'production') {
    const orm = app.get<MikroORM>(MikroORM);
    await orm.getMigrator().up();
  }

  // 2. BetterAuth schema migration.
  //    getMigrations() internally calls createKyselyAdapter(config), which
  //    expects config.database to be { db: Kysely, type: string } — not the
  //    factory function that kyselyAdapter() returns. We pass the already-built
  //    Kysely instance from DI directly in that shape.
  const auth = app.get<AuthInstance>(BETTER_AUTH_TOKEN);
  const kysely = app.get<AuthKysely>('AUTH_DATABASE_KYSELY');
  const { runMigrations } = await getMigrations({
    ...auth.options,
    database: { db: kysely, type: 'postgres' } as Parameters<typeof getMigrations>[0]['database'],
  });
  try {
    await runMigrations();
  } catch (err: unknown) {
    // PostgreSQL error 42701 = duplicate_column: tables already exist from a
    // previous boot. BetterAuth's migration isn't fully idempotent for ALTER
    // TABLE ADD COLUMN — safe to skip since schema is already up-to-date.
    const code = (err as Record<string, unknown>)['code'];
    if (code !== '42701') throw err;
    console.log('[BetterAuth] Schema already up-to-date, skipping duplicate columns.');
  }

  const port = Number(process.env['PORT'] ?? 4001);
  await app.listen(port);
  console.log(`🚀 Users subgraph running at http://localhost:${port}/graphql`);
  console.log(`   BetterAuth HTTP routes at http://localhost:${port}/api/auth`);
  console.log(`   OAuth2 discovery: http://localhost:${port}/api/auth/.well-known/openid-configuration`);
}

bootstrap().catch((err) => {
  console.error('Fatal error in Users subgraph:', err);
  process.exit(1);
});
