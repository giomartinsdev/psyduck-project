import type { FactoryProvider } from '@nestjs/common';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { bearer, oidcProvider } from 'better-auth/plugins';
import { BETTER_AUTH_DATABASE_ADAPTER_TOKEN } from './auth-database.factory';

export const BETTER_AUTH_TOKEN = 'BETTER_AUTH';

export type AuthInstance = ReturnType<typeof betterAuth>;

// ─── Factory 3: BetterAuth instance with adapter injected via DI ─────────────
// RNF-004: BetterAuth acts as the OAuth2/OIDC authorization server.
// The adapter is injected rather than hardwired so the factory chain
// (EntityManager → Kysely → kyselyAdapter → betterAuth) is fully managed
// by NestJS's DI container.
export const BetterAuthFactory = {
  provide: BETTER_AUTH_TOKEN,
  useFactory: (adapter: BetterAuthOptions['database']) => {
    return betterAuth({
      database: adapter,

      baseURL: process.env['BETTER_AUTH_URL'] ?? 'http://localhost:4001',
      secret: process.env['BETTER_AUTH_SECRET'] ?? 'dev-better-auth-secret',

      emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
      },

      session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
      },

      plugins: [
        // bearer() allows Authorization: Bearer <token> alongside cookie sessions.
        // The token returned by signInEmail can be used directly in GraphQL requests
        // or forwarded by the Gateway to subgraphs.
        bearer(),

        // oidcProvider() turns this subgraph into an OAuth2/OIDC authorization
        // server. The Companion AI is registered as a trusted client so the Gateway
        // can perform a token exchange on behalf of the logged-in user and inject
        // a delegated access token into AI subgraph requests.
        oidcProvider({
          loginPage: '/login',
          consentPage: '/consent',
          defaultScope: 'openid profile email',
          trustedClients: [
            {
              clientId: process.env['AI_OAUTH_CLIENT_ID'] ?? 'ai-companion',
              clientSecret: process.env['AI_OAUTH_CLIENT_SECRET'] ?? 'companion-dev-secret',
              redirectUrls: [
                process.env['AI_OAUTH_REDIRECT_URL'] ?? 'http://localhost:4004/auth/callback',
              ],
              name: 'Companion AI',
              type: 'web' as const,
              disabled: false,
              metadata: null,
              skipConsent: true,
            },
          ],
        }),
      ],
    });
  },
  inject: [BETTER_AUTH_DATABASE_ADAPTER_TOKEN],
} satisfies FactoryProvider;
