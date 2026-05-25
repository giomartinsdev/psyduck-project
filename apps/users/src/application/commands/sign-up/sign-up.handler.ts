import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { ConflictException } from '@nestjs/common';
import { SignUpCommand } from './sign-up.command';
import { AuthService } from '../../../infrastructure/auth/auth.service';
import { UserRegisteredEvent } from '../../../domain/user/user.events';

export interface AuthResult {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    createdAt: Date;
  };
}

@CommandHandler(SignUpCommand)
export class SignUpHandler implements ICommandHandler<SignUpCommand, AuthResult> {
  constructor(
    private readonly authService: AuthService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: SignUpCommand): Promise<AuthResult> {
    try {
      const result = await this.authService.signUp({
        name: command.name,
        email: command.email,
        password: command.password,
      });

      // Publish domain event — BetterAuth persisted the user, we announce the fact
      this.eventBus.publish(
        new UserRegisteredEvent(result.user.id, result.user.email, result.user.name, result.user.createdAt),
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
      if (message.includes('USER_ALREADY_EXISTS') || message.includes('already')) {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }
  }
}
