import fs from 'fs';
import path from 'path';
import { BudgetService } from './supabase.js';
import { config } from './config.js';
import { isSameBrazilianPhone, normalizePhone } from './whatsapp.js';

export interface UserSession {
  chatId: string; // Número de telefone no WhatsApp (ex: "5534999999999")
  email: string;
  userId: string;
  connectedAt: string;
}

export class UserManager {
  private filePath: string;
  private users: Map<string, UserSession> = new Map();
  private services: Map<string, BudgetService> = new Map();
  private defaultAdminService: BudgetService | null = null;
  private lastKnownAdminPhone: string = '';

  constructor() {
    this.filePath = path.resolve(process.cwd(), 'data', 'users.json');
    this.loadUsers();
  }

  private loadUsers() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const list: any[] = JSON.parse(raw);
        for (const u of list) {
          const id = normalizePhone(u.chatId);
          if (id) {
            this.users.set(id, { ...u, chatId: id });
          }
        }
        console.log(`[UserManager] Carregados ${this.users.size} usuários conectados.`);
      }
    } catch (e: any) {
      console.error('[UserManager] Erro ao carregar users.json:', e.message);
    }
  }

  private saveUsers() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.users.values());
      fs.writeFileSync(this.filePath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (e: any) {
      console.error('[UserManager] Erro ao salvar users.json:', e.message);
    }
  }

  /**
   * Localiza a chave real armazenada no Map (mesmo com diferença do 9º dígito no Brasil)
   */
  private resolveStoredKey(chatId: string): string | null {
    const clean = normalizePhone(chatId);
    if (this.users.has(clean)) return clean;
    for (const key of this.users.keys()) {
      if (isSameBrazilianPhone(key, clean)) {
        return key;
      }
    }
    return null;
  }

  /**
   * Conecta automaticamente o administrador principal usando as credenciais do .env
   */
  async initDefaultAdmin(): Promise<BudgetService | null> {
    if (!config.userEmail || !config.userPassword) return null;

    if (!this.defaultAdminService) {
      const service = new BudgetService(config.userEmail);
      const ok = await service.authenticateWithCredentials(config.userEmail, config.userPassword);
      if (ok) {
        this.defaultAdminService = service;
        console.log(`[UserManager] Conta padrão (${config.userEmail}) autenticada no Supabase.`);
      }
    }

    const adminPhone = normalizePhone(config.whatsappAdminPhone);
    if (adminPhone && this.defaultAdminService) {
      this.lastKnownAdminPhone = adminPhone;
      if (!this.resolveStoredKey(adminPhone)) {
        const session: UserSession = {
          chatId: adminPhone,
          email: config.userEmail,
          userId: this.defaultAdminService.getUserId() || '',
          connectedAt: new Date().toISOString(),
        };
        this.users.set(adminPhone, session);
        this.services.set(adminPhone, this.defaultAdminService);
        this.saveUsers();
      } else {
        const key = this.resolveStoredKey(adminPhone)!;
        this.services.set(key, this.defaultAdminService);
      }
    }

    return this.defaultAdminService;
  }

  /**
   * Retorna o número de WhatsApp do administrador para envio de notificações (Mercado Pago / PicPay)
   */
  getAdminPhone(): string {
    if (this.lastKnownAdminPhone) return this.lastKnownAdminPhone;
    if (config.whatsappAdminPhone) return normalizePhone(config.whatsappAdminPhone);

    // Se algum usuário estiver conectado com o e-mail do admin, usa o número dele
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === config.userEmail.toLowerCase() && u.chatId.startsWith('55')) {
        return u.chatId;
      }
    }
    return '';
  }

  /**
   * Registra o número real de onde o admin mandou mensagem (útil para manter a janela de 24h ativa no formato exato da Meta)
   */
  registerIncomingPhone(phone: string) {
    const clean = normalizePhone(phone);
    if (!clean) return;
    if (
      !config.whatsappAdminPhone ||
      isSameBrazilianPhone(clean, config.whatsappAdminPhone)
    ) {
      this.lastKnownAdminPhone = clean;
    }
  }

  getUser(chatId: string): UserSession | null {
    const key = this.resolveStoredKey(chatId);
    return key ? this.users.get(key) || null : null;
  }

  getBudgetService(chatId: string): BudgetService | null {
    const key = this.resolveStoredKey(chatId);
    if (key && this.services.has(key)) {
      return this.services.get(key) || null;
    }
    // Se for o telefone do admin (ou se o admin já estiver autenticado e for o mesmo número)
    if (
      this.defaultAdminService &&
      config.whatsappAdminPhone &&
      isSameBrazilianPhone(chatId, config.whatsappAdminPhone)
    ) {
      return this.defaultAdminService;
    }
    return null;
  }

  /**
   * Retorna o BudgetService do administrador (mesmo que WHATSAPP_ADMIN_PHONE ainda esteja sendo configurado)
   */
  async getAdminBudgetService(): Promise<BudgetService | null> {
    if (this.defaultAdminService) return this.defaultAdminService;
    return await this.initDefaultAdmin();
  }

  async connectUser(
    chatId: string,
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string; service?: BudgetService }> {
    try {
      const cleanId = normalizePhone(chatId);
      const service = new BudgetService(email);
      const ok = await service.authenticateWithCredentials(email, password);

      if (!ok) {
        return { success: false, error: 'E-mail ou senha incorretos no app.' };
      }

      const existingKey = this.resolveStoredKey(cleanId);
      if (existingKey && existingKey !== cleanId) {
        this.users.delete(existingKey);
        this.services.delete(existingKey);
      }

      const session: UserSession = {
        chatId: cleanId,
        email,
        userId: service.getUserId() || '',
        connectedAt: new Date().toISOString(),
      };

      this.users.set(cleanId, session);
      this.services.set(cleanId, service);
      if (email.toLowerCase() === config.userEmail.toLowerCase()) {
        this.defaultAdminService = service;
        this.lastKnownAdminPhone = cleanId;
      }
      this.saveUsers();

      console.log(`[UserManager] Usuário conectado no WhatsApp: ${email} (tel: ${cleanId})`);
      return { success: true, service };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  disconnectUser(chatId: string): boolean {
    const key = this.resolveStoredKey(chatId);
    if (key && this.users.has(key)) {
      this.users.delete(key);
      this.services.delete(key);
      this.saveUsers();
      return true;
    }
    return false;
  }

  getAllUsers(): UserSession[] {
    return Array.from(this.users.values());
  }
}
