package domain

import "time"

// ─── Payment status ───────────────────────────────────────────────────────────

type PaymentStatus string

const (
	PaymentStatusInitiated  PaymentStatus = "INITIATED"
	PaymentStatusAuthorized PaymentStatus = "AUTHORIZED"
	PaymentStatusCaptured   PaymentStatus = "CAPTURED"
	PaymentStatusFailed     PaymentStatus = "FAILED"
	PaymentStatusRefunded   PaymentStatus = "REFUNDED"
)

// ─── Payment entity ───────────────────────────────────────────────────────────

// Payment is immutable after creation — a financial record of a capture event.
type Payment struct {
	id             string
	orderID        string
	status         PaymentStatus
	amount         string
	currency       string
	idempotencyKey string
	processedAt    time.Time
}

func NewPayment(id, orderID, amount, idem string) *Payment {
	return &Payment{
		id:             id,
		orderID:        orderID,
		status:         PaymentStatusCaptured,
		amount:         amount,
		currency:       "BRL",
		idempotencyKey: idem,
		processedAt:    time.Now().UTC(),
	}
}

// ReconstructPayment rebuilds a Payment from persisted state.
func ReconstructPayment(id, orderID string, status PaymentStatus, amount, currency, idem string, processedAt *time.Time) *Payment {
	p := &Payment{
		id:             id,
		orderID:        orderID,
		status:         status,
		amount:         amount,
		currency:       currency,
		idempotencyKey: idem,
	}
	if processedAt != nil {
		p.processedAt = *processedAt
	}
	return p
}

func (p *Payment) ID() string              { return p.id }
func (p *Payment) OrderID() string         { return p.orderID }
func (p *Payment) Status() PaymentStatus   { return p.status }
func (p *Payment) Amount() string          { return p.amount }
func (p *Payment) Currency() string        { return p.currency }
func (p *Payment) IdempotencyKey() string  { return p.idempotencyKey }
func (p *Payment) ProcessedAt() time.Time  { return p.processedAt }
