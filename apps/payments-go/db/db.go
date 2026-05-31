package db

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ─── JSON column types ────────────────────────────────────────────────────────

type OrderItem struct {
	ID              string `json:"id"`
	ProductID       string `json:"productId"`
	ProductTitle    string `json:"productTitle"`
	ProductImageURL string `json:"productImageUrl"`
	Quantity        int    `json:"quantity"`
	UnitPrice       string `json:"unitPrice"`
	Subtotal        string `json:"subtotal"`
}

type ShippingAddress struct {
	Street     string `json:"street"`
	City       string `json:"city"`
	State      string `json:"state"`
	PostalCode string `json:"postalCode"`
	Country    string `json:"country"`
}

// ─── Row types ────────────────────────────────────────────────────────────────

type Order struct {
	ID              string
	UserID          string
	Status          string
	Items           []OrderItem
	ShippingAddress ShippingAddress
	Subtotal        string
	Total           string
	IdempotencyKey  string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type Payment struct {
	ID             string
	OrderID        string
	Status         string
	Amount         string
	Currency       string
	IdempotencyKey string
	ProcessedAt    *time.Time
}

// ─── DB ───────────────────────────────────────────────────────────────────────

type DB struct {
	Pool *pgxpool.Pool
}

func New() (*DB, error) {
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s",
		env("DB_USER", "users_user"),
		env("DB_PASSWORD", "users_pwd"),
		env("DB_HOST", "localhost"),
		env("DB_PORT", "5432"),
		env("DB_NAME", "payments_db"),
	)
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse db config: %w", err)
	}
	cfg.MaxConns = 20
	cfg.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		return nil, fmt.Errorf("open pool: %w", err)
	}
	d := &DB{Pool: pool}
	if err := d.migrate(); err != nil {
		pool.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return d, nil
}

func (d *DB) Close() { d.Pool.Close() }

func (d *DB) migrate() error {
	_, err := d.Pool.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS orders (
			id               UUID          PRIMARY KEY,
			user_id          TEXT          NOT NULL,
			status           TEXT          NOT NULL DEFAULT 'PENDING',
			items            JSONB         NOT NULL DEFAULT '[]',
			shipping_address JSONB         NOT NULL DEFAULT '{}',
			subtotal         NUMERIC(10,2) NOT NULL DEFAULT 0,
			total            NUMERIC(10,2) NOT NULL DEFAULT 0,
			idempotency_key  TEXT          UNIQUE NOT NULL,
			created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
			updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
		);
		CREATE TABLE IF NOT EXISTS payments (
			id               UUID          PRIMARY KEY,
			order_id         UUID          NOT NULL REFERENCES orders(id),
			status           TEXT          NOT NULL DEFAULT 'INITIATED',
			amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
			currency         TEXT          NOT NULL DEFAULT 'BRL',
			idempotency_key  TEXT          UNIQUE NOT NULL,
			processed_at     TIMESTAMPTZ
		);
	`)
	return err
}

// ─── Order operations ─────────────────────────────────────────────────────────

type CreateOrderParams struct {
	ID              string
	UserID          string
	Items           []OrderItem
	ShippingAddress ShippingAddress
	Subtotal        string
	Total           string
	IdempotencyKey  string
}

func (d *DB) CreateOrder(ctx context.Context, p CreateOrderParams) (*Order, error) {
	itemsJSON, err := json.Marshal(p.Items)
	if err != nil {
		return nil, err
	}
	addrJSON, err := json.Marshal(p.ShippingAddress)
	if err != nil {
		return nil, err
	}
	_, err = d.Pool.Exec(ctx, `
		INSERT INTO orders (id, user_id, status, items, shipping_address, subtotal, total, idempotency_key)
		VALUES ($1, $2, 'PENDING', $3, $4, $5, $6, $7)
	`, p.ID, p.UserID, itemsJSON, addrJSON, p.Subtotal, p.Total, p.IdempotencyKey)
	if err != nil {
		return nil, err
	}
	return d.FindOrderByID(ctx, p.ID)
}

func (d *DB) FindOrderByID(ctx context.Context, id string) (*Order, error) {
	row := d.Pool.QueryRow(ctx, `
		SELECT id, user_id, status, items, shipping_address, subtotal, total, idempotency_key, created_at, updated_at
		FROM orders WHERE id = $1
	`, id)
	return scanOrder(row)
}

func (d *DB) FindOrderByIdempotencyKey(ctx context.Context, key string) (*Order, error) {
	row := d.Pool.QueryRow(ctx, `
		SELECT id, user_id, status, items, shipping_address, subtotal, total, idempotency_key, created_at, updated_at
		FROM orders WHERE idempotency_key = $1
	`, key)
	return scanOrder(row)
}

func (d *DB) ListOrdersByUser(ctx context.Context, userID string, limit, offset int) ([]*Order, int, error) {
	rows, err := d.Pool.Query(ctx, `
		SELECT id, user_id, status, items, shipping_address, subtotal, total, idempotency_key, created_at, updated_at
		FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var orders []*Order
	for rows.Next() {
		o, err := scanOrderRow(rows)
		if err != nil {
			return nil, 0, err
		}
		orders = append(orders, o)
	}

	var total int
	if err := d.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM orders WHERE user_id = $1`, userID).Scan(&total); err != nil {
		return nil, 0, err
	}
	return orders, total, nil
}

func (d *DB) UpdateOrderStatus(ctx context.Context, id, status string) error {
	_, err := d.Pool.Exec(ctx, `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`, status, id)
	return err
}

// ─── Payment operations ───────────────────────────────────────────────────────

type CreatePaymentParams struct {
	ID             string
	OrderID        string
	Amount         string
	IdempotencyKey string
}

func (d *DB) CreatePayment(ctx context.Context, p CreatePaymentParams) (*Payment, error) {
	now := time.Now()
	_, err := d.Pool.Exec(ctx, `
		INSERT INTO payments (id, order_id, status, amount, currency, idempotency_key, processed_at)
		VALUES ($1, $2, 'CAPTURED', $3, 'BRL', $4, $5)
	`, p.ID, p.OrderID, p.Amount, p.IdempotencyKey, now)
	if err != nil {
		return nil, err
	}
	return d.FindPaymentByID(ctx, p.ID)
}

func (d *DB) FindPaymentByID(ctx context.Context, id string) (*Payment, error) {
	row := d.Pool.QueryRow(ctx, `
		SELECT id, order_id, status, amount, currency, idempotency_key, processed_at
		FROM payments WHERE id = $1
	`, id)
	return scanPayment(row)
}

func (d *DB) FindPaymentByOrderID(ctx context.Context, orderID string) (*Payment, error) {
	row := d.Pool.QueryRow(ctx, `
		SELECT id, order_id, status, amount, currency, idempotency_key, processed_at
		FROM payments WHERE order_id = $1
	`, orderID)
	p, err := scanPayment(row)
	if err != nil {
		return nil, nil // no payment yet is not an error
	}
	return p, nil
}

func (d *DB) FindPaymentByIdempotencyKey(ctx context.Context, key string) (*Payment, error) {
	row := d.Pool.QueryRow(ctx, `
		SELECT id, order_id, status, amount, currency, idempotency_key, processed_at
		FROM payments WHERE idempotency_key = $1
	`, key)
	return scanPayment(row)
}

// ─── Scanners ─────────────────────────────────────────────────────────────────

type rowScanner interface {
	Scan(dest ...any) error
}

func scanOrder(row rowScanner) (*Order, error) {
	var o Order
	var itemsJSON, addrJSON []byte
	err := row.Scan(&o.ID, &o.UserID, &o.Status, &itemsJSON, &addrJSON,
		&o.Subtotal, &o.Total, &o.IdempotencyKey, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(itemsJSON, &o.Items)
	_ = json.Unmarshal(addrJSON, &o.ShippingAddress)
	if o.Items == nil {
		o.Items = []OrderItem{}
	}
	return &o, nil
}

func scanOrderRow(rows interface{ Scan(dest ...any) error }) (*Order, error) {
	return scanOrder(rows)
}

func scanPayment(row rowScanner) (*Payment, error) {
	var p Payment
	err := row.Scan(&p.ID, &p.OrderID, &p.Status, &p.Amount, &p.Currency, &p.IdempotencyKey, &p.ProcessedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
