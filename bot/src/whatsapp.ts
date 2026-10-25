import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  WASocket,
  WAMessage,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import { config } from './config.js';

export function normalizePhone(phone: string | number): string {
  // Remove sufixo @s.whatsapp.net, :device, etc.
  const base = String(phone || '').split('@')[0].split(':')[0];
  return base.replace(/\D/g, '');
}

export function isSameBrazilianPhone(phoneA: string | number, phoneB: string | number): boolean {
  const a = normalizePhone(phoneA);
  const b = normalizePhone(phoneB);
  if (!a || !b) return false;
  if (a === b) return true;

  const stripNinthDigit = (num: string): string => {
    if (num.startsWith('55') && num.length === 13 && num[4] === '9') {
      return num.slice(0, 4) + num.slice(5);
    }
    return num;
  };

  return stripNinthDigit(a) === stripNinthDigit(b);
}

export interface IncomingWhatsAppMessage {
  id: string;
  chatJid: string;   // JID completo para resposta (ex: "553499999999@s.whatsapp.net" ou "...@lid")
  phone: string;     // Número normalizado (ex: "553499999999")
  type: 'text' | 'image' | 'document' | 'audio';
  text?: string;
  caption?: string;
  mimeType?: string;
  rawMessage: WAMessage;
}

type MessageHandler = (msg: IncomingWhatsAppMessage) => Promise<void>;

export class WhatsAppClient {
  private sock: WASocket | null = null;
  private qrDataUrl: string | null = null;
  private connectionStatus: 'connecting' | 'qr' | 'connected' | 'disconnected' = 'connecting';
  private connectedPhone: string = '';
  private connectedJid: string = '';
  private connectedLid: string = '';
  private sentByBotIds = new Set<string>();
  private messageHandler: MessageHandler | null = null;

  private sentWelcomeOnBoot = false;
  private onConnectedCallback: ((jid: string, phone: string) => void) | null = null;

  onMessage(handler: MessageHandler) {
    this.messageHandler = handler;
  }

  onConnected(cb: (jid: string, phone: string) => void) {
    this.onConnectedCallback = cb;
  }

  getStatus() {
    return {
      status: this.connectionStatus,
      connectedPhone: this.connectedPhone,
      qrDataUrl: this.qrDataUrl,
    };
  }

  getConnectedPhone(): string {
    return this.connectedPhone;
  }

  getDefaultAdminTarget(): string {
    if (config.whatsappAdminPhone) {
      return `${normalizePhone(config.whatsappAdminPhone)}@s.whatsapp.net`;
    }
    if (this.connectedJid) {
      return this.connectedJid;
    }
    if (this.connectedPhone) {
      return `${this.connectedPhone}@s.whatsapp.net`;
    }
    return '';
  }

  async connect(): Promise<void> {
    if (!fs.existsSync(config.whatsappAuthDir)) {
      fs.mkdirSync(config.whatsappAuthDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(config.whatsappAuthDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1015901307] as [number, number, number],
    }));

    const logger = pino({ level: 'silent' });

    this.sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ['Budget Buddy Bot', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.connectionStatus = 'qr';
        this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 320 }).catch(() => null);
        const termQr = await QRCode.toString(qr, { type: 'terminal', small: true }).catch(() => '');
        console.log('\n================================================');
        console.log('📲 ESCANEIE O QR CODE ABAIXO NO SEU WHATSAPP:');
        console.log('   (Ou acesse http://localhost:3000 no navegador)');
        console.log('================================================\n');
        if (termQr) console.log(termQr);
      }

      if (connection === 'open') {
        this.connectionStatus = 'connected';
        this.qrDataUrl = null;
        const user = this.sock?.user;
        this.connectedPhone = normalizePhone(user?.id || '');
        this.connectedJid = this.connectedPhone ? `${this.connectedPhone}@s.whatsapp.net` : '';
        this.connectedLid = (user as any)?.lid ? String((user as any).lid).split(':')[0] + '@lid' : '';

        console.log(`🟢 WhatsApp conectado com sucesso! Número: ${this.connectedPhone}`);
        if (!this.sentWelcomeOnBoot && this.connectedJid && this.onConnectedCallback) {
          this.sentWelcomeOnBoot = true;
          this.onConnectedCallback(this.connectedJid, this.connectedPhone);
        }
      }

      if (connection === 'close') {
        this.connectionStatus = 'disconnected';
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        console.warn(`[WhatsApp] Conexão encerrada (código: ${statusCode}). Reconectando...`);

        if (isLoggedOut) {
          console.warn('[WhatsApp] Sessão desconectada pelo celular. Limpando credenciais para gerar novo QR Code...');
          try {
            fs.rmSync(config.whatsappAuthDir, { recursive: true, force: true });
          } catch {}
        }

        setTimeout(() => {
          this.connect().catch((err) => console.error('[WhatsApp] Erro ao reconectar:', err));
        }, 3000);
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        try {
          await this.processRawMessage(msg);
        } catch (err: any) {
          console.error('[WhatsApp] Erro ao processar mensagem recebida:', err.message || err);
        }
      }
    });
  }

  /**
   * Solicita um código de pareamento de 8 dígitos (alternativa ao QR Code)
   */
  async requestPairingCode(phoneNumber: string): Promise<string> {
    if (!this.sock) throw new Error('Socket do WhatsApp ainda não inicializado.');
    const clean = normalizePhone(phoneNumber);
    if (!clean || clean.length < 10) {
      throw new Error('Informe o número completo com DDI 55 + DDD + Número (ex: 5534999999999).');
    }
    const code = await this.sock.requestPairingCode(clean);
    return code;
  }

  private isAllowedChat(msg: WAMessage): boolean {
    const remoteJid = msg.key?.remoteJid || '';
    if (!remoteJid) return false;

    // Ignorar grupos, status e canais
    if (
      remoteJid.endsWith('@g.us') ||
      remoteJid === 'status@broadcast' ||
      remoteJid.endsWith('@broadcast') ||
      remoteJid.endsWith('@newsletter')
    ) {
      return false;
    }

    const remotePhone = normalizePhone(remoteJid);

    // 1. Conversa consigo mesmo ("Você" / Bloco de notas pessoal)
    const isSelfPhone = this.connectedPhone && isSameBrazilianPhone(remotePhone, this.connectedPhone);
    const isSelfLid = this.connectedLid && remoteJid.split(':')[0] === this.connectedLid.split(':')[0];
    if (isSelfPhone || isSelfLid) {
      return true;
    }

    // 2. Se enviou mensagem para outra pessoa (fromMe = true para um terceiro), IGNORAR!
    // Assim o bot nunca interfere nas suas conversas pessoais com outras pessoas.
    if (msg.key?.fromMe) {
      return false;
    }

    // 3. Se você configurou WHATSAPP_ADMIN_PHONE (ex: usando número secundário para o bot)
    if (config.whatsappAdminPhone && isSameBrazilianPhone(remotePhone, config.whatsappAdminPhone)) {
      return true;
    }

    return false;
  }

  private async processRawMessage(msg: WAMessage) {
    const msgId = msg.key?.id;
    if (!msgId) return;

    // Ignorar mensagens que o próprio bot enviou (evita loop infinito na conversa "Você")
    if (this.sentByBotIds.has(msgId)) {
      return;
    }

    if (!this.isAllowedChat(msg)) {
      return;
    }

    const m = msg.message;
    if (!m) return;

    // Desembrulhar ephemeralMessage / viewOnceMessage se necessário
    const content =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.documentWithCaptionMessage?.message ||
      m;

    const rawRemoteJid = msg.key?.remoteJid || '';
    const isSelfLid = this.connectedLid && rawRemoteJid.split(':')[0] === this.connectedLid.split(':')[0];
    const remoteJid = isSelfLid && this.connectedJid ? this.connectedJid : rawRemoteJid;
    const phone = this.connectedPhone || normalizePhone(remoteJid);

    // 1. Texto
    const textBody =
      content.conversation ||
      content.extendedTextMessage?.text ||
      '';

    if (textBody) {
      if (this.messageHandler) {
        await this.messageHandler({
          id: msgId,
          chatJid: remoteJid,
          phone,
          type: 'text',
          text: textBody,
          rawMessage: msg,
        });
      }
      return;
    }

    // 2. Imagem / Foto
    if (content.imageMessage) {
      if (this.messageHandler) {
        await this.messageHandler({
          id: msgId,
          chatJid: remoteJid,
          phone,
          type: 'image',
          caption: content.imageMessage.caption || '',
          mimeType: content.imageMessage.mimetype || 'image/jpeg',
          rawMessage: msg,
        });
      }
      return;
    }

    // 3. Documento (PDF / Imagem)
    if (content.documentMessage) {
      if (this.messageHandler) {
        await this.messageHandler({
          id: msgId,
          chatJid: remoteJid,
          phone,
          type: 'document',
          caption: content.documentMessage.caption || '',
          mimeType: content.documentMessage.mimetype || 'application/pdf',
          rawMessage: msg,
        });
      }
      return;
    }

    // 4. Áudio / Nota de Voz
    if (content.audioMessage) {
      if (this.messageHandler) {
        await this.messageHandler({
          id: msgId,
          chatJid: remoteJid,
          phone,
          type: 'audio',
          mimeType: content.audioMessage.mimetype || 'audio/ogg',
          rawMessage: msg,
        });
      }
      return;
    }
  }

  private formatTargetJid(to: string): string {
    if (to.endsWith('@lid') && this.connectedJid) {
      return this.connectedJid;
    }
    if (to.includes('@')) return to;
    const clean = normalizePhone(to);
    return `${clean}@s.whatsapp.net`;
  }

  private rememberSentId(sent: WAMessage | undefined) {
    const id = sent?.key?.id;
    if (id) {
      this.sentByBotIds.add(id);
      if (this.sentByBotIds.size > 2000) {
        const first = this.sentByBotIds.values().next().value;
        if (first) this.sentByBotIds.delete(first);
      }
    }
  }

  async sendText(to: string, text: string): Promise<void> {
    if (!this.sock || this.connectionStatus !== 'connected') {
      throw new Error('WhatsApp ainda não está conectado. Escaneie o QR Code primeiro.');
    }
    const jid = this.formatTargetJid(to);
    const sent = await this.sock.sendMessage(jid, { text });
    this.rememberSentId(sent);
  }

  async sendAudio(to: string, audioBuffer: Buffer): Promise<void> {
    if (!this.sock || this.connectionStatus !== 'connected') {
      throw new Error('WhatsApp ainda não está conectado.');
    }
    const jid = this.formatTargetJid(to);
    const sent = await this.sock.sendMessage(jid, {
      audio: audioBuffer,
      mimetype: 'audio/mpeg',
      ptt: true,
    });
    this.rememberSentId(sent);
  }

  async downloadMedia(rawMessage: WAMessage): Promise<Buffer> {
    const buffer = await downloadMediaMessage(
      rawMessage,
      'buffer',
      {},
      {
        logger: pino({ level: 'silent' }),
        reuploadRequest: this.sock!.updateMediaMessage,
      }
    );
    return Buffer.from(buffer);
  }
}
