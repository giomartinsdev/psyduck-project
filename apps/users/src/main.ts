import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MikroORM } from '@mikro-orm/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'error', 'warn'] });

  // Auto-run migrations on startup in non-production or if explicitly set
  if (process.env['RUN_MIGRATIONS'] === 'true' || process.env['NODE_ENV'] !== 'production') {
    const orm = app.get<MikroORM>(MikroORM);
    await orm.getMigrator().up();
  }

  const port = Number(process.env['PORT'] ?? 4001);
  await app.listen(port);
  console.log(`🚀 Users subgraph running at http://localhost:${port}/graphql`);
}

bootstrap().catch((err) => {
  console.error('Fatal error in Users subgraph:', err);
  process.exit(1);
});
