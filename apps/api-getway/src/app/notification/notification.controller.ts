import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { CreateNotificationDto, grpc } from '@pulse/shared';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Post()
  create(@Body() dto: CreateNotificationDto): Promise<grpc.SendResponse> {
    return this.service.send(dto); // returns { id, status: 'ACCEPTED' }
  }

  @Get(':id/status')
  status(@Param('id') id: string): Promise<grpc.GetStatusResponse> {
    return this.service.status(id);
  }
}
