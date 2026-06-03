package infrastructure

import (
	"context"
	"encoding/json"
	"log"

	"github.com/redis/go-redis/v9"

	"github.com/psyduck-project/payments-go/domain"
)

const (
	PaymentsStream = "payments:events"
	CommandsStream = "payments:commands"
)

type ValkeyEventBus struct {
	client *redis.Client
}

func NewValkeyEventBus(client *redis.Client) *ValkeyEventBus {
	return &ValkeyEventBus{client: client}
}

func (b *ValkeyEventBus) Publish(event domain.DomainEvent) {
	payload, _ := json.Marshal(event)
	id, err := b.client.XAdd(context.Background(), &redis.XAddArgs{
		Stream: PaymentsStream,
		Values: map[string]interface{}{
			"event_type": event.EventName(),
			"payload":    string(payload),
		},
	}).Result()
	if err != nil {
		log.Printf("[event bus] WARN: failed to publish %s: %v", event.EventName(), err)
		return
	}
	log.Printf("[event bus] %s → %s id=%s", event.EventName(), PaymentsStream, id)
}

func (b *ValkeyEventBus) PublishProcessPaymentCommand(paymentID, orderID, amount, idempotencyKey string) {
	id, err := b.client.XAdd(context.Background(), &redis.XAddArgs{
		Stream: CommandsStream,
		Values: map[string]interface{}{
			"payment_id":      paymentID,
			"order_id":        orderID,
			"amount":          amount,
			"idempotency_key": idempotencyKey,
		},
	}).Result()
	if err != nil {
		log.Printf("[command bus] WARN: failed to publish ProcessPaymentCommand: %v", err)
		return
	}
	log.Printf("[command bus] ProcessPaymentCommand → %s id=%s paymentID=%s", CommandsStream, id, paymentID)
}
