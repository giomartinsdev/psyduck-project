# Companion AI Subgraph (Python)

FastAPI service that provides an AI-powered shopping assistant. Uses LangGraph to orchestrate a ReAct agent loop backed by a local Ollama model. The service also exposes a Model Context Protocol (MCP) endpoint so it can be connected to Claude Desktop or any other MCP-compatible client.

## Responsibilities

- Accept natural-language shopping queries from authenticated users
- Run a LangGraph agent that uses the `search_products` tool to query the federated catalog
- Persist conversation history in PostgreSQL
- Validate user identity via OAuth2 tokens issued by the Users service (FR-010)
- Expose an MCP JSON-RPC server for tool discovery and invocation

## Port

`4004`

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Language | Python 3.12 |
| Web framework | FastAPI |
| GraphQL | Strawberry |
| AI framework | LangGraph + LangChain-Ollama |
| LLM | Ollama (default: `llama3.2:3b`) |
| Database | PostgreSQL via AsyncPG |
| Auth | OAuth2 access token validation (BetterAuth `/oauth2/userinfo`) |

## Prerequisites

Ollama must be running on the **host machine** (not inside Docker) with the target model pulled:

```bash
# Install Ollama: https://ollama.com
ollama pull llama3.2:3b

# Verify it's running
curl http://localhost:11434/api/tags
```

The Companion container reaches Ollama at `http://host.docker.internal:11434`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `companion_db` | Database name |
| `DB_USER` | `users_user` | Database user |
| `DB_PASSWORD` | `users_pwd` | Database password |
| `USERS_AUTH_URL` | `http://localhost:4001` | Users service base URL (for token validation) |
| `GATEWAY_URL` | `http://localhost:4000/graphql` | Gateway GraphQL URL (used by MCP tools) |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `llama3.2:3b` | Model name to use for inference |

## How to Run

### With Docker Compose (recommended)

```bash
docker compose up -d companion
```

Requires `postgres` and `users` to be healthy, and Ollama running on the host.

### Local Dev

```bash
# Start infrastructure
docker compose up -d postgres

# Create a virtual environment
cd apps/companion-py
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the service
uvicorn src.main:app --reload --port 4004
# → http://localhost:4004/graphql
# → http://localhost:4004/mcp  (MCP JSON-RPC)
```

### Build Docker Image

```bash
cd apps/companion-py
docker build -t psyduck-companion-py .
docker run -p 4004:4004 \
  -e USERS_AUTH_URL=http://host.docker.internal:4001 \
  -e OLLAMA_URL=http://host.docker.internal:11434 \
  psyduck-companion-py
```

## GraphQL Schema

### Mutations

```graphql
# Start a new conversation
startConversation: AIConversation!

# Send a message and get the AI response
sendAIMessage(input: SendAIMessageInput!): AIMessageResponse!
```

### Queries

```graphql
# Get all conversations for the authenticated user
myConversations: [AIConversation!]!

# Get a specific conversation by ID
conversation(id: UUID!): AIConversation
```

### Types

```graphql
type AIConversation {
  id: UUID!
  userId: String!
  messages: [AIMessage!]!
  createdAt: DateTime!
}

type AIMessage {
  id: UUID!
  role: MessageRole!
  content: String!
  toolInvocations: [ToolInvocation]
  createdAt: DateTime!
}

enum MessageRole { user assistant }

input SendAIMessageInput {
  conversationId: UUID!
  content: String!
}
```

## Authentication Flow (FR-010)

```
User → Gateway → Companion
                    │
                    ├── Authorization: Bearer <oauth2-access-token>
                    │   (issued by Gateway via Authorization Code + PKCE)
                    │
                    ├── GET /api/auth/oauth2/userinfo  ← BetterAuth (Users service)
                    │   → { "sub": "<user-id>", "email": "...", ... }
                    │
                    └── Conversation scoped to resolved user ID
```

If the OAuth2 token validation fails, the service falls back to validating a direct BetterAuth session token via `/api/auth/get-session`.

## MCP Server

The `/mcp` endpoint implements the Model Context Protocol JSON-RPC 2.0 protocol. Any MCP-compatible client (e.g., Claude Desktop) can connect to it for tool discovery and execution.

### Connecting Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "psyduck": {
      "url": "http://localhost:4004/mcp"
    }
  }
}
```

### Available Tools (via `tools/list`)

Tools are discovered dynamically at request time by introspecting the Gateway's supergraph schema.

**`search_products`**
Search the product catalog by keyword, category, or budget.

```json
{
  "method": "tools/call",
  "params": {
    "name": "search_products",
    "arguments": {
      "query": "waterproof running shoes under $100"
    }
  }
}
```

## Agent Loop

The LangGraph agent runs a ReAct (Reasoning + Acting) loop:

```
User message
     │
     ▼
LLM reasoning (Ollama llama3.2:3b)
     │
     ├── [tool call] → search_products → Gateway GraphQL → Products subgraph
     │                                                         │
     │                ←─────────────── tool result ───────────┘
     │
     └── [final answer] → returned to user
```

The agent retries up to 5 tool calls before producing a final answer. Conversation context is included in every LLM call for multi-turn coherence.

## Project Layout

```
apps/companion-py/
├── Dockerfile
├── requirements.txt
└── src/
    ├── main.py               FastAPI app, auth middleware, startup
    ├── schema.py             Strawberry GraphQL schema
    ├── agent.py              LangGraph agent definition
    ├── mcp_server_protocol.py MCP JSON-RPC handler
    └── db.py                 AsyncPG connection pool
```

## Switching Models

Set `OLLAMA_MODEL` to any model available in your Ollama installation:

```bash
ollama pull mistral
OLLAMA_MODEL=mistral uvicorn src.main:app --port 4004
```

Larger models produce better product recommendations but require more RAM.
