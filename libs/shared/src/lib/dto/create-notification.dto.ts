import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { NotificationChannel } from '../enums/notification-channel.enum';

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
