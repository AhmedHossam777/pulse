import { NotificationStatus } from '../interfaces/notification.interface';

export interface GetStatusRequest {
  id: string;
}

export interface GetStatusResponse {
  id: string;
  status: NotificationStatus;
}
