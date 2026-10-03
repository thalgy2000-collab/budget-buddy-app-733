/**
 * Finance Fácil — Encaminhador de e-mails do Mercado Pago para o bot do Telegram
 *
 * Como usar:
 * 1. Acesse https://script.google.com (logado no Gmail que recebe os e-mails do Mercado Pago)
 * 2. Novo projeto -> cole este arquivo inteiro
 * 3. Preencha BOT_URL e WEBHOOK_SECRET abaixo
 * 4. Execute a função "setup" uma vez (autorize o acesso ao Gmail)
 * Pronto: a cada 5 minutos os e-mails novos do Mercado Pago são enviados ao bot.
 */

const BOT_URL = 'https://financeapp-ro0d.onrender.com/email-webhook';
const WEBHOOK_SECRET = 'COLE_AQUI_O_MESMO_EMAIL_WEBHOOK_SECRET_DO_RENDER';

// Busca: e-mails do Mercado Pago dos últimos 2 dias que ainda não foram enviados ao bot
const SEARCH_QUERY = 'from:(mercadopago.com OR mercadopago.com.br OR mercadolivre.com) newer_than:2d -label:finance-facil-enviado';
const LABEL_NAME = 'finance-facil-enviado';

function processMercadoPagoEmails() {
  const label = GmailApp.getUserLabelByName(LABEL_NAME) || GmailApp.createLabel(LABEL_NAME);
  const threads = GmailApp.search(SEARCH_QUERY, 0, 20);

  threads.forEach(function (thread) {
    let allOk = true;

    thread.getMessages().forEach(function (msg) {
      const payload = {
        secret: WEBHOOK_SECRET,
        messageId: msg.getId(),
        subject: msg.getSubject(),
        from: msg.getFrom(),
        date: msg.getDate().toISOString(),
        body: msg.getPlainBody().substring(0, 8000),
      };

      try {
        const res = UrlFetchApp.fetch(BOT_URL, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
        });
        const code = res.getResponseCode();
        Logger.log('[' + code + '] ' + payload.subject + ' -> ' + res.getContentText());
        if (code !== 200) allOk = false;
      } catch (e) {
        // Render pode estar acordando: tenta de novo na próxima execução
        Logger.log('Erro ao enviar "' + payload.subject + '": ' + e);
        allOk = false;
      }
    });

    // Só marca como enviado se o bot confirmou o recebimento (o bot também evita duplicados)
    if (allOk) thread.addLabel(label);
  });
}

/** Execute UMA vez para criar o gatilho automático a cada 5 minutos. */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processMercadoPagoEmails') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processMercadoPagoEmails').timeBased().everyMinutes(5).create();
  processMercadoPagoEmails();
}
