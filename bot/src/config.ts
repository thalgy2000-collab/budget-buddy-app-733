import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  userEmail: process.env.BUDGET_USER_EMAIL || '',
  userPassword: process.env.BUDGET_USER_PASSWORD || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  // Segredo compartilhado com o Google Apps Script que encaminha e-mails do Mercado Pago
  emailWebhookSecret: process.env.EMAIL_WEBHOOK_SECRET || '',
  // Chat do Telegram que recebe os lançamentos vindos de e-mail
  adminChatId: Number(process.env.TELEGRAM_ADMIN_CHAT_ID || 5750306147),
};

export function validateConfig() {
  const missing: string[] = [];
  if (!config.telegramToken) missing.push('TELEGRAM_BOT_TOKEN');
  if (!config.supabaseUrl) missing.push('SUPABASE_URL');
  if (!config.supabaseAnonKey) missing.push('SUPABASE_ANON_KEY');
  if (!config.userEmail) missing.push('BUDGET_USER_EMAIL');
  if (!config.userPassword) missing.push('BUDGET_USER_PASSWORD');
  if (!config.geminiApiKey) missing.push('GEMINI_API_KEY');

  if (missing.length > 0) {
    console.warn(`[AVISO] Faltam as seguintes variáveis no .env: ${missing.join(', ')}`);
  }
}
