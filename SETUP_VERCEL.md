# Deploy do Nexora na nuvem

Recomendacao para este projeto:

- **App:** Vercel
- **Banco:** CockroachDB Cloud
- **Repositorio:** GitHub

O app e Next.js e ja tem `vercel.json`. O Prisma esta configurado com `provider = "cockroachdb"`, entao use CockroachDB Cloud para evitar mudar o schema.

## 1. Criar o banco no CockroachDB Cloud

1. Acesse <https://www.cockroachlabs.com/get-started-cockroachdb/>
2. Crie um cluster Serverless.
3. Crie/copiei o usuario e senha.
4. Copie a connection string.

Use no formato:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:26257/DB?sslmode=require"
```

Se a connection string vier com `sslmode=verify-full`, o script de build tenta normalizar para `sslmode=require`.

## 2. Subir o projeto para o GitHub

Na pasta do projeto:

```powershell
git init
git add .
git commit -m "Deploy Nexora"
```

Crie um repositorio no GitHub e envie:

```powershell
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git branch -M main
git push -u origin main
```

## 3. Importar na Vercel

1. Acesse <https://vercel.com/new>
2. Importe o repositorio do GitHub.
3. Framework: **Next.js**
4. Build Command: deixe o `vercel.json` usar:

```text
npm run vercel-build
```

O deploy executa:

```text
prisma generate
prisma migrate deploy
next build
```

## 4. Configurar variaveis de ambiente na Vercel

Em **Project Settings > Environment Variables**, adicione para Production, Preview e Development:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:26257/DB?sslmode=require"
NEXTAUTH_URL="https://SEU-DOMINIO.vercel.app"
NEXTAUTH_SECRET="uma-chave-grande-e-forte"
```

Para criar uma chave forte:

```powershell
openssl rand -base64 32
```

Se nao tiver OpenSSL, use um gerador de senha e coloque pelo menos 32 caracteres.

## 5. Login com Google

Se quiser login Google:

1. Acesse Google Cloud Console.
2. Crie um OAuth Client ID do tipo Web.
3. Em Authorized redirect URIs, adicione:

```text
https://SEU-DOMINIO.vercel.app/api/auth/callback/google
```

4. Na Vercel, configure:

```env
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

## 6. Cadastro por e-mail

Em producao, configure SMTP para o codigo de verificacao:

```env
EMAIL_SERVER="smtp://user:pass@smtp.mailserver.com:587"
EMAIL_FROM="Nexora <no-reply@seudominio.com>"
```

Pode usar provedores como Resend, SendGrid, Mailgun ou SMTP do seu dominio.

## 7. Notificacoes push

Se for usar notificacoes, configure VAPID:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY="..."
VAPID_PRIVATE_KEY="..."
VAPID_SUBJECT="mailto:seuemail@dominio.com"
NOTIFICATIONS_CRON_SECRET="uma-chave-forte"
CRON_SECRET="a-mesma-chave-forte"
```

Sem essas variaveis, o app ainda pode rodar, mas notificacoes push nao funcionam.

## 8. Fazer deploy

Depois de configurar as variaveis:

1. Clique em **Deploy** na Vercel.
2. Abra os logs.
3. Confirme que passaram:
   - `prisma generate`
   - `prisma migrate deploy`
   - `next build`

## 9. Testar online

Teste no dominio da Vercel:

- `/login`
- `/register`
- `/dashboard`
- `/subjects`
- `/planner`
- `/settings`

## Problemas comuns

### Build falha em `prisma migrate deploy`

Confira `DATABASE_URL`, usuario, senha e permissao de conexao.

### Cadastro nao envia codigo

Configure `EMAIL_SERVER` e `EMAIL_FROM`.

### Login fica redirecionando errado

Confira se `NEXTAUTH_URL` esta exatamente igual ao dominio em producao.

### Google login falha

Confira se a URL de callback no Google Cloud e exatamente:

```text
https://SEU-DOMINIO.vercel.app/api/auth/callback/google
```
