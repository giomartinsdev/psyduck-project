'use client';

import { ApolloClient, InMemoryCache, HttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { MockLink } from '../mocks/handlers';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

let apolloClient: ApolloClient<unknown> | null = null;

const authLink = setContext((_, { headers }: { headers: Record<string, string> }) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('mock_token') : null;
  return {
    headers: {
      ...headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
});

function createApolloClient() {
  const link = USE_MOCKS
    ? new MockLink()
    : from([
        authLink,
        new HttpLink({
          uri: process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:4000/graphql',
        }),
      ]);

  return new ApolloClient({
    link,
    cache: new InMemoryCache({
      typePolicies: {
        Query: {
          fields: {
            products: {
              keyArgs: ['category', 'search'],
              merge(existing, incoming) {
                if (!existing) return incoming;
                return {
                  ...incoming,
                  edges: [...(existing.edges ?? []), ...(incoming.edges ?? [])],
                };
              },
            },
            myOrders: {
              keyArgs: [],
              merge(existing, incoming) {
                if (!existing) return incoming;
                return {
                  ...incoming,
                  edges: [...(existing.edges ?? []), ...(incoming.edges ?? [])],
                };
              },
            },
          },
        },
      },
    }),
    devtools: {
      enabled: process.env.NODE_ENV === 'development',
    },
    defaultOptions: {
      watchQuery: { fetchPolicy: 'cache-first' },
    },
  });
}

export function getApolloClient() {
  if (typeof window === 'undefined') {
    // Server: always create new instance
    return createApolloClient();
  }
  // Client: reuse singleton
  if (!apolloClient) {
    apolloClient = createApolloClient();
  }
  return apolloClient;
}
