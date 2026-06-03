package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/redis/go-redis/v9"

	"github.com/psyduck-project/payments-go/application"
	"github.com/psyduck-project/payments-go/db"
	"github.com/psyduck-project/payments-go/graph"
	"github.com/psyduck-project/payments-go/infrastructure"
)

type httpProductFetcher struct{ url string }

func (f *httpProductFetcher) FetchProduct(productID string) *application.ProductData {
	body := fmt.Sprintf(`{"query":"query($id:UUID!){product(id:$id){title price imageUrl}}","variables":{"id":%q}}`, productID)
	resp, err := http.Post(f.url, "application/json", strings.NewReader(body))
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
	return &application.ProductData{
		Title:    result.Data.Product.Title,
		Price:    result.Data.Product.Price,
		ImageURL: result.Data.Product.ImageURL,
	}
}

var usersAuthURL = env("USERS_AUTH_URL", "http://localhost:4001")

func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorization := r.Header.Get("Authorization")
		userID := resolveUserID(r.Context(), authorization)
		ctx := context.WithValue(r.Context(), graph.UserIDKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func resolveUserID(ctx context.Context, authorization string) string {
	if authorization == "" {
		return ""
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, usersAuthURL+"/api/auth/get-session", nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Authorization", authorization)
	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		return ""
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var result struct {
		User *struct{ ID string `json:"id"` } `json:"user"`
	}
	if err := json.Unmarshal(body, &result); err != nil || result.User == nil {
		return ""
	}
	return result.User.ID
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	database, err := db.New()
	if err != nil {
		log.Fatalf("DB init failed: %v", err)
	}
	defer database.Close()

	valkeyClient := redis.NewClient(&redis.Options{
		Addr: env("VALKEY_ADDR", "localhost:6379"),
	})
	if err := valkeyClient.Ping(ctx).Err(); err != nil {
		log.Fatalf("Valkey connection failed: %v", err)
	}
	defer valkeyClient.Close()

	orderRepo := &infrastructure.PostgresOrderRepository{Pool: database.Pool}
	paymentRepo := &infrastructure.PostgresPaymentRepository{Pool: database.Pool}

	bus := infrastructure.NewValkeyEventBus(valkeyClient)

	domainConsumer := infrastructure.NewEventConsumer(valkeyClient)
	domainConsumer.Start(ctx)

	cmdConsumer := infrastructure.NewPaymentCommandConsumer(valkeyClient, paymentRepo, orderRepo, bus)
	cmdConsumer.Start(ctx)

	createOrderHandler := &application.CreateOrderHandler{
		Orders:   orderRepo,
		Products: &httpProductFetcher{url: env("PRODUCTS_SUBGRAPH_URL", "http://localhost:4002/graphql")},
		Bus:      bus,
	}
	processPaymentHandler := &application.ProcessPaymentHandler{
		Orders:     orderRepo,
		Payments:   paymentRepo,
		Bus:        bus,
		CommandBus: bus,
	}

	gqlHandler := graph.NewHandler(createOrderHandler, processPaymentHandler, orderRepo, paymentRepo)

	mux := http.NewServeMux()
	mux.Handle("/graphql", authMiddleware(gqlHandler))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("Payments Go — POST /graphql"))
	})

	srv := &http.Server{Addr: ":" + env("PORT", "4003"), Handler: mux}
	go func() {
		<-ctx.Done()
		log.Println("[payments] shutting down")
		_ = srv.Shutdown(context.Background())
	}()

	fmt.Printf("💳 Payments Go running at http://localhost:%s/graphql\n", env("PORT", "4003"))
	log.Fatal(srv.ListenAndServe())
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
