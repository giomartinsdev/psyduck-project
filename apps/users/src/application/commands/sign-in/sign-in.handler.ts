import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { UnauthorizedException } from '@nestjs/common';
import { SignInCommand } from './sign-in.command';
import { AuthService } from '../../../infrastructure/auth/auth.service';
import { UserSignedInEvent } from '../../../domain/user/user.events';
import type { AuthResult } from '../sign-up/sign-up.handler';

@CommandHandler(SignInCommand)
export class SignInHandler implements ICommandHandler<SignInCommand, AuthResult> {
  constructor(
    private readonly authService: AuthService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: SignInCommand): Promise<AuthResult> {
    try {
      const result = await this.authService.signIn({
        email: command.email,
        password: command.password,
      });

      this.eventBus.publish(
        new UserSignedInEvent(result.user.id, result.user.email, new Date()),
      );

      return {
        token: result.token,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          avatarUrl: result.user.image ?? null,
          createdAt: result.user.createdAt,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('INVALID_EMAIL_OR_PASSWORD') || message.includes('Invalid')) {
        throw new UnauthorizedException('Invalid credentials');
      }
      throw err;
    }
  }
}
