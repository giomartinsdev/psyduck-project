import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloFederationDriver, ApolloFederationDriverConfig } from '@nestjs/apollo';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { join } from 'path';
import mikroOrmConfig from './infrastructure/persistence/mikro-orm.config';
import { UsersModule } from './users.module';
import type { Request } from 'express';

@Module({
  imports: [
    MikroOrmModule.forRoot(mikroOrmConfig),
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      typePaths: [join(__dirname, '**/*.graphql')],
      context: ({ req }: { req: Request }) => ({ req }),
    }),
    UsersModule,
  ],
})
export class AppModule {}
