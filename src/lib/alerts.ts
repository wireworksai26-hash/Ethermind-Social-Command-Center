import { env } from './env';

export type AlertEventType = 'token_expiring' | 'token_needs_reauth' | 'viral_spike';

export interface AlertEvent {
  type: AlertEventType;
  workspaceSlug: string;
  message: string;
}

/** Contract for future channels (Telegram Bot API, Klozer WhatsApp Gateway). */
export interface IAlertChannel {
  readonly name: string;
  send(event: AlertEvent): Promise<void>;
}

const channels: IAlertChannel[] = [];

export function registerAlertChannel(channel: IAlertChannel): void {
  channels.push(channel);
}

/** No-op in v1.0: gated by ENABLE_EXTERNAL_ALERTS and no channel is registered yet. */
export async function dispatchAlert(event: AlertEvent): Promise<void> {
  if (!env().ENABLE_EXTERNAL_ALERTS) return;
  await Promise.allSettled(channels.map((c) => c.send(event)));
}
