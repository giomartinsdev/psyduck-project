package domain

import (
	"errors"
	"fmt"
	"strconv"
	"time"
)

// ─── Value objects ────────────────────────────────────────────────────────────

type OrderStatus string

const (
	OrderStatusPending    OrderStatus = "PENDING"
	OrderStatusProcessing OrderStatus = "PROCESSING"
	OrderStatusPaid       OrderStatus = "PAID"
	OrderStatusFulfilled  OrderStatus = "FULFILLED"
	OrderStatusCancelled  OrderStatus = "CANCELLED"
	OrderStatusRefunded   OrderStatus = "REFUNDED"
)

type ShippingAddress struct {
	Street     string
	City       string
	State      string
	PostalCode string
	Country    string
}

type OrderItem struct {
	ID              string
	ProductID       string
	ProductTitle    string
	ProductImageURL string
	Quantity        int
	UnitPrice       string // Decimal string, e.g. "1299.90"
	Subtotal        string // Decimal string
}

// ─── Sentinel errors ──────────────────────────────────────────────────────────

var (
	ErrOrderMustHaveItems    = errors.New("order must contain at least one item")
	ErrOrderAlreadyProcessed = errors.New("order is not in PENDING state")
)

// ─── Order aggregate root ─────────────────────────────────────────────────────

type Order struct {
	id             string
	userID         string
	status         OrderStatus
	items          []OrderItem
	shippingAddr   ShippingAddress
	subtotal       string
	total          string
	idempotencyKey string
	createdAt      time.Time
	updatedAt      time.Time

	events []DomainEvent // uncommitted domain events
}

// NewOrder creates and validates a new Order aggregate, recording an OrderCreatedEvent.
func NewOrder(id, userID string, items []OrderItem, addr ShippingAddress, idem string) (*Order, error) {
	if len(items) == 0 {
		return nil, ErrOrderMustHaveItems
	}

	total := sumItems(items)

	o := &Order{
		id:             id,
		userID:         userID,
		status:         OrderStatusPending,
		items:          items,
		shippingAddr:   addr,
		subtotal:       total,
		total:          total,
		idempotencyKey: idem,
		createdAt:      time.Now().UTC(),
		updatedAt:      time.Now().UTC(),
	}
	o.events = append(o.events, OrderCreatedEvent{
		OrderID:    id,
		UserID:     userID,
		Total:      total,
		OccurredAt: o.createdAt,
	})
	return o, nil
}

// ReconstructOrder rebuilds an Order from persisted state without emitting events.
// Only the infrastructure layer should call this.
func ReconstructOrder(id, userID string, status OrderStatus, items []OrderItem,
	addr ShippingAddress, subtotal, total, idem string,
	createdAt, updatedAt time.Time) *Order {
	return &Order{
		id:             id,
		userID:         userID,
		status:         status,
		items:          items,
		shippingAddr:   addr,
		subtotal:       subtotal,
		total:          total,
		idempotencyKey: idem,
		createdAt:      createdAt,
		updatedAt:      updatedAt,
	}
}

// Pay transitions the order to PAID and records an OrderPaidEvent.
func (o *Order) Pay(paymentID string) error {
	if o.status != OrderStatusPending {
		return ErrOrderAlreadyProcessed
	}
	o.status = OrderStatusPaid
	o.updatedAt = time.Now().UTC()
	o.events = append(o.events, OrderPaidEvent{
		OrderID:    o.id,
		PaymentID:  paymentID,
		Amount:     o.total,
		OccurredAt: o.updatedAt,
	})
	return nil
}

// PopEvents drains and returns uncommitted domain events.
func (o *Order) PopEvents() []DomainEvent {
	evts := o.events
	o.events = nil
	return evts
}

// ─── Getters (no public setters — all mutation via domain methods) ─────────────

func (o *Order) ID() string              { return o.id }
func (o *Order) UserID() string          { return o.userID }
func (o *Order) Status() OrderStatus     { return o.status }
func (o *Order) Items() []OrderItem      { return o.items }
func (o *Order) ShippingAddr() ShippingAddress { return o.shippingAddr }
func (o *Order) Subtotal() string        { return o.subtotal }
func (o *Order) Total() string           { return o.total }
func (o *Order) IdempotencyKey() string  { return o.idempotencyKey }
func (o *Order) CreatedAt() time.Time    { return o.createdAt }
func (o *Order) UpdatedAt() time.Time    { return o.updatedAt }

// ─── Helpers ──────────────────────────────────────────────────────────────────

func sumItems(items []OrderItem) string {
	var total float64
	for _, it := range items {
		v, _ := strconv.ParseFloat(it.Subtotal, 64)
		total += v
	}
	return fmt.Sprintf("%.2f", total)
}
