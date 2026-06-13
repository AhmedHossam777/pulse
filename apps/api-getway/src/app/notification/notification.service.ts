import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { grpc } from '@pulse/shared';

@Injectable()
export class NotificationService implements OnModuleInit {
  private notificationGrpc!: grpc.NotificationGrpc;

  constructor(
    @Inject('NOTIFICATIONS_PACKAGE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.notificationGrpc = this.client.getService<grpc.NotificationGrpc>(
      grpc.NOTIFICATION_SERVICE,
    );
  }

  send(payload: grpc.SendRequest): Promise<grpc.SendResponse> {
    return firstValueFrom(this.notificationGrpc.send(payload));
  }

  status(id: string): Promise<grpc.GetStatusResponse> {
    return firstValueFrom(this.notificationGrpc.getStatus({ id }));
  }
}
