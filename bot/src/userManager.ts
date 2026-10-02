import fs from 'fs';
import path from 'path';
import { BudgetService } from './supabase.js';
import { config } from './config.js';

export interface UserSession {
  chatId: number;
  email: string;
  userId: string;
  connectedAt: string;
}

export class UserManager {
  private filePath: string;
  private users: Map<number, UserSession> = new Map();
  private services: Map<number, BudgetService> = new Map();

  constructor() {
    this.filePath = path.resolve(process.cwd(), 'data', 'users.json');
    this.loadUsers();
    this.initDefaultAdmin();
  }

  private loadUsers() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const list: UserSession[] = JSON.parse(raw);
        for (const u of list) {
          this.users.set(u.chatId, u);
        }
        console.log(`[UserManager] Carregados ${this.users.size} usuários conectados.`);
      }
    } catch (e: any) {
      console.error('[UserManager] Erro ao carregar users.json:', e.message);
    }
  }

  private saveUsers() {
    try {
      const list = Array.from(this.users.values());
      fs.writeFileSync(this.filePath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (e: any) {
      console.error('[UserManager] Erro ao salvar users.json:', e.message);
    }
  }

  /**
   * Conecta automaticamente o Thalgy com o chatId dele (5750306147)
   */
  async initDefaultAdmin() {
    if (config.userEmail && config.userPassword) {
      const adminChatId = 5750306147;
      if (!this.users.has(adminChatId)) {
        console.log('[UserManager] Pré-configurando conta do administrador principal...');
        await this.connectUser(adminChatId, config.userEmail, config.userPassword);
      } else {
        // Já tem o registro, inicializa o BudgetService
        const u = this.users.get(adminChatId)!;
        const service = new BudgetService(u.email);
        await service.authenticateWithCredentials(config.userEmail, config.userPassword);
        this.services.set(adminChatId, service);
      }
    }
  }

  getUser(chatId: number): UserSession | null {
    return this.users.get(chatId) || null;
  }

  getBudgetService(chatId: number): BudgetService | null {
    return this.services.get(chatId) || null;
  }

  async connectUser(
    chatId: number,
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string; service?: BudgetService }> {
    try {
      const service = new BudgetService(email);
      const ok = await service.authenticateWithCredentials(email, password);

      if (!ok) {
        return { success: false, error: 'E-mail ou senha incorretos no app.' };
      }

      const session: UserSession = {
        chatId,
        email,
        userId: service.getUserId() || '',
        connectedAt: new Date().toISOString(),
      };

      this.users.set(chatId, session);
      this.services.set(chatId, service);
      this.saveUsers();

      console.log(`[UserManager] Usuário conectado com sucesso: ${email} (chatId: ${chatId})`);
      return { success: true, service };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  disconnectUser(chatId: number): boolean {
    if (this.users.has(chatId)) {
      this.users.delete(chatId);
      this.services.delete(chatId);
      this.saveUsers();
      return true;
    }
    return false;
  }

  getAllUsers(): UserSession[] {
    return Array.from(this.users.values());
  }
}
