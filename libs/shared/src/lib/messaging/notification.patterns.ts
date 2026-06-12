export const NOTIFICATION_PATTERNS = {
  SEND: 'notification.send',
  GET_STATUS: 'notification.get_status',
} as const;

export type NotificationPattern =
  (typeof NOTIFICATION_PATTERNS)[keyof typeof NOTIFICATION_PATTERNS];
