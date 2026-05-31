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

// SaveWithOrderUpdate writes the payment and updates order status in a single transaction.
func (r *PostgresPaymentRepository) SaveWithOrderUpdate(
	ctx context.Context,
	p *domain.Payment,
	orderID string,
	newStatus domain.OrderStatus,
) error {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, err = tx.Exec(ctx, `
		INSERT INTO payments (id, order_id, status, amount, currency, idempotency_key, processed_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
	`, p.ID(), p.OrderID(), string(p.Status()), p.Amount(), p.Currency(), p.IdempotencyKey(), p.ProcessedAt())
	if err != nil {
		return fmt.Errorf("insert payment: %w", err)
	}

	_, err = tx.Exec(ctx, `UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2`, string(newStatus), orderID)
	if err != nil {
		return fmt.Errorf("update order status: %w", err)
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
