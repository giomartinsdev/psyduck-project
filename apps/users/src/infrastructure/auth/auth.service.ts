import { Injectable } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import { IncomingHttpHeaders } from 'node:http';
import { auth } from './better-auth';

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
  async getSession(nodeHeaders: IncomingHttpHeaders): Promise<BetterAuthSession | null> {
    const headers = fromNodeHeaders(nodeHeaders);
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return null;
    return session as unknown as BetterAuthSession;
  }

  async signUp(params: {
    name: string;
    email: string;
    password: string;
    headers?: Headers;
  }): Promise<{ token: string; user: SessionUser }> {
    const response = await auth.api.signUpEmail({
      body: {
        name: params.name,
        email: params.email,
        password: params.password,
      },
      headers: params.headers,
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
    headers?: Headers;
  }): Promise<{ token: string; user: SessionUser }> {
    const response = await auth.api.signInEmail({
      body: {
        email: params.email,
        password: params.password,
      },
      headers: params.headers,
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
    await auth.api.signOut({ headers: fromNodeHeaders(nodeHeaders) });
  }
}
