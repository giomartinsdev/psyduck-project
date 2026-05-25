import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, ConflictException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SignUpCommand } from './sign-up.command';
import { IUserRepository, USER_REPOSITORY } from '../../../domain/user/user.repository';
import { UserAggregate } from '../../../domain/user/user.aggregate';
import { JwtService } from '../../../infrastructure/auth/jwt.service';
import { PasswordService } from '../../../infrastructure/auth/password.service';

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
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: SignUpCommand): Promise<AuthResult> {
    const emailLower = command.email.toLowerCase().trim();

    if (await this.userRepo.existsByEmail(emailLower)) {
      throw new ConflictException(`Email already registered: ${emailLower}`);
    }

    const hashedPassword = await this.passwordService.hash(command.password);
    const user = UserAggregate.create({
      id: uuidv4(),
      email: emailLower,
      name: command.name.trim(),
      hashedPassword,
    });

    await this.userRepo.save(user);

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
