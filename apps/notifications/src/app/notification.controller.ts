import { Controller, Logger } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { NOTIFICATION_PATTERNS, CreateNotificationDto } from '@pulse/shared';
import type { GetStatusRequest, GetStatusResponse } from '@pulse/shared';

@Controller()
export class NotificationController {
  private readonly logger: Logger = new Logger(NotificationController.name);
  // Event pattern: fire and forget: the gateway doesn't wait
  @EventPattern(NOTIFICATION_PATTERNS.SEND)
  async handleSend(@Payload() dto: CreateNotificationDto) {
    this.logger.log(`Sending ${dto.channel} to ${dto.recipient}...`);
    await new Promise((r) => setTimeout(r, 2000)); // simulate provider latency
    this.logger.log(`Sent to ${dto.recipient}`);
  }

  // request-response: the gateway awaits for reply
  @MessagePattern(NOTIFICATION_PATTERNS.GET_STATUS)
  getStatus(@Payload() { id }: GetStatusRequest): GetStatusResponse {
    return { id, status: 'SENT' };
  }
}
