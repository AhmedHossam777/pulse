import { Observable } from 'rxjs';

export const NOTIFICATION_PACKAGE = 'notification';
export const NOTIFICATION_SERVICE = 'NotificationService';

export interface SendRequest {
  channel: string;
  recipient: string;
  subject: string;
  body: string;
  id?: string;
}

export interface SendResponse {
  id: string;
  status: string;
}
export interface GetStatusRequest {
  id: string;
}
export interface GetStatusResponse {
  id: string;
  status: string;
}

export interface NotificationGrpc {
  send(data: SendRequest): Observable<SendResponse>;
  getStatus(data: GetStatusRequest): Observable<GetStatusResponse>;
}
