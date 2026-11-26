import type {NotificationItem} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {NotFoundError} from '../../shared/errors/AppError.ts';

export class NotificationsService {
  constructor(private readonly adapter: DataAdapter) {}

  async listForUser(userId: string): Promise<NotificationItem[]> {
    return this.adapter.listNotificationsForUser(userId);
  }

  async markRead(userId: string, notificationId: string): Promise<NotificationItem> {
    const updated = await this.adapter.markNotificationRead(userId, notificationId);
    if (!updated) throw new NotFoundError('Notification not found');
    return updated;
  }

  async markAllRead(userId: string): Promise<void> {
    await this.adapter.markAllNotificationsRead(userId);
  }
}
