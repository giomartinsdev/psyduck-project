import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { OrderEntity } from './order.entity';

@Entity({ tableName: 'payments' })
export class PaymentEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @ManyToOne(() => OrderEntity, { fieldName: 'order_id' })
  order!: OrderEntity;

  @Property()
  status: string = 'INITIATED';

  @Property({ columnType: 'numeric(10,2)' })
  amount: string = '0.00';

  @Property()
  currency: string = 'BRL';

  @Property({ unique: true })
  idempotencyKey: string = '';

  @Property({ nullable: true })
  processedAt: Date | null = null;
}
