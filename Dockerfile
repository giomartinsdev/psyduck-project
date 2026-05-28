FROM node:20-alpine
WORKDIR /app

# Copy manifests first so dependency layer is cached independently of source - gio aprova isso aqui :)
COPY package.json package-lock.json tsconfig.base.json tsconfig.json nx.json ./
COPY apps/gateway/package.json   ./apps/gateway/
COPY apps/users/package.json     ./apps/users/
COPY apps/products/package.json  ./apps/products/
COPY apps/payments/package.json  ./apps/payments/
COPY apps/companion/package.json ./apps/companion/
COPY apps/web/package.json       ./apps/web/

RUN npm ci

COPY . .
