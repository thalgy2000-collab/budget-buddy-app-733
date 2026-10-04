import http from 'http';
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { config, validateConfig } from './config.js';
import { BudgetService } from './supabase.js';
import { AiService, ExtractedExpense } from './ai.js';
import { TtsService, AVAILABLE_VOICES } from './tts.js';
import { UserManager } from './userManager.js';

validateConfig();

const bot = new Bot(config.telegramToken);
const userManager = new UserManager();
const aiService = new AiService();
const ttsService = new TtsService();

// Armazenamento em memória para transações pendentes de confirmação
interface PendingTransaction extends ExtractedExpense {
  id: string;
  chatId: number;
  createdAt: number;
}
const pendingExpenses = new Map<string, PendingTransaction>();

// Armazenamento em memória para orçamentos planejados pendentes de confirmação
interface PendingBudget {
  id: string;
  chatId: number;
  categoryId: string;
  categoryName: string;
  amount: number;
  month: string;
  createdAt: number;
}
const pendingBudgets = new Map<string, PendingBudget>();

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
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const idx = parseInt(month, 10) - 1;
  return `${months[idx] || month}/${year}`;
}

function buildConfirmationCard(exp: PendingTransaction): { text: string; keyboard: InlineKeyboard } {
  const monthLabel = getMonthName(exp.month);
  const isIncome = exp.type === 'income';

  const text = isIncome
    ? `💵 *Receita Identificada (Entrada):*
━━━━━━━━━━━━━━━━━━━━
🏷️ *Origem / Descrição:* ${exp.title}
💰 *Valor:* *+ ${formatCurrency(exp.amount)}*
📅 *Data:* ${exp.displayDate}
📆 *Mês no Orçamento:* *${monthLabel}* (${exp.month})
📂 *Categoria sugerida:* *${exp.categoryName}*
${exp.explanation ? `💡 _${exp.explanation}_\n` : ''}━━━━━━━━━━━━━━━━━━━━
_Deseja registrar essa RECEITA no seu Budget Buddy?_`
    : `🧾 *Despesa Identificada (Saída):*
━━━━━━━━━━━━━━━━━━━━
🏷️ *Estabelecimento:* ${exp.title}
💰 *Valor:* *- ${formatCurrency(exp.amount)}*
📅 *Data:* ${exp.displayDate}
📆 *Mês no Orçamento:* *${monthLabel}* (${exp.month})
📂 *Categoria sugerida:* *${exp.categoryName}*
${exp.explanation ? `💡 _${exp.explanation}_\n` : ''}━━━━━━━━━━━━━━━━━━━━
_Deseja registrar essa DESPESA no seu Budget Buddy?_`;

  const btnConfirmLabel = isIncome
    ? `✅ Confirmar Receita em ${monthLabel}`
    : `✅ Confirmar Despesa em ${monthLabel}`;

  const keyboard = new InlineKeyboard()
    .text(btnConfirmLabel, `confirm:${exp.id}`)
    .row()
    .text(`📂 Trocar Categoria`, `change_cat:${exp.id}`)
    .text(`📅 Trocar Mês`, `change_month:${exp.id}`)
    .row()
    .text(`❌ Cancelar`, `cancel:${exp.id}`);

  return { text, keyboard };
}

function buildBudgetConfirmationCard(bud: PendingBudget): { text: string; keyboard: InlineKeyboard } {
  const monthLabel = getMonthName(bud.month);

  const text =
    `📋 *Orçamento / Planejamento Identificado:*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📂 *Categoria:* *${bud.categoryName}*\n` +
    `💰 *Valor planejado:* *${formatCurrency(bud.amount)}*\n` +
    `📆 *Mês:* *${monthLabel}* (${bud.month})\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `_Deseja definir esse orçamento no seu Budget Buddy?_`;

  const keyboard = new InlineKeyboard()
    .text(`✅ Confirmar Orçamento`, `confirm_budget:${bud.id}`)
    .row()
    .text(`📂 Trocar Categoria`, `change_budget_cat:${bud.id}`)
    .text(`📅 Trocar Mês`, `change_budget_month:${bud.id}`)
    .row()
    .text(`❌ Cancelar`, `cancel_budget:${bud.id}`);

  return { text, keyboard };
}

async function handleBudgetIntent(
  ctx: any,
  budgetService: BudgetService,
  intentRes: { month?: string; transcription?: string; budgetAmount?: number; categoryHint?: string },
  statusMsgId: number,
): Promise<void> {
  const amount = intentRes.budgetAmount;
  const categoryHint = intentRes.categoryHint?.toLowerCase() || '';
  const month = intentRes.month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  if (!amount || amount <= 0) {
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsgId,
      `⚠️ Não consegui identificar o valor do orçamento. Tente algo como:\n_"Quero gastar 200 reais com alimentação esse mês"_`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
    return;
  }

  // Buscar a categoria mais próxima do hint
  const categories = budgetService.getCategories();
  let matchedCategory = categories.find(
    (c) => c.name.toLowerCase() === categoryHint
  );
  if (!matchedCategory) {
    matchedCategory = categories.find(
      (c) => c.name.toLowerCase().includes(categoryHint) || categoryHint.includes(c.name.toLowerCase())
    );
  }
  if (!matchedCategory) {
    // Fuzzy: pegar categorias de despesa como fallback
    const expenseCats = categories.filter((c) => c.type === 'expense');
    matchedCategory = expenseCats[0] || categories[0];
  }

  if (!matchedCategory) {
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsgId,
      `❌ Nenhuma categoria encontrada no seu perfil. Crie categorias primeiro no app.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
    return;
  }

  const budId = Math.random().toString(36).substring(2, 9);
  const pending: PendingBudget = {
    id: budId,
    chatId: ctx.chat.id,
    categoryId: matchedCategory.id,
    categoryName: matchedCategory.name,
    amount,
    month,
    createdAt: Date.now(),
  };
  pendingBudgets.set(budId, pending);

  const card = buildBudgetConfirmationCard(pending);
  await ctx.api.deleteMessage(ctx.chat.id, statusMsgId).catch(() => {});
  await ctx.reply(card.text, { reply_markup: card.keyboard, parse_mode: 'Markdown' });
}

async function getService(ctx: any): Promise<BudgetService | null> {
  let service = userManager.getBudgetService(ctx.chat.id);
  if (!service) {
    if (ctx.chat.id === 5750306147 && config.userEmail && config.userPassword) {
      await userManager.initDefaultAdmin();
      service = userManager.getBudgetService(ctx.chat.id);
    }
  }

  if (!service) {
    await ctx.reply(
      `👋 *Olá! Você ainda não conectou sua conta do Budget Buddy.*\n\n` +
      `Para gerenciar suas contas por aqui (por áudio, texto ou comprovante), envie:\n\n` +
      `👉 \`/conectar seu-email@exemplo.com sua-senha\`\n\n` +
      `🔒 _Por segurança, a mensagem com sua senha é apagada do Telegram logo após ser enviada._`,
      { parse_mode: 'Markdown' }
    );
    return null;
  }
  return service;
}

// ---------------- COMANDOS BÁSICOS ----------------

bot.command(['start', 'ajuda', 'help'], async (ctx) => {
  const user = userManager.getUser(ctx.chat.id);

  let welcome = `👋 *Olá! Sou o seu consultor financeiro do Budget Buddy.*\n\n`;

  if (!user) {
    welcome +=
      `⚠️ *Sua conta ainda não está conectada.*\n` +
      `Para começar, use o comando:\n` +
      `👉 \`/conectar seu-email@exemplo.com sua-senha\`\n\n`;
  } else {
    welcome +=
      `👤 *Conectado como:* \`${user.email}\`\n\n` +
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
      `• /conta - Ver a conta conectada\n` +
      `• /categorias - Suas categorias do app\n` +
      `• /voz - Escolher a voz do assistente\n` +
      `• /desconectar - Desconectar este Telegram\n`;
  }

  await ctx.reply(welcome, { parse_mode: 'Markdown' });
});

// CONECTAR NOVO USUÁRIO
bot.command('conectar', async (ctx) => {
  const rawText = ctx.message?.text || '';
  const parts = rawText.split(' ').filter(Boolean);

  // Apagar mensagem original com a senha por segurança
  await ctx.deleteMessage().catch(() => {});

  if (parts.length < 3) {
    return ctx.reply(
      `⚠️ *Formato incorreto.*\n\n` +
      `Envie no formato:\n` +
      `\`/conectar seu-email@exemplo.com sua-senha\``,
      { parse_mode: 'Markdown' }
    );
  }

  const email = parts[1].trim();
  const password = parts.slice(2).join(' ').trim();

  const statusMsg = await ctx.reply('🔄 _Conectando ao Budget Buddy..._', { parse_mode: 'Markdown' });

  const result = await userManager.connectUser(ctx.chat.id, email, password);

  if (result.success && result.service) {
    const cats = await result.service.refreshCategories();
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `✅ *Conta conectada com sucesso!*\n\n` +
      `👤 *Usuário:* \`${email}\`\n` +
      `📂 *Categorias carregadas:* ${cats.length}\n\n` +
      `Agora você já pode mandar comprovantes, falar por áudio ou perguntar sobre suas contas! 🚀`,
      { parse_mode: 'Markdown' }
    );
  } else {
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `❌ *Falha ao conectar:*\n${result.error || 'Verifique se o e-mail e a senha estão corretos no app.'}`,
      { parse_mode: 'Markdown' }
    );
  }
});

// DESCONECTAR USUÁRIO
bot.command('desconectar', async (ctx) => {
  const ok = userManager.disconnectUser(ctx.chat.id);
  if (ok) {
    await ctx.reply('🚪 *Conta desconectada deste Telegram.* Para reconectar, use `/conectar`.', {
      parse_mode: 'Markdown',
    });
  } else {
    await ctx.reply('Nenhuma conta estava conectada neste Telegram.');
  }
});

// VER CONTA ATIVA
bot.command(['conta', 'status'], async (ctx) => {
  const user = userManager.getUser(ctx.chat.id);
  if (!user) {
    return ctx.reply('⚠️ Nenhuma conta conectada. Use `/conectar email senha` para entrar.', {
      parse_mode: 'Markdown',
    });
  }

  const service = userManager.getBudgetService(ctx.chat.id);
  const cats = service ? service.getCategories() : [];

  await ctx.reply(
    `👤 *Sua Conta Conectada:*\n\n` +
    `• E-mail: \`${user.email}\`\n` +
    `• Categorias no app: *${cats.length}*\n` +
    `• Conectado desde: ${new Date(user.connectedAt).toLocaleDateString('pt-BR')}\n` +
    `• Voz atual: *${ttsService.getVoiceName()}*`,
    { parse_mode: 'Markdown' }
  );
});

// LISTAR CATEGORIAS DO USUÁRIO
bot.command('categorias', async (ctx) => {
  const service = await getService(ctx);
  if (!service) return;

  const categories = await service.refreshCategories();
  if (categories.length === 0) {
    return ctx.reply('Nenhuma categoria encontrada.');
  }

  const incomes = categories.filter((c) => c.type === 'income');
  const expenses = categories.filter((c) => c.type === 'expense');

  let text = '📂 *Suas Categorias no Lovable:*\n\n';
  text += '💰 *RECEITAS (Entradas):*\n';
  text += incomes.map((c, i) => `${i + 1}. ${c.name}`).join('\n') || 'Nenhuma cadastrada';
  text += '\n\n💸 *DESPESAS (Saídas):*\n';
  text += expenses.map((c, i) => `${i + 1}. ${c.name}`).join('\n') || 'Nenhuma cadastrada';

  await ctx.reply(text, { parse_mode: 'Markdown' });
});

// ESCOLHER VOZ
bot.command('voz', async (ctx) => {
  const current = ttsService.getVoice();
  const keyboard = new InlineKeyboard();

  AVAILABLE_VOICES.forEach((v) => {
    const isSelected = v.id === current ? '✅ ' : '';
    keyboard.text(`${isSelected}${v.name}`, `set_voice:${v.id}`).row();
  });

  await ctx.reply(
    `🎙️ *Escolha a voz do seu Assistente:*\n\n` +
    `Vozes neurais ultra-realistas com pronúncia natural.\n\n` +
    `Voz atual: *${ttsService.getVoiceName()}*`,
    { reply_markup: keyboard, parse_mode: 'Markdown' }
  );
});

// CALLBACK TROCAR VOZ
bot.callbackQuery(/^set_voice:(.+)$/, async (ctx) => {
  const voiceId = ctx.match[1];
  ttsService.setVoice(voiceId);
  await ctx.answerCallbackQuery({ text: 'Voz alterada!' }).catch(() => {});

  const confirmText = `Voz alterada para ${ttsService.getVoiceName()}! A partir de agora falarei com você assim.`;
  await ctx.editMessageText(`✅ *${confirmText}*`, { parse_mode: 'Markdown' }).catch(() => {});

  try {
    const audioBuf = await ttsService.textToSpeechBuffer('Olá! Esta é a minha nova voz no seu Budget Buddy.');
    await ctx.replyWithVoice(new InputFile(audioBuf, 'demo.mp3'));
  } catch (err: any) {
    console.warn('[TTS] Erro demo:', err.message);
  }
});

// ---------------- PROCESSAMENTO DE MENSAGENS ----------------

// 1. Fotos
bot.on('message:photo', async (ctx) => {
  if (!ctx.message) return;
  const budgetService = await getService(ctx);
  if (!budgetService) return;

  const statusMsg = await ctx.reply('🔍 _Lendo comprovante com IA..._', { parse_mode: 'Markdown' });

  try {
    const photos = ctx.message.photo;
    const largestPhoto = photos[photos.length - 1];
    const file = await ctx.api.getFile(largestPhoto.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${config.telegramToken}/${file.file_path}`;

    const res = await fetch(fileUrl);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const categories = budgetService.getCategories();
    const extracted = await aiService.parseExpense({
      mediaBuffer: buffer,
      mimeType: 'image/jpeg',
      textPrompt: ctx.message.caption,
      categories,
    });

    const txId = Math.random().toString(36).substring(2, 9);
    const pending: PendingTransaction = { ...extracted, id: txId, chatId: ctx.chat.id, createdAt: Date.now() };
    pendingExpenses.set(txId, pending);

    const card = buildConfirmationCard(pending);
    await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
    await ctx.reply(card.text, { reply_markup: card.keyboard, parse_mode: 'Markdown' });
  } catch (err: any) {
    console.error('Erro ao processar foto:', err);
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `❌ *Não consegui ler o comprovante:* ${err.message}`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }
});

// 2. Documentos (PDF ou Imagem)
bot.on('message:document', async (ctx) => {
  if (!ctx.message) return;
  const budgetService = await getService(ctx);
  if (!budgetService) return;

  const doc = ctx.message.document;
  const mime = doc.mime_type || '';

  if (!mime.startsWith('image/') && mime !== 'application/pdf') {
    return ctx.reply('⚠️ Por favor envie o comprovante em formato de imagem (JPG, PNG) ou PDF.');
  }

  const statusMsg = await ctx.reply('📄 _Processando documento com IA..._', { parse_mode: 'Markdown' });

  try {
    const file = await ctx.api.getFile(doc.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${config.telegramToken}/${file.file_path}`;

    const res = await fetch(fileUrl);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const categories = budgetService.getCategories();
    const extracted = await aiService.parseExpense({
      mediaBuffer: buffer,
      mimeType: mime,
      textPrompt: ctx.message.caption,
      categories,
    });

    const txId = Math.random().toString(36).substring(2, 9);
    const pending: PendingTransaction = { ...extracted, id: txId, chatId: ctx.chat.id, createdAt: Date.now() };
    pendingExpenses.set(txId, pending);

    const card = buildConfirmationCard(pending);
    await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
    await ctx.reply(card.text, { reply_markup: card.keyboard, parse_mode: 'Markdown' });
  } catch (err: any) {
    console.error('Erro ao processar documento:', err);
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `❌ *Erro ao processar arquivo:* ${err.message}`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }
});

// 3. Áudios / Mensagens de Voz
bot.on(['message:voice', 'message:audio'], async (ctx) => {
  if (!ctx.message) return;
  const budgetService = await getService(ctx);
  if (!budgetService) return;

  const statusMsg = await ctx.reply('🎧 _Processando seu áudio..._', { parse_mode: 'Markdown' });

  try {
    const voice = ctx.message.voice || ctx.message.audio;
    if (!voice) return;

    const file = await ctx.api.getFile(voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${config.telegramToken}/${file.file_path}`;

    const res = await fetch(fileUrl);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Detectar intenção (Pergunta sobre contas vs Lançamento)
    const intentRes = await aiService.detectIntent({
      mediaBuffer: buffer,
      mimeType: 'audio/ogg',
    });

    if (intentRes.intent === 'QUERY') {
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        '📊 _Consultando suas contas no Lovable..._',
        { parse_mode: 'Markdown' }
      ).catch(() => {});

      const month = intentRes.month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const summary = await budgetService.getMonthBudgetSummary(month);

      if (!summary) {
        return ctx.api.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          '❌ Não foi possível carregar as informações do seu orçamento.',
          { parse_mode: 'Markdown' }
        );
      }

      const answer = await aiService.answerFinancialQuery({
        question: intentRes.transcription || 'Qual a situação do meu orçamento?',
        budgetSummary: summary,
      });

      await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
      await ctx.reply(answer.fullText, { parse_mode: 'Markdown' });

      // Responder com áudio falado ultra direto (1-2 frases concisas)
      try {
        const audioBuffer = await ttsService.textToSpeechBuffer(answer.speechText);
        await ctx.replyWithVoice(new InputFile(audioBuffer, 'resposta.mp3'));
      } catch (ttsErr: any) {
        console.warn('[TTS] Falha ao enviar áudio falado:', ttsErr.message);
      }
      return;
    }

    // Se for definição de orçamento/planejamento (via áudio):
    if (intentRes.intent === 'BUDGET') {
      await handleBudgetIntent(ctx, budgetService, intentRes, statusMsg.message_id);
      return;
    }

    // Se for registro de gasto/receita:
    const categories = budgetService.getCategories();
    const extracted = await aiService.parseExpense({
      mediaBuffer: buffer,
      mimeType: 'audio/ogg',
      categories,
    });

    const txId = Math.random().toString(36).substring(2, 9);
    const pending: PendingTransaction = { ...extracted, id: txId, chatId: ctx.chat.id, createdAt: Date.now() };
    pendingExpenses.set(txId, pending);

    const card = buildConfirmationCard(pending);
    await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
    await ctx.reply(card.text, { reply_markup: card.keyboard, parse_mode: 'Markdown' });
  } catch (err: any) {
    console.error('Erro ao processar áudio:', err);
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `❌ *Não consegui processar o áudio:* ${err.message}`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }
});

// 4. Texto livre (Perguntas sobre contas OU Lançamentos)
bot.on('message:text', async (ctx) => {
  if (!ctx.message) return;
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return; // ignora outros comandos

  const budgetService = await getService(ctx);
  if (!budgetService) return;

  const statusMsg = await ctx.reply('🤖 _Analisando mensagem..._', { parse_mode: 'Markdown' });

  try {
    // 1. Detectar intenção (Pergunta sobre finanças vs Lançamento)
    const intentRes = await aiService.detectIntent({ textPrompt: text });

    if (intentRes.intent === 'QUERY') {
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        '📊 _Consultando seus dados no Lovable..._',
        { parse_mode: 'Markdown' }
      ).catch(() => {});

      const month = intentRes.month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const summary = await budgetService.getMonthBudgetSummary(month);

      if (!summary) {
        return ctx.api.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          '❌ Não foi possível acessar suas contas no momento.',
          { parse_mode: 'Markdown' }
        );
      }

      const answer = await aiService.answerFinancialQuery({
        question: text,
        budgetSummary: summary,
      });

      await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
      await ctx.reply(answer.fullText, { parse_mode: 'Markdown' });

      // Envia nota de voz falada ultra direta (sem enrolação)
      try {
        const audioBuffer = await ttsService.textToSpeechBuffer(answer.speechText);
        await ctx.replyWithVoice(new InputFile(audioBuffer, 'resposta.mp3'));
      } catch (ttsErr: any) {
        console.warn('[TTS] Falha ao enviar áudio falado:', ttsErr.message);
      }
      return;
    }

    // Se for definição de orçamento/planejamento:
    if (intentRes.intent === 'BUDGET') {
      await handleBudgetIntent(ctx, budgetService, intentRes, statusMsg.message_id);
      return;
    }

    // Se for registro de gasto/receita:
    const categories = budgetService.getCategories();
    const extracted = await aiService.parseExpense({
      textPrompt: text,
      categories,
    });

    const txId = Math.random().toString(36).substring(2, 9);
    const pending: PendingTransaction = { ...extracted, id: txId, chatId: ctx.chat.id, createdAt: Date.now() };
    pendingExpenses.set(txId, pending);

    const card = buildConfirmationCard(pending);
    await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
    await ctx.reply(card.text, { reply_markup: card.keyboard, parse_mode: 'Markdown' });
  } catch (err: any) {
    console.error('Erro ao processar texto:', err);
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `❌ *Não consegui processar:* ${err.message}`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }
});

// ---------------- CALLBACKS DOS BOTÕES INTERATIVOS ----------------

// CONFIRMAR GASTO / RECEITA
bot.callbackQuery(/^confirm:(.+)$/, async (ctx) => {
  const txId = ctx.match[1];
  const exp = pendingExpenses.get(txId);

  if (!exp) {
    return ctx.answerCallbackQuery({ text: 'Essa solicitação expirou ou já foi confirmada.' }).catch(() => {});
  }

  const budgetService = userManager.getBudgetService(exp.chatId);
  if (!budgetService) {
    return ctx.answerCallbackQuery({ text: 'Sua sessão expirou. Conecte-se novamente.' }).catch(() => {});
  }

  const isIncome = exp.type === 'income';
  await ctx.answerCallbackQuery({ text: `Salvando ${isIncome ? 'receita' : 'despesa'} no seu Budget Buddy...` }).catch(() => {});

  // Nome formatado com a data (ex: "Salário Empresa (25/03)")
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
    pendingExpenses.delete(txId);
    const monthLabel = getMonthName(exp.month);
    const totalMonth = result.totalMonthCategory
      ? `\n📊 *Total acumulado nesta categoria no mês:* ${formatCurrency(result.totalMonthCategory)}`
      : '';

    const badge = isIncome ? '💵 *Receita Registrada com Sucesso!*' : '✅ *Despesa Registrada com Sucesso!*';
    const sign = isIncome ? '+' : '-';

    await ctx.editMessageText(
      `${badge}\n━━━━━━━━━━━━━━━━━━━━\n` +
      `🏷️ *Item:* ${itemTitle}\n` +
      `💰 *Valor:* *${sign} ${formatCurrency(exp.amount)}*\n` +
      `📂 *Categoria:* ${exp.categoryName} (${isIncome ? 'Receita' : 'Despesa'})\n` +
      `📆 *Mês:* ${monthLabel} (${exp.month})${totalMonth}\n━━━━━━━━━━━━━━━━━━━━\n` +
      `_Já está sincronizado no seu painel do Lovable!_`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  } else {
    await ctx.reply(`❌ *Erro ao salvar no banco:* ${result.error}`, { parse_mode: 'Markdown' });
  }
});

// TROCAR CATEGORIA
bot.callbackQuery(/^change_cat:(.+)$/, async (ctx) => {
  const txId = ctx.match[1];
  const exp = pendingExpenses.get(txId);

  if (!exp) {
    return ctx.answerCallbackQuery({ text: 'Essa solicitação expirou.' }).catch(() => {});
  }

  const budgetService = userManager.getBudgetService(exp.chatId);
  if (!budgetService) {
    return ctx.answerCallbackQuery({ text: 'Sessão expirada.' }).catch(() => {});
  }

  await ctx.answerCallbackQuery().catch(() => {});
  const categories = budgetService.getCategories(exp.type);
  const keyboard = new InlineKeyboard();

  categories.forEach((cat, idx) => {
    keyboard.text(cat.name, `set_cat:${txId}:${cat.id}`);
    if (idx % 2 === 1) keyboard.row();
  });

  keyboard.row();
  const toggleLabel = exp.type === 'income' ? '🔄 Mudar para Despesa' : '🔄 Mudar para Receita';
  keyboard.text(toggleLabel, `toggle_type:${txId}`);
  keyboard.row().text('⬅️ Voltar', `back:${txId}`);

  await ctx.editMessageText(
    `📂 *Selecione a categoria de ${exp.type === 'income' ? 'RECEITA' : 'DESPESA'} (${formatCurrency(exp.amount)}):*\n` +
    `Item: _${exp.title}_`,
    { reply_markup: keyboard, parse_mode: 'Markdown' }
  ).catch(() => {});
});

// ALTERNAR TIPO DE TRANSAÇÃO (Receita <-> Despesa)
bot.callbackQuery(/^toggle_type:(.+)$/, async (ctx) => {
  const txId = ctx.match[1];
  const exp = pendingExpenses.get(txId);

  if (!exp) {
    return ctx.answerCallbackQuery({ text: 'Essa solicitação expirou.' }).catch(() => {});
  }

  const budgetService = userManager.getBudgetService(exp.chatId);
  if (!budgetService) return;

  exp.type = exp.type === 'income' ? 'expense' : 'income';
  const newPool = budgetService.getCategories(exp.type);
  if (newPool.length > 0) {
    exp.categoryId = newPool[0].id;
    exp.categoryName = newPool[0].name;
  }

  await ctx.answerCallbackQuery({ text: `Alterado para ${exp.type === 'income' ? 'Receita' : 'Despesa'}` }).catch(() => {});
  const card = buildConfirmationCard(exp);
  await ctx.editMessageText(card.text, { reply_markup: card.keyboard, parse_mode: 'Markdown' }).catch(() => {});
});

// APLICAR NOVA CATEGORIA
bot.callbackQuery(/^set_cat:(.+):(.+)$/, async (ctx) => {
  const txId = ctx.match[1];
  const newCatId = ctx.match[2];
  const exp = pendingExpenses.get(txId);

  if (!exp) {
    return ctx.answerCallbackQuery({ text: 'Essa solicitação expirou.' }).catch(() => {});
  }

  const budgetService = userManager.getBudgetService(exp.chatId);
  if (!budgetService) return;

  const categories = budgetService.getCategories();
  const selected = categories.find((c) => c.id === newCatId);
  if (selected) {
    exp.categoryId = selected.id;
    exp.categoryName = selected.name;
  }

  await ctx.answerCallbackQuery({ text: `Categoria alterada para: ${exp.categoryName}` }).catch(() => {});
  const card = buildConfirmationCard(exp);
  await ctx.editMessageText(card.text, { reply_markup: card.keyboard, parse_mode: 'Markdown' }).catch(() => {});
});

// TROCAR MÊS
bot.callbackQuery(/^change_month:(.+)$/, async (ctx) => {
  const txId = ctx.match[1];
  const exp = pendingExpenses.get(txId);

  if (!exp) {
    return ctx.answerCallbackQuery({ text: 'Essa solicitação expirou.' }).catch(() => {});
  }

  await ctx.answerCallbackQuery().catch(() => {});

  const [currYear, currMonth] = exp.month.split('-').map(Number);
  const options: { monthStr: string; label: string }[] = [];

  for (let i = -2; i <= 2; i++) {
    const d = new Date(currYear, currMonth - 1 + i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const monthStr = `${y}-${m}`;
    options.push({ monthStr, label: getMonthName(monthStr) });
  }

  const keyboard = new InlineKeyboard();
  options.forEach((opt, idx) => {
    const isCurrent = opt.monthStr === exp.month ? '📍 ' : '';
    keyboard.text(`${isCurrent}${opt.label}`, `set_month:${txId}:${opt.monthStr}`);
    if (idx % 2 === 1) keyboard.row();
  });
  keyboard.row().text('⬅️ Voltar', `back:${txId}`);

  await ctx.editMessageText(
    `📅 *Escolha em qual mês do orçamento registrar este lançamento:*\n` +
    `Item: _${exp.title}_ (${formatCurrency(exp.amount)})`,
    { reply_markup: keyboard, parse_mode: 'Markdown' }
  ).catch(() => {});
});

// APLICAR NOVO MÊS
bot.callbackQuery(/^set_month:(.+):(.+)$/, async (ctx) => {
  const txId = ctx.match[1];
  const newMonth = ctx.match[2];
  const exp = pendingExpenses.get(txId);

  if (!exp) {
    return ctx.answerCallbackQuery({ text: 'Essa solicitação expirou.' }).catch(() => {});
  }

  exp.month = newMonth;
  await ctx.answerCallbackQuery({ text: `Mês alterado para: ${getMonthName(newMonth)}` }).catch(() => {});
  const card = buildConfirmationCard(exp);
  await ctx.editMessageText(card.text, { reply_markup: card.keyboard, parse_mode: 'Markdown' }).catch(() => {});
});

// VOLTAR
bot.callbackQuery(/^back:(.+)$/, async (ctx) => {
  const txId = ctx.match[1];
  const exp = pendingExpenses.get(txId);
  if (!exp) {
    return ctx.answerCallbackQuery({ text: 'Essa solicitação expirou.' }).catch(() => {});
  }
  await ctx.answerCallbackQuery().catch(() => {});
  const card = buildConfirmationCard(exp);
  await ctx.editMessageText(card.text, { reply_markup: card.keyboard, parse_mode: 'Markdown' }).catch(() => {});
});

// CANCELAR
bot.callbackQuery(/^cancel:(.+)$/, async (ctx) => {
  const txId = ctx.match[1];
  pendingExpenses.delete(txId);
  await ctx.answerCallbackQuery({ text: 'Operação cancelada.' }).catch(() => {});
  await ctx.editMessageText('❌ *Operação cancelada.* Nenhuma alteração foi feita no seu sistema.', {
    parse_mode: 'Markdown',
  }).catch(() => {});
});

// ---------------- CALLBACKS DE ORÇAMENTO PLANEJADO ----------------

// CONFIRMAR ORÇAMENTO PLANEJADO
bot.callbackQuery(/^confirm_budget:(.+)$/, async (ctx) => {
  const budId = ctx.match[1];
  const bud = pendingBudgets.get(budId);

  if (!bud) {
    return ctx.answerCallbackQuery({ text: 'Essa solicitação expirou ou já foi confirmada.' }).catch(() => {});
  }

  const budgetService = userManager.getBudgetService(bud.chatId);
  if (!budgetService) {
    return ctx.answerCallbackQuery({ text: 'Sua sessão expirou. Conecte-se novamente.' }).catch(() => {});
  }

  await ctx.answerCallbackQuery({ text: 'Salvando orçamento planejado...' }).catch(() => {});

  const result = await budgetService.setPlannedBudget({
    categoryId: bud.categoryId,
    month: bud.month,
    amount: bud.amount,
  });

  if (result.success) {
    pendingBudgets.delete(budId);
    const monthLabel = getMonthName(bud.month);
    const remainingText = result.remaining !== undefined
      ? `\n💡 *Já gasto nesta categoria:* ${formatCurrency(result.actual || 0)}\n🎯 *Restante disponível:* ${formatCurrency(result.remaining)}`
      : '';

    await ctx.editMessageText(
      `📋 *Orçamento Definido com Sucesso!*\n━━━━━━━━━━━━━━━━━━━━\n` +
      `📂 *Categoria:* ${bud.categoryName}\n` +
      `💰 *Valor planejado:* *${formatCurrency(bud.amount)}*\n` +
      `📆 *Mês:* ${monthLabel} (${bud.month})${remainingText}\n━━━━━━━━━━━━━━━━━━━━\n` +
      `_Sincronizado no seu painel do Budget Buddy!_`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  } else {
    await ctx.reply(`❌ *Erro ao salvar orçamento:* ${result.error}`, { parse_mode: 'Markdown' });
  }
});

// TROCAR CATEGORIA DO ORÇAMENTO
bot.callbackQuery(/^change_budget_cat:(.+)$/, async (ctx) => {
  const budId = ctx.match[1];
  const bud = pendingBudgets.get(budId);

  if (!bud) {
    return ctx.answerCallbackQuery({ text: 'Essa solicitação expirou.' }).catch(() => {});
  }

  const budgetService = userManager.getBudgetService(bud.chatId);
  if (!budgetService) {
    return ctx.answerCallbackQuery({ text: 'Sessão expirada.' }).catch(() => {});
  }

  await ctx.answerCallbackQuery().catch(() => {});
  const categories = budgetService.getCategories();
  const keyboard = new InlineKeyboard();

  categories.forEach((cat, idx) => {
    keyboard.text(cat.name, `set_budget_cat:${budId}:${cat.id}`);
    if (idx % 2 === 1) keyboard.row();
  });

  keyboard.row().text('⬅️ Voltar', `back_budget:${budId}`);

  await ctx.editMessageText(
    `📂 *Selecione a categoria para o orçamento de ${formatCurrency(bud.amount)}:*`,
    { reply_markup: keyboard, parse_mode: 'Markdown' }
  ).catch(() => {});
});

// APLICAR NOVA CATEGORIA AO ORÇAMENTO
bot.callbackQuery(/^set_budget_cat:(.+):(.+)$/, async (ctx) => {
  const budId = ctx.match[1];
  const newCatId = ctx.match[2];
  const bud = pendingBudgets.get(budId);

  if (!bud) {
    return ctx.answerCallbackQuery({ text: 'Essa solicitação expirou.' }).catch(() => {});
  }

  const budgetService = userManager.getBudgetService(bud.chatId);
  if (!budgetService) return;

  const categories = budgetService.getCategories();
  const selected = categories.find((c) => c.id === newCatId);
  if (selected) {
    bud.categoryId = selected.id;
    bud.categoryName = selected.name;
  }

  await ctx.answerCallbackQuery({ text: `Categoria alterada para: ${bud.categoryName}` }).catch(() => {});
  const card = buildBudgetConfirmationCard(bud);
  await ctx.editMessageText(card.text, { reply_markup: card.keyboard, parse_mode: 'Markdown' }).catch(() => {});
});

// TROCAR MÊS DO ORÇAMENTO
bot.callbackQuery(/^change_budget_month:(.+)$/, async (ctx) => {
  const budId = ctx.match[1];
  const bud = pendingBudgets.get(budId);

  if (!bud) {
    return ctx.answerCallbackQuery({ text: 'Essa solicitação expirou.' }).catch(() => {});
  }

  await ctx.answerCallbackQuery().catch(() => {});

  const [currYear, currMonth] = bud.month.split('-').map(Number);
  const options: { monthStr: string; label: string }[] = [];

  for (let i = -2; i <= 2; i++) {
    const d = new Date(currYear, currMonth - 1 + i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const monthStr = `${y}-${m}`;
    options.push({ monthStr, label: getMonthName(monthStr) });
  }

  const keyboard = new InlineKeyboard();
  options.forEach((opt, idx) => {
    const isCurrent = opt.monthStr === bud.month ? '📍 ' : '';
    keyboard.text(`${isCurrent}${opt.label}`, `set_budget_month:${budId}:${opt.monthStr}`);
    if (idx % 2 === 1) keyboard.row();
  });
  keyboard.row().text('⬅️ Voltar', `back_budget:${budId}`);

  await ctx.editMessageText(
    `📅 *Escolha o mês para definir o orçamento de ${formatCurrency(bud.amount)}:*\n` +
    `Categoria: _${bud.categoryName}_`,
    { reply_markup: keyboard, parse_mode: 'Markdown' }
  ).catch(() => {});
});

// APLICAR NOVO MÊS AO ORÇAMENTO
bot.callbackQuery(/^set_budget_month:(.+):(.+)$/, async (ctx) => {
  const budId = ctx.match[1];
  const newMonth = ctx.match[2];
  const bud = pendingBudgets.get(budId);

  if (!bud) {
    return ctx.answerCallbackQuery({ text: 'Essa solicitação expirou.' }).catch(() => {});
  }

  bud.month = newMonth;
  await ctx.answerCallbackQuery({ text: `Mês alterado para: ${getMonthName(newMonth)}` }).catch(() => {});
  const card = buildBudgetConfirmationCard(bud);
  await ctx.editMessageText(card.text, { reply_markup: card.keyboard, parse_mode: 'Markdown' }).catch(() => {});
});

// VOLTAR (ORÇAMENTO)
bot.callbackQuery(/^back_budget:(.+)$/, async (ctx) => {
  const budId = ctx.match[1];
  const bud = pendingBudgets.get(budId);
  if (!bud) {
    return ctx.answerCallbackQuery({ text: 'Essa solicitação expirou.' }).catch(() => {});
  }
  await ctx.answerCallbackQuery().catch(() => {});
  const card = buildBudgetConfirmationCard(bud);
  await ctx.editMessageText(card.text, { reply_markup: card.keyboard, parse_mode: 'Markdown' }).catch(() => {});
});

// CANCELAR ORÇAMENTO
bot.callbackQuery(/^cancel_budget:(.+)$/, async (ctx) => {
  const budId = ctx.match[1];
  pendingBudgets.delete(budId);
  await ctx.answerCallbackQuery({ text: 'Operação cancelada.' }).catch(() => {});
  await ctx.editMessageText('❌ *Operação cancelada.* Nenhum orçamento foi definido.', {
    parse_mode: 'Markdown',
  }).catch(() => {});
});

// ---------------- TRATAMENTO GLOBAL DE ERROS ----------------

bot.catch((err) => {
  console.error('[Bot Error Handler] Erro capturado:', err.message || err);
});

// ---------------- E-MAILS ENCAMINHADOS (MERCADO PAGO) ----------------

// Evita processar o mesmo e-mail duas vezes (caso o Apps Script reenvie)
const processedEmailIds = new Set<string>();

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

  const chatId = config.adminChatId;
  let budgetService = userManager.getBudgetService(chatId);
  if (!budgetService) {
    await userManager.initDefaultAdmin();
    budgetService = userManager.getBudgetService(chatId);
  }
  if (!budgetService) throw new Error('Conta do administrador não conectada ao Budget Buddy');

  // 1. Filtrar e-mails que não são transações (promoções, códigos, etc.)
  const classification = await aiService.classifyEmail({ subject, body });
  if (!classification.isTransaction) {
    console.log(`[Email] Ignorado: "${subject}" (${classification.reason})`);
    if (messageId) processedEmailIds.add(messageId);
    return { status: 'ignored', reason: classification.reason };
  }

  // 2. Extrair dados da transação reaproveitando o mesmo parser usado para texto/áudio
  const emailDate = payload.date ? new Date(payload.date) : new Date();
  const extracted = await aiService.parseExpense({
    textPrompt:
      `E-mail de notificação financeira (remetente: ${payload.from || 'Mercado Pago'}).\n` +
      `Assunto: ${subject}\n\n${body.substring(0, 4000)}`,
    categories: budgetService.getCategories(),
    fallbackDate: isNaN(emailDate.getTime()) ? new Date() : emailDate,
  });

  // 3. Criar pendência e enviar o cartão de confirmação no Telegram
  const txId = Math.random().toString(36).substring(2, 9);
  const pending: PendingTransaction = { ...extracted, id: txId, chatId, createdAt: Date.now() };
  pendingExpenses.set(txId, pending);

  const card = buildConfirmationCard(pending);
  await bot.api.sendMessage(chatId, `📧 *Novo e-mail do Mercado Pago detectado*\n_${subject}_\n\n${card.text}`, {
    reply_markup: card.keyboard,
    parse_mode: 'Markdown',
  }).catch(async () => {
    // Fallback sem o assunto, caso ele contenha caracteres que quebrem o Markdown
    await bot.api.sendMessage(chatId, card.text, { reply_markup: card.keyboard, parse_mode: 'Markdown' });
  });

  if (messageId) processedEmailIds.add(messageId);
  console.log(`[Email] Transação enviada para confirmação: ${extracted.title} - ${extracted.amount}`);
  return { status: 'sent' };
}

// ---------------- NOTIFICAÇÕES DO CELULAR (PICPAY / BANCOS) ----------------

// Evita processar notificações repetidas em um intervalo curto (10 min)
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

  // Deduplicação básica baseada em texto nos últimos 10 minutos
  const hashKey = `${app}:${notifTitle}:${notifText}`;
  const now = Date.now();
  if (recentNotificationHashes.has(hashKey)) {
    const lastTime = recentNotificationHashes.get(hashKey)!;
    if (now - lastTime < 10 * 60 * 1000) {
      return { status: 'duplicate', reason: 'Notificação duplicada recente' };
    }
  }

  const chatId = config.adminChatId;
  let budgetService = userManager.getBudgetService(chatId);
  if (!budgetService) {
    await userManager.initDefaultAdmin();
    budgetService = userManager.getBudgetService(chatId);
  }
  if (!budgetService) throw new Error('Conta do administrador não conectada ao Budget Buddy');

  // 1. Classificar se é transação financeira real
  const classification = await aiService.classifyNotification({ app, title: notifTitle, text: notifText });
  if (!classification.isTransaction) {
    console.log(`[Notificação ${app}] Ignorada: "${notifTitle} - ${notifText}" (${classification.reason})`);
    recentNotificationHashes.set(hashKey, now);
    return { status: 'ignored', reason: classification.reason };
  }

  // 2. Extrair dados da transação
  const notifDate = payload.date ? new Date(payload.date) : new Date();
  const extracted = await aiService.parseExpense({
    textPrompt:
      `Notificação push de aplicativo financeiro (App: ${app}).\n` +
      `Título: ${notifTitle}\n` +
      `Texto: ${notifText}`,
    categories: budgetService.getCategories(),
    fallbackDate: isNaN(notifDate.getTime()) ? new Date() : notifDate,
  });

  // 3. Criar pendência e enviar cartão no Telegram
  const txId = Math.random().toString(36).substring(2, 9);
  const pending: PendingTransaction = { ...extracted, id: txId, chatId, createdAt: Date.now() };
  pendingExpenses.set(txId, pending);

  const card = buildConfirmationCard(pending);
  const appEmoji = app.toLowerCase().includes('picpay') ? '💚' : '📱';
  const prefix = `${appEmoji} *Nova transação detectada no ${app}*\n_${notifTitle || notifText}_\n\n`;

  await bot.api.sendMessage(chatId, `${prefix}${card.text}`, {
    reply_markup: card.keyboard,
    parse_mode: 'Markdown',
  }).catch(async () => {
    // Fallback se markdown quebrar por caracteres especiais
    await bot.api.sendMessage(chatId, card.text, { reply_markup: card.keyboard, parse_mode: 'Markdown' });
  });

  recentNotificationHashes.set(hashKey, now);
  console.log(`[Notificação ${app}] Transação enviada para confirmação: ${extracted.title} - R$ ${extracted.amount}`);
  return { status: 'sent', title: extracted.title, amount: extracted.amount };
}

// ---------------- INICIALIZAÇÃO ----------------

async function bootstrap() {
  console.log('Iniciando Budget Buddy Bot (Multi-usuário)...');
  await userManager.initDefaultAdmin();

  // Servidor HTTP: health check do Render + webhook de e-mails/notificações
  const port = process.env.PORT || 3000;
  http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');

    if (req.method === 'POST' && (url.pathname === '/email-webhook' || url.pathname === '/notification-webhook')) {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
        if (raw.length > 200_000) req.destroy(); // proteção contra payloads gigantes
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

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('🤖 Budget Buddy Bot está online e operando!');
  }).listen(port, () => {
    console.log(`🌐 Health check HTTP ativo na porta ${port}`);
  });

  bot.start({
    drop_pending_updates: false,
    onStart: (botInfo) => {
      console.log(`🤖 Bot @${botInfo.username} online e pronto para múltiplos usuários!`);
    },
  });
}

bootstrap().catch((err) => {
  console.error('Erro fatal ao iniciar bot:', err);
});
