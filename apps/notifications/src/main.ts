import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { grpc } from '@pulse/shared';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const url = process.env.NOTIFICATION_GRPC_URL ?? '0.0.0.0:4001';

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: grpc.NOTIFICATION_PACKAGE,
        protoPath: join(__dirname, 'proto/notification.proto'),
        url,
      },
    },
  );

  await app.listen();
  console.log(`notifications microservice listening on gRPC at ${url}`);
}

void bootstrap();