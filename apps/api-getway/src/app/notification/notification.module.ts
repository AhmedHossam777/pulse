import { join } from 'path';
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { grpc } from '@pulse/shared';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationEntity, PulseDatabaseModule } from '@pulse/database';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'NOTIFICATIONS_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: grpc.NOTIFICATION_PACKAGE,
          protoPath: join(__dirname, 'proto/notification.proto'),
          url: process.env.NOTIFICATION_GRPC_URL ?? '127.0.0.1:4001',
        },
      },
    ]),
    TypeOrmModule.forFeature([NotificationEntity]),
    PulseDatabaseModule,
  ],
  controllers: [NotificationController],
  providers: [NotificationService],
})
export class NotificationModule {}
