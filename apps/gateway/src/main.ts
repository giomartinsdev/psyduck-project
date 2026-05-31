import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  const port = Number(process.env['PORT'] ?? 4000);
  await app.listen(port);

  const usersUrl    = process.env['USERS_SUBGRAPH_URL']    ?? 'http://localhost:4001/graphql';
  const productsUrl = process.env['PRODUCTS_SUBGRAPH_URL'] ?? 'http://localhost:4002/graphql';
  const paymentsUrl = process.env['PAYMENTS_SUBGRAPH_URL'] ?? 'http://localhost:4003/graphql';
  const aiUrl       = process.env['AI_SUBGRAPH_URL']       ?? 'http://localhost:4004/graphql';

  console.log(`🌐 Supergraph Gateway (NestJS) ready at http://localhost:${port}/graphql`);
  console.log(`   ↳ users    → ${usersUrl}`);
  console.log(`   ↳ products → ${productsUrl}`);
  console.log(`   ↳ payments → ${paymentsUrl}`);
  console.log(`   ↳ companion→ ${aiUrl}`);
}

bootstrap().catch((err) => {
  console.error('Fatal error in Gateway:', err);
  process.exit(1);
});
