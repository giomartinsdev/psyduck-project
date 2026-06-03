import json
import logging
import os
import re
from typing import Annotated, Literal

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_ollama import ChatOllama
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from .mcp import mcp_server

log = logging.getLogger(__name__)

OLLAMA_URL   = os.getenv("OLLAMA_URL",   "http://host.docker.internal:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")

SYSTEM_PROMPT = """You are a shopping assistant for TechStore.

Your ONLY job: pick ONE tool and write a 1-line intro sentence. The system formats the data.

LANGUAGE: always match the user's language (Portuguese → PT, English → EN).

TOOL SELECTION — choose exactly one:

get_my_orders()
  USE WHEN: user mentions orders, pedidos, compras, histórico, itens do pedido,
            items of order, last order, último pedido, what did I buy, meu pedido,
            detalhes do pedido, items, purchase history
  DO NOT use search_products for ANY order-related question.

search_products(search="keyword", category=None)
  USE WHEN: user asks about a product type (monitor, keyboard, mouse pad, etc.)
  Pass ONLY the product name as search, ignore price/budget mentions.
  Example: "mouse pad de 300 reais" → search="mouse pad", category=None
  Example: "headphone barato" → search="headphone", category=None
  NEVER pass {"type":"string"} — only plain text or omit the argument.

get_featured_products()
  USE WHEN: greetings, recommendations, "what do you have", "mostrar produtos"

get_my_profile()
  USE WHEN: user asks name, account, email, "quem sou"


After the tool call write ONE short sentence intro only. Do NOT list products or prices.
Examples:
  PT: "Aqui estão seus pedidos:"
  EN: "Here are your orders:"
  PT: "Aqui estão os produtos encontrados:"
  EN: "Here's what we found:"
"""

_PRICE_RE = re.compile(
    r'\s*(de\s+|até\s+|abaixo\s+de\s+|under\s+|up\s+to\s+)?'
    r'r?\$?\s*\d[\d\.,]*\s*(reais?|brl|k|mil)?\s*',
    re.IGNORECASE,
)

_PT_EN: dict = {
    "teclado": "keyboard", "teclados": "keyboard",
    "fone de ouvido": "headphone", "fone": "headphone", "fones": "headphone",
    "audifonos": "headphone", "audifono": "headphone",
    "cadeira": "chair", "cadeiras": "chair",
    "mesa": "desk", "mesas": "desk",
    "microfone": "microphone", "microfones": "microphone",
    "câmera": "camera", "webcam": "webcam",
    "carregador": "charger", "carregadores": "charger",
    "cabo": "cable", "cabos": "cable",
    "armazenamento": "storage", "disco": "drive",
    "rato": "mouse", "ratos": "mouse",
    "suporte": "stand", "braço": "arm",
    "sem fio": "wireless", "bluetooth": "bluetooth",
    "mecânico": "mechanical", "mecânica": "mechanical",
    "ergonômico": "ergonomic", "ergonômica": "ergonomic",
    "gaming": "gaming", "gamer": "gaming",
    "alto falante": "speaker", "caixa de som": "speaker",
    "leve": "lightweight", "compacto": "compact",
    "barato": "", "caro": "", "premium": "premium",
}

_VALID_CATEGORIES = {"Electronics", "Peripherals", "Displays", "Furniture",
                     "Accessories", "Storage", "Networking", "Audio"}

_TWO_WORD_PRODUCTS = {"mouse pad", "desk mat", "cable tie"}

_SCHEMA_VALUE_RE = re.compile(r"""^\{['"]type['"]\s*:""")

_PT_PATTERN = re.compile(
    r"\b(oi|olá|ola|quero|têm|meu|minha|meus|minhas|você|voce|preciso|posso|"
    r"produto[s]?|pedido[s]?|comprar|novidade[s]?|desconto|promoção|teclado[s]?|"
    r"fone[s]?|cadeira[s]?|disponível|estoque|logado|recomenda)\b"
    r"|[ãõçáéíóúâêîôû]",
    re.IGNORECASE,
)


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    authorization: str
    tool_data: dict
    final_response: str


def make_tools(authorization: str):
    @tool
    async def search_products(search: str = "", category: str = "") -> str:
        """Search for products in the TechStore catalogue."""
        result = await mcp_server.call_tool(
            "products", {"search": search, "category": category}, authorization
        )
        return json.dumps(result, ensure_ascii=False)

    @tool
    async def get_featured_products() -> str:
        """Get the store's featured/recommended products."""
        result = await mcp_server.call_tool("featuredProducts", {}, authorization)
        return json.dumps(result, ensure_ascii=False)

    @tool
    async def get_my_orders() -> str:
        """Get the authenticated user's recent orders."""
        result = await mcp_server.call_tool("myOrders", {}, authorization)
        return json.dumps(result, ensure_ascii=False)

    @tool
    async def get_my_profile() -> str:
        """Get the user's profile (name and email)."""
        result = await mcp_server.call_tool("me", {}, authorization)
        return json.dumps(result, ensure_ascii=False)

    return [search_products, get_featured_products, get_my_orders, get_my_profile]


def _product_line(p: dict, lang: str = "en") -> str:
    title = p.get("title", "?")
    price = _fmt_brl(p.get("price", "0"))
    pid   = p.get("id", "")
    if pid:
        return f"• [**{title}**](/catalogue/{pid}) — {price}"
    return f"• **{title}** — {price}"


def _fmt_brl(v) -> str:
    try:
        return f"R$ {float(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return str(v)


async def _format_tool_data(tool_name: str, raw: str, lang: str,
                      llm_intro: str, authorization: str) -> str:
    try:
        data = json.loads(raw)
    except Exception:
        data = raw

    intro_clean = llm_intro.strip()
    _suspicious = ["r$", "monitor", "teclado", "keyboard", "mouse", "headphone",
                   "disponível", "available", "alta qualidade", "high quality",
                   "samsung", "aoc", "dell", "asus",
                   "nenhum pedido", "no order", "não fez", "nenhum item", "no items"]
    if intro_clean and not any(s in intro_clean.lower() for s in _suspicious) and len(intro_clean) < 150:
        parts = [intro_clean]
    else:
        parts = ["Aqui estão os resultados:" if lang == "pt" else "Here's what we found:"]

    if tool_name in ("search_products", "get_featured_products"):
        items = data if isinstance(data, list) else []
        unwrapped = []
        for item in items:
            node = item.get("node", item) if isinstance(item, dict) else item
            if isinstance(node, dict) and node.get("title"):
                unwrapped.append(node)

        if not unwrapped:
            no_stock = "Não temos esse item em estoque. Veja o que temos disponível:" if lang == "pt" \
                       else "We don't have that exact item. Here's what we carry:"
            parts.append(no_stock)
            featured = await mcp_server.call_tool("featuredProducts", {}, authorization)
            for p in (featured or [])[:4]:
                if isinstance(p, dict) and p.get("title"):
                    parts.append(_product_line(p, lang=""))
        else:
            for p in unwrapped[:5]:
                stock = ("✅ Em estoque" if lang == "pt" else "✅ In stock") \
                        if p.get("stockStatus") == "IN_STOCK" \
                        else ("❌ Indisponível" if lang == "pt" else "❌ Out of stock")
                parts.append(f"{_product_line(p, lang)} ({stock})")

    elif tool_name == "get_my_orders":
        edges = data if isinstance(data, list) else []
        orders = [e.get("node", e) for e in edges if isinstance(e, dict)]
        if not orders:
            parts.append("Você não tem pedidos ainda." if lang == "pt"
                         else "You don't have any orders yet.")
        else:
            header = "📦 **Seus pedidos recentes:**" if lang == "pt" \
                     else "📦 **Your recent orders:**"
            parts.append(header)
            for idx, o in enumerate(orders[:5]):
                total  = _fmt_brl(o.get("total", "0"))
                status = o.get("status", "?")
                date   = o.get("createdAt", "")[:10]
                oid    = o.get("id", "")[:8]
                parts.append(f"• **#{oid}** {date} — {status} — {total}")
                for item in o.get("items", []):
                    qty   = item.get("quantity", 1)
                    title = item.get("productTitle", "?")
                    price = _fmt_brl(item.get("unitPrice", "0"))
                    sub   = _fmt_brl(item.get("subtotal", "0"))
                    parts.append(f"  ↳ {title} ×{qty} — {price} cada (subtotal: {sub})")

    elif tool_name == "get_my_profile":
        if isinstance(data, dict) and data.get("name"):
            greeting = f"Olá, **{data['name']}**! ({data.get('email','')})" if lang == "pt" \
                       else f"Hi, **{data['name']}**! ({data.get('email','')})"
            parts = [greeting]
        else:
            parts.append("Perfil não encontrado." if lang == "pt" else "Profile not found.")

    return "\n".join(parts) if parts else (
        "Não encontrei nada." if lang == "pt" else "Nothing found."
    )


def _detect_lang(text: str) -> str:
    return "pt" if _PT_PATTERN.search(text) else "en"


def _sanitize_args(raw_args: dict) -> dict:
    safe_args: dict = {}
    for k, v in raw_args.items():
        if isinstance(v, (dict, list)):
            safe_args[k] = ""
        elif isinstance(v, str) and _SCHEMA_VALUE_RE.match(v.strip()):
            safe_args[k] = ""
        elif v is None:
            safe_args[k] = ""
        else:
            safe_args[k] = v

    if "search" in safe_args and safe_args["search"]:
        s = safe_args["search"].lower().strip()
        original = s
        for pt, en in sorted(_PT_EN.items(), key=lambda x: -len(x[0])):
            s = s.replace(pt, en if en else "").strip()
        translated = s != original
        s = _PRICE_RE.sub(" ", s).strip()
        if translated and s and len(s.split()) >= 2 and s not in _TWO_WORD_PRODUCTS:
            s = s.split()[0]
        safe_args["search"] = s.strip() or original

    if "category" in safe_args and safe_args.get("category"):
        if safe_args["category"] not in _VALID_CATEGORIES:
            safe_args["category"] = ""

    return safe_args


def build_graph(tools: list):
    llm = ChatOllama(
        model=OLLAMA_MODEL,
        base_url=OLLAMA_URL,
        temperature=0.2,
    ).bind_tools(tools)
    tool_map = {t.name: t for t in tools}

    async def call_model(state: AgentState) -> dict:
        response = await llm.ainvoke(state["messages"])
        log.info("[LLM] tool_calls=%d", len(response.tool_calls or []))
        return {"messages": [response]}

    async def call_tools(state: AgentState) -> dict:
        last = state["messages"][-1]
        tool_results = []
        tool_data = dict(state.get("tool_data") or {})
        for tc in last.tool_calls:
            safe_args = _sanitize_args(tc.get("args") or {})
            log.info("[Tool] %s(%s)", tc["name"], safe_args)
            fn = tool_map.get(tc["name"])
            try:
                result = await fn.ainvoke(safe_args) if fn else "Tool not found."
            except Exception as exc:
                log.warning("[Tool] %s failed: %s", tc["name"], exc)
                result = "[]"
            tool_data[tc["name"]] = result
            tool_results.append(ToolMessage(content=str(result), tool_call_id=tc["id"]))
        return {"messages": tool_results, "tool_data": tool_data}

    def should_continue(state: AgentState) -> Literal["call_tools", "__end__"]:
        last = state["messages"][-1]
        return "call_tools" if isinstance(last, AIMessage) and last.tool_calls else "__end__"

    g = StateGraph(AgentState)
    g.add_node("call_model", call_model)
    g.add_node("call_tools", call_tools)
    g.set_entry_point("call_model")
    g.add_conditional_edges("call_model", should_continue)
    g.add_edge("call_tools", "call_model")
    return g.compile()


async def run_agent(
    user_message: str,
    authorization: str,
    history: list[dict],
) -> tuple[str, list[dict]]:
    lang = _detect_lang(user_message)

    messages: list = [SystemMessage(content=SYSTEM_PROMPT)]
    for msg in history[-6:]:
        if msg["role"] == "USER":
            messages.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "ASSISTANT":
            messages.append(AIMessage(content=msg["content"]))
    messages.append(HumanMessage(content=user_message))

    tools = make_tools(authorization)
    graph = build_graph(tools)

    result = await graph.ainvoke(
        {"messages": messages, "authorization": authorization,
         "tool_data": {}, "final_response": ""},
        config={"recursion_limit": 8},
    )

    final_ai_msg = None
    for msg in reversed(result["messages"]):
        if isinstance(msg, AIMessage) and not msg.tool_calls:
            final_ai_msg = msg
            break
    llm_intro = (final_ai_msg.content or "") if final_ai_msg else ""

    tool_data: dict = result.get("tool_data") or {}
    if tool_data:
        last_tool = list(tool_data.keys())[-1]
        response_text = await _format_tool_data(
            last_tool, tool_data[last_tool], lang, llm_intro, authorization
        )
    else:
        response_text = llm_intro or (
            "Olá! Como posso ajudar?" if lang == "pt" else "Hi! How can I help?"
        )

    tool_invocations = []
    for msg in result["messages"]:
        if isinstance(msg, AIMessage) and msg.tool_calls:
            for tc in msg.tool_calls:
                tool_invocations.append({
                    "toolName":  tc["name"],
                    "arguments": json.dumps(tc.get("args", {})),
                    "result":    None,
                    "status":    "SUCCESS",
                })
        elif isinstance(msg, ToolMessage) and tool_invocations:
            tool_invocations[-1]["result"] = msg.content[:300]

    log.info("[Agent] tools=%s lang=%s", list(tool_data.keys()), lang)
    return response_text, tool_invocations
