import { Controller, Get } from '@nestjs/common';
import { Repository } from 'typeorm';
import { NotificationEntity } from '@pulse/database';
import { InjectRepository } from '@nestjs/typeorm';

@Controller('admin/notifications')
export class AdminController {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepo: Repository<NotificationEntity>,
  ) {}

  @Get()
  async findAll() {
    return this.notificationRepo.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  @Get('stats')
  async stats() {
    const [pending, sent, failed] = await Promise.all([
      this.notificationRepo.countBy({ status: 'PENDING' }),
      this.notificationRepo.countBy({ status: 'SENT' }),
      this.notificationRepo.countBy({ status: 'FAILED' }),
    ]);
    return { pending, sent, failed };
  }
}
