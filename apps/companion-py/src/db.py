import asyncpg
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            host=os.getenv("DB_HOST", "localhost"),
            port=int(os.getenv("DB_PORT", "5432")),
            database=os.getenv("DB_NAME", "companion_db"),
            user=os.getenv("DB_USER", "users_user"),
            password=os.getenv("DB_PASSWORD", "users_pwd"),
            min_size=2,
            max_size=10,
        )
        await _migrate(_pool)
    return _pool


async def _migrate(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id         UUID         PRIMARY KEY,
                user_id    TEXT         NOT NULL DEFAULT 'unknown',
                created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS messages (
                id               UUID        PRIMARY KEY,
                conversation_id  UUID        NOT NULL REFERENCES conversations(id) ON UPDATE CASCADE,
                role             TEXT        NOT NULL DEFAULT '',
                content          TEXT        NOT NULL DEFAULT '',
                tool_invocations JSONB       NOT NULL DEFAULT '[]',
                created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)


async def create_conversation(user_id: str) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO conversations (id, user_id, created_at, updated_at) "
            "VALUES ($1, $2, NOW(), NOW()) RETURNING *",
            str(uuid.uuid4()), user_id,
        )
        return dict(row)


async def get_conversation(conversation_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM conversations WHERE id = $1", conversation_id
        )
        return dict(row) if row else None


async def list_conversations(user_id: str) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC",
            user_id,
        )
        return [dict(r) for r in rows]


async def touch_conversation(conversation_id: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
            conversation_id,
        )


async def create_message(
    conversation_id: str,
    role: str,
    content: str,
    tool_invocations: list[dict] | None = None,
) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO messages (id, conversation_id, role, content, tool_invocations, created_at) "
            "VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *",
            str(uuid.uuid4()),
            conversation_id,
            role,
            content,
            json.dumps(tool_invocations or []),
        )
        return dict(row)


async def get_messages(conversation_id: str) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
            conversation_id,
        )
        return [dict(r) for r in rows]
