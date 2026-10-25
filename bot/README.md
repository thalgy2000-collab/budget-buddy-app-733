# 🟢 Budget Buddy - WhatsApp Bot de Automação Financeira (Cloud API Oficial)

Bot integrado ao **Budget Buddy** (Lovable Cloud / Supabase) que utiliza inteligência artificial (**Google Gemini**) e a **WhatsApp Cloud API Oficial da Meta** para registrar despesas e receitas de forma instantânea a partir de comprovantes, mensagens de texto, áudio, e-mails do Mercado Pago e notificações do celular.

---

## ⚡ Como funciona o fluxo no WhatsApp

1. **Input do Usuário ou Automação:**
   - 📸 **Foto / Print:** Comprovante PIX, cupom fiscal, nota fiscal.
   - 📄 **Documento:** Comprovante em PDF.
   - 🎤 **Áudio:** Ex: *"Gastei 45 no almoço hoje"* ou *"Quanto gastei esse mês?"*.
   - 💬 **Texto:** Ex: *"Posto Shell 120"*, *"Recebi 500"*.
   - 📧 **E-mails do Mercado Pago:** Encaminhados automaticamente via Google Apps Script (`gmail-forwarder.gs`).
   - 📱 **Notificações de Celular:** PicPay e apps de banco via `/notification-webhook`.

2. **Processamento Inteligente (Google Gemini):**
   - Extrai: Estabelecimento/Origem, Valor exato, Tipo (Receita/Despesa) e Data.
   - Determina o **mês de competência** (`YYYY-MM`).
   - Classifica automaticamente em uma das **suas categorias** cadastradas no Budget Buddy.

3. **Confirmação Interativa Nativa do WhatsApp:**
   - O bot envia um cartão com **Botões Interativos** do WhatsApp:
     - `[ ✅ Confirmar ]`
     - `[ ✏️ Categoria / Mês ]` *(abre Lista Interativa do WhatsApp com todas as suas categorias, meses e opção de alternar Receita/Despesa)*
     - `[ ❌ Cancelar ]`

---

## 🚀 Como Configurar na Meta (WhatsApp Cloud API)

1. Acesse [developers.facebook.com](https://developers.facebook.com/) e crie um App do tipo **Empresa (Business)**.
2. Adicione o produto **WhatsApp** ao seu aplicativo.
3. Em **WhatsApp > Configuração da API (API Setup)**:
   - Copie o **Identificador do número de telefone** (`WHATSAPP_PHONE_NUMBER_ID`).
   - Copie o **Token de acesso** (`WHATSAPP_ACCESS_TOKEN`).
   - Adicione seu número pessoal de WhatsApp na lista de destinatários (caso esteja em modo de desenvolvimento).
4. Em **WhatsApp > Configuração (Configuration) > Webhook**:
   - **URL de Callback:** `https://SUA-URL-NO-RENDER.onrender.com/whatsapp-webhook`
   - **Verificar token (Verify Token):** O mesmo valor de `WHATSAPP_VERIFY_TOKEN` do seu `.env`.
   - Clique em **Verificar e salvar** e assine o campo **`messages`**.

---

## ⚙️ Variáveis de Ambiente (`bot/.env` ou painel do Render)

```env
WHATSAPP_ACCESS_TOKEN="EAAG..."
WHATSAPP_PHONE_NUMBER_ID="123456789012345"
WHATSAPP_VERIFY_TOKEN="ca6b93e6369909a7e39f5b778fe9264852d35f30f5e712f4"
WHATSAPP_ADMIN_PHONE="5534999999999"

SUPABASE_URL="https://fzszatylgmiomwhmhnnb.supabase.co"
SUPABASE_ANON_KEY="sua_anon_key"
BUDGET_USER_EMAIL="seu_email@exemplo.com"
BUDGET_USER_PASSWORD="sua_senha_do_app"
GEMINI_API_KEY="AIzaSy..."
EMAIL_WEBHOOK_SECRET="ca6b93e6369909a7e39f5b778fe9264852d35f30f5e712f4"
```

---

## 💻 Rodando Localmente ou Compilando

```bash
cd bot
npm run build
npm run dev
```
