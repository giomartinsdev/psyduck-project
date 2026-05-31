// Package graph is the GraphQL-over-HTTP adapter for the payments subgraph.
// It parses incoming requests, delegates to the application layer, and formats responses.
// No business logic lives here.
package graph

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/psyduck-project/payments-go/application"
	"github.com/psyduck-project/payments-go/domain"
)

// ─── Auth context ─────────────────────────────────────────────────────────────

type ctxKey string

const UserIDKey ctxKey = "userId"

func UserIDFromCtx(ctx context.Context) string {
	v, _ := ctx.Value(UserIDKey).(string)
	return v
}

// ─── GraphQL wire types ───────────────────────────────────────────────────────

type gqlRequest struct {
	Query         string                 `json:"query"`
	Variables     map[string]interface{} `json:"variables"`
	OperationName string                 `json:"operationName"`
}

type gqlResponse struct {
	Data   interface{} `json:"data,omitempty"`
	Errors []gqlError  `json:"errors,omitempty"`
}

type gqlError struct {
	Message    string                 `json:"message"`
	Extensions map[string]interface{} `json:"extensions,omitempty"`
}

func errUnauthorized() gqlError {
	return gqlError{Message: "Unauthorized", Extensions: map[string]interface{}{"code": "UNAUTHORIZED"}}
}
func errForbidden() gqlError {
	return gqlError{Message: "Forbidden", Extensions: map[string]interface{}{"code": "FORBIDDEN"}}
}
func errInternal(msg string) gqlError { return gqlError{Message: msg} }

// ─── GraphQL response shapes ──────────────────────────────────────────────────

type gqlShippingAddress struct {
	Street     string `json:"street"`
	City       string `json:"city"`
	State      string `json:"state"`
	PostalCode string `json:"postalCode"`
	Country    string `json:"country"`
}

type gqlOrderItem struct {
	ID              string `json:"id"`
	ProductID       string `json:"productId"`
	ProductTitle    string `json:"productTitle"`
	ProductImageURL string `json:"productImageUrl"`
	Quantity        int    `json:"quantity"`
	UnitPrice       string `json:"unitPrice"`
	Subtotal        string `json:"subtotal"`
}

type gqlPayment struct {
	ID             string  `json:"id"`
	OrderID        string  `json:"orderId"`
	Status         string  `json:"status"`
	Amount         string  `json:"amount"`
	Currency       string  `json:"currency"`
	IdempotencyKey string  `json:"idempotencyKey"`
	ProcessedAt    *string `json:"processedAt"`
}

type gqlOrder struct {
	ID              string             `json:"id"`
	UserID          string             `json:"userId"`
	Status          string             `json:"status"`
	Items           []gqlOrderItem     `json:"items"`
	ShippingAddress gqlShippingAddress `json:"shippingAddress"`
	Subtotal        string             `json:"subtotal"`
	Total           string             `json:"total"`
	Payment         *gqlPayment        `json:"payment"`
	IdempotencyKey  string             `json:"idempotencyKey"`
	CreatedAt       string             `json:"createdAt"`
	UpdatedAt       string             `json:"updatedAt"`
}

type gqlPageInfo struct {
	HasNextPage     bool    `json:"hasNextPage"`
	HasPreviousPage bool    `json:"hasPreviousPage"`
	StartCursor     *string `json:"startCursor"`
	EndCursor       *string `json:"endCursor"`
}

type gqlOrderConnection struct {
	Edges      []struct {
		Cursor string    `json:"cursor"`
		Node   *gqlOrder `json:"node"`
	} `json:"edges"`
	PageInfo   gqlPageInfo `json:"pageInfo"`
	TotalCount int         `json:"totalCount"`
}

// ─── Schema SDL ───────────────────────────────────────────────────────────────

const schemaSDL = `
extend schema
  @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

scalar DateTime
scalar UUID
scalar Decimal

type PageInfo @shareable {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

enum OrderStatus { PENDING PROCESSING PAID FULFILLED CANCELLED REFUNDED }
enum PaymentStatus { INITIATED AUTHORIZED CAPTURED FAILED REFUNDED }

type ShippingAddress { street: String! city: String! state: String! postalCode: String! country: String! }
type OrderItem { id: UUID! productId: UUID! productTitle: String! productImageUrl: String! quantity: Int! unitPrice: Decimal! subtotal: Decimal! }
type Payment { id: UUID! orderId: UUID! status: PaymentStatus! amount: Decimal! currency: String! idempotencyKey: String! processedAt: DateTime }

type Order @key(fields: "id") {
  id: UUID! userId: UUID! status: OrderStatus! items: [OrderItem!]!
  shippingAddress: ShippingAddress! subtotal: Decimal! total: Decimal!
  payment: Payment idempotencyKey: String! createdAt: DateTime! updatedAt: DateTime!
}

type OrderEdge { cursor: String! node: Order! }
type OrderConnection { edges: [OrderEdge!]! pageInfo: PageInfo! totalCount: Int! }

input ShippingAddressInput { street: String! city: String! state: String! postalCode: String! country: String! }
input OrderItemInput { productId: UUID! quantity: Int! }
input CreateOrderInput { items: [OrderItemInput!]! shippingAddress: ShippingAddressInput! idempotencyKey: String! }
input ProcessPaymentInput { orderId: UUID! idempotencyKey: String! }

type Query { myOrders(first: Int, after: String): OrderConnection! order(id: UUID!): Order }
type Mutation { createOrder(input: CreateOrderInput!): Order! processPayment(input: ProcessPaymentInput!): Payment! }
`

// ─── HTTP handler ─────────────────────────────────────────────────────────────

type Handler struct {
	createOrder    *application.CreateOrderHandler
	processPayment *application.ProcessPaymentHandler
	orders         domain.OrderRepository
	payments       domain.PaymentRepository
}

func NewHandler(
	createOrder *application.CreateOrderHandler,
	processPayment *application.ProcessPaymentHandler,
	orders domain.OrderRepository,
	payments domain.PaymentRepository,
) *Handler {
	return &Handler{
		createOrder:    createOrder,
		processPayment: processPayment,
		orders:         orders,
		payments:       payments,
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodGet {
		writeJSON(w, gqlResponse{Data: map[string]string{"__typename": "Query"}})
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeJSON(w, gqlResponse{Errors: []gqlError{errInternal("cannot read body")}})
		return
	}
	var req gqlRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, gqlResponse{Errors: []gqlError{errInternal("invalid JSON")}})
		return
	}
	writeJSON(w, h.dispatch(r.Context(), req))
}

func (h *Handler) dispatch(ctx context.Context, req gqlRequest) gqlResponse {
	q := req.Query
	v := req.Variables

	switch {
	case strings.Contains(q, "_service"):
		return gqlResponse{Data: map[string]interface{}{"_service": map[string]string{"sdl": schemaSDL}}}
	case strings.Contains(q, "_entities"):
		return h.handleEntities(ctx, v)
	case strings.Contains(q, "myOrders"):
		return h.handleMyOrders(ctx, v)
	case strings.Contains(q, "createOrder"):
		return h.handleCreateOrder(ctx, v)
	case strings.Contains(q, "processPayment"):
		return h.handleProcessPayment(ctx, v)
	case strings.Contains(q, "order"):
		return h.handleOrder(ctx, v)
	default:
		return gqlResponse{Data: map[string]string{"__typename": "Query"}}
	}
}

// ─── Resolver implementations ─────────────────────────────────────────────────

func (h *Handler) handleEntities(ctx context.Context, vars map[string]interface{}) gqlResponse {
	reps, _ := vars["representations"].([]interface{})
	entities := make([]interface{}, 0, len(reps))
	for _, rep := range reps {
		m, _ := rep.(map[string]interface{})
		if typeName, _ := m["__typename"].(string); typeName == "Order" {
			id, _ := m["id"].(string)
			o, err := h.orders.FindByID(ctx, id)
			if err != nil || o == nil {
				entities = append(entities, nil)
				continue
			}
			gqlO := h.toGQLOrder(ctx, o)
			entities = append(entities, gqlO)
		}
	}
	return gqlResponse{Data: map[string]interface{}{"_entities": entities}}
}

func (h *Handler) handleMyOrders(ctx context.Context, vars map[string]interface{}) gqlResponse {
	userID := UserIDFromCtx(ctx)
	if userID == "" {
		return gqlResponse{Errors: []gqlError{errUnauthorized()}}
	}
	first := 10
	if v, _ := vars["first"].(float64); v > 0 {
		first = int(v)
	}
	offset := 0
	if after, _ := vars["after"].(string); after != "" {
		offset = decodeCursor(after) + 1
	}
	orders, total, err := h.orders.ListByUser(ctx, userID, first, offset)
	if err != nil {
		return gqlResponse{Errors: []gqlError{errInternal(err.Error())}}
	}
	type edge struct {
		Cursor string    `json:"cursor"`
		Node   *gqlOrder `json:"node"`
	}
	edges := make([]edge, 0, len(orders))
	for i, o := range orders {
		edges = append(edges, edge{Cursor: encodeCursor(offset + i), Node: h.toGQLOrder(ctx, o)})
	}
	var startCursor, endCursor *string
	if len(edges) > 0 {
		s, e := edges[0].Cursor, edges[len(edges)-1].Cursor
		startCursor, endCursor = &s, &e
	}
	return gqlResponse{Data: map[string]interface{}{
		"myOrders": map[string]interface{}{
			"edges": edges,
			"pageInfo": gqlPageInfo{
				HasNextPage:     offset+first < total,
				HasPreviousPage: offset > 0,
				StartCursor:     startCursor,
				EndCursor:       endCursor,
			},
			"totalCount": total,
		},
	}}
}

func (h *Handler) handleOrder(ctx context.Context, vars map[string]interface{}) gqlResponse {
	id, _ := vars["id"].(string)
	if id == "" {
		return gqlResponse{Data: map[string]interface{}{"order": nil}}
	}
	o, err := h.orders.FindByID(ctx, id)
	if err != nil || o == nil {
		return gqlResponse{Data: map[string]interface{}{"order": nil}}
	}
	return gqlResponse{Data: map[string]interface{}{"order": h.toGQLOrder(ctx, o)}}
}

func (h *Handler) handleCreateOrder(ctx context.Context, vars map[string]interface{}) gqlResponse {
	userID := UserIDFromCtx(ctx)
	if userID == "" {
		return gqlResponse{Errors: []gqlError{errUnauthorized()}}
	}
	inputMap := getMap(vars, "input")
	cmd := application.CreateOrderCommand{
		UserID:         userID,
		IdempotencyKey: getString(inputMap, "idempotencyKey"),
		ShippingAddress: application.ShippingAddressInput{
			Street:     getString(getMap(inputMap, "shippingAddress"), "street"),
			City:       getString(getMap(inputMap, "shippingAddress"), "city"),
			State:      getString(getMap(inputMap, "shippingAddress"), "state"),
			PostalCode: getString(getMap(inputMap, "shippingAddress"), "postalCode"),
			Country:    getString(getMap(inputMap, "shippingAddress"), "country"),
		},
	}
	rawItems, _ := inputMap["items"].([]interface{})
	for _, ri := range rawItems {
		m, _ := ri.(map[string]interface{})
		qty := 1
		if q, ok := m["quantity"].(float64); ok {
			qty = int(q)
		}
		cmd.Items = append(cmd.Items, application.OrderItemInput{
			ProductID: getString(m, "productId"),
			Quantity:  qty,
		})
	}
	order, err := h.createOrder.Handle(ctx, cmd)
	if err != nil {
		return gqlResponse{Errors: []gqlError{errInternal(err.Error())}}
	}
	return gqlResponse{Data: map[string]interface{}{"createOrder": h.toGQLOrder(ctx, order)}}
}

func (h *Handler) handleProcessPayment(ctx context.Context, vars map[string]interface{}) gqlResponse {
	userID := UserIDFromCtx(ctx)
	if userID == "" {
		return gqlResponse{Errors: []gqlError{errUnauthorized()}}
	}
	inputMap := getMap(vars, "input")
	cmd := application.ProcessPaymentCommand{
		UserID:         userID,
		OrderID:        getString(inputMap, "orderId"),
		IdempotencyKey: getString(inputMap, "idempotencyKey"),
	}
	payment, err := h.processPayment.Handle(ctx, cmd)
	if err != nil {
		switch err {
		case application.ErrOrderNotFound:
			return gqlResponse{Errors: []gqlError{errInternal("Order not found")}}
		case application.ErrForbidden, domain.ErrOrderAlreadyProcessed:
			return gqlResponse{Errors: []gqlError{errForbidden()}}
		default:
			return gqlResponse{Errors: []gqlError{errInternal(err.Error())}}
		}
	}
	return gqlResponse{Data: map[string]interface{}{"processPayment": toGQLPayment(payment)}}
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

func (h *Handler) toGQLOrder(ctx context.Context, o *domain.Order) *gqlOrder {
	items := make([]gqlOrderItem, 0, len(o.Items()))
	for _, it := range o.Items() {
		items = append(items, gqlOrderItem{
			ID:              it.ID,
			ProductID:       it.ProductID,
			ProductTitle:    it.ProductTitle,
			ProductImageURL: it.ProductImageURL,
			Quantity:        it.Quantity,
			UnitPrice:       it.UnitPrice,
			Subtotal:        it.Subtotal,
		})
	}
	addr := o.ShippingAddr()

	// Lazy-load payment (acceptable N+1 for single order responses)
	var pay *gqlPayment
	if p, err := h.payments.FindByOrderID(ctx, o.ID()); err == nil && p != nil {
		pay = toGQLPayment(p)
	}

	return &gqlOrder{
		ID:     o.ID(),
		UserID: o.UserID(),
		Status: string(o.Status()),
		Items:  items,
		ShippingAddress: gqlShippingAddress{
			Street:     addr.Street,
			City:       addr.City,
			State:      addr.State,
			PostalCode: addr.PostalCode,
			Country:    addr.Country,
		},
		Subtotal:       o.Subtotal(),
		Total:          o.Total(),
		Payment:        pay,
		IdempotencyKey: o.IdempotencyKey(),
		CreatedAt:      o.CreatedAt().Format(time.RFC3339),
		UpdatedAt:      o.UpdatedAt().Format(time.RFC3339),
	}
}

func toGQLPayment(p *domain.Payment) *gqlPayment {
	if p == nil {
		return nil
	}
	var processedAt *string
	if !p.ProcessedAt().IsZero() {
		s := p.ProcessedAt().UTC().Format(time.RFC3339)
		processedAt = &s
	}
	return &gqlPayment{
		ID:             p.ID(),
		OrderID:        p.OrderID(),
		Status:         string(p.Status()),
		Amount:         p.Amount(),
		Currency:       p.Currency(),
		IdempotencyKey: p.IdempotencyKey(),
		ProcessedAt:    processedAt,
	}
}

// ─── Cursor helpers ───────────────────────────────────────────────────────────

func encodeCursor(offset int) string {
	return base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("offset:%d", offset)))
}

func decodeCursor(cursor string) int {
	b, err := base64.StdEncoding.DecodeString(cursor)
	if err != nil {
		return 0
	}
	parts := strings.SplitN(string(b), ":", 2)
	if len(parts) != 2 {
		return 0
	}
	n, _ := strconv.Atoi(parts[1])
	return n
}

// ─── Utility ──────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, v interface{}) { _ = json.NewEncoder(w).Encode(v) }

func getMap(m map[string]interface{}, key string) map[string]interface{} {
	v, _ := m[key].(map[string]interface{})
	if v == nil {
		return map[string]interface{}{}
	}
	return v
}

func getString(m map[string]interface{}, key string) string {
	v, _ := m[key].(string)
	return v
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
