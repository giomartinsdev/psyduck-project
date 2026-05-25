import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { UserOrmEntity } from './infrastructure/persistence/user.orm-entity';
import { IdempotencyOrmEntity } from './infrastructure/persistence/idempotency.orm-entity';
import { UserRepository } from './infrastructure/persistence/user.repository.impl';
import { JwtService } from './infrastructure/auth/jwt.service';
import { PasswordService } from './infrastructure/auth/password.service';
import { SignUpHandler } from './application/commands/sign-up/sign-up.handler';
import { SignInHandler } from './application/commands/sign-in/sign-in.handler';
import { GetMeHandler } from './application/queries/get-me/get-me.handler';
import { UserResolver } from './graphql/user.resolver';
import { USER_REPOSITORY } from './domain/user/user.repository';

const CommandHandlers = [SignUpHandler, SignInHandler];
const QueryHandlers = [GetMeHandler];

@Module({
  imports: [
    CqrsModule,
    MikroOrmModule.forFeature([UserOrmEntity, IdempotencyOrmEntity]),
  ],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    UserResolver,
    JwtService,
    PasswordService,
    {
      provide: USER_REPOSITORY,
      useClass: UserRepository,
    },
  ],
})
export class UsersModule {}
