# ── Build stage ──────────────────────────────────────────────────────────────
FROM golang:1.23-alpine AS builder
WORKDIR /app

# Copy module definition only — lets Docker cache the dep-download layer
COPY go.mod ./
RUN go mod download

# Copy source after deps are cached
COPY . .
# go mod tidy generates go.sum and reconciles any drift
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -trimpath -o payments .

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM alpine:3.19
RUN apk --no-cache add ca-certificates wget
WORKDIR /root/
COPY --from=builder /app/payments .
EXPOSE 4003
CMD ["./payments"]
