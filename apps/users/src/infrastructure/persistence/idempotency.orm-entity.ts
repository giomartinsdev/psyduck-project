import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'idempotency_keys' })
export class IdempotencyOrmEntity {
  @PrimaryKey()
  key!: string;

  @Property({ type: 'json', nullable: true })
  payload: unknown = null;

  @Property({ fieldName: 'created_at' })
  createdAt!: Date;
}
