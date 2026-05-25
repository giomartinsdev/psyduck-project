import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { UserOrmEntity } from './infrastructure/persistence/user.orm-entity';
import { IdempotencyOrmEntity } from './infrastructure/persistence/idempotency.orm-entity';
import { AuthService } from './infrastructure/auth/auth.service';
import { SignUpHandler } from './application/commands/sign-up/sign-up.handler';
import { SignInHandler } from './application/commands/sign-in/sign-in.handler';
import { GetMeHandler } from './application/queries/get-me/get-me.handler';
import { UserResolver } from './graphql/user.resolver';

const CommandHandlers = [SignUpHandler, SignInHandler];
const QueryHandlers = [GetMeHandler];

@Module({
  imports: [
    CqrsModule,
    // MikroORM entities kept for future domain extensions (e.g. user profiles,
    // preferences). BetterAuth manages auth-specific tables via Kysely.
    MikroOrmModule.forFeature([UserOrmEntity, IdempotencyOrmEntity]),
  ],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    UserResolver,
    AuthService,
  ],
})
export class UsersModule {}
