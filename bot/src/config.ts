import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  // Opcional: número de WhatsApp do admin (ex: "5534999999999").
  // Se deixado em branco, o bot usa automaticamente o próprio número conectado no QR Code!
  whatsappAdminPhone: (process.env.WHATSAPP_ADMIN_PHONE || '').replace(/\D/g, ''),

  // Pasta onde a sessão do WhatsApp (QR Code) fica salva
  whatsappAuthDir: process.env.WHATSAPP_AUTH_DIR || path.resolve(process.cwd(), 'data', 'whatsapp_auth'),

  // Supabase / Budget Buddy
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  userEmail: process.env.BUDGET_USER_EMAIL || '',
  userPassword: process.env.BUDGET_USER_PASSWORD || '',

  // Google Gemini
  geminiApiKey: process.env.GEMINI_API_KEY || '',

  // Segredo compartilhado com o Google Apps Script (e-mails do Mercado Pago) e app de notificações
  emailWebhookSecret: process.env.EMAIL_WEBHOOK_SECRET || '',
};

export function validateConfig() {
  const missing: string[] = [];
  if (!config.supabaseUrl) missing.push('SUPABASE_URL');
  if (!config.supabaseAnonKey) missing.push('SUPABASE_ANON_KEY');
  if (!config.userEmail) missing.push('BUDGET_USER_EMAIL');
  if (!config.userPassword) missing.push('BUDGET_USER_PASSWORD');
  if (!config.geminiApiKey) missing.push('GEMINI_API_KEY');

  if (missing.length > 0) {
    console.warn(`[AVISO] Faltam as seguintes variáveis no .env: ${missing.join(', ')}`);
  }
}
