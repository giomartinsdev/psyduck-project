import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MikroORM } from '@mikro-orm/core';
import { getMigrations } from 'better-auth/db/migration';
import { sql } from 'kysely';
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

  // 3. Ensure the ai-companion OAuth2 application exists in the DB.
  //    BetterAuth trustedClients config handles the authorize step, but the
  //    token exchange endpoint requires the client row in oauth_application.
  const aiClientId = process.env['AI_OAUTH_CLIENT_ID'] ?? 'ai-companion';
  const aiClientSecret = process.env['AI_OAUTH_CLIENT_SECRET'] ?? 'companion-dev-secret';
  const aiRedirectUrl = process.env['AI_OAUTH_REDIRECT_URL'] ?? 'http://localhost:4004/auth/callback';
  try {
    await sql`
      INSERT INTO oauth_application
        (id, name, client_id, client_secret, redirect_urls, type, disabled, created_at, updated_at)
      VALUES
        ('ai-companion-app', 'Companion AI',
         ${aiClientId}, ${aiClientSecret},
         ${JSON.stringify([aiRedirectUrl])},
         'web', false, NOW(), NOW())
      ON CONFLICT (client_id) DO NOTHING
    `.execute(kysely);
    console.log('[BetterAuth] OAuth2 ai-companion client ensured.');
  } catch (err) {
    console.warn('[BetterAuth] ai-companion registration skipped:', (err as Error).message);
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
