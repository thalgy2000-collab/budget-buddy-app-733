# 🤖 Budget Buddy - Telegram Bot de Automação Financeira

Bot integrado ao **Budget Buddy** (Lovable Cloud / Supabase) que utiliza inteligência artificial (**Google Gemini**) para registrar despesas de forma instantânea a partir de comprovantes, mensagens de texto ou áudio.

---

## ⚡ Como funciona o fluxo

1. **Input do Usuário no Telegram:**
   - 📸 **Foto / Print:** Comprovante PIX, cupom fiscal, nota fiscal.
   - 📄 **Documento:** Comprovante em PDF.
   - 🎤 **Áudio:** Ex: *"Gastei 45 no almoço hoje"*.
   - 💬 **Texto:** Ex: *"Posto Shell 120"*, *"Farmácia 35"*.

2. **Processamento Inteligente (Google Gemini):**
   - Extrai: Estabelecimento, Valor exato e Data do pagamento.
   - Determina o **mês de competência** no formato `YYYY-MM`.
   - Classifica automaticamente em uma das **suas categorias** cadastradas no Lovable.

3. **Confirmação Interativa:**
   - O bot envia um resumo com botões inline:
     - `[ ✅ Confirmar em Mês/Ano ]`
     - `[ 📂 Trocar Categoria ]`
     - `[ 📅 Trocar Mês ]`
     - `[ ❌ Cancelar ]`

4. **Gravação no Lovable Cloud (Supabase):**
   - Atualiza a lista de `sub_items` (detalhamento do gasto com dia).
   - Incrementa o total realizado (`actual`) da categoria naquele mês.
   - Atualiza o histórico para os gráficos do app.

---

## 🚀 Como Iniciar o Bot

### 1. Configurar o `.env`
O arquivo `bot/.env` já está pré-configurado com o token do seu bot e a URL do Lovable Cloud.
Você só precisa preencher:

```env
# Seu login no Budget Buddy / Lovable:
BUDGET_USER_EMAIL="seu_email@exemplo.com"
BUDGET_USER_PASSWORD="sua_senha_do_app"

# Chave gratuita do Gemini (pegue em https://aistudio.google.com/):
GEMINI_API_KEY="AIzaSy..."
```

### 2. Rodar Localmente
Abra o terminal na pasta `bot` e execute:
```bash
npm run dev
```

Você verá a mensagem:
`🤖 Bot @seu_bot online e escutando mensagens!`

Abra o Telegram, procure pelo seu bot e mande `/start` ou mande qualquer foto de comprovante!
