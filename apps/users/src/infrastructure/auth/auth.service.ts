import { Injectable, Inject } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import { IncomingHttpHeaders } from 'node:http';
import { BETTER_AUTH_TOKEN, type AuthInstance } from './better-auth.factory';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  createdAt: Date;
}

export interface BetterAuthSession {
  user: SessionUser;
  session: {
    id: string;
    token: string;
    userId: string;
    expiresAt: Date;
  };
}

@Injectable()
export class AuthService {
  constructor(@Inject(BETTER_AUTH_TOKEN) private readonly auth: AuthInstance) {}

  async getSession(nodeHeaders: IncomingHttpHeaders): Promise<BetterAuthSession | null> {
    const headers = fromNodeHeaders(nodeHeaders);
    const session = await this.auth.api.getSession({ headers });
    if (!session?.user) return null;
    return session as unknown as BetterAuthSession;
  }

  async signUp(params: {
    name: string;
    email: string;
    password: string;
  }): Promise<{ token: string; user: SessionUser }> {
    const response = await this.auth.api.signUpEmail({
      body: { name: params.name, email: params.email, password: params.password },
    });
    return {
      token: response.token ?? '',
      user: {
        id: response.user.id,
        email: response.user.email,
        name: response.user.name,
        image: response.user.image,
        createdAt: new Date(response.user.createdAt),
      },
    };
  }

  async signIn(params: {
    email: string;
    password: string;
  }): Promise<{ token: string; user: SessionUser }> {
    const response = await this.auth.api.signInEmail({
      body: { email: params.email, password: params.password },
    });
    return {
      token: response.token ?? '',
      user: {
        id: response.user.id,
        email: response.user.email,
        name: response.user.name,
        image: response.user.image,
        createdAt: new Date(response.user.createdAt),
      },
    };
  }

  async signOut(nodeHeaders: IncomingHttpHeaders): Promise<void> {
    await this.auth.api.signOut({ headers: fromNodeHeaders(nodeHeaders) });
  }
}
