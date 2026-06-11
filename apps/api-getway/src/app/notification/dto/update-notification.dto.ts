import { PartialType } from '@nestjs/mapped-types';
import { CreateNotificationDto } from '@pulse/shared';

export class UpdateNotificationDto extends PartialType(CreateNotificationDto) {}
