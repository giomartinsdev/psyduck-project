package domain

import "context"

// OrderRepository is the port for Order persistence.
// The infrastructure layer provides the adapter.
type OrderRepository interface {
	Save(ctx context.Context, order *Order) error
	FindByID(ctx context.Context, id string) (*Order, error)
	FindByIdempotencyKey(ctx context.Context, key string) (*Order, error)
	ListByUser(ctx context.Context, userID string, limit, offset int) ([]*Order, int, error)
}

// PaymentRepository is the port for Payment persistence.
// SaveWithOrderUpdate writes the payment and updates the order status atomically.
type PaymentRepository interface {
	SaveWithOrderUpdate(ctx context.Context, payment *Payment, orderID string, newStatus OrderStatus) error
	FindByOrderID(ctx context.Context, orderID string) (*Payment, error)
	FindByIdempotencyKey(ctx context.Context, key string) (*Payment, error)
}
