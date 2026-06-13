import { join } from 'path';
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { grpc } from '@pulse/shared';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'NOTIFICATIONS_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: grpc.NOTIFICATION_PACKAGE,
          protoPath: join(__dirname, 'proto/notification.proto'),
          url: '127.0.0.1:4001',
        },
      },
    ]),
  ],
  controllers: [NotificationController],
  providers: [NotificationService],
})
export class NotificationModule {}
