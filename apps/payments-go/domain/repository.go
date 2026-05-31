package domain

import "context"

// OrderRepository is the port for Order persistence.
type OrderRepository interface {
	Save(ctx context.Context, order *Order) error
	FindByID(ctx context.Context, id string) (*Order, error)
	FindByIdempotencyKey(ctx context.Context, key string) (*Order, error)
	ListByUser(ctx context.Context, userID string, limit, offset int) ([]*Order, int, error)
}

// PaymentRepository is the port for Payment persistence.
type PaymentRepository interface {
	// Create persists a new payment (e.g. INITIATED status).
	Create(ctx context.Context, payment *Payment) error

	// CaptureWithOrderUpdate atomically transitions a payment to CAPTURED
	// and the associated order to PAID inside a single database transaction.
	CaptureWithOrderUpdate(ctx context.Context, paymentID, orderID string) error

	FindByOrderID(ctx context.Context, orderID string) (*Payment, error)
	FindByIdempotencyKey(ctx context.Context, key string) (*Payment, error)
}
