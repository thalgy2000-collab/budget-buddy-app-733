import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import * as googleTTS from 'google-tts-api';

export const AVAILABLE_VOICES = [
  { id: 'pt-BR-FranciscaNeural', name: '👩 Francisca (Feminina, natural e suave)' },
  { id: 'pt-BR-AntonioNeural', name: '👨 Antonio (Masculina, natural e profissional)' },
  { id: 'pt-BR-ThalitaNeural', name: '👧 Thalita (Feminina, leve e jovem)' },
  { id: 'pt-BR-FabioNeural', name: '🧑 Fabio (Masculina, dinâmica)' },
];

export class TtsService {
  private currentVoice: string = 'pt-BR-FranciscaNeural';

  setVoice(voiceId: string) {
    const exists = AVAILABLE_VOICES.some((v) => v.id === voiceId);
    if (exists) {
      this.currentVoice = voiceId;
      console.log(`[TTS] Voz alterada para: ${voiceId}`);
    }
  }

  getVoice(): string {
    return this.currentVoice;
  }

  getVoiceName(): string {
    const v = AVAILABLE_VOICES.find((item) => item.id === this.currentVoice);
    return v ? v.name : this.currentVoice;
  }

  /**
   * Converte texto em áudio usando Vozes Neurais da Microsoft (alta fidelidade humana)
   */
  async textToSpeechBuffer(text: string): Promise<Buffer> {
    // 1. Limpar tags markdown, formatação e emojis para a leitura soar humana
    const cleanText = text
      .replace(/[*_~`#>]/g, '')           // remove símbolos markdown
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // remove links markdown
      .replace(/https?:\/\/\S+/g, '')     // remove URLs
      .replace(/━+/g, '')                 // remove traços decorativos
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // remove emojis
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) {
      throw new Error('Texto vazio após limpeza.');
    }

    // 2. Se for muito longo, corta para um resumo falado de até 500 caracteres
    const spokenText = cleanText.length > 500 ? cleanText.substring(0, 497) + '...' : cleanText;

    // 3. Tentar Voz Neural da Microsoft (Edge TTS)
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(this.currentVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(spokenText);

      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        if (typeof chunk === 'string') {
          chunks.push(Buffer.from(chunk));
        } else {
          chunks.push(chunk);
        }
      }

      tts.close();
      const buffer = Buffer.concat(chunks);
      if (buffer.length > 0) {
        return buffer;
      }
    } catch (err: any) {
      console.warn(`[TTS] Falha ao sintetizar com Edge Neural (${this.currentVoice}): ${err.message}. Usando fallback...`);
    }

    // 4. Fallback secundário
    try {
      const results = await googleTTS.getAllAudioBase64(spokenText.substring(0, 200), {
        lang: 'pt',
        slow: false,
        host: 'https://translate.google.com',
        timeout: 10000,
      });
      const buffers = results.map((item) => Buffer.from(item.base64, 'base64'));
      return Buffer.concat(buffers);
    } catch (fallbackErr: any) {
      console.error('[TTS] Falha em todos os provedores de áudio:', fallbackErr.message);
      throw fallbackErr;
    }
  }
}
