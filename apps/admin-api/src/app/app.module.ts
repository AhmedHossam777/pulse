import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { NotificationEntity, PulseDatabaseModule } from '@pulse/database';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    PulseDatabaseModule,
    TypeOrmModule.forFeature([NotificationEntity]),
  ],
  controllers: [AdminController],
})
export class AppModule {}
