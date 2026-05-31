import 'reflect-metadata';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { GraphQLError } from 'graphql';
import { gql } from 'graphql-tag';
import { MikroORM } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/postgresql';
import { v4 as uuidv4 } from 'uuid';
import { ConversationEntity } from './conversation.entity';
import { MessageEntity } from './message.entity';

const USERS_AUTH_URL = process.env['USERS_AUTH_URL'] ?? 'http://localhost:4001';

// ─── Auth ─────────────────────────────────────────────────────────────────────
type Context = { userId: string | null };

// Resolves the user ID from the incoming Authorization header.
//
// FR-010 flow: the gateway exchanges the user's session token for an OAuth2
// access token scoped to ai-companion (via Authorization Code + PKCE against
// BetterAuth's OIDC provider). This companion subgraph validates that token
// by calling /oauth2/userinfo, which returns the authenticated user's sub.
//
// Fallback: if the token is an older-style session token (direct calls,
// not via gateway), /get-session is tried as a secondary path.
async function resolveUserId(authorization: string): Promise<string | null> {
  if (!authorization.startsWith('Bearer ')) return null;
  try {
    // Primary: validate as OAuth2 access token via OIDC userinfo endpoint.
    // The gateway issues these after the authorization_code + PKCE exchange.
    const uiRes = await fetch(`${USERS_AUTH_URL}/api/auth/oauth2/userinfo`, {
      headers: { authorization },
    });
    if (uiRes.ok) {
      const ui = await uiRes.json() as { sub?: string };
      if (ui.sub) return ui.sub;
    }
  } catch { /* fall through to session fallback */ }

  try {
    // Fallback: validate as a raw BetterAuth session token (bearer plugin).
    const res = await fetch(`${USERS_AUTH_URL}/api/auth/get-session`, {
      headers: { authorization },
    });
    const data = await res.json() as { user?: { id: string } };
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

function requireAuth(ctx: Context): string {
  if (!ctx.userId) throw new GraphQLError('Unauthorized', { extensions: { code: 'UNAUTHORIZED' } });
  return ctx.userId;
}

// ─── MikroORM ─────────────────────────────────────────────────────────────────
let orm: MikroORM;

async function initOrm() {
  orm = await MikroORM.init(defineConfig({
    host: process.env['DB_HOST'] ?? 'localhost',
    port: Number(process.env['DB_PORT'] ?? 5432),
    dbName: process.env['DB_NAME'] ?? 'companion_db',
    user: process.env['DB_USER'] ?? 'users_user',
    password: process.env['DB_PASSWORD'] ?? 'users_pwd',
    entities: [ConversationEntity, MessageEntity],
    debug: false,
  }));
  await orm.schema.updateSchema({ safe: true });
}

// ─── Mappers ──────────────────────────────────────────────────────────────────
function toMessage(m: MessageEntity) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    toolInvocations: m.toolInvocations,
    createdAt: m.createdAt.toISOString(),
  };
}

function toConversation(c: ConversationEntity) {
  return {
    id: c.id,
    userId: c.userId,
    messages: c.messages.isInitialized() ? c.messages.getItems().map(toMessage) : [],
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// ─── SDL ──────────────────────────────────────────────────────────────────────
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

// ─── Resolvers ────────────────────────────────────────────────────────────────
const resolvers = {
  Query: {
    async myConversations(_: unknown, __: unknown, ctx: unknown) {
      const userId = requireAuth(ctx as Context);
      const em = orm.em.fork();
      const conversations = await em.find(ConversationEntity, { userId }, {
        populate: ['messages'],
        orderBy: { updatedAt: 'DESC' },
      });
      return conversations.map(toConversation);
    },

    async conversation(_: unknown, { id }: { id: string }) {
      const em = orm.em.fork();
      const c = await em.findOne(ConversationEntity, { id }, { populate: ['messages'] });
      return c ? toConversation(c) : null;
    },
  },

  Mutation: {
    async startConversation(_: unknown, __: unknown, ctx: unknown) {
      const userId = requireAuth(ctx as Context);
      const em = orm.em.fork();
      const conv = em.create(ConversationEntity, { userId, createdAt: new Date(), updatedAt: new Date() });
      await em.persistAndFlush(conv);
      return toConversation(conv);
    },

    async sendAIMessage(_: unknown, { input }: { input: { conversationId?: string; content: string } }, ctx: unknown) {
      const userId = requireAuth(ctx as Context);
      const em = orm.em.fork();

      let conv: ConversationEntity;
      if (input.conversationId) {
        conv = await em.findOneOrFail(ConversationEntity, { id: input.conversationId }, { populate: ['messages'] });
      } else {
        conv = em.create(ConversationEntity, { userId, createdAt: new Date(), updatedAt: new Date() });
        await em.persistAndFlush(conv);
        await em.populate(conv, ['messages']);
      }

      const userMsg = em.create(MessageEntity, {
        conversation: conv,
        role: 'USER',
        content: input.content,
        toolInvocations: [],
        createdAt: new Date(),
      });

      const assistantContent = `I found relevant products for "${input.content}". Check our **Wireless Headphones** (R$ 1.299,90) or **Mechanical Keyboard** (R$ 849,90). Shall I add one to your cart?`;
      const toolInvocations = [{
        toolName: 'search_products',
        arguments: JSON.stringify({ query: input.content }),
        result: JSON.stringify({ found: 'Wireless Noise-Cancelling Headphones' }),
        status: 'SUCCESS',
      }];

      const assistantMsg = em.create(MessageEntity, {
        conversation: conv,
        role: 'ASSISTANT',
        content: assistantContent,
        toolInvocations,
        createdAt: new Date(),
      });

      conv.updatedAt = new Date();
      await em.persistAndFlush([userMsg, assistantMsg, conv]);

      // Reload with all messages for the response
      const updated = await em.findOneOrFail(ConversationEntity, { id: conv.id }, { populate: ['messages'] });

      return {
        message: toMessage(assistantMsg),
        conversation: toConversation(updated),
      };
    },
  },

  AIConversation: {
    async __resolveReference(ref: { id: string }) {
      const em = orm.em.fork();
      const c = await em.findOne(ConversationEntity, { id: ref.id }, { populate: ['messages'] });
      return c ? toConversation(c) : null;
    },
  },
};

// ─── Bootstrap ────────────────────────────────────────────────────────────────
const server = new ApolloServer<Context>({ schema: buildSubgraphSchema({ typeDefs, resolvers }) });

async function main() {
  await initOrm();
  const { url } = await startStandaloneServer(server, {
    context: async ({ req }) => ({
      userId: await resolveUserId(req.headers['authorization'] ?? ''),
    }),
    listen: { port: Number(process.env['PORT'] ?? 4004) },
  });
  console.log(`🤖 Companion AI subgraph running at: ${url}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
