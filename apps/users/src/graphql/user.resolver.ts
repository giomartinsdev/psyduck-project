import { Resolver, Query, Mutation, Args, Context, ResolveReference } from '@nestjs/graphql';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { SignUpCommand } from '../application/commands/sign-up/sign-up.command';
import { SignInCommand } from '../application/commands/sign-in/sign-in.command';
import { GetMeQuery } from '../application/queries/get-me/get-me.query';
import { AuthService } from '../infrastructure/auth/auth.service';
import type { AuthResult } from '../application/commands/sign-up/sign-up.handler';
import type { UserView } from '../application/queries/get-me/get-me.handler';
import { IncomingHttpHeaders } from 'node:http';

interface GqlContext {
  req: { headers: IncomingHttpHeaders };
}

@Resolver('User')
export class UserResolver {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly authService: AuthService,
  ) {}

  @Query()
  async me(@Context() ctx: GqlContext): Promise<UserView | null> {
    return this.queryBus.execute(new GetMeQuery(ctx.req.headers));
  }

  @Query()
  _sdl(): string {
    return '__schema';
  }

  @Mutation()
  async signUp(
    @Args('input') input: { name: string; email: string; password: string },
  ): Promise<AuthResult> {
    return this.commandBus.execute(
      new SignUpCommand(input.name, input.email, input.password),
    );
  }

  @Mutation()
  async signIn(
    @Args('input') input: { email: string; password: string },
  ): Promise<AuthResult> {
    return this.commandBus.execute(new SignInCommand(input.email, input.password));
  }

  @Mutation()
  async signOut(@Context() ctx: GqlContext): Promise<boolean> {
    await this.authService.signOut(ctx.req.headers);
    return true;
  }

  @ResolveReference()
  async resolveReference(reference: { __typename: string; id: string }, @Context() ctx: GqlContext): Promise<UserView | null> {
    // When another subgraph references a User by id, we look it up from session
    // context or fall back to auth service lookup by userId.
    const session = await this.authService.getSession(ctx.req.headers);
    if (session?.user.id === reference.id) {
      return {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        avatarUrl: session.user.image ?? null,
        createdAt: session.user.createdAt,
      };
    }
    return null;
  }
}
