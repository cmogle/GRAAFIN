import { sendWhatsAppMessage, isTwilioConfigured, validateWhatsAppNumber, type TwilioConfig } from './twilio.js';

export interface NotificationConfig {
  twilio: TwilioConfig;
  notifyWhatsapp: string;
}

export async function sendNotification(
  config: NotificationConfig,
  message: string
): Promise<boolean> {
  if (!config.notifyWhatsapp) {
    console.log('⚠️  No notification number configured. Set NOTIFY_WHATSAPP in .env');
    return false;
  }

  if (!isTwilioConfigured(config.twilio)) {
    console.log('⚠️  Twilio not configured. Notification not sent.');
    return false;
  }

  const whatsappNumber = validateWhatsAppNumber(config.notifyWhatsapp);
  return sendWhatsAppMessage(config.twilio, whatsappNumber, message);
}

export { sendWhatsAppMessage, isTwilioConfigured, validateWhatsAppNumber };
export type { TwilioConfig };
