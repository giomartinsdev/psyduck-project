import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { UserOrmEntity } from './infrastructure/persistence/user.orm-entity';
import { IdempotencyOrmEntity } from './infrastructure/persistence/idempotency.orm-entity';
import {
  AuthDatabaseKyselyFactory,
  BetterAuthDatabaseAdapterFactory,
} from './infrastructure/auth/auth-database.factory';
import { BetterAuthFactory } from './infrastructure/auth/better-auth.factory';
import { AuthService } from './infrastructure/auth/auth.service';
import { AuthController } from './infrastructure/auth/auth.controller';
import { SignUpHandler } from './application/commands/sign-up/sign-up.handler';
import { SignInHandler } from './application/commands/sign-in/sign-in.handler';
import { GetMeHandler } from './application/queries/get-me/get-me.handler';
import { UserResolver } from './graphql/user.resolver';

const CommandHandlers = [SignUpHandler, SignInHandler];
const QueryHandlers = [GetMeHandler];

// Factory chain: EntityManager → Kysely → kyselyAdapter → betterAuth instance
// Each step is a NestJS FactoryProvider so the DI container owns the lifecycle.
const BetterAuthProviders = [
  AuthDatabaseKyselyFactory,
  BetterAuthDatabaseAdapterFactory,
  BetterAuthFactory,
];

@Module({
  imports: [
    CqrsModule,
    MikroOrmModule.forFeature([UserOrmEntity, IdempotencyOrmEntity]),
  ],
  providers: [
    ...BetterAuthProviders,
    ...CommandHandlers,
    ...QueryHandlers,
    AuthService,
    UserResolver,
  ],
  controllers: [AuthController],
})
export class UsersModule {}
