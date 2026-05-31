import { Migration } from '@mikro-orm/migrations';

export class Migration20260531000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id"              uuid          NOT NULL,
        "email"           varchar(255)  NOT NULL,
        "name"            varchar(255)  NOT NULL,
        "hashed_password" varchar(255)  NOT NULL,
        "avatar_url"      varchar(255)  NULL,
        "created_at"      timestamptz   NOT NULL,
        CONSTRAINT "users_pkey" PRIMARY KEY ("id")
      );
    `);
    this.addSql(`ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE ("email");`);

    this.addSql(`
      CREATE TABLE IF NOT EXISTS "idempotency_keys" (
        "key"        varchar(255)  NOT NULL,
        "payload"    jsonb         NULL,
        "created_at" timestamptz   NOT NULL,
        CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "idempotency_keys";`);
    this.addSql(`DROP TABLE IF EXISTS "users";`);
  }
}
