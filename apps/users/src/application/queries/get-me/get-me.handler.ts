import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetMeQuery } from './get-me.query';
import { AuthService } from '../../../infrastructure/auth/auth.service';
import { IncomingHttpHeaders } from 'node:http';

export interface UserView {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
}

// GetMeQuery now carries the raw request headers so BetterAuth can
// verify the session token (cookie or Bearer) directly.
@QueryHandler(GetMeQuery)
export class GetMeHandler implements IQueryHandler<GetMeQuery, UserView | null> {
  constructor(private readonly authService: AuthService) {}

  async execute(query: GetMeQuery): Promise<UserView | null> {
    const session = await this.authService.getSession(query.headers as IncomingHttpHeaders);
    if (!session) return null;
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      avatarUrl: session.user.image ?? null,
      createdAt: session.user.createdAt,
    };
  }
}
