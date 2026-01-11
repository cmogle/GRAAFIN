import twilio from 'twilio';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  whatsappFrom: string;
}

export async function sendWhatsAppMessage(
  config: TwilioConfig,
  to: string,
  message: string
): Promise<boolean> {
  if (!config.accountSid || !config.authToken) {
    console.log('⚠️  Twilio not configured. Message not sent.');
    console.log('   Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env');
    return false;
  }

  try {
    const client = twilio(config.accountSid, config.authToken);

    const result = await client.messages.create({
      from: config.whatsappFrom,
      to: to,
      body: message,
    });

    console.log(`✅ WhatsApp message sent: ${result.sid}`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Failed to send WhatsApp message: ${errorMessage}`);
    return false;
  }
}

export function validateWhatsAppNumber(number: string): string {
  // Ensure the number has the whatsapp: prefix
  if (!number.startsWith('whatsapp:')) {
    return `whatsapp:${number}`;
  }
  return number;
}

export function isTwilioConfigured(config: TwilioConfig): boolean {
  return !!(
    config.accountSid &&
    config.authToken &&
    config.whatsappFrom &&
    config.accountSid !== 'your_account_sid'
  );
}
