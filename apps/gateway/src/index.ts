import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { ApolloGateway, IntrospectAndCompose, RemoteGraphQLDataSource, GraphQLDataSourceProcessOptions } from '@apollo/gateway';

// ─── Subgraph registry ────────────────────────────────────────────────────────
const USERS_URL = process.env['USERS_SUBGRAPH_URL'] ?? 'http://localhost:4001/graphql';
const PRODUCTS_URL = process.env['PRODUCTS_SUBGRAPH_URL'] ?? 'http://localhost:4002/graphql';
const PAYMENTS_URL = process.env['PAYMENTS_SUBGRAPH_URL'] ?? 'http://localhost:4003/graphql';
const AI_URL = process.env['AI_SUBGRAPH_URL'] ?? 'http://localhost:4004/graphql';

type GatewayContext = Record<string, string>;

// ─── Auth-forwarding datasource ───────────────────────────────────────────────
// Propagates the Authorization header from the gateway request to every subgraph,
// enabling each subgraph to independently verify the caller's identity.
class AuthForwardingDataSource extends RemoteGraphQLDataSource<GatewayContext> {
  override willSendRequest({ request, context }: GraphQLDataSourceProcessOptions<GatewayContext>) {
    if (context['authorization']) {
      request.http?.headers.set('authorization', context['authorization']);
    }
    if (context['x-user-id']) {
      request.http?.headers.set('x-user-id', context['x-user-id']);
    }
  }
}

// ─── Gateway setup with IntrospectAndCompose ──────────────────────────────────
const gateway = new ApolloGateway({
  supergraphSdl: new IntrospectAndCompose({
    subgraphs: [
      { name: 'users', url: USERS_URL },
      { name: 'products', url: PRODUCTS_URL },
      { name: 'payments', url: PAYMENTS_URL },
      { name: 'companion', url: AI_URL },
    ],
    // Poll subgraphs for schema changes during development
    pollIntervalInMs: process.env['NODE_ENV'] !== 'production' ? 30_000 : undefined,
  }),
  buildService({ url }) {
    return new AuthForwardingDataSource({ url });
  },
});

// ─── Apollo Server wrapping the gateway ──────────────────────────────────────
const server = new ApolloServer({ gateway });

async function main() {
  const port = Number(process.env['PORT'] ?? 4000);
  const { url } = await startStandaloneServer(server, {
    context: async ({ req }) => {
      const auth = req.headers['authorization'] ?? '';
      const userId = req.headers['x-user-id'] ?? '';
      return {
        authorization: auth,
        'x-user-id': userId,
      };
    },
    listen: { port },
  });
  console.log(`🌐 Supergraph Gateway ready at: ${url}`);
  console.log(`   ↳ users    → ${USERS_URL}`);
  console.log(`   ↳ products → ${PRODUCTS_URL}`);
  console.log(`   ↳ payments → ${PAYMENTS_URL}`);
  console.log(`   ↳ companion→ ${AI_URL}`);
}

main().catch((err) => {
  console.error('Fatal error in Gateway:', err);
  process.exit(1);
});
