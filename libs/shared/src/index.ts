export * from './lib/enums/notification-channel.enum';
export * from './lib/dto/create-notification.dto';
export * from './lib/interfaces/notification.interface';
export * from './lib/messaging/notification.patterns';
export * from './lib/messaging/notification.messages';
// gRPC contract is a separate transport layer (proto-style, `status: string`) and
// re-declares GetStatusRequest/GetStatusResponse. Namespace it to avoid colliding
// with the messaging types above. Consume as `grpc.GetStatusRequest`, `grpc.NotificationGrpc`, etc.
export * as grpc from './lib/grpc/notification.types';
