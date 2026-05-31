import { Collection, Entity, OneToMany, PrimaryKey, Property } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { MessageEntity } from './message.entity';

@Entity({ tableName: 'conversations' })
export class ConversationEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @Property()
  userId: string = 'unknown';

  @OneToMany(() => MessageEntity, (m) => m.conversation, { orderBy: { createdAt: 'ASC' } })
  messages = new Collection<MessageEntity>(this);

  @Property()
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
