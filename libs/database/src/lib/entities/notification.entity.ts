import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('notifications')
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: ['EMAIL', 'SMS', 'PUSH'] })
  channel!: string;

  @Column()
  recipient!: string;

  @Column()
  subject!: string;

  @Column('text')
  body!: string;

  @Column({
    type: 'enum',
    enum: ['PENDING', 'SENT', 'FAILED'],
    default: 'PENDING',
  })
  status!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
