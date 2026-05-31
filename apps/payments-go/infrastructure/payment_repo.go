package infrastructure

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/psyduck-project/payments-go/domain"
)

type PostgresPaymentRepository struct {
	Pool *pgxpool.Pool
}

// Create inserts a new payment row (e.g. with INITIATED status).
func (r *PostgresPaymentRepository) Create(ctx context.Context, p *domain.Payment) error {
	_, err := r.Pool.Exec(ctx, `
		INSERT INTO payments (id, order_id, status, amount, currency, idempotency_key)
		VALUES ($1,$2,$3,$4,$5,$6)
	`, p.ID(), p.OrderID(), string(p.Status()), p.Amount(), p.Currency(), p.IdempotencyKey())
	return err
}

// CaptureWithOrderUpdate atomically transitions the payment to CAPTURED
// and the order to PAID in a single pgx transaction.
// This is called by the async consumer — not by the HTTP handler.
func (r *PostgresPaymentRepository) CaptureWithOrderUpdate(ctx context.Context, paymentID, orderID string) error {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, err = tx.Exec(ctx,
		`UPDATE payments SET status='CAPTURED', processed_at=NOW() WHERE id=$1`,
		paymentID)
	if err != nil {
		return fmt.Errorf("update payment: %w", err)
	}

	_, err = tx.Exec(ctx,
		`UPDATE orders SET status='PAID', updated_at=NOW() WHERE id=$1`,
		orderID)
	if err != nil {
		return fmt.Errorf("update order: %w", err)
	}

	return tx.Commit(ctx)
}

func (r *PostgresPaymentRepository) FindByOrderID(ctx context.Context, orderID string) (*domain.Payment, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT id, order_id, status, amount, currency, idempotency_key, processed_at FROM payments WHERE order_id = $1`,
		orderID)
	return scanPayment(row)
}

func (r *PostgresPaymentRepository) FindByIdempotencyKey(ctx context.Context, key string) (*domain.Payment, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT id, order_id, status, amount, currency, idempotency_key, processed_at FROM payments WHERE idempotency_key = $1`,
		key)
	return scanPayment(row)
}

func scanPayment(row rowScanner) (*domain.Payment, error) {
	var id, orderID, status, amount, currency, idem string
	var processedAt *time.Time
	if err := row.Scan(&id, &orderID, &status, &amount, &currency, &idem, &processedAt); err != nil {
		return nil, err
	}
	return domain.ReconstructPayment(id, orderID, domain.PaymentStatus(status), amount, currency, idem, processedAt), nil
}
