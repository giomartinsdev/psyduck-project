import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { ConversationEntity } from './conversation.entity';

export type ToolInvocationJson = {
  toolName: string;
  arguments: string;
  result: string | null;
  status: string;
};

@Entity({ tableName: 'messages' })
export class MessageEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @ManyToOne(() => ConversationEntity, { fieldName: 'conversation_id' })
  conversation!: ConversationEntity;

  @Property()
  role: string = '';

  @Property({ columnType: 'text' })
  content: string = '';

  @Property({ columnType: 'jsonb', fieldName: 'tool_invocations' })
  toolInvocations: ToolInvocationJson[] = [];

  @Property()
  createdAt: Date = new Date();
}
