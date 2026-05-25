import { All, Controller, Inject, Req, Res } from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import { BETTER_AUTH_TOKEN, type AuthInstance } from './better-auth.factory';
import type { Request, Response } from 'express';

// Mounts every BetterAuth route under /api/auth/*:
//   POST /api/auth/sign-in/email
//   POST /api/auth/sign-up/email
//   POST /api/auth/sign-out
//   GET  /api/auth/get-session
//   GET  /api/auth/oauth2/authorize        ← OAuth2 authorization endpoint
//   POST /api/auth/oauth2/token            ← token exchange (for AI delegation)
//   GET  /.well-known/openid-configuration ← OIDC discovery
@Controller('api/auth')
export class AuthController {
  private readonly handler: ReturnType<typeof toNodeHandler>;

  constructor(@Inject(BETTER_AUTH_TOKEN) auth: AuthInstance) {
    this.handler = toNodeHandler(auth);
  }

  @All('*')
  async handle(@Req() req: Request, @Res() res: Response) {
    await this.handler(
      req as unknown as Parameters<typeof this.handler>[0],
      res as unknown as Parameters<typeof this.handler>[1],
    );
  }
}
