import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloGatewayDriver, ApolloGatewayDriverConfig } from '@nestjs/apollo';
import {
  IntrospectAndCompose,
  RemoteGraphQLDataSource,
  type GraphQLDataSourceProcessOptions,
} from '@apollo/gateway';
import type { Request } from 'express';

const USERS_URL    = process.env['USERS_SUBGRAPH_URL']    ?? 'http://localhost:4001/graphql';
const PRODUCTS_URL = process.env['PRODUCTS_SUBGRAPH_URL'] ?? 'http://localhost:4002/graphql';
const PAYMENTS_URL = process.env['PAYMENTS_SUBGRAPH_URL'] ?? 'http://localhost:4003/graphql';
const AI_URL       = process.env['AI_SUBGRAPH_URL']       ?? 'http://localhost:4004/graphql';

type GatewayContext = { authorization: string; 'x-user-id': string };

class AuthForwardingDataSource extends RemoteGraphQLDataSource<GatewayContext> {
  override willSendRequest(
    { request, context }: GraphQLDataSourceProcessOptions<GatewayContext>,
  ) {
    if (context.authorization) {
      request.http?.headers.set('authorization', context.authorization);
    }
    if (context['x-user-id']) {
      request.http?.headers.set('x-user-id', context['x-user-id']);
    }
  }
}

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloGatewayDriverConfig>({
      driver: ApolloGatewayDriver,
      server: {
        context: ({ req }: { req: Request }): GatewayContext => ({
          authorization:  (req.headers['authorization']  as string) ?? '',
          'x-user-id':   (req.headers['x-user-id']      as string) ?? '',
        }),
      },
      gateway: {
        supergraphSdl: new IntrospectAndCompose({
          subgraphs: [
            { name: 'users',    url: USERS_URL },
            { name: 'products', url: PRODUCTS_URL },
            { name: 'payments', url: PAYMENTS_URL },
            { name: 'companion',url: AI_URL },
          ],
          pollIntervalInMs: process.env['NODE_ENV'] !== 'production' ? 30_000 : undefined,
        }),
        buildService({ url }) {
          return new AuthForwardingDataSource({ url });
        },
      },
    }),
  ],
})
export class AppModule {}
