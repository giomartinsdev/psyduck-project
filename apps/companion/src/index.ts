import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { gql } from 'graphql-tag';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// This TypeScript stub will be replaced by the Python/LangChain/Apollo MCP
// service as described in the architecture. The schema contract is preserved.

const pool = new Pool({
  host: process.env['DB_HOST'] ?? 'localhost',
  port: Number(process.env['DB_PORT'] ?? 5432),
  database: process.env['DB_NAME'] ?? 'companion_db',
  user: process.env['DB_USER'] ?? 'users_user',
  password: process.env['DB_PASSWORD'] ?? 'users_pwd',
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'unknown',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY,
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_invocations JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

type DbConversation = { id: string; user_id: string; created_at: Date; updated_at: Date };
type DbMessage = { id: string; conversation_id: string; role: string; content: string; tool_invocations: Record<string, unknown>[]; created_at: Date };

function rowToConversation(row: DbConversation, messages: ReturnType<typeof rowToMessage>[] = []) {
  return {
    id: row.id,
    userId: row.user_id,
    messages,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToMessage(row: DbMessage) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    toolInvocations: row.tool_invocations,
    createdAt: row.created_at.toISOString(),
  };
}

async function loadConversation(id: string) {
  const { rows: convRows } = await pool.query<DbConversation>('SELECT * FROM conversations WHERE id = $1', [id]);
  if (!convRows[0]) return null;
  const { rows: msgRows } = await pool.query<DbMessage>('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC', [id]);
  return rowToConversation(convRows[0], msgRows.map(rowToMessage));
}

const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

  scalar DateTime
  scalar UUID

  enum MessageRole {
    USER
    ASSISTANT
    SYSTEM
  }

  enum ToolStatus {
    PENDING
    RUNNING
    SUCCESS
    FAILED
  }

  type ToolInvocation {
    toolName: String!
    arguments: String!
    result: String
    status: ToolStatus!
  }

  type AIMessage {
    id: UUID!
    role: MessageRole!
    content: String!
    toolInvocations: [ToolInvocation!]!
    createdAt: DateTime!
  }

  type AIConversation @key(fields: "id") {
    id: UUID!
    userId: UUID!
    messages: [AIMessage!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type AIMessageResponse {
    message: AIMessage!
    conversation: AIConversation!
  }

  input SendAIMessageInput {
    conversationId: UUID
    content: String!
  }

  type Query {
    myConversations: [AIConversation!]!
    conversation(id: UUID!): AIConversation
  }

  type Mutation {
    sendAIMessage(input: SendAIMessageInput!): AIMessageResponse!
    startConversation: AIConversation!
  }
`;

const resolvers = {
  Query: {
    async myConversations() {
      const { rows } = await pool.query<DbConversation>('SELECT * FROM conversations ORDER BY updated_at DESC');
      return Promise.all(rows.map((r) => loadConversation(r.id)));
    },
    async conversation(_: unknown, { id }: { id: string }) {
      return loadConversation(id);
    },
  },
  Mutation: {
    async startConversation() {
      const id = uuidv4();
      await pool.query('INSERT INTO conversations (id) VALUES ($1)', [id]);
      return loadConversation(id);
    },
    async sendAIMessage(_: unknown, { input }: { input: { conversationId?: string; content: string } }) {
      let convId = input.conversationId;
      if (!convId) {
        convId = uuidv4();
        await pool.query('INSERT INTO conversations (id) VALUES ($1)', [convId]);
      }

      const userMsgId = uuidv4();
      await pool.query(
        'INSERT INTO messages (id, conversation_id, role, content, tool_invocations) VALUES ($1, $2, $3, $4, $5)',
        [userMsgId, convId, 'USER', input.content, JSON.stringify([])],
      );

      const assistantContent = `I found relevant products for "${input.content}". Check our **Wireless Headphones** (R$ 1.299,90) or **Mechanical Keyboard** (R$ 849,90). Shall I add one to your cart?`;
      const toolInvocations = [{ toolName: 'search_products', arguments: JSON.stringify({ query: input.content }), result: JSON.stringify({ found: 'Wireless Noise-Cancelling Headphones' }), status: 'SUCCESS' }];
      const assistantMsgId = uuidv4();
      await pool.query(
        'INSERT INTO messages (id, conversation_id, role, content, tool_invocations) VALUES ($1, $2, $3, $4, $5)',
        [assistantMsgId, convId, 'ASSISTANT', assistantContent, JSON.stringify(toolInvocations)],
      );

      await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [convId]);

      const { rows: msgRows } = await pool.query<DbMessage>('SELECT * FROM messages WHERE id = $1', [assistantMsgId]);
      const conv = await loadConversation(convId);
      return { message: rowToMessage(msgRows[0]!), conversation: conv };
    },
  },
  AIConversation: {
    async __resolveReference(ref: { id: string }) {
      return loadConversation(ref.id);
    },
  },
};

const server = new ApolloServer({ schema: buildSubgraphSchema({ typeDefs, resolvers }) });

async function main() {
  await initDb();
  const { url } = await startStandaloneServer(server, { listen: { port: Number(process.env['PORT'] ?? 4004) } });
  console.log(`🤖 Companion AI subgraph running at: ${url}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
