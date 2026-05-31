package domain

import (
	"log"
	"time"
)

// ─── Domain event interface ───────────────────────────────────────────────────

type DomainEvent interface {
	EventName() string
}

// ─── Concrete events ──────────────────────────────────────────────────────────

type OrderCreatedEvent struct {
	OrderID    string
	UserID     string
	Total      string
	OccurredAt time.Time
}

func (e OrderCreatedEvent) EventName() string { return "order.created" }

type OrderPaidEvent struct {
	OrderID    string
	PaymentID  string
	Amount     string
	OccurredAt time.Time
}

func (e OrderPaidEvent) EventName() string { return "order.paid" }

// ─── Event bus ────────────────────────────────────────────────────────────────

type EventBus interface {
	Publish(event DomainEvent)
}

// LoggingEventBus is the in-process synchronous bus used in development.
// Swap for a Kafka/NATS publisher without changing application or domain code.
type LoggingEventBus struct{}

func (b *LoggingEventBus) Publish(event DomainEvent) {
	log.Printf("[domain event] %s %+v", event.EventName(), event)
}
