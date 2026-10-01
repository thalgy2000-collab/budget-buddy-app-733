import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config.js';
import { CategoryItem } from './supabase.js';

export interface ExtractedTransaction {
  type: 'income' | 'expense';
  title: string;
  amount: number;
  date: string;       // "YYYY-MM-DD"
  month: string;      // "YYYY-MM"
  displayDate: string;// "DD/MM/YYYY"
  categoryId: string;
  categoryName: string;
  explanation: string;
}

export type ExtractedExpense = ExtractedTransaction;

export interface FinancialAnswer {
  fullText: string;
  speechText: string;
}

export class AiService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    if (config.geminiApiKey) {
      this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    }
  }

  private async generateWithFallback(parts: any[]): Promise<string> {
    if (!this.genAI) {
      if (!config.geminiApiKey) {
        throw new Error('Chave GEMINI_API_KEY não informada no .env');
      }
      this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    }

    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.6-flash',
      'gemini-3.7-flash',
      'gemini-3.8-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
    ];

    let lastError: any = null;

    for (const modelName of candidateModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const model = this.genAI.getGenerativeModel({ model: modelName });
          const response = await model.generateContent(parts);
          const text = response.response.text().trim();
          if (text) return text;
        } catch (err: any) {
          lastError = err;
          if (err?.message?.includes('503') || err?.message?.includes('high demand') || err?.status === 503) {
            console.warn(`[IA] Modelo ${modelName} ocupado (503). Aguardando 1s para retry...`);
            await new Promise((r) => setTimeout(r, 1200));
            continue;
          }
          console.warn(`[IA] Falha no modelo ${modelName}: ${err.message}. Tentando próximo...`);
          break; // vai para o próximo modelo
        }
      }
    }

    throw lastError || new Error('Nenhum modelo Gemini respondeu com sucesso.');
  }

  async parseExpense(params: {
    textPrompt?: string;
    mediaBuffer?: Buffer;
    mimeType?: string;
    categories: CategoryItem[];
    fallbackDate?: Date;
  }): Promise<ExtractedTransaction> {
    const today = params.fallbackDate || new Date();
    const todayStr = today.toISOString().split('T')[0]; // "YYYY-MM-DD"

    const incomeCategories = params.categories.filter((c) => c.type === 'income');
    const expenseCategories = params.categories.filter((c) => c.type === 'expense');

    const incomePrompt = incomeCategories
      .map((c) => `  - ID: "${c.id}" | Nome: "${c.name}"`)
      .join('\n') || '  (Nenhuma específica, use geral se necessário)';

    const expensePrompt = expenseCategories
      .map((c) => `  - ID: "${c.id}" | Nome: "${c.name}"`)
      .join('\n') || '  (Nenhuma específica)';

    const systemPrompt = `Você é um assistente financeiro pessoal de alta precisão.
Sua missão é analisar o comprovante (imagem, documento ou texto) ou mensagem de voz e extrair os dados da transação financeira, classificando corretamente se é RECEITA (entrada de dinheiro) ou DESPESA (saída de dinheiro).

Data de hoje de referência: ${todayStr}

CATEGORIAS DE RECEITAS (Entradas / Dinheiro que entrou):
${incomePrompt}

CATEGORIAS DE DESPESAS (Saídas / Gastos):
${expensePrompt}

REGRAS DE CLASSIFICAÇÃO:
1. "type":
   - "income": Se o usuário disser que RECEBEU, GANHOU, ENTROU, SALÁRIO CAIU, VENDEU algo, ou se for comprovante de crédito/PIX recebido/transferência recebida.
   - "expense": Se o usuário disser que GASTOU, PAGOU, COMPROU, ou se for comprovante de pagamento efetuado/PIX enviado/fatura paga.
2. "title": Nome do estabelecimento, pagador/recebedor ou descrição curta (ex: "Salário Empresa X", "Freelance Design", "Supermercado Extra", "Posto Shell").
3. "amount": Valor total como número positivo (float, ex: 150.00). Nunca negativo.
4. "date": A data exata em que ocorreu a transação no formato "YYYY-MM-DD". Se o comprovante tiver data impressa, use-a. Se for texto/áudio sem data, use a data de hoje: "${todayStr}".
5. "month": "YYYY-MM" derivado da data da transação.
6. "displayDate": "DD/MM/AAAA".
7. "categoryId":
   - Se type for "income", OBRIGATORIAMENTE escolha um ID da lista de CATEGORIAS DE RECEITAS acima.
   - Se type for "expense", OBRIGATORIAMENTE escolha um ID da lista de CATEGORIAS DE DESPESAS acima.
8. "categoryName": O nome da categoria correspondente ao ID selecionado.
9. "explanation": Explicação concisa em 1 frase.

Responda APENAS com JSON válido:
{
  "type": "income" ou "expense",
  "title": "string",
  "amount": 0.00,
  "date": "YYYY-MM-DD",
  "month": "YYYY-MM",
  "displayDate": "DD/MM/YYYY",
  "categoryId": "string",
  "categoryName": "string",
  "explanation": "string"
}`;

    const parts: any[] = [{ text: systemPrompt }];

    if (params.textPrompt) {
      parts.push({ text: `Entrada do usuário: ${params.textPrompt}` });
    }

    if (params.mediaBuffer && params.mimeType) {
      parts.push({
        inlineData: {
          data: params.mediaBuffer.toString('base64'),
          mimeType: params.mimeType,
        },
      });
    }

    const text = await this.generateWithFallback(parts);

    const cleanJson = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleanJson);
      const isIncome = parsed.type === 'income';
      const targetPool = isIncome ? incomeCategories : expenseCategories;
      
      let matchedCategory = targetPool.find((c) => c.id === parsed.categoryId);
      if (!matchedCategory) {
        matchedCategory = params.categories.find((c) => c.id === parsed.categoryId) || targetPool[0] || params.categories[0];
      }

      const dateStr = parsed.date || todayStr;
      const [year, month] = dateStr.split('-');
      const monthStr = `${year}-${month}`;

      return {
        type: isIncome ? 'income' : 'expense',
        title: parsed.title || (isIncome ? 'Receita' : 'Despesa'),
        amount: Number(parsed.amount) || 0,
        date: dateStr,
        month: parsed.month || monthStr,
        displayDate: parsed.displayDate || dateStr.split('-').reverse().join('/'),
        categoryId: matchedCategory ? matchedCategory.id : (params.categories[0]?.id || ''),
        categoryName: matchedCategory ? matchedCategory.name : (params.categories[0]?.name || 'Geral'),
        explanation: parsed.explanation || '',
      };
    } catch (err: any) {
      console.error('[IA] Falha ao fazer parse do JSON retornado:', text);
      throw new Error(`Não foi possível extrair os dados da transação: ${err.message}`);
    }
  }

  async detectIntent(params: {
    textPrompt?: string;
    mediaBuffer?: Buffer;
    mimeType?: string;
  }): Promise<{ intent: 'QUERY' | 'EXPENSE'; month?: string; transcription?: string }> {
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    const prompt = `Analise a mensagem ou áudio do usuário e classifique a intenção:
1. "QUERY": O usuário está PERGUNTANDO ou consultando sobre suas contas/finanças/gastos/receitas (ex: "quanto gastei com alimentação?", "qual meu salário?", "quanto fiz de renda extra?", "qual meu saldo?", "como estão meus gastos?", "quais contas tenho pendentes?").
2. "EXPENSE": O usuário está informando ou registrando um novo gasto que acabou de fazer ou enviando um comprovante (ex: "almoço 35", "gastei 50 no posto", "uber 20", comprovante de PIX).

Mês atual de referência: "${currentMonth}".

Responda APENAS com JSON:
{
  "intent": "QUERY" ou "EXPENSE",
  "month": "YYYY-MM" (se a pergunta mencionar um mês específico como "em agosto", "mês passado", etc. Se não mencionar, retorne "${currentMonth}"),
  "transcription": "texto do áudio se for áudio, ou o próprio texto da pergunta"
}`;

    const parts: any[] = [{ text: prompt }];

    if (params.textPrompt) {
      parts.push({ text: `Mensagem: ${params.textPrompt}` });
    }

    if (params.mediaBuffer && params.mimeType) {
      parts.push({
        inlineData: {
          data: params.mediaBuffer.toString('base64'),
          mimeType: params.mimeType,
        },
      });
    }

    try {
      const text = await this.generateWithFallback(parts);
      const cleanJson = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const parsed = JSON.parse(cleanJson);
      return {
        intent: parsed.intent === 'QUERY' ? 'QUERY' : 'EXPENSE',
        month: parsed.month || currentMonth,
        transcription: parsed.transcription || params.textPrompt || '',
      };
    } catch {
      // Se falhar a detecção, considera gasto por padrão
      return { intent: 'EXPENSE', month: currentMonth };
    }
  }

  async answerFinancialQuery(params: {
    question: string;
    budgetSummary: any;
  }): Promise<FinancialAnswer> {
    const { question, budgetSummary } = params;

    const prompt = `Você é o consultor financeiro pessoal inteligente do usuário no app Budget Buddy.
O usuário fez uma pergunta sobre as finanças dele e você tem os dados reais do banco de dados do mês ${budgetSummary.month}.

DADOS REAIS DO ORÇAMENTO (${budgetSummary.month}):
${JSON.stringify(budgetSummary, null, 2)}

PERGUNTA DO USUÁRIO:
"${question}"

INSTRUÇÕES:
Você deve produzir DUAS respostas:
1. "fullText": Resposta em texto para a tela do Telegram. Use formatação Markdown (negrito, valores em R$, tópicos com emojis se fizer sentido). Seja claro e organizado.
2. "speechText": Resposta ULTRA DIRETA para ser falada em áudio. DEVE TER NO MÁXIMO 1 A 2 FRASES CURTAS (até 20 palavras). Vá direto aos números e à resposta, sem rodeios nem saudações longas.
   - Exemplo bom de speechText: "Você gastou 120 reais com combustível este mês."
   - Exemplo bom de speechText: "Seu saldo atual está positivo em 450 reais."
   - Exemplo bom de speechText: "Não há registro de gastos com alimentação neste mês."

Responda APENAS com um JSON válido:
{
  "fullText": "string",
  "speechText": "string"
}`;

    const parts = [{ text: prompt }];

    try {
      const text = await this.generateWithFallback(parts);
      const cleanJson = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsed = JSON.parse(cleanJson);
      return {
        fullText: parsed.fullText || text,
        speechText: parsed.speechText || parsed.fullText?.substring(0, 100) || text.substring(0, 100),
      };
    } catch {
      // Fallback em caso de resposta sem JSON
      return {
        fullText: 'Aqui está o resumo das suas contas no mês.',
        speechText: 'Consultei seus dados no sistema.',
      };
    }
  }
}
