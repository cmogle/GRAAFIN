import twilio from 'twilio';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  whatsappFrom: string;
}

export async function sendWhatsAppMessage(
  config: TwilioConfig,
  to: string,
  message: string,
  retries: number = 3
): Promise<boolean> {
  if (!config.accountSid || !config.authToken) {
    console.log('⚠️  Twilio not configured. Message not sent.');
    console.log('   Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env');
    return false;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
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
      const errorCode = (error as any)?.code;
      
      // Check if it's a rate limit error (Twilio error code 20429)
      const isRateLimit = errorCode === 20429 || errorMessage.includes('rate limit');
      
      if (isRateLimit && attempt < retries) {
        // Exponential backoff: 2^attempt seconds
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⚠️  Rate limit hit, retrying in ${delay / 1000}s (attempt ${attempt}/${retries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // For other errors or final attempt, log and return
      if (attempt === retries) {
        console.error(`❌ Failed to send WhatsApp message after ${retries} attempts: ${errorMessage}`);
        return false;
      }
      
      // For non-rate-limit errors, retry with exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`⚠️  Error sending message, retrying in ${delay / 1000}s (attempt ${attempt}/${retries}): ${errorMessage}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return false;
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
