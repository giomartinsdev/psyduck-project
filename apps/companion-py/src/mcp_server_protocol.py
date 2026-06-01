"""
Proper MCP (Model Context Protocol) server implementation.

Exposes the supergraph operations as MCP tools via JSON-RPC 2.0 over HTTP POST.
The LangGraph agent uses this server via MCPClient — any standard MCP client
(Claude Desktop, other agents) can also connect to :4005/mcp.

Protocol: https://modelcontextprotocol.io/specification
Methods implemented:
  - initialize
  - tools/list   → dynamic discovery from supergraph introspection (FR-008)
  - tools/call   → execute operation against gateway
"""
import json
import logging
from fastapi import Request
from fastapi.responses import JSONResponse

from .mcp import mcp_server, TOOL_CONFIGS

log = logging.getLogger(__name__)

MCP_VERSION = "2024-11-05"


async def handle_mcp_rpc(request: Request) -> JSONResponse:
    """Single POST endpoint — handles all MCP JSON-RPC methods."""
    try:
        body = await request.json()
    except Exception:
        return _error(-32700, "Parse error", id=None)

    rpc_id = body.get("id")
    method = body.get("method", "")
    params = body.get("params", {})

    log.info("[MCP-RPC] method=%s id=%s", method, rpc_id)

    if method == "initialize":
        return _result(rpc_id, {
            "protocolVersion": MCP_VERSION,
            "capabilities": {"tools": {"listChanged": True}},
            "serverInfo": {
                "name": "techstore-supergraph-mcp",
                "version": "1.0.0",
            },
        })

    if method == "tools/list":
        # FR-008: discover available tools from the live supergraph SDL
        available = await mcp_server.list_tools()
        tools = [
            {
                "name": t["name"],
                "description": t["description"],
                "inputSchema": _input_schema(t["name"]),
            }
            for t in available
        ]
        return _result(rpc_id, {"tools": tools})

    if method == "tools/call":
        tool_name = params.get("name", "")
        arguments = params.get("arguments", {})
        # Authorization is passed via meta or arguments
        authorization = params.get("_meta", {}).get("authorization", "") or \
                        arguments.pop("_authorization", "")

        if tool_name not in TOOL_CONFIGS:
            return _error(-32602, f"Unknown tool: {tool_name}", rpc_id)

        result = await mcp_server.call_tool(tool_name, arguments, authorization)
        return _result(rpc_id, {
            "content": [{"type": "text", "text": json.dumps(result, default=str, ensure_ascii=False)}],
            "isError": isinstance(result, dict) and "error" in result,
        })

    if method == "notifications/initialized":
        # Client confirmation — no response needed
        return JSONResponse(content=None, status_code=204)

    return _error(-32601, f"Method not found: {method}", rpc_id)


def _result(rpc_id, result) -> JSONResponse:
    return JSONResponse({"jsonrpc": "2.0", "id": rpc_id, "result": result})


def _error(code: int, message: str, id) -> JSONResponse:
    return JSONResponse({"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}})


def _input_schema(tool_name: str) -> dict:
    """Generate a minimal JSON Schema for each tool's input arguments."""
    schemas: dict[str, dict] = {
        "me": {"type": "object", "properties": {}, "required": []},
        "products": {
            "type": "object",
            "properties": {
                "search":   {"type": "string", "description": "Search term"},
                "category": {"type": "string", "description": "Product category"},
            },
        },
        "featuredProducts": {"type": "object", "properties": {}, "required": []},
        "featuredPosts":    {"type": "object", "properties": {}, "required": []},
        "myOrders":         {"type": "object", "properties": {}, "required": []},
        "createOrder": {
            "type": "object",
            "required": ["product_id", "street", "city", "state", "postal_code"],
            "properties": {
                "product_id":  {"type": "string"},
                "quantity":    {"type": "integer", "default": 1},
                "street":      {"type": "string"},
                "city":        {"type": "string"},
                "state":       {"type": "string"},
                "postal_code": {"type": "string"},
                "country":     {"type": "string", "default": "Brasil"},
            },
        },
    }
    return schemas.get(tool_name, {"type": "object"})
