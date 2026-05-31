package db

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

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
			idempotency_key  TEXT          NOT NULL,
			created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
			updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
			UNIQUE(user_id, idempotency_key)
		);
		CREATE TABLE IF NOT EXISTS payments (
			id               UUID          PRIMARY KEY,
			order_id         UUID          NOT NULL REFERENCES orders(id),
			status           TEXT          NOT NULL DEFAULT 'INITIATED',
			amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
			currency         TEXT          NOT NULL DEFAULT 'BRL',
			idempotency_key  TEXT          NOT NULL,
			processed_at     TIMESTAMPTZ,
			UNIQUE(order_id, idempotency_key)
		);
	`)
	return err
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
