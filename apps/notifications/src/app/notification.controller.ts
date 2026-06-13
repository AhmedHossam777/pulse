import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { grpc, NotificationStatus } from '@pulse/shared';
import type { GetStatusRequest, GetStatusResponse } from '@pulse/shared';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity } from '@pulse/database';

@Controller()
export class NotificationsConsumer {
  private readonly logger = new Logger(NotificationsConsumer.name);
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly repo: Repository<NotificationEntity>,
  ) {}

  @GrpcMethod(grpc.NOTIFICATION_SERVICE, 'Send')
  async send(data: grpc.SendRequest): Promise<grpc.SendResponse> {
    this.logger.log(
      `Accepted ${data.channel} → ${data.recipient} (id=${data.id})`,
    );

    // this assume that the notification process is done successfully
    await this.repo.update(data.id!, { status: 'SENT' });

    return { id: data.id!, status: 'ACCEPTED' };
  }

  @GrpcMethod(grpc.NOTIFICATION_SERVICE, 'GetStatus')
  async getStatus(data: GetStatusRequest): Promise<GetStatusResponse> {
    const row = await this.repo.findOneByOrFail({ id: data.id });
    return { id: data.id, status: row.status as NotificationStatus };
  }
}
