// notifications.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateNotificationDto } from './dto/create-notification.dto';

export interface NotificationRecord extends CreateNotificationDto {
  id: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  createdAt: string;
}

@Injectable()
export class NotificationService {
  private readonly store = new Map<string, NotificationRecord>();

  create(dto: CreateNotificationDto): NotificationRecord {
    const record: NotificationRecord = {
      ...dto,
      id: randomUUID(),
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    this.store.set(record.id, record);
    return record;
  }

  findAll(): NotificationRecord[] {
    return [...this.store.values()];
  }

  findOne(id: string): NotificationRecord {
    const record = this.store.get(id);
    if (!record) throw new NotFoundException(`Notification ${id} not found`);
    return record;
  }
}
