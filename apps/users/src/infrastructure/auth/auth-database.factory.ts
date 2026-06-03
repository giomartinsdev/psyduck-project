import type { FactoryProvider } from '@nestjs/common';
import { AbstractSqlConnection } from '@mikro-orm/knex';
import { EntityManager } from '@mikro-orm/postgresql';
import { kyselyAdapter } from '@better-auth/kysely-adapter';
import { Kysely, PostgresDialect, CamelCasePlugin } from 'kysely';
import { Pool } from 'pg';

export const BETTER_AUTH_DATABASE_ADAPTER_TOKEN = 'BETTER_AUTH_DATABASE_ADAPTER';

export const AuthDatabaseKyselyFactory = {
  provide: 'AUTH_DATABASE_KYSELY',
  async useFactory(em: EntityManager) {
    const sqlConn = em.getConnection() as unknown as AbstractSqlConnection;
    const knex = sqlConn.getKnex();
    const pgConn = (knex.client as { config: { connection: Record<string, unknown> } }).config
      .connection as {
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      password?: string;
    };

    const pool = new Pool({
      host: pgConn.host ?? process.env['DB_HOST'] ?? 'localhost',
      port: pgConn.port ?? Number(process.env['DB_PORT'] ?? 5432),
      database: pgConn.database ?? process.env['DB_NAME'] ?? 'users_db',
      user: pgConn.user ?? process.env['DB_USER'] ?? 'users_user',
      password: pgConn.password ?? process.env['DB_PASSWORD'] ?? 'users_pwd',
    });

    return new Kysely<Record<string, unknown>>({
      dialect: new PostgresDialect({ pool }),
      log: process.env['DB_LOGS'] === 'enabled' ? ['error', 'query'] : ['error'],
      plugins: [new CamelCasePlugin()],
    });
  },
  inject: [EntityManager],
} satisfies FactoryProvider;

export type AuthKysely = Kysely<Record<string, unknown>>;

export const BetterAuthDatabaseAdapterFactory = {
  provide: BETTER_AUTH_DATABASE_ADAPTER_TOKEN,
  useFactory: async (pluggedKysely: AuthKysely) => {
    return kyselyAdapter(pluggedKysely as Parameters<typeof kyselyAdapter>[0], {
      type: 'postgres',
    });
  },
  inject: ['AUTH_DATABASE_KYSELY'],
} satisfies FactoryProvider;
