package application

import (
	"context"
	"fmt"
	"strconv"

	"github.com/google/uuid"
	"github.com/psyduck-project/payments-go/domain"
)

type ProductFetcher interface {
	FetchProduct(productID string) *ProductData
}

type ProductData struct {
	Title    string
	Price    string
	ImageURL string
}

type OrderItemInput struct {
	ProductID string
	Quantity  int
}

type ShippingAddressInput struct {
	Street     string
	City       string
	State      string
	PostalCode string
	Country    string
}

type CreateOrderCommand struct {
	UserID          string
	Items           []OrderItemInput
	ShippingAddress ShippingAddressInput
	IdempotencyKey  string
}

type CreateOrderHandler struct {
	Orders   domain.OrderRepository
	Products ProductFetcher
	Bus      domain.EventBus
}

func (h *CreateOrderHandler) Handle(ctx context.Context, cmd CreateOrderCommand) (*domain.Order, error) {
	if existing, err := h.Orders.FindByIdempotencyKey(ctx, cmd.UserID, cmd.IdempotencyKey); err == nil && existing != nil {
		return existing, nil
	}

	items := make([]domain.OrderItem, 0, len(cmd.Items))
	for _, input := range cmd.Items {
		unitPrice := 99.00
		title := "Product"
		imageURL := ""

		if product := h.Products.FetchProduct(input.ProductID); product != nil {
			if p, err := strconv.ParseFloat(product.Price, 64); err == nil {
				unitPrice = p
			}
			title = product.Title
			imageURL = product.ImageURL
		}

		subtotal := unitPrice * float64(input.Quantity)
		items = append(items, domain.OrderItem{
			ID:              uuid.New().String(),
			ProductID:       input.ProductID,
			ProductTitle:    title,
			ProductImageURL: imageURL,
			Quantity:        input.Quantity,
			UnitPrice:       fmt.Sprintf("%.2f", unitPrice),
			Subtotal:        fmt.Sprintf("%.2f", subtotal),
		})
	}

	order, err := domain.NewOrder(
		uuid.New().String(),
		cmd.UserID,
		items,
		domain.ShippingAddress{
			Street:     cmd.ShippingAddress.Street,
			City:       cmd.ShippingAddress.City,
			State:      cmd.ShippingAddress.State,
			PostalCode: cmd.ShippingAddress.PostalCode,
			Country:    cmd.ShippingAddress.Country,
		},
		cmd.IdempotencyKey,
	)
	if err != nil {
		return nil, err
	}

	if err := h.Orders.Save(ctx, order); err != nil {
		return nil, err
	}

	for _, evt := range order.PopEvents() {
		h.Bus.Publish(evt)
	}

	return order, nil
}
