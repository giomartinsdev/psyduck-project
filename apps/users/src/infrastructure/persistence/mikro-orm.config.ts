import { defineConfig } from '@mikro-orm/postgresql';
import { UserOrmEntity } from './user.orm-entity';
import { IdempotencyOrmEntity } from './idempotency.orm-entity';

export default defineConfig({
  host: process.env['DB_HOST'] ?? 'localhost',
  port: Number(process.env['DB_PORT'] ?? 5432),
  dbName: process.env['DB_NAME'] ?? 'users_db',
  user: process.env['DB_USER'] ?? 'users_user',
  password: process.env['DB_PASSWORD'] ?? 'users_pwd',
  entities: [UserOrmEntity, IdempotencyOrmEntity],
  migrations: {
    path: './src/infrastructure/persistence/migrations',
    glob: '!(*.d).{js,ts}',
  },
  schemaGenerator: {
    disableForeignKeys: false,
  },
  debug: process.env['NODE_ENV'] !== 'production',
});
