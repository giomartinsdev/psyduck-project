"""
SupergraphMCPServer — in-process MCP-style tool registry.

FR-008: Discovers available tools by introspecting the live supergraph SDL at
runtime. Any new Query/Mutation field added to the supergraph is automatically
included on the next discovery call, satisfying SC-005.

Architecture:
  list_tools()  → GET /graphql with { _service { sdl } } → parse operation names
                → intersect with TOOL_CONFIGS → return manifest
  call_tool()   → POST /graphql with the tool's query/mutation + user's token
"""
import json
import logging
import os
import re
import uuid
from typing import Any

import httpx

log = logging.getLogger(__name__)

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:4000/graphql")


# Tool configurations: description + GraphQL document + result extractor.
# The key MUST match a field name in the supergraph's Query or Mutation type.
# When a new supergraph operation is added and its name appears here, it is
# automatically made available to the LangGraph agent without code changes.
TOOL_CONFIGS: dict[str, dict] = {
    "me": {
        "description": "Get the currently authenticated user's profile (name, email). Use this when the user asks who they are, their name, account info, or wants to personalize the conversation.",
        "gql": "{ me { id name email createdAt } }",
        "vars": lambda args: {},
        "extract": lambda d: d.get("me") or {},
    },
    "products": {
        "description": "Search and browse tech products. Accepts: search (str), category (str).",
        "gql": """
            query SearchProducts($search: String, $category: String) {
              products(first: 8, search: $search, category: $category) {
                edges { node { id title price compareAtPrice stockStatus category description imageUrl } }
                totalCount
              }
            }
        """,
        "vars": lambda args: {"search": args.get("search"), "category": args.get("category")},
        "extract": lambda d: d.get("products", {}).get("edges", []),
    },
    "featuredProducts": {
        "description": "Get the store's featured/recommended products. No args required.",
        "gql": "{ featuredProducts(limit: 5) { id title price compareAtPrice stockStatus imageUrl category description } }",
        "vars": lambda args: {},
        "extract": lambda d: d.get("featuredProducts", []),
    },
    "myOrders": {
        "description": "Check the authenticated user's recent orders. No args required.",
        "gql": """
            {
              myOrders(first: 5) {
                edges { node { id status total createdAt
                  items { productTitle quantity unitPrice subtotal }
                } }
              }
            }
        """,
        "vars": lambda args: {},
        "extract": lambda d: d.get("myOrders", {}).get("edges", []),
    },
    "createOrder": {
        "description": (
            "Place a new order. Accepts: product_id (str), quantity (int), "
            "street (str), city (str), state (str), postal_code (str), country (str)."
        ),
        "gql": """
            mutation CreateOrder($input: CreateOrderInput!) {
              createOrder(input: $input) { id status total createdAt idempotencyKey }
            }
        """,
        "vars": lambda args: {
            "input": {
                "items": [{"productId": args["product_id"], "quantity": int(args.get("quantity", 1))}],
                "shippingAddress": {
                    "street":     args.get("street", ""),
                    "city":       args.get("city", ""),
                    "state":      args.get("state", ""),
                    "postalCode": args.get("postal_code", ""),
                    "country":    args.get("country", "Brasil"),
                },
                "idempotencyKey": str(uuid.uuid4()),
            }
        },
        "extract": lambda d: d.get("createOrder", {}),
    },
}


class SupergraphMCPServer:
    """
    In-process MCP server: exposes supergraph operations as discoverable tools.
    Acts as both the MCP server (tool registry) and MCP client (tool executor).
    """

    _cached_sdl: str | None = None

    async def list_tools(self) -> list[dict]:
        """
        FR-008 entry point: fetch the live SDL and return the available tool manifest.
        Only operations present in BOTH the supergraph SDL AND TOOL_CONFIGS are listed.
        """
        sdl = await self._fetch_sdl()
        if sdl:
            operation_names = self._parse_operation_names(sdl)
            log.info("[MCP] Supergraph operations discovered: %s", operation_names)
        else:
            operation_names = list(TOOL_CONFIGS.keys())
            log.warning("[MCP] SDL fetch failed; using full config as fallback")

        available = [
            {"name": name, "description": TOOL_CONFIGS[name]["description"]}
            for name in operation_names
            if name in TOOL_CONFIGS
        ]
        log.info("[MCP] Tools available to agent: %s", [t["name"] for t in available])
        return available

    async def call_tool(self, name: str, args: dict, authorization: str) -> Any:
        """Execute a discovered tool by posting GraphQL to the gateway."""
        config = TOOL_CONFIGS.get(name)
        if not config:
            return {"error": f"Unknown tool: {name}"}

        variables = config["vars"](args)
        payload: dict = {"query": config["gql"].strip()}
        if variables:
            payload["variables"] = variables

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                resp = await client.post(
                    GATEWAY_URL,
                    json=payload,
                    headers={
                        "Authorization": authorization,
                        "Content-Type": "application/json",
                    },
                )
                data = resp.json()
                if "errors" in data:
                    return {"error": data["errors"][0]["message"]}
                return config["extract"](data.get("data", {}))
            except Exception as exc:
                log.error("[MCP] Tool %s call failed: %s", name, exc)
                return {"error": str(exc)}

    # ─── Internal ─────────────────────────────────────────────────────────────

    async def _fetch_sdl(self) -> str | None:
        """
        Discover available operations via standard GraphQL introspection.
        Returns a minimal pseudo-SDL string that list_tools() can parse.
        Uses introspection rather than _service{sdl} since the gateway
        doesn't expose that endpoint at the federation level.
        """
        introspection = """{
            __schema {
                queryType    { fields { name } }
                mutationType { fields { name } }
            }
        }"""
        async with httpx.AsyncClient(timeout=5.0) as client:
            try:
                resp = await client.post(GATEWAY_URL, json={"query": introspection})
                schema = resp.json()["data"]["__schema"]
                q_fields = [f["name"] for f in (schema.get("queryType")    or {}).get("fields", [])]
                m_fields = [f["name"] for f in (schema.get("mutationType") or {}).get("fields", [])]
                # Emit a minimal pseudo-SDL that _parse_operation_names() understands
                pseudo_sdl = (
                    "type Query {\n" + "".join(f"  {n}\n" for n in q_fields) + "}\n"
                    "type Mutation {\n" + "".join(f"  {n}\n" for n in m_fields) + "}\n"
                )
                self._cached_sdl = pseudo_sdl
                return pseudo_sdl
            except Exception:
                return self._cached_sdl  # stale cache on network error

    @staticmethod
    def _parse_operation_names(sdl: str) -> list[str]:
        """
        Extract field names from the SDL's Query and Mutation type blocks.
        This is the core FR-008 mechanism: the tool manifest is derived directly
        from the live supergraph schema, not from a static list.
        """
        names: list[str] = []
        in_root_type = False
        for line in sdl.splitlines():
            stripped = line.strip()
            if re.match(r"^type\s+(Query|Mutation)\b", stripped):
                in_root_type = True
                continue
            if stripped == "}" and in_root_type:
                in_root_type = False
                continue
            if in_root_type and stripped and not stripped.startswith("#"):
                # Extract the field name (before parentheses or colon)
                match = re.match(r"^([a-zA-Z_]\w*)", stripped)
                if match:
                    names.append(match.group(1))
        return names


# Singleton — shared across all requests
mcp_server = SupergraphMCPServer()
