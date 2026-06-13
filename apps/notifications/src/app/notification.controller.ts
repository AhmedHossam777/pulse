import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { grpc } from '@pulse/shared';
import type { GetStatusRequest, GetStatusResponse } from '@pulse/shared';
import { randomUUID } from 'node:crypto';

@Controller()
export class NotificationsConsumer {
  private readonly logger = new Logger(NotificationsConsumer.name);

  @GrpcMethod(grpc.NOTIFICATION_SERVICE, 'Send')
  send(data: grpc.SendRequest): grpc.SendResponse {
    const id = randomUUID();
    this.logger.log(`Accepted ${data.channel} → ${data.recipient} (id=${id})`);

    // gRPC unary is request-response: return an ACK immediately,
    // then do the slow "send" asynchronously (fire-and-forget INSIDE the worker).
    void this.deliver(id, data);

    return { id, status: 'ACCEPTED' };
  }

  @GrpcMethod(grpc.NOTIFICATION_SERVICE, 'GetStatus')
  getStatus(data: GetStatusRequest): GetStatusResponse {
    // faked until M4 wires a DB
    return { id: data.id, status: 'SENT' };
  }

  private async deliver(id: string, data: grpc.SendRequest) {
    await new Promise((r) => setTimeout(r, 2000)); // simulate provider latency
    this.logger.log(`Delivered id=${id} to ${data.recipient}`);
  }
}
