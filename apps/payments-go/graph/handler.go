// Package graph implements the GraphQL-over-HTTP execution layer for the
// payments subgraph.  Apollo Federation v2 is supported: _service returns
// the SDL for IntrospectAndCompose, and _entities resolves Order references.
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

	"github.com/google/uuid"
	"github.com/psyduck-project/payments-go/db"
)

// ─── Context key for authenticated user ──────────────────────────────────────

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
	Data   interface{}  `json:"data,omitempty"`
	Errors []gqlError   `json:"errors,omitempty"`
}

type gqlError struct {
	Message    string                 `json:"message"`
	Extensions map[string]interface{} `json:"extensions,omitempty"`
}

func errUnauthorized() *gqlError {
	return &gqlError{Message: "Unauthorized", Extensions: map[string]interface{}{"code": "UNAUTHORIZED"}}
}
func errForbidden() *gqlError {
	return &gqlError{Message: "Forbidden", Extensions: map[string]interface{}{"code": "FORBIDDEN"}}
}
func errNotFound(entity string) *gqlError {
	return &gqlError{Message: entity + " not found"}
}

// ─── GraphQL response types (match the SDL) ───────────────────────────────────

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

type gqlOrderEdge struct {
	Cursor string    `json:"cursor"`
	Node   *gqlOrder `json:"node"`
}

type gqlOrderConnection struct {
	Edges      []gqlOrderEdge `json:"edges"`
	PageInfo   gqlPageInfo    `json:"pageInfo"`
	TotalCount int            `json:"totalCount"`
}

// ─── Schema SDL (returned for Apollo Federation _service query) ───────────────

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

// ─── Handler ──────────────────────────────────────────────────────────────────

type Handler struct {
	DB          *db.DB
	productsURL string
	usersURL    string
}

func NewHandler(database *db.DB) *Handler {
	return &Handler{
		DB:          database,
		productsURL: env("PRODUCTS_SUBGRAPH_URL", "http://localhost:4002/graphql"),
		usersURL:    env("USERS_AUTH_URL", "http://localhost:4001"),
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodGet {
		// Healthcheck / GET introspection — return __typename
		writeJSON(w, gqlResponse{Data: map[string]string{"__typename": "Query"}})
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeJSON(w, gqlResponse{Errors: []gqlError{{Message: "cannot read body"}}})
		return
	}

	var req gqlRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, gqlResponse{Errors: []gqlError{{Message: "invalid JSON"}}})
		return
	}

	ctx := r.Context()
	resp := h.execute(ctx, req)
	writeJSON(w, resp)
}

func (h *Handler) execute(ctx context.Context, req gqlRequest) gqlResponse {
	q := req.Query
	vars := req.Variables

	switch {
	case strings.Contains(q, "_service"):
		return gqlResponse{Data: map[string]interface{}{
			"_service": map[string]string{"sdl": schemaSDL},
		}}

	case strings.Contains(q, "__typename") && !strings.Contains(q, "_entities") && !strings.Contains(q, "myOrders") && !strings.Contains(q, "createOrder"):
		return gqlResponse{Data: map[string]string{"__typename": "Query"}}

	case strings.Contains(q, "_entities"):
		return h.handleEntities(ctx, vars)

	case strings.Contains(q, "myOrders"):
		return h.handleMyOrders(ctx, vars)

	case strings.Contains(q, "createOrder"):
		return h.handleCreateOrder(ctx, vars)

	case strings.Contains(q, "processPayment"):
		return h.handleProcessPayment(ctx, vars)

	case strings.Contains(q, "order"):
		return h.handleOrder(ctx, vars)

	default:
		return gqlResponse{Errors: []gqlError{{Message: "unknown operation"}}}
	}
}

// ─── _entities ────────────────────────────────────────────────────────────────

func (h *Handler) handleEntities(ctx context.Context, vars map[string]interface{}) gqlResponse {
	reps, _ := vars["representations"].([]interface{})
	entities := make([]interface{}, 0, len(reps))

	for _, rep := range reps {
		m, _ := rep.(map[string]interface{})
		typeName, _ := m["__typename"].(string)
		if typeName == "Order" {
			id, _ := m["id"].(string)
			o, err := h.DB.FindOrderByID(ctx, id)
			if err != nil || o == nil {
				entities = append(entities, nil)
				continue
			}
			gqlO, _ := h.orderToGQL(ctx, o)
			entities = append(entities, gqlO)
		}
	}
	return gqlResponse{Data: map[string]interface{}{"_entities": entities}}
}

// ─── myOrders ─────────────────────────────────────────────────────────────────

func (h *Handler) handleMyOrders(ctx context.Context, vars map[string]interface{}) gqlResponse {
	userID := UserIDFromCtx(ctx)
	if userID == "" {
		return gqlResponse{Errors: []gqlError{*errUnauthorized()}}
	}

	first := 10
	if v, ok := vars["first"]; ok {
		switch n := v.(type) {
		case float64:
			first = int(n)
		case int:
			first = n
		}
	}
	offset := 0
	if after, _ := vars["after"].(string); after != "" {
		offset = decodeCursor(after) + 1
	}

	orders, total, err := h.DB.ListOrdersByUser(ctx, userID, first, offset)
	if err != nil {
		return gqlResponse{Errors: []gqlError{{Message: err.Error()}}}
	}

	edges := make([]gqlOrderEdge, 0, len(orders))
	for i, o := range orders {
		gqlO, err := h.orderToGQL(ctx, o)
		if err != nil {
			continue
		}
		edges = append(edges, gqlOrderEdge{Cursor: encodeCursor(offset + i), Node: gqlO})
	}

	var startCursor, endCursor *string
	if len(edges) > 0 {
		s := edges[0].Cursor
		e := edges[len(edges)-1].Cursor
		startCursor, endCursor = &s, &e
	}

	return gqlResponse{Data: map[string]interface{}{
		"myOrders": gqlOrderConnection{
			Edges: edges,
			PageInfo: gqlPageInfo{
				HasNextPage:     offset+first < total,
				HasPreviousPage: offset > 0,
				StartCursor:     startCursor,
				EndCursor:       endCursor,
			},
			TotalCount: total,
		},
	}}
}

// ─── order ────────────────────────────────────────────────────────────────────

func (h *Handler) handleOrder(ctx context.Context, vars map[string]interface{}) gqlResponse {
	id, _ := vars["id"].(string)
	if id == "" {
		return gqlResponse{Errors: []gqlError{{Message: "id is required"}}}
	}
	o, err := h.DB.FindOrderByID(ctx, id)
	if err != nil || o == nil {
		return gqlResponse{Data: map[string]interface{}{"order": nil}}
	}
	gqlO, err := h.orderToGQL(ctx, o)
	if err != nil {
		return gqlResponse{Errors: []gqlError{{Message: err.Error()}}}
	}
	return gqlResponse{Data: map[string]interface{}{"order": gqlO}}
}

// ─── createOrder ──────────────────────────────────────────────────────────────

func (h *Handler) handleCreateOrder(ctx context.Context, vars map[string]interface{}) gqlResponse {
	userID := UserIDFromCtx(ctx)
	if userID == "" {
		return gqlResponse{Errors: []gqlError{*errUnauthorized()}}
	}

	inputMap := getMap(vars, "input")
	idempotencyKey, _ := inputMap["idempotencyKey"].(string)

	// Idempotency check
	if existing, err := h.DB.FindOrderByIdempotencyKey(ctx, idempotencyKey); err == nil && existing != nil {
		gqlO, _ := h.orderToGQL(ctx, existing)
		return gqlResponse{Data: map[string]interface{}{"createOrder": gqlO}}
	}

	// Parse shipping address
	addrMap := getMap(inputMap, "shippingAddress")
	addr := db.ShippingAddress{
		Street:     getString(addrMap, "street"),
		City:       getString(addrMap, "city"),
		State:      getString(addrMap, "state"),
		PostalCode: getString(addrMap, "postalCode"),
		Country:    getString(addrMap, "country"),
	}

	// Resolve items + fetch prices
	rawItems, _ := inputMap["items"].([]interface{})
	items := make([]db.OrderItem, 0, len(rawItems))
	subtotal := 0.0

	for _, ri := range rawItems {
		m, _ := ri.(map[string]interface{})
		productID := getString(m, "productId")
		qty := 1
		if q, ok := m["quantity"].(float64); ok {
			qty = int(q)
		}

		unitPrice := 99.0
		title := "Product"
		imageURL := ""
		if p := h.fetchProduct(productID); p != nil {
			if v, err := strconv.ParseFloat(p.Price, 64); err == nil {
				unitPrice = v
			}
			title = p.Title
			imageURL = p.ImageURL
		}

		itemSubtotal := unitPrice * float64(qty)
		subtotal += itemSubtotal
		items = append(items, db.OrderItem{
			ID:              uuid.New().String(),
			ProductID:       productID,
			ProductTitle:    title,
			ProductImageURL: imageURL,
			Quantity:        qty,
			UnitPrice:       fmt.Sprintf("%.2f", unitPrice),
			Subtotal:        fmt.Sprintf("%.2f", itemSubtotal),
		})
	}

	subtotalStr := fmt.Sprintf("%.2f", subtotal)
	o, err := h.DB.CreateOrder(ctx, db.CreateOrderParams{
		ID:              uuid.New().String(),
		UserID:          userID,
		Items:           items,
		ShippingAddress: addr,
		Subtotal:        subtotalStr,
		Total:           subtotalStr,
		IdempotencyKey:  idempotencyKey,
	})
	if err != nil {
		return gqlResponse{Errors: []gqlError{{Message: err.Error()}}}
	}

	gqlO, err := h.orderToGQL(ctx, o)
	if err != nil {
		return gqlResponse{Errors: []gqlError{{Message: err.Error()}}}
	}
	return gqlResponse{Data: map[string]interface{}{"createOrder": gqlO}}
}

// ─── processPayment ───────────────────────────────────────────────────────────

func (h *Handler) handleProcessPayment(ctx context.Context, vars map[string]interface{}) gqlResponse {
	userID := UserIDFromCtx(ctx)
	if userID == "" {
		return gqlResponse{Errors: []gqlError{*errUnauthorized()}}
	}

	inputMap := getMap(vars, "input")
	orderID := getString(inputMap, "orderId")
	idempotencyKey := getString(inputMap, "idempotencyKey")

	// Idempotency check
	if existing, err := h.DB.FindPaymentByIdempotencyKey(ctx, idempotencyKey); err == nil && existing != nil {
		return gqlResponse{Data: map[string]interface{}{"processPayment": paymentToGQL(existing)}}
	}

	// Verify order exists and belongs to user
	o, err := h.DB.FindOrderByID(ctx, orderID)
	if err != nil || o == nil {
		return gqlResponse{Errors: []gqlError{*errNotFound("Order")}}
	}
	if o.UserID != userID {
		return gqlResponse{Errors: []gqlError{*errForbidden()}}
	}

	p, err := h.DB.CreatePayment(ctx, db.CreatePaymentParams{
		ID:             uuid.New().String(),
		OrderID:        orderID,
		Amount:         o.Total,
		IdempotencyKey: idempotencyKey,
	})
	if err != nil {
		return gqlResponse{Errors: []gqlError{{Message: err.Error()}}}
	}

	if err := h.DB.UpdateOrderStatus(ctx, orderID, "PAID"); err != nil {
		return gqlResponse{Errors: []gqlError{{Message: err.Error()}}}
	}

	return gqlResponse{Data: map[string]interface{}{"processPayment": paymentToGQL(p)}}
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

func (h *Handler) orderToGQL(ctx context.Context, o *db.Order) (*gqlOrder, error) {
	items := make([]gqlOrderItem, 0, len(o.Items))
	for _, it := range o.Items {
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

	// Lazy-load payment
	payment, _ := h.DB.FindPaymentByOrderID(ctx, o.ID)

	return &gqlOrder{
		ID:     o.ID,
		UserID: o.UserID,
		Status: o.Status,
		Items:  items,
		ShippingAddress: gqlShippingAddress{
			Street:     o.ShippingAddress.Street,
			City:       o.ShippingAddress.City,
			State:      o.ShippingAddress.State,
			PostalCode: o.ShippingAddress.PostalCode,
			Country:    o.ShippingAddress.Country,
		},
		Subtotal:       o.Subtotal,
		Total:          o.Total,
		Payment:        paymentToGQL(payment),
		IdempotencyKey: o.IdempotencyKey,
		CreatedAt:      o.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:      o.UpdatedAt.UTC().Format(time.RFC3339),
	}, nil
}

func paymentToGQL(p *db.Payment) *gqlPayment {
	if p == nil {
		return nil
	}
	var processedAt *string
	if p.ProcessedAt != nil {
		s := p.ProcessedAt.UTC().Format(time.RFC3339)
		processedAt = &s
	}
	return &gqlPayment{
		ID:             p.ID,
		OrderID:        p.OrderID,
		Status:         p.Status,
		Amount:         p.Amount,
		Currency:       p.Currency,
		IdempotencyKey: p.IdempotencyKey,
		ProcessedAt:    processedAt,
	}
}

// ─── Product price fetch ──────────────────────────────────────────────────────

type productResult struct {
	Title    string
	Price    string
	ImageURL string
}

func (h *Handler) fetchProduct(productID string) *productResult {
	body := fmt.Sprintf(`{"query":"query($id:UUID!){product(id:$id){title price imageUrl}}","variables":{"id":%q}}`, productID)
	resp, err := http.Post(h.productsURL, "application/json", strings.NewReader(body))
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	var result struct {
		Data struct {
			Product *struct {
				Title    string `json:"title"`
				Price    string `json:"price"`
				ImageURL string `json:"imageUrl"`
			} `json:"product"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || result.Data.Product == nil {
		return nil
	}
	return &productResult{
		Title:    result.Data.Product.Title,
		Price:    result.Data.Product.Price,
		ImageURL: result.Data.Product.ImageURL,
	}
}

// ─── Cursor pagination helpers ────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, v interface{}) {
	_ = json.NewEncoder(w).Encode(v)
}

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
