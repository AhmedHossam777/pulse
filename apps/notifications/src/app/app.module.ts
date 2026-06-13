import { Module } from '@nestjs/common';
import { NotificationsConsumer } from './notification.controller';

@Module({ controllers: [NotificationsConsumer] })
export class AppModule {}
