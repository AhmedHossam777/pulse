import { Module } from '@nestjs/common';
import { NotificationsConsumer } from './notification.controller';

import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationEntity, PulseDatabaseModule } from '@pulse/database';

@Module({
  controllers: [NotificationsConsumer],
  imports: [
    PulseDatabaseModule,
    TypeOrmModule.forFeature([NotificationEntity]),
  ],
})
export class AppModule {}
