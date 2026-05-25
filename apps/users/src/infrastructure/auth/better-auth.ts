import { betterAuth } from 'better-auth';
import { kyselyAdapter } from '@better-auth/kysely-adapter';
import { bearer } from 'better-auth/plugins';
import { oidcProvider } from 'better-auth/plugins';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

// ─── Kysely PostgreSQL connection (shared with BetterAuth) ────────────────────
export const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number(process.env['DB_PORT'] ?? 5432),
      database: process.env['DB_NAME'] ?? 'users_db',
      user: process.env['DB_USER'] ?? 'users_user',
      password: process.env['DB_PASSWORD'] ?? 'users_pwd',
    }),
  }),
});

// ─── BetterAuth instance ──────────────────────────────────────────────────────
// Acts as the central identity provider and OAuth2 authorization server.
// RNF-004: Mandatory use of BetterAuth as OAuth2 Provider for token delegation
// to the Companion AI subgraph.
export const auth = betterAuth({
  database: kyselyAdapter(db, { type: 'postgres' }),

  // Core email/password strategy
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // refresh if older than 1 day
  },

  plugins: [
    // bearer() enables Authorization: Bearer <session-token> in addition to cookies.
    // This allows the Gateway and subgraphs to authenticate headlessly via the
    // token returned on sign-in, without relying on cookies.
    bearer(),

    // oidcProvider acts as an OAuth2/OIDC authorization server.
    // The Companion AI subgraph authenticates using tokens issued here,
    // fulfilling the OAuth2 token delegation requirement from RNF-004.
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

export type Auth = typeof auth;
