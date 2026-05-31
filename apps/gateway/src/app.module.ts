import 'reflect-metadata';
import crypto from 'crypto';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloGatewayDriver, ApolloGatewayDriverConfig } from '@nestjs/apollo';
import {
  IntrospectAndCompose,
  RemoteGraphQLDataSource,
  type GraphQLDataSourceProcessOptions,
} from '@apollo/gateway';
import type { Request } from 'express';

const USERS_URL    = process.env['USERS_SUBGRAPH_URL']    ?? 'http://localhost:4001/graphql';
const PRODUCTS_URL = process.env['PRODUCTS_SUBGRAPH_URL'] ?? 'http://localhost:4002/graphql';
const PAYMENTS_URL = process.env['PAYMENTS_SUBGRAPH_URL'] ?? 'http://localhost:4003/graphql';
const AI_URL       = process.env['AI_SUBGRAPH_URL']       ?? 'http://localhost:4004/graphql';

// BetterAuth OIDC authority (internal Docker URL for gateway→users calls)
const USERS_AUTH_URL = process.env['USERS_AUTH_URL'] ?? 'http://localhost:4001';
const AI_CLIENT_ID     = process.env['AI_OAUTH_CLIENT_ID']     ?? 'ai-companion';
const AI_CLIENT_SECRET = process.env['AI_OAUTH_CLIENT_SECRET'] ?? 'companion-dev-secret';
const AI_REDIRECT_URI  = process.env['AI_OAUTH_REDIRECT_URL']  ?? 'http://localhost:4004/auth/callback';

type GatewayContext = {
  authorization: string;
  'x-user-id': string;
};

// ─── OAuth2 token cache (per user session token) ──────────────────────────────
interface CachedToken { accessToken: string; expiresAt: number }
const companionTokenCache = new Map<string, CachedToken>();

// Performs the OAuth2 Authorization Code + PKCE flow server-side:
//  1. GET /authorize with the user's Bearer token → 302 with ?code=
//  2. POST /token with code + verifier → { access_token, expires_in }
// The resulting token is scoped to the ai-companion client and represents
// the authenticated user, validated by /userinfo in the companion subgraph.
async function getCompanionToken(userBearerToken: string): Promise<string | null> {
  const cached = companionTokenCache.get(userBearerToken);
  if (cached && Date.now() < cached.expiresAt - 30_000) {
    return cached.accessToken;
  }

  try {
    // PKCE code verifier + challenge
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(8).toString('base64url');

    // Step 1: Authorization endpoint — intercept the redirect, don't follow it
    const params = new URLSearchParams({
      client_id: AI_CLIENT_ID,
      redirect_uri: AI_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid profile email',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    const authorizeRes = await fetch(
      `${USERS_AUTH_URL}/api/auth/oauth2/authorize?${params}`,
      {
        method: 'GET',
        headers: { authorization: userBearerToken },
        redirect: 'manual',
      },
    );

    const location = authorizeRes.headers.get('location') ?? '';
    const codeMatch = location.match(/[?&]code=([^&]+)/);
    if (!codeMatch) return null;
    const code = decodeURIComponent(codeMatch[1]);

    // Step 2: Token exchange
    const tokenRes = await fetch(`${USERS_AUTH_URL}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: AI_REDIRECT_URI,
        client_id: AI_CLIENT_ID,
        client_secret: AI_CLIENT_SECRET,
        code_verifier: verifier,
      }),
    });

    if (!tokenRes.ok) return null;
    const tokens = await tokenRes.json() as { access_token: string; expires_in: number };
    if (!tokens.access_token) return null;

    companionTokenCache.set(userBearerToken, {
      accessToken: tokens.access_token,
      expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    });
    return tokens.access_token;
  } catch {
    return null;
  }
}

// ─── Per-subgraph data sources ────────────────────────────────────────────────

// Standard subgraphs (users, products, payments): forward the user's Bearer
// session token directly.
class SessionForwardingDataSource extends RemoteGraphQLDataSource<GatewayContext> {
  override willSendRequest({ request, context }: GraphQLDataSourceProcessOptions<GatewayContext>) {
    if (context.authorization) {
      request.http?.headers.set('authorization', context.authorization);
    }
    if (context['x-user-id']) {
      request.http?.headers.set('x-user-id', context['x-user-id']);
    }
  }
}

// AI Companion subgraph: perform the OAuth2 Authorization Code + PKCE exchange
// (FR-010) and inject the resulting access token. The companion validates it
// via BetterAuth's /userinfo endpoint to identify the user.
class CompanionDataSource extends RemoteGraphQLDataSource<GatewayContext> {
  override async willSendRequest({ request, context }: GraphQLDataSourceProcessOptions<GatewayContext>) {
    if (context.authorization) {
      const companionToken = await getCompanionToken(context.authorization);
      if (companionToken) {
        request.http?.headers.set('authorization', `Bearer ${companionToken}`);
        // Forward original token as fallback for the companion's get-session path
        request.http?.headers.set('x-user-token', context.authorization);
      }
      // If exchange failed, still forward the session token as fallback
      if (!companionToken) {
        request.http?.headers.set('authorization', context.authorization);
      }
    }
    if (context['x-user-id']) {
      request.http?.headers.set('x-user-id', context['x-user-id']);
    }
  }
}

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloGatewayDriverConfig>({
      driver: ApolloGatewayDriver,
      server: {
        context: ({ req }: { req: Request }): GatewayContext => ({
          authorization:  (req.headers['authorization']  as string) ?? '',
          'x-user-id':   (req.headers['x-user-id']      as string) ?? '',
        }),
      },
      gateway: {
        supergraphSdl: new IntrospectAndCompose({
          subgraphs: [
            { name: 'users',    url: USERS_URL },
            { name: 'products', url: PRODUCTS_URL },
            { name: 'payments', url: PAYMENTS_URL },
            { name: 'companion',url: AI_URL },
          ],
          pollIntervalInMs: process.env['NODE_ENV'] !== 'production' ? 30_000 : undefined,
        }),
        buildService({ url }) {
          if (url === AI_URL) return new CompanionDataSource({ url });
          return new SessionForwardingDataSource({ url });
        },
      },
    }),
  ],
})
export class AppModule {}
