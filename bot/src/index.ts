import http from 'http';
import { config, validateConfig } from './config.js';
import { BudgetService } from './supabase.js';
import { AiService, ExtractedExpense } from './ai.js';
import { TtsService, AVAILABLE_VOICES } from './tts.js';
import { UserManager } from './userManager.js';
import { WhatsAppClient, IncomingWhatsAppMessage } from './whatsapp.js';

validateConfig();

const whatsapp = new WhatsAppClient();
const userManager = new UserManager();
const aiService = new AiService();
const ttsService = new TtsService();

// Estado de interação atual do chat para respostas rápidas por número (1, 2, 3...)
type InteractionMode =
  | { type: 'confirm_tx'; txId: string }
  | { type: 'select_tx_cat'; txId: string; categoryIds: string[] }
  | { type: 'select_tx_month'; txId: string; months: string[] }
  | { type: 'confirm_budget'; budId: string }
  | { type: 'select_budget_cat'; budId: string; categoryIds: string[] }
  | { type: 'select_budget_month'; budId: string; months: string[] }
  | { type: 'select_voice' };

const activeMenuByChat = new Map<string, InteractionMode>();

// Armazenamento em memória para transações pendentes de confirmação
interface PendingTransaction extends ExtractedExpense {
  id: string;
  chatJid: string;
  createdAt: number;
}
const pendingExpenses = new Map<string, PendingTransaction>();

// Armazenamento em memória para orçamentos planejados pendentes de confirmação
interface PendingBudget {
  id: string;
  chatJid: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  month: string;
  createdAt: number;
}
const pendingBudgets = new Map<string, PendingBudget>();

// Último chat JID ativo do admin (para enviar e-mails do Mercado Pago / PicPay na conversa certa)
let lastActiveAdminJid: string = '';

// Limpeza de pendências antigas (> 1 hora)
setInterval(() => {
  const now = Date.now();
  for (const [id, exp] of pendingExpenses.entries()) {
    if (now - exp.createdAt > 3600000) {
      pendingExpenses.delete(id);
    }
  }
  for (const [id, bud] of pendingBudgets.entries()) {
    if (now - bud.createdAt > 3600000) {
      pendingBudgets.delete(id);
    }
  }
}, 600000);

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function getMonthName(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  const idx = parseInt(month, 10) - 1;
  return `${months[idx] || month}/${year}`;
}

function buildConfirmationText(exp: PendingTransaction, prefixHeader?: string): string {
  const monthLabel = getMonthName(exp.month);
  const isIncome = exp.type === 'income';
  const header = prefixHeader ? `${prefixHeader}\n\n` : '';
  const toggleText = isIncome ? 'Mudar para Despesa' : 'Mudar para Receita';

  const body = isIncome
    ? `💵 *Receita Identificada (Entrada):*
━━━━━━━━━━━━━━━━━━━━
🏷️ *Origem / Descrição:* ${exp.title}
💰 *Valor:* *+ ${formatCurrency(exp.amount)}*
📅 *Data:* ${exp.displayDate}
📆 *Mês no Orçamento:* *${monthLabel}* (${exp.month})
📂 *Categoria sugerida:* *${exp.categoryName}*
${exp.explanation ? `💡 _${exp.explanation}_\n` : ''}━━━━━━━━━━━━━━━━━━━━
*Responda com o número da opção:*
*1* — ✅ Confirmar em ${monthLabel}
*2* — 📂 Trocar Categoria
*3* — 📅 Trocar Mês
*4* — 🔄 ${toggleText}
*0* — ❌ Cancelar`
    : `🧾 *Despesa Identificada (Saída):*
━━━━━━━━━━━━━━━━━━━━
🏷️ *Estabelecimento:* ${exp.title}
💰 *Valor:* *- ${formatCurrency(exp.amount)}*
📅 *Data:* ${exp.displayDate}
📆 *Mês no Orçamento:* *${monthLabel}* (${exp.month})
📂 *Categoria sugerida:* *${exp.categoryName}*
${exp.explanation ? `💡 _${exp.explanation}_\n` : ''}━━━━━━━━━━━━━━━━━━━━
*Responda com o número da opção:*
*1* — ✅ Confirmar em ${monthLabel}
*2* — 📂 Trocar Categoria
*3* — 📅 Trocar Mês
*4* — 🔄 ${toggleText}
*0* — ❌ Cancelar`;

  return `${header}${body}`;
}

async function sendConfirmationCard(chatJid: string, exp: PendingTransaction, prefixHeader?: string): Promise<void> {
  activeMenuByChat.set(chatJid, { type: 'confirm_tx', txId: exp.id });
  const text = buildConfirmationText(exp, prefixHeader);
  await whatsapp.sendText(chatJid, text);
}

function buildBudgetConfirmationText(bud: PendingBudget): string {
  const monthLabel = getMonthName(bud.month);
  return (
    `📋 *Orçamento / Planejamento Identificado:*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📂 *Categoria:* *${bud.categoryName}*\n` +
    `💰 *Valor planejado:* *${formatCurrency(bud.amount)}*\n` +
    `📆 *Mês:* *${monthLabel}* (${bud.month})\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `*Responda com o número da opção:*\n` +
    `*1* — ✅ Confirmar Orçamento\n` +
    `*2* — 📂 Trocar Categoria\n` +
    `*3* — 📅 Trocar Mês\n` +
    `*0* — ❌ Cancelar`
  );
}

async function sendBudgetConfirmationCard(chatJid: string, bud: PendingBudget): Promise<void> {
  activeMenuByChat.set(chatJid, { type: 'confirm_budget', budId: bud.id });
  const text = buildBudgetConfirmationText(bud);
  await whatsapp.sendText(chatJid, text);
}

async function handleBudgetIntent(
  chatJid: string,
  budgetService: BudgetService,
  intentRes: { month?: string; transcription?: string; budgetAmount?: number; categoryHint?: string }
): Promise<void> {
  const amount = intentRes.budgetAmount;
  const categoryHint = intentRes.categoryHint?.toLowerCase() || '';
  const month = intentRes.month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  if (!amount || amount <= 0) {
    await whatsapp.sendText(
      chatJid,
      `⚠️ Não consegui identificar o valor do orçamento. Tente algo como:\n_"Quero gastar 200 reais com alimentação esse mês"_`
    );
    return;
  }

  const categories = budgetService.getCategories();
  let matchedCategory = categories.find((c) => c.name.toLowerCase() === categoryHint);
  if (!matchedCategory) {
    matchedCategory = categories.find(
      (c) => c.name.toLowerCase().includes(categoryHint) || categoryHint.includes(c.name.toLowerCase())
    );
  }
  if (!matchedCategory) {
    const expenseCats = categories.filter((c) => c.type === 'expense');
    matchedCategory = expenseCats[0] || categories[0];
  }

  if (!matchedCategory) {
    await whatsapp.sendText(chatJid, `❌ Nenhuma categoria encontrada no seu perfil. Crie categorias primeiro no app.`);
    return;
  }

  const budId = Math.random().toString(36).substring(2, 9);
  const pending: PendingBudget = {
    id: budId,
    chatJid,
    categoryId: matchedCategory.id,
    categoryName: matchedCategory.name,
    amount,
    month,
    createdAt: Date.now(),
  };
  pendingBudgets.set(budId, pending);

  await sendBudgetConfirmationCard(chatJid, pending);
}

async function getService(chatJid: string, phone: string): Promise<BudgetService | null> {
  lastActiveAdminJid = chatJid;
  userManager.registerIncomingPhone(phone);

  let service = userManager.getBudgetService(phone);
  if (!service) {
    service = await userManager.getAdminBudgetService();
    if (service && phone) {
      await userManager.connectUser(phone, config.userEmail, config.userPassword);
    }
  }

  if (!service) {
    await whatsapp.sendText(
      chatJid,
      `👋 *Olá! Você ainda não conectou sua conta do Budget Buddy.*\n\n` +
        `Para gerenciar suas contas por aqui (por áudio, texto ou comprovante), envie:\n\n` +
        `👉 \`/conectar seu-email@exemplo.com sua-senha\``
    );
    return null;
  }
  return service;
}

// ---------------- MENU NUMERADO INTERATIVO ----------------

async function handleMenuReply(chatJid: string, phone: string, rawText: string): Promise<boolean> {
  const menu = activeMenuByChat.get(chatJid);
  if (!menu) return false;

  const clean = rawText.trim().toLowerCase();

  // 1. Menu de confirmação de Transação
  if (menu.type === 'confirm_tx') {
    const exp = pendingExpenses.get(menu.txId);
    if (!exp) {
      activeMenuByChat.delete(chatJid);
      return false;
    }

    if (clean === '1' || clean === 'sim' || clean === 's' || clean === 'ok' || clean === 'confirmar') {
      activeMenuByChat.delete(chatJid);
      const budgetService = await getService(chatJid, phone);
      if (!budgetService) return true;

      const isIncome = exp.type === 'income';
      const [_, m, d] = exp.date.split('-');
      const itemTitle = `${exp.title} (${d}/${m})`;

      const result = await budgetService.addTransaction({
        categoryId: exp.categoryId,
        month: exp.month,
        title: itemTitle,
        amount: exp.amount,
        type: exp.type,
      });

      if (result.success) {
        pendingExpenses.delete(exp.id);
        const monthLabel = getMonthName(exp.month);
        const totalMonth = result.totalMonthCategory
          ? `\n📊 *Total acumulado nesta categoria no mês:* ${formatCurrency(result.totalMonthCategory)}`
          : '';

        const badge = isIncome ? '💵 *Receita Registrada com Sucesso!*' : '✅ *Despesa Registrada com Sucesso!*';
        const sign = isIncome ? '+' : '-';

        await whatsapp.sendText(
          chatJid,
          `${badge}\n━━━━━━━━━━━━━━━━━━━━\n` +
            `🏷️ *Item:* ${itemTitle}\n` +
            `💰 *Valor:* *${sign} ${formatCurrency(exp.amount)}*\n` +
            `📂 *Categoria:* ${exp.categoryName} (${isIncome ? 'Receita' : 'Despesa'})\n` +
            `📆 *Mês:* ${monthLabel} (${exp.month})${totalMonth}\n━━━━━━━━━━━━━━━━━━━━\n` +
            `_Já está sincronizado no seu painel do Budget Buddy!_`
        );
      } else {
        await whatsapp.sendText(chatJid, `❌ *Erro ao salvar no banco:* ${result.error}`);
      }
      return true;
    }

    if (clean === '2') {
      const budgetService = await getService(chatJid, phone);
      if (!budgetService) return true;

      const categories = budgetService.getCategories(exp.type);
      const catIds = categories.map((c) => c.id);
      activeMenuByChat.set(chatJid, { type: 'select_tx_cat', txId: exp.id, categoryIds: catIds });

      const listText = categories
        .map((c, idx) => `*${idx + 1}* — ${c.name}${c.id === exp.categoryId ? ' 📍' : ''}`)
        .join('\n');

      await whatsapp.sendText(
        chatJid,
        `📂 *Escolha a categoria de ${exp.type === 'income' ? 'RECEITA' : 'DESPESA'}:*\n\n${listText}\n\n*0* — ⬅️ Voltar\n\n_Responda apenas com o número da categoria desejada._`
      );
      return true;
    }

    if (clean === '3') {
      const [currYear, currMonth] = exp.month.split('-').map(Number);
      const months: string[] = [];
      const lines: string[] = [];

      for (let i = -2; i <= 2; i++) {
        const d = new Date(currYear, currMonth - 1 + i, 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const monthStr = `${y}-${m}`;
        months.push(monthStr);
        const isCurrent = monthStr === exp.month ? ' 📍' : '';
        lines.push(`*${months.length}* — ${getMonthName(monthStr)} (${monthStr})${isCurrent}`);
      }

      activeMenuByChat.set(chatJid, { type: 'select_tx_month', txId: exp.id, months });
      await whatsapp.sendText(
        chatJid,
        `📅 *Escolha o mês do orçamento:*\n\n${lines.join('\n')}\n\n*0* — ⬅️ Voltar\n\n_Responda com o número do mês._`
      );
      return true;
    }

    if (clean === '4') {
      const budgetService = await getService(chatJid, phone);
      if (!budgetService) return true;

      exp.type = exp.type === 'income' ? 'expense' : 'income';
      const newPool = budgetService.getCategories(exp.type);
      if (newPool.length > 0) {
        exp.categoryId = newPool[0].id;
        exp.categoryName = newPool[0].name;
      }

      await sendConfirmationCard(
        chatJid,
        exp,
        `🔄 _Tipo alterado para *${exp.type === 'income' ? 'Receita' : 'Despesa'}*_`
      );
      return true;
    }

    if (clean === '0' || clean === 'nao' || clean === 'não' || clean === 'cancelar') {
      activeMenuByChat.delete(chatJid);
      pendingExpenses.delete(exp.id);
      await whatsapp.sendText(chatJid, '❌ *Operação cancelada.* Nenhuma alteração foi feita no seu sistema.');
      return true;
    }

    return false;
  }

  // 2. Seleção de Categoria da Transação
  if (menu.type === 'select_tx_cat') {
    const exp = pendingExpenses.get(menu.txId);
    if (!exp) {
      activeMenuByChat.delete(chatJid);
      return false;
    }

    if (clean === '0') {
      await sendConfirmationCard(chatJid, exp);
      return true;
    }

    const idx = parseInt(clean, 10) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < menu.categoryIds.length) {
      const budgetService = await getService(chatJid, phone);
      if (!budgetService) return true;

      const selectedId = menu.categoryIds[idx];
      const cat = budgetService.getCategories().find((c) => c.id === selectedId);
      if (cat) {
        exp.categoryId = cat.id;
        exp.categoryName = cat.name;
      }
      await sendConfirmationCard(chatJid, exp, `📂 _Categoria alterada para: *${exp.categoryName}*_`);
      return true;
    }
    return false;
  }

  // 3. Seleção de Mês da Transação
  if (menu.type === 'select_tx_month') {
    const exp = pendingExpenses.get(menu.txId);
    if (!exp) {
      activeMenuByChat.delete(chatJid);
      return false;
    }

    if (clean === '0') {
      await sendConfirmationCard(chatJid, exp);
      return true;
    }

    const idx = parseInt(clean, 10) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < menu.months.length) {
      exp.month = menu.months[idx];
      await sendConfirmationCard(chatJid, exp, `📅 _Mês alterado para: *${getMonthName(exp.month)}*_`);
      return true;
    }
    return false;
  }

  // 4. Menu de confirmação de Orçamento Planejado
  if (menu.type === 'confirm_budget') {
    const bud = pendingBudgets.get(menu.budId);
    if (!bud) {
      activeMenuByChat.delete(chatJid);
      return false;
    }

    if (clean === '1' || clean === 'sim' || clean === 's' || clean === 'ok' || clean === 'confirmar') {
      activeMenuByChat.delete(chatJid);
      const budgetService = await getService(chatJid, phone);
      if (!budgetService) return true;

      const result = await budgetService.setPlannedBudget({
        categoryId: bud.categoryId,
        month: bud.month,
        amount: bud.amount,
      });

      if (result.success) {
        pendingBudgets.delete(bud.id);
        const monthLabel = getMonthName(bud.month);
        const remainingText =
          result.remaining !== undefined
            ? `\n💡 *Já gasto nesta categoria:* ${formatCurrency(result.actual || 0)}\n🎯 *Restante disponível:* ${formatCurrency(result.remaining)}`
            : '';

        await whatsapp.sendText(
          chatJid,
          `📋 *Orçamento Definido com Sucesso!*\n━━━━━━━━━━━━━━━━━━━━\n` +
            `📂 *Categoria:* ${bud.categoryName}\n` +
            `💰 *Valor planejado:* *${formatCurrency(bud.amount)}*\n` +
            `📆 *Mês:* ${monthLabel} (${bud.month})${remainingText}\n━━━━━━━━━━━━━━━━━━━━\n` +
            `_Sincronizado no seu painel do Budget Buddy!_`
        );
      } else {
        await whatsapp.sendText(chatJid, `❌ *Erro ao salvar orçamento:* ${result.error}`);
      }
      return true;
    }

    if (clean === '2') {
      const budgetService = await getService(chatJid, phone);
      if (!budgetService) return true;

      const categories = budgetService.getCategories();
      const catIds = categories.map((c) => c.id);
      activeMenuByChat.set(chatJid, { type: 'select_budget_cat', budId: bud.id, categoryIds: catIds });

      const listText = categories
        .map((c, idx) => `*${idx + 1}* — ${c.name}${c.id === bud.categoryId ? ' 📍' : ''}`)
        .join('\n');

      await whatsapp.sendText(
        chatJid,
        `📂 *Escolha a categoria para o orçamento:*\n\n${listText}\n\n*0* — ⬅️ Voltar`
      );
      return true;
    }

    if (clean === '3') {
      const [currYear, currMonth] = bud.month.split('-').map(Number);
      const months: string[] = [];
      const lines: string[] = [];

      for (let i = -2; i <= 2; i++) {
        const d = new Date(currYear, currMonth - 1 + i, 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const monthStr = `${y}-${m}`;
        months.push(monthStr);
        const isCurrent = monthStr === bud.month ? ' 📍' : '';
        lines.push(`*${months.length}* — ${getMonthName(monthStr)} (${monthStr})${isCurrent}`);
      }

      activeMenuByChat.set(chatJid, { type: 'select_budget_month', budId: bud.id, months });
      await whatsapp.sendText(
        chatJid,
        `📅 *Escolha o mês do orçamento:*\n\n${lines.join('\n')}\n\n*0* — ⬅️ Voltar`
      );
      return true;
    }

    if (clean === '0' || clean === 'nao' || clean === 'não' || clean === 'cancelar') {
      activeMenuByChat.delete(chatJid);
      pendingBudgets.delete(bud.id);
      await whatsapp.sendText(chatJid, '❌ *Operação cancelada.* Nenhum orçamento foi definido.');
      return true;
    }

    return false;
  }

  // 5. Seleção de Categoria do Orçamento
  if (menu.type === 'select_budget_cat') {
    const bud = pendingBudgets.get(menu.budId);
    if (!bud) {
      activeMenuByChat.delete(chatJid);
      return false;
    }
    if (clean === '0') {
      await sendBudgetConfirmationCard(chatJid, bud);
      return true;
    }
    const idx = parseInt(clean, 10) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < menu.categoryIds.length) {
      const budgetService = await getService(chatJid, phone);
      if (!budgetService) return true;
      const cat = budgetService.getCategories().find((c) => c.id === menu.categoryIds[idx]);
      if (cat) {
        bud.categoryId = cat.id;
        bud.categoryName = cat.name;
      }
      await sendBudgetConfirmationCard(chatJid, bud);
      return true;
    }
    return false;
  }

  // 6. Seleção de Mês do Orçamento
  if (menu.type === 'select_budget_month') {
    const bud = pendingBudgets.get(menu.budId);
    if (!bud) {
      activeMenuByChat.delete(chatJid);
      return false;
    }
    if (clean === '0') {
      await sendBudgetConfirmationCard(chatJid, bud);
      return true;
    }
    const idx = parseInt(clean, 10) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < menu.months.length) {
      bud.month = menu.months[idx];
      await sendBudgetConfirmationCard(chatJid, bud);
      return true;
    }
    return false;
  }

  // 7. Seleção de Voz do Assistente
  if (menu.type === 'select_voice') {
    if (clean === '0') {
      activeMenuByChat.delete(chatJid);
      await whatsapp.sendText(chatJid, '👌 Mantida a voz atual.');
      return true;
    }
    const idx = parseInt(clean, 10) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < AVAILABLE_VOICES.length) {
      activeMenuByChat.delete(chatJid);
      const selected = AVAILABLE_VOICES[idx];
      ttsService.setVoice(selected.id);
      await whatsapp.sendText(
        chatJid,
        `✅ *Voz alterada para ${ttsService.getVoiceName()}!*\nA partir de agora falarei com você assim.`
      );
      try {
        const audioBuf = await ttsService.textToSpeechBuffer('Olá! Esta é a minha nova voz no seu Budget Buddy.');
        await whatsapp.sendAudio(chatJid, audioBuf);
      } catch (err: any) {
        console.warn('[TTS] Erro demo:', err.message);
      }
      return true;
    }
    return false;
  }

  return false;
}

// ---------------- COMANDOS DE TEXTO ----------------

async function handleCommand(chatJid: string, phone: string, rawText: string): Promise<boolean> {
  const trimmed = rawText.trim();
  const lower = trimmed.toLowerCase();

  if (
    lower === '/start' ||
    lower === '/ajuda' ||
    lower === '/help' ||
    lower === 'ajuda' ||
    lower === 'menu' ||
    lower === 'oi' ||
    lower === 'olá' ||
    lower === 'ola'
  ) {
    await getService(chatJid, phone);
    const user = userManager.getUser(phone);

    const welcome =
      `👋 *Olá! Sou o seu consultor financeiro do Budget Buddy no WhatsApp.*\n\n` +
      `👤 *Conectado como:* \`${user?.email || config.userEmail}\`\n\n` +
      `📊 *FAÇA PERGUNTAS SOBRE SUAS CONTAS (Texto ou Áudio):*\n` +
      `• _"Quanto eu gastei com alimentação esse mês?"_\n` +
      `• _"Qual foi meu salário registrado este mês?"_\n` +
      `• _"Quanto eu fiz de dinheiro extra?"_\n` +
      `• _"Qual é o meu saldo atual?"_\n\n` +
      `💸 *OU REGISTRE GASTOS E RECEITAS:*\n` +
      `📸 *Envie foto/print* de comprovante (PIX, nota fiscal);\n` +
      `📄 *Envie arquivo PDF* do comprovante;\n` +
      `🎤 *Envie áudio:* _"Gastei 45 no almoço"_ ou _"Recebi 300 de freela"_\n` +
      `💬 *Envie texto:* _"Uber 28,50"_, _"Recebi 500"_\n\n` +
      `⚙️ *Comandos úteis:*\n` +
      `• \`/conta\` - Ver a conta conectada\n` +
      `• \`/categorias\` - Suas categorias do app\n` +
      `• \`/voz\` - Escolher a voz do assistente\n` +
      `• \`/conectar email senha\` - Trocar conta`;

    await whatsapp.sendText(chatJid, welcome);
    return true;
  }

  if (lower.startsWith('/conectar')) {
    const parts = trimmed.split(' ').filter(Boolean);
    if (parts.length < 3) {
      await whatsapp.sendText(
        chatJid,
        `⚠️ *Formato incorreto.*\n\nEnvie no formato:\n\`/conectar seu-email@exemplo.com sua-senha\``
      );
      return true;
    }

    const email = parts[1].trim();
    const password = parts.slice(2).join(' ').trim();

    await whatsapp.sendText(chatJid, '🔄 _Conectando ao Budget Buddy..._');
    const result = await userManager.connectUser(phone, email, password);

    if (result.success && result.service) {
      const cats = await result.service.refreshCategories();
      await whatsapp.sendText(
        chatJid,
        `✅ *Conta conectada com sucesso!*\n\n` +
          `👤 *Usuário:* \`${email}\`\n` +
          `📂 *Categorias carregadas:* ${cats.length}\n\n` +
          `Agora você já pode mandar comprovantes, falar por áudio ou perguntar sobre suas contas! 🚀`
      );
    } else {
      await whatsapp.sendText(
        chatJid,
        `❌ *Falha ao conectar:*\n${result.error || 'Verifique se o e-mail e a senha estão corretos no app.'}`
      );
    }
    return true;
  }

  if (lower === '/desconectar') {
    const ok = userManager.disconnectUser(phone);
    if (ok) {
      await whatsapp.sendText(chatJid, '🚪 *Conta desconectada.* Para reconectar, use `/conectar`.');
    } else {
      await whatsapp.sendText(chatJid, 'Nenhuma conta estava conectada.');
    }
    return true;
  }

  if (lower === '/conta' || lower === '/status') {
    const service = await getService(chatJid, phone);
    const user = userManager.getUser(phone);
    const cats = service ? service.getCategories() : [];

    await whatsapp.sendText(
      chatJid,
      `👤 *Sua Conta Conectada:*\n\n` +
        `• E-mail: \`${user?.email || config.userEmail}\`\n` +
        `• Categorias no app: *${cats.length}*\n` +
        `• Voz atual: *${ttsService.getVoiceName()}*`
    );
    return true;
  }

  if (lower === '/categorias' || lower === 'categorias') {
    const service = await getService(chatJid, phone);
    if (!service) return true;

    const categories = await service.refreshCategories();
    if (categories.length === 0) {
      await whatsapp.sendText(chatJid, 'Nenhuma categoria encontrada.');
      return true;
    }

    const incomes = categories.filter((c) => c.type === 'income');
    const expenses = categories.filter((c) => c.type === 'expense');

    let text = '📂 *Suas Categorias no Budget Buddy:*\n\n';
    text += '💰 *RECEITAS (Entradas):*\n';
    text += incomes.map((c, i) => `${i + 1}. ${c.name}`).join('\n') || 'Nenhuma cadastrada';
    text += '\n\n💸 *DESPESAS (Saídas):*\n';
    text += expenses.map((c, i) => `${i + 1}. ${c.name}`).join('\n') || 'Nenhuma cadastrada';

    await whatsapp.sendText(chatJid, text);
    return true;
  }

  if (lower === '/voz' || lower === 'voz') {
    const current = ttsService.getVoice();
    const lines = AVAILABLE_VOICES.map(
      (v, idx) => `*${idx + 1}* — ${v.name}${v.id === current ? ' ✅' : ''}`
    );

    activeMenuByChat.set(chatJid, { type: 'select_voice' });
    await whatsapp.sendText(
      chatJid,
      `🎙️ *Escolha a voz do seu Assistente:*\n\n${lines.join('\n')}\n\n*0* — Cancelar\n\n_Responda com o número da voz desejada._`
    );
    return true;
  }

  return false;
}

// ---------------- HANDLER PRINCIPAL DE MENSAGENS DO WHATSAPP ----------------

whatsapp.onConnected(async (jid, phone) => {
  lastActiveAdminJid = jid;
  setTimeout(async () => {
    try {
      await whatsapp.sendText(
        jid,
        `🟢 *Budget Buddy conectado ao seu WhatsApp!*\n\n` +
          `Tudo funciona igualzinho ao Telegram aqui na sua conversa pessoal:\n` +
          `• 📸 *Fotos/PDFs* de comprovantes\n` +
          `• 🎤 *Áudios* (ex: _"Gastei 45 no almoço"_ ou _"Quanto gastei esse mês?"_)\n` +
          `• 💬 *Textos* (ex: _"Uber 25"_)\n` +
          `• 📧 *Alertas automáticos* do Mercado Pago e PicPay\n\n` +
          `Digite */ajuda* ou mande qualquer gasto para testar!`
      );
      console.log(`[WhatsApp] Mensagem de boas-vindas enviada para ${phone}`);
    } catch (err: any) {
      console.warn('[WhatsApp] Aviso ao enviar boas-vindas:', err.message);
    }
  }, 1500);
});

whatsapp.onMessage(async (msg: IncomingWhatsAppMessage) => {
  const { chatJid, phone, type } = msg;
  lastActiveAdminJid = chatJid;

  // 1. Mensagens de Texto
  if (type === 'text') {
    const text = (msg.text || '').trim();
    if (!text) return;

    // Primeiro verifica se é resposta a um menu numerado pendente (1, 2, 3, 0...)
    const handledMenu = await handleMenuReply(chatJid, phone, text);
    if (handledMenu) return;

    // Verifica se é comando (/ajuda, /categorias, /voz, etc.)
    const handledCmd = await handleCommand(chatJid, phone, text);
    if (handledCmd) return;

    const budgetService = await getService(chatJid, phone);
    if (!budgetService) return;

    try {
      const intentRes = await aiService.detectIntent({ textPrompt: text });

      if (intentRes.intent === 'QUERY') {
        const month =
          intentRes.month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const summary = await budgetService.getMonthBudgetSummary(month);

        if (!summary) {
          await whatsapp.sendText(chatJid, '❌ Não foi possível acessar suas contas no momento.');
          return;
        }

        const answer = await aiService.answerFinancialQuery({
          question: text,
          budgetSummary: summary,
        });

        await whatsapp.sendText(chatJid, answer.fullText);

        try {
          const audioBuffer = await ttsService.textToSpeechBuffer(answer.speechText);
          await whatsapp.sendAudio(chatJid, audioBuffer);
        } catch (ttsErr: any) {
          console.warn('[TTS] Falha ao enviar áudio falado:', ttsErr.message);
        }
        return;
      }

      if (intentRes.intent === 'BUDGET') {
        await handleBudgetIntent(chatJid, budgetService, intentRes);
        return;
      }

      const categories = budgetService.getCategories();
      const extracted = await aiService.parseExpense({
        textPrompt: text,
        categories,
      });

      const txId = Math.random().toString(36).substring(2, 9);
      const pending: PendingTransaction = { ...extracted, id: txId, chatJid, createdAt: Date.now() };
      pendingExpenses.set(txId, pending);

      await sendConfirmationCard(chatJid, pending);
    } catch (err: any) {
      console.error('Erro ao processar texto no WhatsApp:', err);
      await whatsapp.sendText(chatJid, `❌ *Não consegui processar:* ${err.message}`);
    }
    return;
  }

  // 2. Fotos / Prints de Comprovantes
  if (type === 'image') {
    const budgetService = await getService(chatJid, phone);
    if (!budgetService) return;

    await whatsapp.sendText(chatJid, '🔍 _Lendo comprovante com IA..._');

    try {
      const buffer = await whatsapp.downloadMedia(msg.rawMessage);
      const categories = budgetService.getCategories();
      const extracted = await aiService.parseExpense({
        mediaBuffer: buffer,
        mimeType: msg.mimeType || 'image/jpeg',
        textPrompt: msg.caption,
        categories,
      });

      const txId = Math.random().toString(36).substring(2, 9);
      const pending: PendingTransaction = { ...extracted, id: txId, chatJid, createdAt: Date.now() };
      pendingExpenses.set(txId, pending);

      await sendConfirmationCard(chatJid, pending);
    } catch (err: any) {
      console.error('Erro ao processar foto no WhatsApp:', err);
      await whatsapp.sendText(chatJid, `❌ *Não consegui ler o comprovante:* ${err.message}`);
    }
    return;
  }

  // 3. Documentos (PDF ou Imagem)
  if (type === 'document') {
    const budgetService = await getService(chatJid, phone);
    if (!budgetService) return;

    const mime = msg.mimeType || '';
    if (!mime.startsWith('image/') && mime !== 'application/pdf') {
      await whatsapp.sendText(chatJid, '⚠️ Por favor envie o comprovante em formato de imagem (JPG, PNG) ou PDF.');
      return;
    }

    await whatsapp.sendText(chatJid, '📄 _Processando documento com IA..._');

    try {
      const buffer = await whatsapp.downloadMedia(msg.rawMessage);
      const categories = budgetService.getCategories();
      const extracted = await aiService.parseExpense({
        mediaBuffer: buffer,
        mimeType: mime,
        textPrompt: msg.caption,
        categories,
      });

      const txId = Math.random().toString(36).substring(2, 9);
      const pending: PendingTransaction = { ...extracted, id: txId, chatJid, createdAt: Date.now() };
      pendingExpenses.set(txId, pending);

      await sendConfirmationCard(chatJid, pending);
    } catch (err: any) {
      console.error('Erro ao processar documento no WhatsApp:', err);
      await whatsapp.sendText(chatJid, `❌ *Erro ao processar arquivo:* ${err.message}`);
    }
    return;
  }

  // 4. Áudios / Notas de Voz
  if (type === 'audio') {
    const budgetService = await getService(chatJid, phone);
    if (!budgetService) return;

    await whatsapp.sendText(chatJid, '🎧 _Processando seu áudio..._');

    try {
      const buffer = await whatsapp.downloadMedia(msg.rawMessage);

      const intentRes = await aiService.detectIntent({
        mediaBuffer: buffer,
        mimeType: 'audio/ogg',
      });

      if (intentRes.intent === 'QUERY') {
        const month =
          intentRes.month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const summary = await budgetService.getMonthBudgetSummary(month);

        if (!summary) {
          await whatsapp.sendText(chatJid, '❌ Não foi possível carregar as informações do seu orçamento.');
          return;
        }

        const answer = await aiService.answerFinancialQuery({
          question: intentRes.transcription || 'Qual a situação do meu orçamento?',
          budgetSummary: summary,
        });

        await whatsapp.sendText(chatJid, answer.fullText);

        try {
          const audioBuffer = await ttsService.textToSpeechBuffer(answer.speechText);
          await whatsapp.sendAudio(chatJid, audioBuffer);
        } catch (ttsErr: any) {
          console.warn('[TTS] Falha ao enviar áudio falado:', ttsErr.message);
        }
        return;
      }

      if (intentRes.intent === 'BUDGET') {
        await handleBudgetIntent(chatJid, budgetService, intentRes);
        return;
      }

      const categories = budgetService.getCategories();
      const extracted = await aiService.parseExpense({
        mediaBuffer: buffer,
        mimeType: 'audio/ogg',
        categories,
      });

      const txId = Math.random().toString(36).substring(2, 9);
      const pending: PendingTransaction = { ...extracted, id: txId, chatJid, createdAt: Date.now() };
      pendingExpenses.set(txId, pending);

      await sendConfirmationCard(chatJid, pending);
    } catch (err: any) {
      console.error('Erro ao processar áudio no WhatsApp:', err);
      await whatsapp.sendText(chatJid, `❌ *Não consegui processar o áudio:* ${err.message}`);
    }
    return;
  }
});

// ---------------- E-MAILS ENCAMINHADOS (MERCADO PAGO) ----------------

const processedEmailIds = new Set<string>();

function resolveAdminTargetJid(): string {
  if (lastActiveAdminJid) return lastActiveAdminJid;
  return whatsapp.getDefaultAdminTarget();
}

async function handleIncomingEmail(payload: {
  messageId?: string;
  subject?: string;
  body?: string;
  from?: string;
  date?: string;
}): Promise<{ status: 'duplicate' | 'ignored' | 'sent'; reason?: string }> {
  const subject = (payload.subject || '').trim();
  const body = (payload.body || '').trim();
  const messageId = payload.messageId || '';

  if (messageId && processedEmailIds.has(messageId)) {
    return { status: 'duplicate' };
  }

  const targetJid = resolveAdminTargetJid();
  if (!targetJid) {
    throw new Error('WhatsApp ainda não está conectado. Escaneie o QR Code na página do bot primeiro.');
  }

  const budgetService = await userManager.getAdminBudgetService();
  if (!budgetService) {
    throw new Error('Conta do administrador não conectada ao Budget Buddy');
  }

  const classification = await aiService.classifyEmail({ subject, body });
  if (!classification.isTransaction) {
    console.log(`[Email] Ignorado: "${subject}" (${classification.reason})`);
    if (messageId) processedEmailIds.add(messageId);
    return { status: 'ignored', reason: classification.reason };
  }

  const emailDate = payload.date ? new Date(payload.date) : new Date();
  const extracted = await aiService.parseExpense({
    textPrompt:
      `E-mail de notificação financeira (remetente: ${payload.from || 'Mercado Pago'}).\n` +
      `Assunto: ${subject}\n\n${body.substring(0, 4000)}`,
    categories: budgetService.getCategories(),
    fallbackDate: isNaN(emailDate.getTime()) ? new Date() : emailDate,
  });

  const txId = Math.random().toString(36).substring(2, 9);
  const pending: PendingTransaction = { ...extracted, id: txId, chatJid: targetJid, createdAt: Date.now() };
  pendingExpenses.set(txId, pending);

  await sendConfirmationCard(
    targetJid,
    pending,
    `📧 *Novo e-mail do Mercado Pago detectado*\n_${subject}_`
  );

  if (messageId) processedEmailIds.add(messageId);
  console.log(`[Email -> WhatsApp] Transação enviada para confirmação: ${extracted.title} - R$ ${extracted.amount}`);
  return { status: 'sent' };
}

// ---------------- NOTIFICAÇÕES DO CELULAR (PICPAY / BANCOS) ----------------

const recentNotificationHashes = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [hash, time] of recentNotificationHashes.entries()) {
    if (now - time > 60 * 60 * 1000) {
      recentNotificationHashes.delete(hash);
    }
  }
}, 30 * 60 * 1000);

async function handleIncomingNotification(payload: {
  app?: string;
  title?: string;
  text?: string;
  date?: string;
}): Promise<{ status: 'duplicate' | 'ignored' | 'sent'; reason?: string; title?: string; amount?: number }> {
  const app = (payload.app || 'PicPay').trim();
  const notifTitle = (payload.title || '').trim();
  const notifText = (payload.text || '').trim();

  if (!notifText && !notifTitle) {
    return { status: 'ignored', reason: 'Notificação vazia' };
  }

  const hashKey = `${app}:${notifTitle}:${notifText}`;
  const now = Date.now();
  if (recentNotificationHashes.has(hashKey)) {
    const lastTime = recentNotificationHashes.get(hashKey)!;
    if (now - lastTime < 10 * 60 * 1000) {
      return { status: 'duplicate', reason: 'Notificação duplicada recente' };
    }
  }

  const targetJid = resolveAdminTargetJid();
  if (!targetJid) {
    throw new Error('WhatsApp ainda não está conectado. Escaneie o QR Code na página do bot primeiro.');
  }

  const budgetService = await userManager.getAdminBudgetService();
  if (!budgetService) {
    throw new Error('Conta do administrador não conectada ao Budget Buddy');
  }

  const classification = await aiService.classifyNotification({ app, title: notifTitle, text: notifText });
  if (!classification.isTransaction) {
    console.log(`[Notificação ${app}] Ignorada: "${notifTitle} - ${notifText}" (${classification.reason})`);
    recentNotificationHashes.set(hashKey, now);
    return { status: 'ignored', reason: classification.reason };
  }

  const notifDate = payload.date ? new Date(payload.date) : new Date();
  const extracted = await aiService.parseExpense({
    textPrompt:
      `Notificação push de aplicativo financeiro (App: ${app}).\n` +
      `Título: ${notifTitle}\n` +
      `Texto: ${notifText}`,
    categories: budgetService.getCategories(),
    fallbackDate: isNaN(notifDate.getTime()) ? new Date() : notifDate,
  });

  const txId = Math.random().toString(36).substring(2, 9);
  const pending: PendingTransaction = { ...extracted, id: txId, chatJid: targetJid, createdAt: Date.now() };
  pendingExpenses.set(txId, pending);

  const appEmoji = app.toLowerCase().includes('picpay') ? '💚' : '📱';
  await sendConfirmationCard(
    targetJid,
    pending,
    `${appEmoji} *Nova transação detectada no ${app}*\n_${notifTitle || notifText}_`
  );

  recentNotificationHashes.set(hashKey, now);
  console.log(`[Notificação ${app} -> WhatsApp] Transação enviada para confirmação: ${extracted.title} - R$ ${extracted.amount}`);
  return { status: 'sent', title: extracted.title, amount: extracted.amount };
}

// ---------------- PÁGINA WEB DE CONEXÃO (QR CODE / PAIRING CODE) ----------------

function renderStatusPage(): string {
  const st = whatsapp.getStatus();
  const isConnected = st.status === 'connected';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${!isConnected ? '<meta http-equiv="refresh" content="6" />' : ''}
  <title>Budget Buddy • WhatsApp Bot</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 28px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4);
    }
    h1 { font-size: 1.35rem; margin: 0 0 8px; color: #22c55e; }
    p { font-size: 0.95rem; color: #cbd5e1; line-height: 1.5; margin: 8px 0; }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 999px;
      font-weight: 600;
      font-size: 0.85rem;
      margin-bottom: 16px;
    }
    .badge.ok { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid #22c55e; }
    .badge.wait { background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid #eab308; }
    .qr-box {
      background: #ffffff;
      padding: 12px;
      border-radius: 12px;
      display: inline-block;
      margin: 14px 0;
    }
    .qr-box img { display: block; width: 260px; height: 260px; }
    .steps {
      text-align: left;
      background: #0f172a;
      padding: 14px 18px;
      border-radius: 10px;
      font-size: 0.88rem;
      color: #94a3b8;
      margin-top: 14px;
    }
    .steps li { margin: 6px 0; }
    .pair-box {
      margin-top: 18px;
      padding-top: 16px;
      border-top: 1px solid #334155;
    }
    input {
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid #475569;
      background: #0f172a;
      color: #fff;
      width: 65%;
      font-size: 0.9rem;
    }
    button {
      padding: 10px 14px;
      border-radius: 8px;
      border: none;
      background: #22c55e;
      color: #052e16;
      font-weight: 700;
      cursor: pointer;
      font-size: 0.9rem;
    }
    #pairResult {
      margin-top: 12px;
      font-size: 1.2rem;
      font-weight: 700;
      letter-spacing: 3px;
      color: #4ade80;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>🤖 Budget Buddy WhatsApp</h1>
    ${
      isConnected
        ? `<div class="badge ok">🟢 Conectado (${st.connectedPhone})</div>
           <p>Seu WhatsApp está conectado e pronto!</p>
           <div class="steps">
             <strong>Como usar:</strong>
             <ol>
               <li>Abra o seu WhatsApp e entre na conversa <strong>com você mesmo ("Você")</strong>.</li>
               <li>Mande um <code>/ajuda</code>, um áudio (ex: <em>"Gastei 40 no mercado"</em>) ou uma foto de comprovante!</li>
               <li>Os e-mails do <strong>Mercado Pago</strong> e notificações do <strong>PicPay</strong> também chegarão direto lá.</li>
             </ol>
           </div>`
        : `<div class="badge wait">📲 Aguardando Conexão</div>
           ${
             st.qrDataUrl
               ? `<div class="qr-box"><img src="${st.qrDataUrl}" alt="QR Code WhatsApp" /></div>
                  <p>Abra o WhatsApp no celular &rarr; <strong>Aparelhos conectados</strong> &rarr; <strong>Conectar aparelho</strong> e escaneie o QR Code acima.</p>`
               : `<p>Gerando QR Code... A página atualizará automaticamente em instantes.</p>`
           }
           <div class="pair-box">
             <p style="font-size:0.85rem;">Ou conecte pelo <strong>Código de 8 dígitos</strong> (sem usar a câmera):</p>
             <input id="phoneInput" type="text" placeholder="Ex: 5534999999999" />
             <button onclick="getCode()">Gerar Código</button>
             <div id="pairResult"></div>
           </div>
           <script>
             async function getCode() {
               const phone = document.getElementById('phoneInput').value.trim();
               const el = document.getElementById('pairResult');
               el.textContent = 'Gerando...';
               try {
                 const r = await fetch('/pairing-code?phone=' + encodeURIComponent(phone));
                 const d = await r.json();
                 el.textContent = d.code ? d.code : ('Erro: ' + (d.error || 'Tente novamente'));
               } catch (e) {
                 el.textContent = 'Erro ao gerar código';
               }
             }
           </script>`
    }
  </div>
</body>
</html>`;
}

// ---------------- INICIALIZAÇÃO ----------------

async function bootstrap() {
  console.log('Iniciando Budget Buddy WhatsApp Bot (Conexão Direta Baileys)...');
  await userManager.initDefaultAdmin();
  await whatsapp.connect();

  const port = process.env.PORT || 3000;
  http
    .createServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');

      // Endpoint para gerar Código de Pareamento de 8 dígitos
      if (req.method === 'GET' && url.pathname === '/pairing-code') {
        const phone = url.searchParams.get('phone') || '';
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        try {
          const code = await whatsapp.requestPairingCode(phone);
          res.end(JSON.stringify({ ok: true, code }));
        } catch (err: any) {
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return;
      }

      // Webhooks de E-mail (Mercado Pago) e Notificações de Celular (PicPay / Bancos)
      if (req.method === 'POST' && (url.pathname === '/email-webhook' || url.pathname === '/notification-webhook')) {
        let raw = '';
        req.on('data', (chunk) => {
          raw += chunk;
          if (raw.length > 200_000) req.destroy();
        });
        req.on('end', async () => {
          const sendJson = (status: number, body: any) => {
            res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(body));
          };
          try {
            const payload = JSON.parse(raw || '{}');
            if (!config.emailWebhookSecret || payload.secret !== config.emailWebhookSecret) {
              return sendJson(401, { ok: false, error: 'unauthorized' });
            }
            if (url.pathname === '/notification-webhook') {
              const result = await handleIncomingNotification(payload);
              return sendJson(200, { ok: true, ...result });
            } else {
              const result = await handleIncomingEmail(payload);
              return sendJson(200, { ok: true, ...result });
            }
          } catch (err: any) {
            console.error(`[Webhook ${url.pathname}] Erro:`, err.message);
            sendJson(500, { ok: false, error: err.message });
          }
        });
        return;
      }

      // Página principal com QR Code / Status
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderStatusPage());
    })
    .listen(port, () => {
      console.log(`🌐 Painel de conexão (QR Code) ativo em: http://localhost:${port}`);
    });
}

bootstrap().catch((err) => {
  console.error('Erro fatal ao iniciar bot:', err);
});
