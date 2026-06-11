import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export enum NotificationChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  PUSH = 'PUSH',
}

export class CreateNotificationDto {
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsString()
  @IsNotEmpty()
  recipient!: string;

  @IsString()
  @MaxLength(120)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;
}
