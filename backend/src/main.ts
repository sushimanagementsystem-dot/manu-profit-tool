import { randomUUID } from 'node:crypto';

import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { ProblemExceptionFilter } from './common/problem-exception.filter';
import { APP_CONFIG } from './config/config.module';
import type { AppConfig } from './config/env.schema';
import { UPLOAD_LIMITS } from './files/upload-limits';

// Node's own .env loader; in production the environment is set by the host instead.
try {
  process.loadEnvFile();
} catch {
  // No .env file on disk — fall through to the real environment.
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Signed n8n callbacks are verified against the exact bytes received.
    rawBody: true,
    bodyParser: true,
    logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
  });
  const config = app.get<AppConfig>(APP_CONFIG);

  app.setGlobalPrefix('api/v1');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use((request: Request, response: Response, next: NextFunction) => {
    const id = (request.headers['x-request-id'] as string | undefined) ?? randomUUID();
    (request as Request & { id: string }).id = id;
    response.setHeader('x-request-id', id);
    next();
  });
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors({
    origin: config.FRONTEND_ORIGIN,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['authorization', 'content-type', 'idempotency-key'],
    maxAge: 86_400,
  });
  app.useGlobalFilters(new ProblemExceptionFilter());
  app.set('trust proxy', 1);
  app.enableShutdownHooks();

  await app.listen(config.PORT);
  new Logger('Bootstrap').log(
    `Menu Profit API on http://localhost:${config.PORT}/api/v1 (max upload ${UPLOAD_LIMITS.maxFileBytes / 1024 / 1024} MB)`,
  );
}

void bootstrap();
