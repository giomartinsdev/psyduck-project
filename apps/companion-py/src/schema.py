"""
Strawberry GraphQL schema for the Companion AI subgraph.

Matches the exact SDL contract from apps/companion/src/index.ts so the
Apollo Gateway federation continues to work without changes.
Federation v2 @key on AIConversation enables __resolveReference.
"""
import json
import uuid
from typing import Optional

import strawberry
import strawberry.federation
from strawberry.types import Info

from . import db as database
from .agent import run_agent


# ─── GraphQL types ────────────────────────────────────────────────────────────

@strawberry.type
class ToolInvocation:
    tool_name: str
    arguments: str
    result: Optional[str]
    status: str


@strawberry.type
class AIMessage:
    id: strawberry.ID
    role: str
    content: str
    tool_invocations: list[ToolInvocation]
    created_at: str


@strawberry.federation.type(keys=["id"])
class AIConversation:
    id: strawberry.ID
    user_id: strawberry.ID
    messages: list[AIMessage]
    created_at: str
    updated_at: str

    @classmethod
    async def resolve_reference(cls, id: strawberry.ID) -> Optional["AIConversation"]:
        row = await database.get_conversation(str(id))
        if not row:
            return None
        msgs = await database.get_messages(str(id))
        return _conv_from_row(row, msgs)


@strawberry.type
class AIMessageResponse:
    message: AIMessage
    conversation: AIConversation


# ─── Input types ──────────────────────────────────────────────────────────────

@strawberry.input
class SendAIMessageInput:
    content: str
    conversation_id: Optional[strawberry.ID] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _invocations_from_row(raw: object) -> list[ToolInvocation]:
    if isinstance(raw, str):
        try:
            items = json.loads(raw)
        except json.JSONDecodeError:
            return []
    elif isinstance(raw, list):
        items = raw
    else:
        return []
    return [
        ToolInvocation(
            tool_name=it.get("toolName", it.get("tool_name", "")),
            arguments=it.get("arguments", ""),
            result=it.get("result"),
            status=it.get("status", "SUCCESS"),
        )
        for it in items
    ]


def _msg_from_row(row: dict) -> AIMessage:
    return AIMessage(
        id=strawberry.ID(str(row["id"])),
        role=row["role"],
        content=row["content"],
        tool_invocations=_invocations_from_row(row.get("tool_invocations", [])),
        created_at=row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
    )


def _conv_from_row(row: dict, msgs: list[dict]) -> AIConversation:
    return AIConversation(
        id=strawberry.ID(str(row["id"])),
        user_id=strawberry.ID(str(row["user_id"])),
        messages=[_msg_from_row(m) for m in msgs],
        created_at=row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
        updated_at=row["updated_at"].isoformat() if hasattr(row["updated_at"], "isoformat") else str(row["updated_at"]),
    )


def _require_auth(info: Info) -> str:
    user_id = info.context.get("user_id")
    if not user_id:
        raise Exception("Unauthorized")
    return user_id


# ─── Query ────────────────────────────────────────────────────────────────────

@strawberry.type
class Query:
    @strawberry.field(name="myConversations")
    async def my_conversations(self, info: Info) -> list[AIConversation]:
        user_id = _require_auth(info)
        rows = await database.list_conversations(user_id)
        result = []
        for row in rows:
            msgs = await database.get_messages(str(row["id"]))
            result.append(_conv_from_row(row, msgs))
        return result

    @strawberry.field
    async def conversation(self, info: Info, id: strawberry.ID) -> Optional[AIConversation]:
        row = await database.get_conversation(str(id))
        if not row:
            return None
        msgs = await database.get_messages(str(id))
        return _conv_from_row(row, msgs)


# ─── Mutation ─────────────────────────────────────────────────────────────────

@strawberry.type
class Mutation:
    @strawberry.mutation(name="startConversation")
    async def start_conversation(self, info: Info) -> AIConversation:
        user_id = _require_auth(info)
        row = await database.create_conversation(user_id)
        return _conv_from_row(row, [])

    @strawberry.mutation(name="sendAIMessage")
    async def send_ai_message(
        self,
        info: Info,
        input: SendAIMessageInput,
    ) -> AIMessageResponse:
        user_id = _require_auth(info)
        # user_token: the user's original session token forwarded by the gateway.
        # Used by MCP tools when calling other subgraphs (payments, products, etc.).
        user_token = info.context.get("user_token", "") or info.context.get("authorization", "")

        # Load or create conversation
        if input.conversation_id:
            conv_row = await database.get_conversation(str(input.conversation_id))
            if not conv_row:
                raise Exception("Conversation not found")
        else:
            conv_row = await database.create_conversation(user_id)

        conv_id = str(conv_row["id"])

        # Load conversation history for context
        history_rows = await database.get_messages(conv_id)
        history = [{"role": r["role"], "content": r["content"]} for r in history_rows]

        # Persist the user message
        await database.create_message(conv_id, "USER", input.content)

        # Run the LangGraph agent (MCP tool discovery + execution)
        response_text, tool_invocations = await run_agent(
            user_message=input.content,
            authorization=user_token,   # session token — works with all subgraphs
            history=history,
        )

        # Persist the assistant reply with tool invocations
        assistant_row = await database.create_message(
            conv_id, "ASSISTANT", response_text, tool_invocations
        )
        await database.touch_conversation(conv_id)

        # Reload conversation with all messages
        all_msgs = await database.get_messages(conv_id)
        updated_conv_row = await database.get_conversation(conv_id)

        return AIMessageResponse(
            message=_msg_from_row(assistant_row),
            conversation=_conv_from_row(updated_conv_row, all_msgs),
        )


# ─── Schema ───────────────────────────────────────────────────────────────────

schema = strawberry.federation.Schema(
    query=Query,
    mutation=Mutation,
    enable_federation_2=True,
)
