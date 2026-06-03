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

type PaymentCommandBus interface {
	PublishProcessPaymentCommand(paymentID, orderID, amount, idempotencyKey string)
}

type ProcessPaymentCommand struct {
	UserID         string
	OrderID        string
	IdempotencyKey string
}

type ProcessPaymentHandler struct {
	Orders     domain.OrderRepository
	Payments   domain.PaymentRepository
	Bus        domain.EventBus
	CommandBus PaymentCommandBus
}

func (h *ProcessPaymentHandler) Handle(ctx context.Context, cmd ProcessPaymentCommand) (*domain.Payment, error) {
	if existing, err := h.Payments.FindByIdempotencyKey(ctx, cmd.IdempotencyKey); err == nil && existing != nil {
		return existing, nil
	}

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

	payment := domain.NewInitiatedPayment(uuid.New().String(), cmd.OrderID, order.Total(), cmd.IdempotencyKey)
	if err := h.Payments.Create(ctx, payment); err != nil {
		return nil, err
	}

	h.CommandBus.PublishProcessPaymentCommand(payment.ID(), cmd.OrderID, order.Total(), cmd.IdempotencyKey)

	return payment, nil
}
