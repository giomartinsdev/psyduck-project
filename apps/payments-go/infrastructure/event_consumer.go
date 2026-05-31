package infrastructure

import (
	"context"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	consumerGroup = "payments-cg"
	consumerName  = "payments-worker-1"
)

// EventConsumer reads from the payments stream via a consumer group,
// giving at-least-once delivery: unACKed messages are re-delivered after
// a crash and can be reclaimed with XAUTOCLAIM.
type EventConsumer struct {
	client *redis.Client
}

func NewEventConsumer(client *redis.Client) *EventConsumer {
	return &EventConsumer{client: client}
}

// Start creates the consumer group (idempotent) and launches the read loop.
func (c *EventConsumer) Start(ctx context.Context) {
	// MKSTREAM creates the stream atomically if it does not yet exist.
	// BUSYGROUP error is expected when group already exists — safe to ignore.
	err := c.client.XGroupCreateMkStream(ctx, PaymentsStream, consumerGroup, "0").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		log.Printf("[event consumer] group create warning: %v", err)
	}
	go c.loop(ctx)
}

func (c *EventConsumer) loop(ctx context.Context) {
	log.Printf("[event consumer] started — stream=%s group=%s consumer=%s",
		PaymentsStream, consumerGroup, consumerName)

	for {
		select {
		case <-ctx.Done():
			log.Printf("[event consumer] shutting down")
			return
		default:
		}

		streams, err := c.client.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    consumerGroup,
			Consumer: consumerName,
			Streams:  []string{PaymentsStream, ">"},
			Count:    10,
			Block:    2 * time.Second,
		}).Result()

		if err != nil {
			if err == redis.Nil || ctx.Err() != nil {
				continue // no new messages or context cancelled
			}
			log.Printf("[event consumer] read error: %v — retrying in 1s", err)
			time.Sleep(time.Second)
			continue
		}

		for _, stream := range streams {
			for _, msg := range stream.Messages {
				c.process(ctx, msg)
			}
		}
	}
}

func (c *EventConsumer) process(ctx context.Context, msg redis.XMessage) {
	eventType, _ := msg.Values["event_type"].(string)
	payload, _ := msg.Values["payload"].(string)

	log.Printf("[event consumer] processing id=%s type=%s", msg.ID, eventType)

	// Domain reactions — extend here to call external services, send notifications, etc.
	switch eventType {
	case "order.created":
		log.Printf("[event consumer] ✓ order.created — order ready for fulfillment pipeline | %s", payload)
	case "order.paid":
		log.Printf("[event consumer] ✓ order.paid — trigger shipping + notification | %s", payload)
	default:
		log.Printf("[event consumer] unknown event type: %s", eventType)
	}

	// ACK removes the message from the PEL (pending-entries list).
	// If we crash before ACK, the message stays pending and will be
	// re-delivered to another consumer via XAUTOCLAIM.
	if err := c.client.XAck(ctx, PaymentsStream, consumerGroup, msg.ID).Err(); err != nil {
		log.Printf("[event consumer] WARN: failed to ACK %s: %v", msg.ID, err)
	}
}
