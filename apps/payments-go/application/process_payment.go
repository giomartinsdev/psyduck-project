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

// ─── Command ──────────────────────────────────────────────────────────────────

type ProcessPaymentCommand struct {
	UserID         string
	OrderID        string
	IdempotencyKey string
}

// ─── Handler ──────────────────────────────────────────────────────────────────

type ProcessPaymentHandler struct {
	Orders   domain.OrderRepository
	Payments domain.PaymentRepository
	Bus      domain.EventBus
}

func (h *ProcessPaymentHandler) Handle(ctx context.Context, cmd ProcessPaymentCommand) (*domain.Payment, error) {
	// Idempotency: return existing payment if key already used
	if existing, err := h.Payments.FindByIdempotencyKey(ctx, cmd.IdempotencyKey); err == nil && existing != nil {
		return existing, nil
	}

	// Load the Order aggregate
	order, err := h.Orders.FindByID(ctx, cmd.OrderID)
	if err != nil || order == nil {
		return nil, ErrOrderNotFound
	}

	// Ownership guard — only the order's owner can pay
	if order.UserID() != cmd.UserID {
		return nil, ErrForbidden
	}

	// Create the Payment entity
	payment := domain.NewPayment(uuid.New().String(), cmd.OrderID, order.Total(), cmd.IdempotencyKey)

	// Transition the aggregate — validates status invariant
	if err := order.Pay(payment.ID()); err != nil {
		return nil, err
	}

	// Persist payment + order status update in a single atomic transaction
	if err := h.Payments.SaveWithOrderUpdate(ctx, payment, cmd.OrderID, order.Status()); err != nil {
		return nil, err
	}

	// Dispatch domain events
	for _, evt := range order.PopEvents() {
		h.Bus.Publish(evt)
	}

	return payment, nil
}
