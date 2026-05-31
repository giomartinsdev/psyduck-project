package infrastructure

import (
	"context"
	"log"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/psyduck-project/payments-go/domain"
)

const (
	paymentsCommandGroup    = "payments-cmd-cg"
	paymentsCommandConsumer = "payments-cmd-worker-1"
)

// PaymentCommandConsumer reads ProcessPaymentCommand entries from the commands
// stream and performs the atomic capture: UPDATE payment → CAPTURED,
// UPDATE order → PAID, then publishes an OrderPaidEvent.
type PaymentCommandConsumer struct {
	client   *redis.Client
	payments *PostgresPaymentRepository
	orders   *PostgresOrderRepository
	bus      *ValkeyEventBus
}

func NewPaymentCommandConsumer(
	client *redis.Client,
	payments *PostgresPaymentRepository,
	orders *PostgresOrderRepository,
	bus *ValkeyEventBus,
) *PaymentCommandConsumer {
	return &PaymentCommandConsumer{
		client:   client,
		payments: payments,
		orders:   orders,
		bus:      bus,
	}
}

func (c *PaymentCommandConsumer) Start(ctx context.Context) {
	err := c.client.XGroupCreateMkStream(ctx, CommandsStream, paymentsCommandGroup, "0").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		log.Printf("[cmd consumer] group create warning: %v", err)
	}
	go c.loop(ctx)
}

func (c *PaymentCommandConsumer) loop(ctx context.Context) {
	log.Printf("[cmd consumer] started — stream=%s group=%s", CommandsStream, paymentsCommandGroup)
	for {
		select {
		case <-ctx.Done():
			log.Printf("[cmd consumer] shutting down")
			return
		default:
		}

		streams, err := c.client.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    paymentsCommandGroup,
			Consumer: paymentsCommandConsumer,
			Streams:  []string{CommandsStream, ">"},
			Count:    5,
			Block:    2 * time.Second,
		}).Result()

		if err != nil {
			if err == redis.Nil || ctx.Err() != nil {
				continue
			}
			log.Printf("[cmd consumer] read error: %v — retrying in 1s", err)
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

func (c *PaymentCommandConsumer) process(ctx context.Context, msg redis.XMessage) {
	paymentID, _ := msg.Values["payment_id"].(string)
	orderID, _ := msg.Values["order_id"].(string)
	amount, _ := msg.Values["amount"].(string)

	log.Printf("[cmd consumer] capturing payment id=%s orderID=%s amount=%s", paymentID, orderID, amount)

	// Atomic: UPDATE payment → CAPTURED + UPDATE order → PAID
	if err := c.payments.CaptureWithOrderUpdate(ctx, paymentID, orderID); err != nil {
		log.Printf("[cmd consumer] WARN: capture failed for %s: %v — message stays pending for retry", paymentID, err)
		return // do NOT ACK — message will be re-delivered
	}

	// Reload updated payment to build the domain event with final state
	payment, err := c.payments.FindByOrderID(ctx, orderID)
	if err != nil {
		log.Printf("[cmd consumer] WARN: could not reload payment after capture: %v", err)
	}

	// Load order for event enrichment
	order, err := c.orders.FindByID(ctx, orderID)
	if err != nil {
		log.Printf("[cmd consumer] WARN: could not load order for event: %v", err)
	}

	// Publish OrderPaidEvent to the events stream
	payID := ""
	if payment != nil {
		payID = payment.ID()
	}
	userID := ""
	if order != nil {
		userID = order.UserID()
	}
	c.bus.Publish(domain.OrderPaidEvent{
		OrderID:    orderID,
		PaymentID:  payID,
		Amount:     amount,
		OccurredAt: time.Now().UTC(),
	})
	log.Printf("[cmd consumer] ✓ payment captured — orderID=%s paymentID=%s userID=%s amount=%s",
		orderID, payID, userID, amount)

	// ACK only after successful capture + event publication
	if err := c.client.XAck(ctx, CommandsStream, paymentsCommandGroup, msg.ID).Err(); err != nil {
		log.Printf("[cmd consumer] WARN: ACK failed for %s: %v", msg.ID, err)
	}
}
