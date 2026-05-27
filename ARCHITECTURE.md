# Psyduck Project — Architecture & Developer Handbook

> Estado do sistema em 2026-05-25. Documento destinado a qualquer IA ou developer que precise continuar o trabalho.

---

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Mapa de Serviços](#2-mapa-de-serviços)
3. [Como Rodar Tudo](#3-como-rodar-tudo)
4. [Banco de Dados](#4-banco-de-dados)
5. [Gateway — Supergraph Federation](#5-gateway--supergraph-federation)
6. [Users Subgraph — NestJS + BetterAuth](#6-users-subgraph--nestjs--betterauth)
7. [Products Subgraph](#7-products-subgraph)
8. [Payments Subgraph](#8-payments-subgraph)
9. [Companion AI Subgraph](#9-companion-ai-subgraph)
10. [Web App (Next.js)](#10-web-app-nextjs)
11. [Schema GraphQL Unificado](#11-schema-graphql-unificado)
12. [Autenticação — Fluxo Completo](#12-autenticação--fluxo-completo)
13. [O que Está em Memória (Estado Volátil)](#13-o-que-está-em-memória-estado-volátil)
14. [O que Precisa Ser Feito](#14-o-que-precisa-ser-feito)
15. [Decisões Técnicas e Contexto](#15-decisões-técnicas-e-contexto)

---

## 1. Visão Geral

Sistema de e-commerce federado com 5 serviços independentes comunicando-se via **Apollo Federation v2**. O único ponto de entrada externo é o **Gateway** na porta 4000. Cada subgraph pode ser desenvolvido, deployado e testado de forma independente.

```
Cliente (Web/Mobile)
        │
        ▼
  Gateway :4000  ──── Apollo Federation IntrospectAndCompose
        │
        ├──► Users :4001      (NestJS + BetterAuth + PostgreSQL)
        ├──► Products :4002   (Node.js standalone + WooCommerce/mock)
        ├──► Payments :4003   (Node.js standalone + in-memory)
        └──► Companion :4004  (Node.js standalone + in-memory AI stub)
```

**Stack:**
- Monorepo npm workspaces (`apps/*`)
- TypeScript em todos os serviços
- Apollo Federation v2 com `IntrospectAndCompose` (sem Rover CLI)
- NestJS v10 apenas no Users subgraph
- Docker Compose para infraestrutura (PostgreSQL + WordPress/MySQL)

---

## 2. Mapa de Serviços

| Serviço | Porta | Framework | Persistência | Status |
|---------|-------|-----------|--------------|--------|
| Gateway | 4000 | Apollo Server + ApolloGateway | — | Produção |
| Users | 4001 | NestJS + MikroORM + BetterAuth | PostgreSQL :5432 | Produção |
| Products | 4002 | Apollo Server standalone | WooCommerce GraphQL / mock in-memory | Produção (mock ativo) |
| Payments | 4003 | Apollo Server standalone | In-memory (volátil) | Stub funcional |
| Companion | 4004 | Apollo Server standalone | In-memory (volátil) | Stub funcional |
| Web | — | Next.js 14 App Router | — | Existe mas não testado com o stack |
| WordPress | 8080 | WordPress + WooCommerce | MySQL :3306 | Opcional (mock fallback ativo) |
| PostgreSQL | 5432 | Docker postgres:16-alpine | Volume `postgres_data` | Rodando |
| MySQL | 3306 | Docker mysql:8.0 | Volume `db_data` | Opcional |

---

## 3. Como Rodar Tudo

### Pré-requisitos

```bash
node >= 20
npm >= 10
docker + docker compose
```

### 1. Infraestrutura (PostgreSQL obrigatório, WordPress opcional)

```bash
# Da raiz do monorepo
docker compose up -d postgres

# Se quiser o WordPress também (não obrigatório — Products tem mock)
docker compose up -d
```

### 2. Instalar dependências

```bash
# Da raiz do monorepo
npm install
```

### 3. Subir os serviços (terminais separados)

```bash
# Terminal 1 — Users subgraph (DEVE ser o primeiro — faz as migrations)
npm run dev:users

# Terminal 2 — Products subgraph
npm run dev:products

# Terminal 3 — Payments subgraph
npm run dev:payments

# Terminal 4 — Companion AI subgraph
npm run dev:companion

# Terminal 5 — Gateway (DEVE ser o último — precisa dos 4 subgraphs up)
npm run dev:gateway
```

### 4. Verificar

```bash
# Health check do gateway
curl http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
# → {"data":{"__typename":"Query"}}

# OIDC discovery
curl http://localhost:4001/api/auth/.well-known/openid-configuration
```

### Scripts disponíveis na raiz (`package.json`)

```json
{
  "dev:gateway":  "npm run dev --workspace=apps/gateway",
  "dev:users":    "npm run dev --workspace=apps/users",
  "dev:products": "npm run dev --workspace=apps/products",
  "dev:payments": "npm run dev --workspace=apps/payments",
  "dev:companion":"npm run dev --workspace=apps/companion"
}
```

### Scripts do Users subgraph (`apps/users/package.json`)

```bash
npm run dev              # ts-node src/main.ts (dev com auto-migration)
npm run build            # tsc
npm run start            # node dist/main.js (produção)
npm run migration:create # mikro-orm migration:create
npm run migration:up     # mikro-orm migration:up
```

---

## 4. Banco de Dados

### PostgreSQL (Users subgraph)

**Conexão:**
```
host:     localhost:5432
database: users_db
user:     users_user
password: users_pwd
```

**Variáveis de ambiente** (`apps/users/.env`):
```env
PORT=4001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=users_db
DB_USER=users_user
DB_PASSWORD=users_pwd
NODE_ENV=development
RUN_MIGRATIONS=false

# BetterAuth OAuth2 client para o Companion AI
AI_OAUTH_CLIENT_ID=ai-companion
AI_OAUTH_CLIENT_SECRET=companion-dev-secret
AI_OAUTH_REDIRECT_URL=http://localhost:4004/auth/callback

# BetterAuth
BETTER_AUTH_URL=http://localhost:4001
BETTER_AUTH_SECRET=dev-better-auth-secret-change-in-prod
```

### Tabelas existentes

O banco tem **duas origens de schema** — MikroORM (domínio) e BetterAuth (auth):

#### Tabelas do MikroORM (domínio)

| Tabela | Descrição |
|--------|-----------|
| `mikro_orm_migrations` | Controle de migrations executadas |
| _(sem migrations aplicadas ainda)_ | `users` e `idempotency_keys` definidas como entidades mas sem migration gerada |

> **ATENÇÃO:** As entidades `UserOrmEntity` (`users`) e `IdempotencyOrmEntity` (`idempotency_keys`) estão definidas no código mas **não têm migration criada**. O MikroORM está configurado mas `orm.getMigrator().up()` só roda migrações existentes na pasta `src/infrastructure/persistence/migrations/` — que está **vazia**. Isso significa que essas tabelas ainda não existem no banco. Precisa gerar e aplicar a migration (ver seção 14).

#### Tabelas do BetterAuth (criadas automaticamente no boot)

| Tabela | Descrição |
|--------|-----------|
| `user` | Usuários registrados (id TEXT, email, name, email_verified, image, created_at, updated_at) |
| `session` | Sessões ativas (id, token, user_id FK, expires_at, ip_address, user_agent) |
| `account` | Contas vinculadas (email+password, OAuth providers) |
| `verification` | Tokens de verificação de e-mail |
| `oauth_application` | Aplicações OAuth2 registradas (Companion AI) |
| `oauth_access_token` | Access/refresh tokens emitidos |
| `oauth_consent` | Consentimentos OAuth2 do usuário |

#### Schema detalhado das tabelas BetterAuth

```sql
-- user
id TEXT PRIMARY KEY
name TEXT NOT NULL
email TEXT NOT NULL UNIQUE
email_verified BOOLEAN NOT NULL
image TEXT
created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP

-- session
id TEXT PRIMARY KEY
token TEXT NOT NULL UNIQUE
user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
expires_at TIMESTAMPTZ NOT NULL
created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMPTZ NOT NULL
ip_address TEXT
user_agent TEXT

-- account
id TEXT PRIMARY KEY
account_id TEXT NOT NULL
provider_id TEXT NOT NULL         -- "credential" para email+password
user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
access_token TEXT
refresh_token TEXT
id_token TEXT
access_token_expires_at TIMESTAMPTZ
refresh_token_expires_at TIMESTAMPTZ
scope TEXT
password TEXT                     -- hash bcrypt da senha (provider "credential")
created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMPTZ NOT NULL

-- oauth_application
id TEXT PRIMARY KEY
name TEXT NOT NULL
client_id TEXT NOT NULL UNIQUE
client_secret TEXT
redirect_urls TEXT NOT NULL       -- JSON serializado
type TEXT NOT NULL                -- "web"
disabled BOOLEAN
user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE

-- oauth_access_token
id TEXT PRIMARY KEY
access_token TEXT NOT NULL UNIQUE
refresh_token TEXT NOT NULL UNIQUE
client_id TEXT NOT NULL REFERENCES oauth_application(client_id) ON DELETE CASCADE
user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE
scopes TEXT NOT NULL
access_token_expires_at TIMESTAMPTZ NOT NULL
refresh_token_expires_at TIMESTAMPTZ NOT NULL
```

### MySQL (WordPress/WooCommerce — opcional)

```
host:     localhost:3306
database: wordpress
user:     wordpress_user
password: wordpress_pwd
root:     wordpress_root_pwd
```

Usado exclusivamente pelo Products subgraph via WooCommerce GraphQL (`http://localhost:8080/graphql`). Se o WordPress não estiver rodando, o Products subgraph usa automaticamente o mock in-memory.

---

## 5. Gateway — Supergraph Federation

**Arquivo:** `apps/gateway/src/index.ts`

**Dependências:** `@apollo/gateway ^2.7.5`, `@apollo/server ^4.10.4`

### Como funciona

O gateway usa `IntrospectAndCompose` — ele **introspeta os schemas dos subgraphs em runtime**, sem precisar de Rover CLI ou supergraph SDL pré-compilado. Faz polling a cada 30s em desenvolvimento.

```typescript
const gateway = new ApolloGateway({
  supergraphSdl: new IntrospectAndCompose({
    subgraphs: [
      { name: 'users',    url: 'http://localhost:4001/graphql' },
      { name: 'products', url: 'http://localhost:4002/graphql' },
      { name: 'payments', url: 'http://localhost:4003/graphql' },
      { name: 'companion',url: 'http://localhost:4004/graphql' },
    ],
    pollIntervalInMs: 30_000, // só em NODE_ENV !== 'production'
  }),
  buildService({ url }) {
    return new AuthForwardingDataSource({ url });
  },
});
```

### Propagação de Auth

`AuthForwardingDataSource` estende `RemoteGraphQLDataSource` e propaga os headers `authorization` e `x-user-id` de cada request de entrada para todos os subgraphs downstream:

```typescript
class AuthForwardingDataSource extends RemoteGraphQLDataSource<GatewayContext> {
  override willSendRequest({ request, context }) {
    if (context['authorization']) {
      request.http?.headers.set('authorization', context['authorization']);
    }
    if (context['x-user-id']) {
      request.http?.headers.set('x-user-id', context['x-user-id']);
    }
  }
}
```

### Variáveis de ambiente do Gateway

```env
PORT=4000                                          # default
USERS_SUBGRAPH_URL=http://localhost:4001/graphql   # default
PRODUCTS_SUBGRAPH_URL=http://localhost:4002/graphql
PAYMENTS_SUBGRAPH_URL=http://localhost:4003/graphql
AI_SUBGRAPH_URL=http://localhost:4004/graphql
```

---

## 6. Users Subgraph — NestJS + BetterAuth

**Porta:** 4001  
**Arquivo principal:** `apps/users/src/main.ts`  
**Framework:** NestJS 10 com CQRS, MikroORM 6, BetterAuth 1.6.11

### Arquitetura interna

```
src/
├── main.ts                          # Bootstrap: migrations + listen
├── app.module.ts                    # GraphQL + MikroORM + UsersModule
├── users.module.ts                  # CQRS + BetterAuth providers + resolvers

├── domain/user/
│   ├── user.aggregate.ts            # UserAggregate (Aggregate Root DDD)
│   ├── user.value-objects.ts        # Email, HashedPassword
│   ├── user.events.ts               # UserRegisteredEvent, UserSignedInEvent
│   └── user.repository.ts           # IUserRepository interface

├── application/
│   ├── commands/sign-up/            # SignUpCommand + SignUpHandler
│   ├── commands/sign-in/            # SignInCommand + SignInHandler
│   └── queries/get-me/              # GetMeQuery + GetMeHandler

├── infrastructure/
│   ├── auth/
│   │   ├── auth-database.factory.ts # DI: EntityManager → Kysely → kyselyAdapter
│   │   ├── better-auth.factory.ts   # DI: kyselyAdapter → betterAuth instance
│   │   ├── auth.service.ts          # Wrapper injetável sobre auth.api.*
│   │   └── auth.controller.ts       # @All('api/auth/*') → toNodeHandler(auth)
│   └── persistence/
│       ├── mikro-orm.config.ts      # Configuração MikroORM + migrations path
│       ├── user.orm-entity.ts       # @Entity tableName: 'users'
│       ├── idempotency.orm-entity.ts# @Entity tableName: 'idempotency_keys'
│       ├── user.repository.impl.ts  # IUserRepository via MikroORM
│       └── migrations/              # VAZIA — ver seção 14

└── graphql/
    ├── user.schema.graphql          # SDL federado
    └── user.resolver.ts             # @Resolver('User') com CQRS
```

### Cadeia de DI do BetterAuth

```
EntityManager (MikroORM, injetado automaticamente)
    ↓  AuthDatabaseKyselyFactory
Kysely<Record<string,unknown>>  (via AbstractSqlConnection.getKnex())
    ↓  BetterAuthDatabaseAdapterFactory
kyselyAdapter(kysely, { type: 'postgres' })
    ↓  BetterAuthFactory
betterAuth({ database: adapter, plugins: [bearer(), oidcProvider()] })
    ↓  AuthService
authService.signUp() / signIn() / signOut() / getSession()
```

Todos os providers usam o padrão `satisfies FactoryProvider` do NestJS.

### BetterAuth — configuração

```typescript
betterAuth({
  database: adapter,                    // kyselyAdapter injetado via DI
  baseURL: 'http://localhost:4001',
  secret: 'dev-better-auth-secret-change-in-prod',
  emailAndPassword: { enabled: true, requireEmailVerification: false },
  session: { expiresIn: 604800, updateAge: 86400 }, // 7d / 1d
  plugins: [
    bearer(),         // suporte a Authorization: Bearer <token>
    oidcProvider({    // OAuth2/OIDC server (RNF-004)
      loginPage: '/login',
      consentPage: '/consent',
      defaultScope: 'openid profile email',
      trustedClients: [{
        clientId: 'ai-companion',
        clientSecret: 'companion-dev-secret',
        redirectUrls: ['http://localhost:4004/auth/callback'],
        name: 'Companion AI',
        type: 'web',
        skipConsent: true,  // sem tela de consentimento para o AI
      }],
    }),
  ],
})
```

### Rotas HTTP do BetterAuth (montadas em `/api/auth/*`)

| Método | Path | Descrição |
|--------|------|-----------|
| POST | `/api/auth/sign-up/email` | Cadastro com e-mail+senha |
| POST | `/api/auth/sign-in/email` | Login, retorna token |
| POST | `/api/auth/sign-out` | Invalida sessão |
| GET | `/api/auth/get-session` | Retorna sessão ativa |
| GET | `/api/auth/oauth2/authorize` | Authorization endpoint (OAuth2) |
| POST | `/api/auth/oauth2/token` | Token exchange |
| GET | `/api/auth/.well-known/openid-configuration` | OIDC discovery |

### GraphQL Schema (users subgraph)

```graphql
extend schema
  @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

type User @key(fields: "id") {
  id: UUID!
  email: String!
  name: String!
  avatarUrl: String
  createdAt: DateTime!
}

type AuthPayload { token: String!; user: User! }

input SignInInput { email: String!; password: String! }
input SignUpInput { name: String!; email: String!; password: String! }

type Query  { me: User; _sdl: String! }
type Mutation {
  signIn(input: SignInInput!): AuthPayload!
  signUp(input: SignUpInput!): AuthPayload!
  signOut: Boolean!
}
```

### Processo de bootstrap (main.ts)

1. `NestFactory.create(AppModule)` — NestJS sobe, MikroORM conecta ao PostgreSQL
2. Se `RUN_MIGRATIONS=true` **ou** `NODE_ENV !== 'production'`: roda `orm.getMigrator().up()` (MikroORM migrations da pasta `migrations/`)
3. Busca a instância `betterAuth` do DI e a instância `Kysely` do DI
4. Chama `getMigrations({ ...auth.options, database: { db: kysely, type: 'postgres' } })` para obter as migrations do BetterAuth
5. Roda `runMigrations()` — cria/atualiza as tabelas `user`, `session`, `account`, etc.
6. Captura erro `42701` (duplicate_column) — indica que as tabelas já existem, é seguro ignorar
7. `app.listen(4001)`

### Nota importante sobre o `CamelCasePlugin` do Kysely

O `AuthDatabaseKyselyFactory` instancia o Kysely **com** `CamelCasePlugin`. Isso significa que o Kysely converte automaticamente `camelCase → snake_case` nas queries SQL. O BetterAuth usa `camelCase` internamente e o banco usa `snake_case` nas colunas — o plugin faz a ponte.

---

## 7. Products Subgraph

**Porta:** 4002  
**Arquivo:** `apps/products/src/index.ts`  
**Framework:** Apollo Server standalone + `buildSubgraphSchema`

### Estratégia de dados

Tenta buscar do WordPress/WooCommerce GraphQL (`http://localhost:8080/graphql`). Se falhar (timeout, conexão recusada), **cai automaticamente no mock in-memory** sem quebrar.

```typescript
async function fetchWP(query, variables) {
  try {
    const res = await fetch(WP_GRAPHQL_URL, { ... });
    return await res.json();
  } catch {
    console.warn('[Products] WP unavailable, using mock fallback');
    return null; // sinal para usar mock
  }
}
```

### Mapeamento WP ID ↔ UUID

WooCommerce usa IDs base64 (`post:16`). O subgraph converte bidireccionalmente:
- `p1000001-0000-0000-0000-000000000016` ↔ `cG9zdDoxNg==` (base64 de `post:16`)
- `b2000001-0000-0000-0000-000000000012` ↔ base64 de `post:12` (posts do blog)

### Mock data (16 produtos + 12 posts)

IDs dos produtos mock: `p1000001-0000-0000-0000-000000000001` até `...000016`  
IDs dos posts mock: `b2000001-0000-0000-0000-000000000001` até `...000012`

### Paginação

Relay cursor pagination: cursor = base64(`offset:N`). Suporta `first` e `after`.

### GraphQL Schema (products subgraph)

```graphql
type Product @key(fields: "id") { id, slug, title, description, price, compareAtPrice,
  imageUrl, galleryImages, stockStatus, inventoryCount, category, tags, createdAt }

type Post @key(fields: "id") { id, slug, title, excerpt, content, imageUrl,
  category, tags, publishedAt, author }

type Query {
  products(first: Int, after: String, category: String, search: String): ProductConnection!
  product(id: UUID!): Product
  featuredProducts(limit: Int): [Product!]!
  posts(first: Int, after: String, category: String): PostConnection!
  post(id: UUID!): Post
  featuredPosts(limit: Int): [Post!]!
}
```

---

## 8. Payments Subgraph

**Porta:** 4003  
**Arquivo:** `apps/payments/src/index.ts`  
**Persistência:** In-memory (arrays JavaScript — dados perdidos ao reiniciar)

### Idempotência

Usa um `Map<string, unknown>` para garantir idempotência:
- `createOrder` com mesma `idempotencyKey` → retorna o mesmo `Order`
- `processPayment` com mesma `idempotencyKey` → retorna o mesmo `Payment`

```typescript
const idempotency = new Map<string, unknown>();
// Chave: "order:<idempotencyKey>" ou "payment:<idempotencyKey>"
```

### GraphQL Schema (payments subgraph)

```graphql
type Order @key(fields: "id") {
  id, userId, status: OrderStatus, items: [OrderItem!]!,
  shippingAddress: ShippingAddress!, subtotal: Decimal!, total: Decimal!,
  payment: Payment, idempotencyKey: String!, createdAt, updatedAt
}

type Payment { id, orderId, status: PaymentStatus, amount, currency, idempotencyKey, processedAt }

input CreateOrderInput {
  items: [OrderItemInput!]!     # { productId: UUID!, quantity: Int! }
  shippingAddress: ShippingAddressInput!
  idempotencyKey: String!
}

input ProcessPaymentInput {
  orderId: UUID!
  idempotencyKey: String!
}

type Mutation {
  createOrder(input: CreateOrderInput!): Order!
  processPayment(input: ProcessPaymentInput!): Payment!
}

type Query {
  myOrders(first: Int, after: String): OrderConnection!
  order(id: UUID!): Order
}
```

### Comportamento atual do `createOrder`

O stub não busca preços reais do Products subgraph. Usa `unitPrice: '99.00'` fixo para todos os itens. Isso é um placeholder — veja seção 14.

---

## 9. Companion AI Subgraph

**Porta:** 4004  
**Arquivo:** `apps/companion/src/index.ts`  
**Persistência:** In-memory (arrays JavaScript — dados perdidos ao reiniciar)

### Comportamento atual

O stub retorna uma resposta hardcoded de AI simulando busca de produtos:
```
"I found relevant products for '<query>'. Check our **Wireless Headphones** (R$ 1.299,90)
or **Mechanical Keyboard** (R$ 849,90). Shall I add one to your cart?"
```

Inclui um `ToolInvocation` simulado (`search_products`) para demonstrar o formato da resposta.

### GraphQL Schema (companion subgraph)

```graphql
type AIConversation @key(fields: "id") {
  id, userId, messages: [AIMessage!]!, createdAt, updatedAt
}

type AIMessage { id, role: MessageRole!, content: String!,
  toolInvocations: [ToolInvocation!]!, createdAt }

type AIMessageResponse {
  message: AIMessage!
  conversation: AIConversation!
}

input SendAIMessageInput {
  conversationId: UUID   # null = cria nova conversa
  content: String!
}

type Mutation {
  startConversation: AIConversation!
  sendAIMessage(input: SendAIMessageInput!): AIMessageResponse!
}

type Query {
  myConversations: [AIConversation!]!
  conversation(id: UUID!): AIConversation
}
```

---

## 10. Web App (Next.js)

**Localização:** `apps/web/`  
**Framework:** Next.js 14 App Router  
**Estado:** Existe, tem Apollo Client configurado (`src/lib/apollo-client.ts`) apontando para o gateway, mas **não foi integrado nem testado** com o stack atual.

---

## 11. Schema GraphQL Unificado

Todos os types visíveis no Gateway (após composição):

```
Query: me, products, product, featuredProducts, posts, post, featuredPosts,
       myOrders, order, myConversations, conversation, _sdl

Mutation: signUp, signIn, signOut, createOrder, processPayment,
          startConversation, sendAIMessage

Scalars: DateTime, UUID, Decimal

Types: User, AuthPayload, Product, Post, Order, OrderItem, Payment,
       ShippingAddress, AIConversation, AIMessage, AIMessageResponse, ToolInvocation

Enums: StockStatus, OrderStatus, PaymentStatus, MessageRole, ToolStatus

Connections (Relay): ProductConnection, PostConnection, OrderConnection
                     + respectivos Edge e PageInfo
```

---

## 12. Autenticação — Fluxo Completo

### Registro e Login (Bearer Token)

```
1. POST /graphql  mutation { signUp(input: { name, email, password }) { token user { id } } }
                             ↓
2. Users subgraph → AuthService.signUp() → auth.api.signUpEmail()
                             ↓
3. BetterAuth: cria user na tabela "user", cria account (provider: "credential"),
               cria session, retorna { token, user }
                             ↓
4. O token é um Bearer token de sessão (não JWT) — opaco, validado via DB
                             ↓
5. Próximas requests: Authorization: Bearer <token>
                      Gateway propaga o header para todos os subgraphs
                             ↓
6. Users subgraph: auth.api.getSession({ headers }) → verifica token na tabela "session"
```

### Token de Sessão vs JWT

BetterAuth com `bearer()` retorna tokens de sessão **opacos** armazenados na tabela `session`. **Não são JWTs**. Para obter JWTs, seria necessário configurar o plugin `jwt()` separadamente.

### OAuth2 / OIDC (Companion AI)

```
OIDC Discovery:  GET  http://localhost:4001/api/auth/.well-known/openid-configuration
Authorization:   GET  http://localhost:4001/api/auth/oauth2/authorize
Token Exchange:  POST http://localhost:4001/api/auth/oauth2/token

Client registrado:
  clientId:     ai-companion
  clientSecret: companion-dev-secret
  redirectUrl:  http://localhost:4004/auth/callback
  skipConsent:  true
```

---

## 13. O que Está em Memória (Estado Volátil)

Os seguintes dados são **perdidos ao reiniciar** os serviços:

| Serviço | Dados voláteis |
|---------|---------------|
| Payments (:4003) | Todos os Orders e Payments |
| Companion (:4004) | Todas as AIConversations e AIMessages |

Os seguintes dados são **persistidos**:

| Dado | Onde |
|------|------|
| Users, Sessions, Accounts | PostgreSQL — tabelas BetterAuth |
| OAuth applications/tokens | PostgreSQL — tabelas BetterAuth |

---

## 14. O que Precisa Ser Feito

### Pendências imediatas

#### 1. Gerar migrations do MikroORM para as tabelas de domínio

As entidades `UserOrmEntity` (`users`) e `IdempotencyOrmEntity` (`idempotency_keys`) estão definidas mas **nunca foram migradas para o banco**. A pasta `apps/users/src/infrastructure/persistence/migrations/` está vazia.

```bash
cd apps/users
npm run migration:create -- --name=CreateUsersAndIdempotencyKeys
npm run migration:up
```

> **Contexto:** O sistema hoje funciona porque BetterAuth usa sua própria tabela `user` (não a tabela `users` do MikroORM). Mas quando implementar o `UserRepository` real (persistência de domain objects), precisará dessas tabelas.

#### 2. Persistência real no Payments subgraph

Substituir os arrays in-memory por PostgreSQL (ou outro banco). O subgraph perdeu todos os dados de Orders/Payments ao reiniciar. Precisa de schema SQL + conexão.

#### 3. Persistência real no Companion subgraph

Idem — conversas são perdidas no restart. Substituir pelo banco de dados ou pelo serviço Python/LangChain mencionado no TODO do código.

#### 4. Implementar Companion AI real

O arquivo `apps/companion/src/index.ts` tem um comentário explícito:
```
// This TypeScript stub will be replaced by the Python/LangChain/Apollo MCP
// service as described in the architecture. The schema contract is preserved.
```

O schema GraphQL (contrato) está definido e testado. O serviço Python precisa implementar as mesmas mutations/queries respeitando o SDL.

#### 5. Autenticação nos subgraphs não-Users

Payments e Companion recebem o header `Authorization: Bearer <token>` via gateway mas **não verificam a sessão**. O campo `userId` nos Orders e Conversations está hardcoded como `'unknown'`. Precisa chamar o Users subgraph (via federation `@key`) ou expor um endpoint interno para validar o token.

#### 6. `createOrder` precisa buscar preço real

O stub usa `unitPrice: '99.00'` fixo. Precisa chamar o Products subgraph para obter o preço real do produto antes de criar o pedido.

#### 7. Web App — integração com o stack

`apps/web/` tem Apollo Client configurado mas não foi integrado nem testado com os subgraphs reais.

#### 8. Variáveis de ambiente de produção

- `BETTER_AUTH_SECRET` precisa ser uma string forte gerada aleatoriamente
- `AI_OAUTH_CLIENT_SECRET` precisa ser rotacionado
- Credenciais do banco precisam ser gerenciadas via secrets manager

### Itens opcionais / melhorias

- Configurar Rover CLI + supergraph SDL compilado em vez de `IntrospectAndCompose` (melhor para produção)
- Adicionar `@nestjs/swagger` ou similar para documentar as rotas REST do BetterAuth
- Adicionar healthcheck endpoints (`/health`) em cada subgraph
- Configurar JWT plugin no BetterAuth para tokens stateless se necessário

---

## 15. Decisões Técnicas e Contexto

### Por que `IntrospectAndCompose` e não Rover CLI?

`IntrospectAndCompose` é mais simples para desenvolvimento — sem etapa de compilação do supergraph SDL. Em produção, Apollo recomenda usar o Managed Federation ou compilar o SDL com `rover supergraph compose`. O schema polling a cada 30s é aceitável em dev.

### Por que BetterAuth via Kysely e não direto?

Requisito RNF-004 — BetterAuth é obrigatório. O BetterAuth não tem adapter nativo para MikroORM. A solução foi criar uma cadeia de DI:
1. Extrair as configurações de conexão do MikroORM via `AbstractSqlConnection.getKnex()`
2. Criar um `pg.Pool` com essas configs
3. Criar um `Kysely` com esse pool
4. Passar o Kysely para `kyselyAdapter()` do `@better-auth/kysely-adapter`

Isso garante que BetterAuth e MikroORM usam o mesmo servidor PostgreSQL sem duplicar configuração de conexão.

### Por que a tabela `user` (BetterAuth) e não a tabela `users` (MikroORM)?

Situação atual: BetterAuth gerencia `user` (singular, sua tabela nativa). MikroORM gerenciaria `users` (plural, tabela de domínio). São **tabelas separadas** com propósitos diferentes:
- `user` (BetterAuth): identidade, sessões, OAuth
- `users` (MikroORM, ainda não criada): aggregate root do domínio com campos específicos do negócio

O `UserRepository` implementado em `user.repository.impl.ts` aponta para `users`, não para `user`. Quando a migration for criada e aplicada, os dois sistemas coexistirão. O `SignUpHandler` hoje usa apenas BetterAuth (tabela `user`) — a sincronização com a tabela `users` de domínio seria responsabilidade de um event handler ouvindo `UserRegisteredEvent`.

### Por que `CamelCasePlugin` no Kysely?

BetterAuth escreve queries com nomes de colunas em `camelCase` (ex: `userId`). O banco PostgreSQL usa `snake_case` (ex: `user_id`). O `CamelCasePlugin` do Kysely converte automaticamente, sem necessidade de mapear cada coluna manualmente.

### Por que o erro `42701` é ignorado no boot?

BetterAuth 1.6.11: `runMigrations()` não é totalmente idempotente. Na segunda inicialização, tenta `ALTER TABLE ADD COLUMN` em colunas que já existem, causando `ERROR 42701: column already exists`. É seguro ignorar — o schema já está correto. Qualquer outro erro (ex: `42P01: table does not exist`) é relançado normalmente.

### Por que os tokens não são JWTs?

O plugin `bearer()` do BetterAuth emite tokens de sessão opacos, não JWTs. São armazenados na tabela `session` e validados via lookup no banco. Vantagem: podem ser revogados imediatamente. Desvantagem: toda validação requer acesso ao banco. Para stateless/JWT, seria necessário adicionar o plugin `jwt()` ao BetterAuth.
