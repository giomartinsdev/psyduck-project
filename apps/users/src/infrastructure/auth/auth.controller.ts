import { All, Controller, Req, Res } from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './better-auth';
import type { Request, Response } from 'express';

// Mounts every BetterAuth route (sign-in, sign-up, sessions, OAuth2 authorize,
// token endpoint, OIDC discovery, etc.) under /api/auth/*.
@Controller('api/auth')
export class AuthController {
  private readonly handler = toNodeHandler(auth);

  @All('*')
  async handle(@Req() req: Request, @Res() res: Response) {
    // BetterAuth's toNodeHandler takes Node IncomingMessage/ServerResponse
    await this.handler(req as unknown as Parameters<typeof this.handler>[0], res as unknown as Parameters<typeof this.handler>[1]);
  }
}
