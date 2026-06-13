import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { CreateNotificationDto, grpc } from '@pulse/shared';
import { InjectRepository } from '@nestjs/typeorm';
import { NotificationEntity } from '@pulse/database';
import { Repository } from 'typeorm';

@Injectable()
export class NotificationService implements OnModuleInit {
  private notificationGrpc!: grpc.NotificationGrpc;

  constructor(
    @Inject('NOTIFICATIONS_PACKAGE') private readonly client: ClientGrpc,
    @InjectRepository(NotificationEntity)
    private readonly repo: Repository<NotificationEntity>,
  ) {}

  onModuleInit() {
    this.notificationGrpc = this.client.getService<grpc.NotificationGrpc>(
      grpc.NOTIFICATION_SERVICE,
    );
  }

  async send(dto: CreateNotificationDto): Promise<grpc.SendResponse> {
    const row = await this.repo.save({ ...dto, status: 'PENDING' });
    const ack = await firstValueFrom(
      this.notificationGrpc.send({ ...dto, id: row.id }),
    );
    return { id: row.id, status: ack.status }; // ACCEPTED
  }

  status(id: string): Promise<grpc.GetStatusResponse> {
    return firstValueFrom(this.notificationGrpc.getStatus({ id }));
  }
}
