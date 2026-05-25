import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/core';

@Entity({ tableName: 'users' })
export class UserOrmEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property()
  @Unique()
  email!: string;

  @Property()
  name!: string;

  @Property({ fieldName: 'hashed_password' })
  hashedPassword!: string;

  @Property({ fieldName: 'avatar_url', nullable: true })
  avatarUrl: string | null = null;

  @Property({ fieldName: 'created_at' })
  createdAt!: Date;
}
