import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { gql } from 'graphql-tag';
import { v4 as uuidv4 } from 'uuid';

// ─── Federated SDL ─────────────────────────────────────────────────────────────
// This TypeScript stub will be replaced by the Python/LangChain/Apollo MCP
// service as described in the architecture. The schema contract is preserved.
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

const conversations: Record<string, unknown>[] = [];

const resolvers = {
  Query: {
    myConversations: () => conversations,
    conversation(_: unknown, { id }: { id: string }) {
      return conversations.find((c) => (c as { id: string }).id === id) ?? null;
    },
  },
  Mutation: {
    startConversation() {
      const conv = { id: uuidv4(), userId: 'unknown', messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      conversations.push(conv);
      return conv;
    },
    sendAIMessage(_: unknown, { input }: { input: { conversationId?: string; content: string } }) {
      let conv = conversations.find((c) => (c as { id: string }).id === input.conversationId) as Record<string, unknown> | undefined;
      if (!conv) {
        conv = { id: uuidv4(), userId: 'unknown', messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        conversations.push(conv);
      }
      const msgs = conv['messages'] as unknown[];
      const userMsg = { id: uuidv4(), role: 'USER', content: input.content, toolInvocations: [], createdAt: new Date().toISOString() };
      const assistantMsg = {
        id: uuidv4(),
        role: 'ASSISTANT',
        content: `I found relevant products for "${input.content}". Check our **Wireless Headphones** (R$ 1.299,90) or **Mechanical Keyboard** (R$ 849,90). Shall I add one to your cart?`,
        toolInvocations: [{ toolName: 'search_products', arguments: JSON.stringify({ query: input.content }), result: JSON.stringify({ found: 'Wireless Noise-Cancelling Headphones' }), status: 'SUCCESS' }],
        createdAt: new Date().toISOString(),
      };
      msgs.push(userMsg, assistantMsg);
      conv['updatedAt'] = new Date().toISOString();
      return { message: assistantMsg, conversation: conv };
    },
  },
  AIConversation: {
    __resolveReference(ref: { id: string }) {
      return conversations.find((c) => (c as { id: string }).id === ref.id) ?? null;
    },
  },
};

const server = new ApolloServer({ schema: buildSubgraphSchema({ typeDefs, resolvers }) });

startStandaloneServer(server, { listen: { port: Number(process.env['PORT'] ?? 4004) } })
  .then(({ url }) => console.log(`🤖 Companion AI subgraph running at: ${url}`))
  .catch((err) => { console.error(err); process.exit(1); });
