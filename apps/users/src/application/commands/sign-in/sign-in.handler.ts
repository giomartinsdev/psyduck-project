import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, UnauthorizedException } from '@nestjs/common';
import { SignInCommand } from './sign-in.command';
import { IUserRepository, USER_REPOSITORY } from '../../../domain/user/user.repository';
import { JwtService } from '../../../infrastructure/auth/jwt.service';
import { PasswordService } from '../../../infrastructure/auth/password.service';
import type { AuthResult } from '../sign-up/sign-up.handler';

@CommandHandler(SignInCommand)
export class SignInHandler implements ICommandHandler<SignInCommand, AuthResult> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: SignInCommand): Promise<AuthResult> {
    const user = await this.userRepo.findByEmail(command.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await this.passwordService.compare(command.password, user.hashedPassword);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    user.recordSignIn();
    const events = user.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      name: user.name,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
    };
  }
}
