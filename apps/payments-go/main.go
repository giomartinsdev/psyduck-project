package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/psyduck-project/payments-go/db"
	"github.com/psyduck-project/payments-go/graph"
)

func main() {
	database, err := db.New()
	if err != nil {
		log.Fatalf("DB init failed: %v", err)
	}
	defer database.Close()

	gqlHandler := graph.NewHandler(database)

	mux := http.NewServeMux()
	mux.Handle("/graphql", authMiddleware(gqlHandler))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("Payments Go subgraph — POST /graphql"))
	})

	port := env("PORT", "4003")
	fmt.Printf("💳 Payments Go subgraph running at http://localhost:%s/graphql\n", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

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
		User *struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	if err := json.Unmarshal(body, &result); err != nil || result.User == nil {
		return ""
	}
	return result.User.ID
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
