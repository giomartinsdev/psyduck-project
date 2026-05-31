package infrastructure

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/psyduck-project/payments-go/domain"
)

// ─── JSON column shapes ───────────────────────────────────────────────────────

type orderItemJSON struct {
	ID              string `json:"id"`
	ProductID       string `json:"productId"`
	ProductTitle    string `json:"productTitle"`
	ProductImageURL string `json:"productImageUrl"`
	Quantity        int    `json:"quantity"`
	UnitPrice       string `json:"unitPrice"`
	Subtotal        string `json:"subtotal"`
}

type shippingAddressJSON struct {
	Street     string `json:"street"`
	City       string `json:"city"`
	State      string `json:"state"`
	PostalCode string `json:"postalCode"`
	Country    string `json:"country"`
}

// ─── Repository ───────────────────────────────────────────────────────────────

type PostgresOrderRepository struct {
	Pool *pgxpool.Pool
}

func (r *PostgresOrderRepository) Save(ctx context.Context, o *domain.Order) error {
	itemsJSON, err := json.Marshal(toItemJSONSlice(o.Items()))
	if err != nil {
		return fmt.Errorf("marshal items: %w", err)
	}
	addrJSON, err := json.Marshal(toAddrJSON(o.ShippingAddr()))
	if err != nil {
		return fmt.Errorf("marshal address: %w", err)
	}

	_, err = r.Pool.Exec(ctx, `
		INSERT INTO orders (id, user_id, status, items, shipping_address, subtotal, total, idempotency_key, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		ON CONFLICT (id) DO UPDATE SET
			status = EXCLUDED.status,
			updated_at = EXCLUDED.updated_at
	`,
		o.ID(), o.UserID(), string(o.Status()),
		itemsJSON, addrJSON,
		o.Subtotal(), o.Total(), o.IdempotencyKey(),
		o.CreatedAt(), o.UpdatedAt(),
	)
	return err
}

func (r *PostgresOrderRepository) FindByID(ctx context.Context, id string) (*domain.Order, error) {
	row := r.Pool.QueryRow(ctx, orderSelectSQL+" WHERE id = $1", id)
	return scanOrder(row)
}

func (r *PostgresOrderRepository) FindByIdempotencyKey(ctx context.Context, key string) (*domain.Order, error) {
	row := r.Pool.QueryRow(ctx, orderSelectSQL+" WHERE idempotency_key = $1", key)
	return scanOrder(row)
}

func (r *PostgresOrderRepository) ListByUser(ctx context.Context, userID string, limit, offset int) ([]*domain.Order, int, error) {
	rows, err := r.Pool.Query(ctx,
		orderSelectSQL+" WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
		userID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var orders []*domain.Order
	for rows.Next() {
		o, err := scanOrder(rows)
		if err != nil {
			return nil, 0, err
		}
		orders = append(orders, o)
	}

	var total int
	if err := r.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM orders WHERE user_id = $1`, userID).Scan(&total); err != nil {
		return nil, 0, err
	}
	return orders, total, nil
}

// ─── SQL + scanner helpers ────────────────────────────────────────────────────

const orderSelectSQL = `
	SELECT id, user_id, status, items, shipping_address, subtotal, total, idempotency_key, created_at, updated_at
	FROM orders`

type rowScanner interface{ Scan(dest ...any) error }

func scanOrder(row rowScanner) (*domain.Order, error) {
	var id, userID, status string
	var itemsJSON, addrJSON []byte
	var subtotal, total, idem string
	var createdAt, updatedAt time.Time

	if err := row.Scan(&id, &userID, &status, &itemsJSON, &addrJSON,
		&subtotal, &total, &idem, &createdAt, &updatedAt); err != nil {
		return nil, err
	}

	var rawItems []orderItemJSON
	_ = json.Unmarshal(itemsJSON, &rawItems)

	var rawAddr shippingAddressJSON
	_ = json.Unmarshal(addrJSON, &rawAddr)

	items := make([]domain.OrderItem, 0, len(rawItems))
	for _, it := range rawItems {
		items = append(items, domain.OrderItem{
			ID:              it.ID,
			ProductID:       it.ProductID,
			ProductTitle:    it.ProductTitle,
			ProductImageURL: it.ProductImageURL,
			Quantity:        it.Quantity,
			UnitPrice:       it.UnitPrice,
			Subtotal:        it.Subtotal,
		})
	}

	return domain.ReconstructOrder(
		id, userID, domain.OrderStatus(status), items,
		domain.ShippingAddress{
			Street:     rawAddr.Street,
			City:       rawAddr.City,
			State:      rawAddr.State,
			PostalCode: rawAddr.PostalCode,
			Country:    rawAddr.Country,
		},
		subtotal, total, idem, createdAt.UTC(), updatedAt.UTC(),
	), nil
}

func toItemJSONSlice(items []domain.OrderItem) []orderItemJSON {
	out := make([]orderItemJSON, 0, len(items))
	for _, it := range items {
		out = append(out, orderItemJSON{
			ID:              it.ID,
			ProductID:       it.ProductID,
			ProductTitle:    it.ProductTitle,
			ProductImageURL: it.ProductImageURL,
			Quantity:        it.Quantity,
			UnitPrice:       it.UnitPrice,
			Subtotal:        it.Subtotal,
		})
	}
	return out
}

func toAddrJSON(a domain.ShippingAddress) shippingAddressJSON {
	return shippingAddressJSON{
		Street:     a.Street,
		City:       a.City,
		State:      a.State,
		PostalCode: a.PostalCode,
		Country:    a.Country,
	}
}
