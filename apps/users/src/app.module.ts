import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloFederationDriver, ApolloFederationDriverConfig } from '@nestjs/apollo';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { join } from 'path';
import mikroOrmConfig from './infrastructure/persistence/mikro-orm.config';
import { UsersModule } from './users.module';
import { JwtService } from './infrastructure/auth/jwt.service';
import { buildContext } from './infrastructure/auth/auth.context';

@Module({
  imports: [
    MikroOrmModule.forRoot(mikroOrmConfig),
    GraphQLModule.forRootAsync<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      useFactory: (jwtService: JwtService) => ({
        typePaths: [join(__dirname, '**/*.graphql')],
        federationVersion: 2,
        context: ({ req }: { req: { headers: Record<string, string> } }) => {
          const auth = req.headers['authorization'] ?? '';
          return buildContext(auth, jwtService);
        },
      }),
      inject: [JwtService],
      imports: [UsersModule],
    }),
    UsersModule,
  ],
})
export class AppModule {}
