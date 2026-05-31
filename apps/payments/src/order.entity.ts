import { Entity, PrimaryKey, Property } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';

export type OrderItemJson = {
  id: string;
  productId: string;
  productTitle: string;
  productImageUrl: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
};

export type ShippingAddressJson = {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

@Entity({ tableName: 'orders' })
export class OrderEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @Property()
  userId: string = 'unknown';

  @Property()
  status: string = 'PENDING';

  @Property({ columnType: 'jsonb' })
  items: OrderItemJson[] = [];

  @Property({ columnType: 'jsonb', fieldName: 'shipping_address' })
  shippingAddress: ShippingAddressJson = { street: '', city: '', state: '', postalCode: '', country: '' };

  @Property({ columnType: 'numeric(10,2)' })
  subtotal: string = '0.00';

  @Property({ columnType: 'numeric(10,2)' })
  total: string = '0.00';

  @Property({ unique: true })
  idempotencyKey: string = '';

  @Property()
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
