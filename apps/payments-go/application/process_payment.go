package application

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/psyduck-project/payments-go/domain"
)

var (
	ErrOrderNotFound = errors.New("order not found")
	ErrForbidden     = errors.New("forbidden")
)

// ─── Command bus port ─────────────────────────────────────────────────────────

// PaymentCommandBus publishes the async command for payment capture.
// The infrastructure layer (ValkeyCommandBus) provides the adapter.
type PaymentCommandBus interface {
	PublishProcessPaymentCommand(paymentID, orderID, amount, idempotencyKey string)
}

// ─── Command ──────────────────────────────────────────────────────────────────

type ProcessPaymentCommand struct {
	UserID         string
	OrderID        string
	IdempotencyKey string
}

// ─── Handler ──────────────────────────────────────────────────────────────────

type ProcessPaymentHandler struct {
	Orders     domain.OrderRepository
	Payments   domain.PaymentRepository
	Bus        domain.EventBus        // domain event bus (OrderPaid etc.)
	CommandBus PaymentCommandBus      // async command transport (Valkey stream)
}

// Handle:
//  1. Idempotency — return existing payment if key already used
//  2. Load Order aggregate, enforce ownership + PENDING status invariant
//  3. Create Payment with INITIATED status in DB (makes command idempotent)
//  4. Publish ProcessPaymentCommand to the Valkey stream
//  5. Return INITIATED payment — client polls order(id) until CAPTURED
func (h *ProcessPaymentHandler) Handle(ctx context.Context, cmd ProcessPaymentCommand) (*domain.Payment, error) {
	// 1. Idempotency
	if existing, err := h.Payments.FindByIdempotencyKey(ctx, cmd.IdempotencyKey); err == nil && existing != nil {
		return existing, nil
	}

	// 2. Load + validate
	order, err := h.Orders.FindByID(ctx, cmd.OrderID)
	if err != nil || order == nil {
		return nil, ErrOrderNotFound
	}
	if order.UserID() != cmd.UserID {
		return nil, ErrForbidden
	}
	if order.Status() != domain.OrderStatusPending {
		return nil, domain.ErrOrderAlreadyProcessed
	}

	// 3. Persist INITIATED payment — the unique idempotency_key prevents duplicates
	//    if the client retries before the consumer runs.
	payment := domain.NewInitiatedPayment(uuid.New().String(), cmd.OrderID, order.Total(), cmd.IdempotencyKey)
	if err := h.Payments.Create(ctx, payment); err != nil {
		return nil, err
	}

	// 4. Enqueue the capture command — consumer will do the atomic DB update
	h.CommandBus.PublishProcessPaymentCommand(payment.ID(), cmd.OrderID, order.Total(), cmd.IdempotencyKey)

	// 5. Return INITIATED — client should poll order(id).payment.status
	return payment, nil
}
