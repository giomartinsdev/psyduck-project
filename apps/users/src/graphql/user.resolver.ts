import { Resolver, Query, Mutation, Args, Context, ResolveReference } from '@nestjs/graphql';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { UnauthorizedException } from '@nestjs/common';
import { SignUpCommand } from '../application/commands/sign-up/sign-up.command';
import { SignInCommand } from '../application/commands/sign-in/sign-in.command';
import { GetMeQuery } from '../application/queries/get-me/get-me.query';
import { JwtService } from '../infrastructure/auth/jwt.service';
import type { AuthResult } from '../application/commands/sign-up/sign-up.handler';
import type { UserView } from '../application/queries/get-me/get-me.handler';
import { v4 as uuidv4 } from 'uuid';

@Resolver('User')
export class UserResolver {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly jwtService: JwtService,
  ) {}

  @Query()
  async me(@Context() ctx: { userId?: string }): Promise<UserView | null> {
    if (!ctx.userId) return null;
    return this.queryBus.execute(new GetMeQuery(ctx.userId));
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
      new SignUpCommand(input.name, input.email, input.password, uuidv4()),
    );
  }

  @Mutation()
  async signIn(
    @Args('input') input: { email: string; password: string },
  ): Promise<AuthResult> {
    return this.commandBus.execute(new SignInCommand(input.email, input.password));
  }

  @Mutation()
  signOut(): boolean {
    return true;
  }

  @ResolveReference()
  async resolveReference(reference: { __typename: string; id: string }): Promise<UserView | null> {
    return this.queryBus.execute(new GetMeQuery(reference.id));
  }
}
