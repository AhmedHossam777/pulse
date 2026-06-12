import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { NotificationService } from './notification.service';

import {
  CreateNotificationDto,
  GetStatusResponse,
  NOTIFICATION_PATTERNS,
} from '@pulse/shared';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Controller('notification')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    @Inject('NOTIFICATIONS_CLIENT') private readonly client: ClientProxy,
  ) {}

  @Post()
  create(@Body() createNotificationDto: CreateNotificationDto) {
    const record = this.notificationService.create(createNotificationDto); // store PENDING in-memory (M2)
    this.client.emit(NOTIFICATION_PATTERNS.SEND, record);
    return record;
  }

  @Get('/:id/status')
  async status(@Param('id') id: string): Promise<GetStatusResponse> {
    return firstValueFrom(
      this.client.send<GetStatusResponse>(NOTIFICATION_PATTERNS.GET_STATUS, {
        id,
      }),
    );
  }

  @Get()
  findAll() {
    return this.notificationService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.notificationService.findOne(id);
  }
}
