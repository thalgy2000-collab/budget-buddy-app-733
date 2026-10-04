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
      'gemini-flash-latest',
      'gemini-3.5-flash-lite',
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

  /**
   * Decide se um e-mail (ex: Mercado Pago) descreve uma transação financeira real
   * (compra, pagamento, PIX enviado/recebido, transferência) ou se é marketing/aviso genérico.
   */
  async classifyEmail(params: { subject: string; body: string }): Promise<{ isTransaction: boolean; reason: string }> {
    const prompt = `Você recebe um e-mail enviado por um banco/carteira digital (ex: Mercado Pago).
Decida se ele confirma uma TRANSAÇÃO FINANCEIRA REAL JÁ REALIZADA pelo usuário, com valor em dinheiro:
- SIM: compra aprovada, pagamento realizado, PIX enviado, PIX recebido, transferência enviada/recebida, boleto pago, dinheiro recebido.
- NÃO: promoções, ofertas, propaganda, cashback oferecido, código de segurança, login, avisos de fatura futura, pagamento pendente/recusado, pesquisas.

ASSUNTO: ${params.subject}

CORPO:
${params.body.substring(0, 4000)}

Responda APENAS com JSON válido:
{ "isTransaction": true ou false, "reason": "motivo curto" }`;

    try {
      const text = await this.generateWithFallback([{ text: prompt }]);
      const cleanJson = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const parsed = JSON.parse(cleanJson);
      return { isTransaction: parsed.isTransaction === true, reason: parsed.reason || '' };
    } catch (err: any) {
      console.warn('[IA] Falha ao classificar e-mail:', err.message);
      return { isTransaction: false, reason: 'falha na classificação' };
    }
  }

  /**
   * Decide se uma notificação push do celular (ex: PicPay, Nubank, etc.)
   * descreve uma transação financeira real (compra no cartão, pagamento, Pix, etc.)
   * ou se é propaganda/aviso genérico.
   */
  async classifyNotification(params: { app?: string; title: string; text: string }): Promise<{ isTransaction: boolean; reason: string }> {
    const prompt = `Você recebe uma notificação push do celular de um banco ou carteira digital (App: ${params.app || 'PicPay'}).
Decida se ela confirma uma TRANSAÇÃO FINANCEIRA REAL JÁ REALIZADA pelo usuário, com valor em dinheiro:
- SIM: compra aprovada, compra no cartão de crédito/débito, pagamento realizado, Pix enviado, Pix recebido, transferência realizada/recebida, boleto pago, recarga feita.
- NÃO: propaganda, limite aumentado, oferta de empréstimo, código de segurança, login em novo aparelho, lembrete de fatura aberta/fechando, dicas, novidades no app.

TÍTULO DA NOTIFICAÇÃO: ${params.title}

CONTEÚDO DA NOTIFICAÇÃO:
${params.text.substring(0, 1000)}

Responda APENAS com JSON válido:
{ "isTransaction": true ou false, "reason": "motivo curto" }`;

    try {
      const text = await this.generateWithFallback([{ text: prompt }]);
      const cleanJson = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const parsed = JSON.parse(cleanJson);
      return { isTransaction: parsed.isTransaction === true, reason: parsed.reason || '' };
    } catch (err: any) {
      console.warn('[IA] Falha ao classificar notificação:', err.message);
      return { isTransaction: false, reason: 'falha na classificação' };
    }
  }

  async detectIntent(params: {
    textPrompt?: string;
    mediaBuffer?: Buffer;
    mimeType?: string;
  }): Promise<{ intent: 'QUERY' | 'EXPENSE' | 'BUDGET'; month?: string; transcription?: string; budgetAmount?: number; categoryHint?: string }> {
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    const prompt = `Analise a mensagem ou áudio do usuário e classifique a intenção em EXATAMENTE uma das 3 categorias:

1. "BUDGET": O usuário quer DEFINIR, PLANEJAR ou ESTABELECER um limite/meta de orçamento para uma categoria em um mês.
   Palavras-chave típicas: "quero gastar", "meu orçamento de", "planejar", "reservar", "separar", "destinar", "limitar", "esse mês quero", "meu teto de", "pretendo gastar", "meta de gastos".
   Exemplos:
   - "esse mês quero gastar 200 reais com alimentação"
   - "meu orçamento de transporte é 150 reais"
   - "quero separar 500 para lazer esse mês"
   - "vou destinar 1000 reais para moradia"
   - "minha meta de alimentação é 800 reais esse mês"
   - "planejei 300 reais para saúde"

2. "EXPENSE": O usuário está REGISTRANDO algo que JÁ ACONTECEU — um gasto realizado, uma receita recebida, ou enviando um comprovante.
   Palavras-chave típicas: "gastei", "paguei", "comprei", "almocei", "abastecer", "recebi", "entrou", "veio", verbos no passado ou presente indicando transação já feita.
   Exemplos:
   - "gastei 30 reais com comida hoje"
   - "almoço 35"
   - "paguei 50 no posto"
   - "uber 20"
   - "recebi 3000 de salário"
   - comprovante de PIX enviado

3. "QUERY": O usuário está PERGUNTANDO ou CONSULTANDO informações sobre suas finanças, sem registrar nada novo nem planejar.
   Palavras-chave típicas: "quanto gastei", "quanto tenho", "quanto falta", "qual meu saldo", "como estão", "quanto sobra", "quanto ainda posso gastar".
   Exemplos:
   - "quanto gastei com alimentação esse mês?"
   - "quanto ainda tenho pra gastar com transporte?"
   - "qual meu saldo atual?"
   - "como estão meus gastos?"

REGRAS IMPORTANTES:
- Frases no FUTURO ou com INTENÇÃO de gastar (quero, pretendo, planejo, vou destinar) → BUDGET
- Frases no PASSADO ou PRESENTE indicando transação realizada (gastei, paguei, comprei) → EXPENSE
- Perguntas consultivas (quanto gastei, quanto falta, qual meu saldo) → QUERY

Mês atual de referência: "${currentMonth}".

Responda APENAS com JSON válido:
{
  "intent": "QUERY" ou "EXPENSE" ou "BUDGET",
  "month": "YYYY-MM" (se mencionar mês específico como "em agosto", "mês passado", etc. Se não, retorne "${currentMonth}"),
  "transcription": "texto do áudio se for áudio, ou o próprio texto da mensagem",
  "budgetAmount": número (SOMENTE se intent for BUDGET — o valor planejado mencionado, ex: 200. Caso contrário null),
  "categoryHint": "string" (SOMENTE se intent for BUDGET — o nome da categoria mencionada pelo usuário, ex: "alimentação", "transporte". Caso contrário null)
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
      const intent = parsed.intent === 'QUERY' ? 'QUERY' : parsed.intent === 'BUDGET' ? 'BUDGET' : 'EXPENSE';
      return {
        intent,
        month: parsed.month || currentMonth,
        transcription: parsed.transcription || params.textPrompt || '',
        budgetAmount: intent === 'BUDGET' ? (Number(parsed.budgetAmount) || undefined) : undefined,
        categoryHint: intent === 'BUDGET' ? (parsed.categoryHint || undefined) : undefined,
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

CONCEITOS IMPORTANTES:
- "planned" = valor PLANEJADO / orçamento / meta que o usuário definiu para aquela categoria no mês
- "actual" = valor REALIZADO / efetivamente gasto ou recebido até agora
- "Saldo restante por categoria" = planned - actual (quanto ainda pode gastar naquela categoria)
  - Se positivo: o usuário ainda tem margem para gastar
  - Se negativo: o usuário ESTOUROU o orçamento daquela categoria
  - Se planned for 0: o usuário não definiu orçamento para essa categoria

INSTRUÇÕES:
- Quando o usuário perguntar "quanto ainda posso gastar com X?" ou "quanto falta de X?", calcule: planned - actual daquela categoria.
- Quando o usuário perguntar sobre gastos de uma categoria, mostre o planejado, o realizado e o restante.
- Quando o usuário perguntar o saldo geral, mostre receitas - despesas (tanto planejado quanto realizado).
- Se uma categoria não tem planejado (planned = 0), avise que não há orçamento definido para ela.

Você deve produzir DUAS respostas:
1. "fullText": Resposta em texto para a tela do Telegram. Use formatação Markdown (negrito, valores em R$, tópicos com emojis se fizer sentido). Seja claro e organizado.
2. "speechText": Resposta ULTRA DIRETA para ser falada em áudio. DEVE TER NO MÁXIMO 1 A 2 FRASES CURTAS (até 20 palavras). Vá direto aos números e à resposta, sem rodeios nem saudações longas.
   - Exemplo bom de speechText: "Você ainda pode gastar 170 reais com alimentação este mês."
   - Exemplo bom de speechText: "Você estourou o orçamento de transporte em 50 reais."
   - Exemplo bom de speechText: "Seu saldo atual está positivo em 450 reais."

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
