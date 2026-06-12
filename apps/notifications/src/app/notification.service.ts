import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationService {
  getData(): { message: string } {
    return { message: 'Hello API' };
  }
}
