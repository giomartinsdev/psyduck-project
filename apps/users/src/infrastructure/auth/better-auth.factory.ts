import type { FactoryProvider } from '@nestjs/common';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { bearer, oidcProvider } from 'better-auth/plugins';
import { BETTER_AUTH_DATABASE_ADAPTER_TOKEN } from './auth-database.factory';

export const BETTER_AUTH_TOKEN = 'BETTER_AUTH';

export type AuthInstance = ReturnType<typeof betterAuth>;

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
        bearer(),
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
