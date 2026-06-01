"""FastAPI application — auth middleware, startup, GraphQL router."""
import logging
import os

import httpx
from fastapi import FastAPI, Request
from strawberry.fastapi import GraphQLRouter

from .schema import schema
from . import db as database
from .mcp_server_protocol import handle_mcp_rpc

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)

USERS_AUTH_URL = os.getenv("USERS_AUTH_URL", "http://localhost:4001")


# ─── Auth ─────────────────────────────────────────────────────────────────────

async def resolve_user_id(authorization: str) -> str | None:
    """
    FR-010: The gateway injects an OAuth2 access token scoped to ai-companion.
    Validate it via BetterAuth's /oauth2/userinfo → extract sub (user ID).
    Fallback: try /api/auth/get-session for direct session tokens.
    """
    if not authorization.startswith("Bearer "):
        return None

    async with httpx.AsyncClient(timeout=5.0) as client:
        # Primary: OAuth2 access token (issued by gateway via authorization_code + PKCE)
        try:
            resp = await client.get(
                f"{USERS_AUTH_URL}/api/auth/oauth2/userinfo",
                headers={"Authorization": authorization},
            )
            if resp.is_success:
                data = resp.json()
                if data.get("sub"):
                    return data["sub"]
        except Exception:
            pass

        # Fallback: BetterAuth session token
        try:
            resp = await client.get(
                f"{USERS_AUTH_URL}/api/auth/get-session",
                headers={"Authorization": authorization},
            )
            if resp.is_success:
                data = resp.json()
                return data.get("user", {}).get("id")
        except Exception:
            pass

    return None


# ─── Context factory ──────────────────────────────────────────────────────────

async def get_context(request: Request) -> dict:
    authorization = request.headers.get("authorization", "")
    user_id = await resolve_user_id(authorization)
    # Gateway sends the user's original session token in x-user-token.
    # MCP tools must use this when calling other subgraphs (payments, products, etc.)
    # because those subgraphs validate session tokens, not the companion's OAuth2 token.
    user_token = request.headers.get("x-user-token", "") or authorization
    return {"user_id": user_id, "authorization": authorization, "user_token": user_token}


# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(title="Companion AI Subgraph", version="1.0.0")

graphql_router = GraphQLRouter(schema, context_getter=get_context)
app.include_router(graphql_router, prefix="/graphql")

# ─── MCP JSON-RPC endpoint (Model Context Protocol) ──────────────────────────
# Any MCP-compatible client (Claude Desktop, other agents) can connect here.
# tools/list  → dynamic discovery from supergraph introspection
# tools/call  → execute operation against the gateway
@app.post("/mcp")
async def mcp_endpoint(request: Request):
    return await handle_mcp_rpc(request)


@app.on_event("startup")
async def startup() -> None:
    await database.get_pool()
    log.info("🤖 Companion AI subgraph (Python/LangGraph/MCP) running at :4004/graphql")
    log.info("   MCP JSON-RPC server at :4004/mcp (tools/list + tools/call)")


@app.on_event("shutdown")
async def shutdown() -> None:
    pool = await database.get_pool()
    await pool.close()
