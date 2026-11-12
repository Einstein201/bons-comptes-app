import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { isSwaggerEnabled, setupSwagger } from './swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const frontendOrigin =
    process.env.FRONTEND_ORIGIN ??
    process.env.FRONTEND_URL ??
    'http://localhost:3001';
  app.enableCors({
    origin: frontendOrigin,
    credentials: true,
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  if (isSwaggerEnabled()) {
    setupSwagger(app);
  }
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
