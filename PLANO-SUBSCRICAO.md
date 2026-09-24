# Plano para transformar o Nexora em SaaS por assinatura

Data: 24/09/2026 · Complementa o [RELATORIO-BUGS.md](RELATORIO-BUGS.md)

Resposta curta: **o produto está 70% pronto como app, mas 25% pronto como SaaS.** Falta
principalmente (a) dado do aluno no servidor em formato usável, (b) cobrança + controle de acesso,
(c) o que faz alguém continuar pagando depois do primeiro mês.

---

## 1. Diagnóstico honesto

### Já está pronto e é valioso

| Área | Situação |
|---|---|
| Motor de cronograma | Trilha pedagógica, revisão espaçada, simulados, backlog — agora funcionando no uso semanal |
| Gamificação | XP, níveis, conquistas, streak (corrigido para respeitar descanso) |
| Analytics | Heatmap, distribuição por matéria, insights de IA |
| Auth | Google + e-mail/senha + verificação em 2 etapas + reset de senha + excluir conta |
| Notificações | Web Push (VAPID) + cron diário na Vercel já configurado |
| PWA | Instalável, manifest, service worker |
| Banco | Prisma com schema completo (usuário, disciplinas, blocos, sessões, conquistas...) |

### O que impede de cobrar hoje

| # | Problema | Onde | Impacto |
|---|---|---|---|
| 1 | **O progresso do aluno vive no `localStorage` e é sincronizado como um blob JSON único** | `src/app/api/progress/route.ts` + `UserProgressSnapshot.payload` | ~3,3 MB por ano; conflito entre celular e PC; sem métricas no servidor; sem como cobrar por uso |
| 2 | **Não existe nada de assinatura no schema** | `prisma/schema.prisma` | Sem plano, sem status, sem fatura, sem trial |
| 3 | **XP e conclusão são calculados no cliente** | `src/app/(app)/dashboard/page.tsx`, `WeeklyPlanner.tsx` → `POST /api/gamification/complete` | Fácil fraudar ranking/conquistas: ruim para produto pago com ranking |
| 4 | **Nenhuma proteção contra abuso** | rotas `register`, `password-reset/request`, `notifications/test` | Custo de e-mail/SMTP, spam de código de verificação, brute force |
| 5 | **Sem observabilidade** | projeto inteiro | Você descobre que o aluno não consegue gerar cronograma pelo WhatsApp dele |
| 6 | **Segredo de auth com fallback para `CRON_SECRET`/valor fixo** | `src/lib/env.ts` | Risco de sessão forjada se a env faltar em produção |
| 7 | **Sem headers de segurança/CSP e sem rate limit** | `next.config.js` | XSS/clickjacking, scraping |
| 8 | **`weeklyReport` existe nas configurações mas nenhum e-mail é enviado** | `settings/page.tsx`, `lib/mail.ts` sem uso | Promessa não cumprida = churn |
| 9 | **Sem exportar/backup dos dados** | — | LGPD (portabilidade) + aluno com medo de perder 1 ano de estudo |
| 10 | **Modo demo depende de env pública** | `NEXT_PUBLIC_LOCAL_DEMO_MODE` | Garantir que é impossível em produção/self-host |

---

## 2. P0 — bloqueadores técnicos (fazer antes de vender)

### 2.1 Tirar o progresso do `localStorage` (o item mais importante)

Estratégia em 3 passos, sem parar o app:

1. **Espelhar no banco:** passar a gravar `StudyBlock`, `StudySession`, `Subject` e `XpEvent` reais
   (as tabelas já existem no schema) via rotas incrementais:
   `POST/PATCH /api/blocks`, `POST /api/sessions`, `POST /api/subjects`.
   O `localStorage` continua sendo o estado da UI (offline-first), mas o servidor é a fonte da verdade.
2. **Migração preguiçosa:** ao logar, se existe `UserProgressSnapshot.payload`, converter o blob em
   linhas e marcar como migrado. Depois de ~30 dias, desligar a leitura do blob.
3. **Sync incremental:** trocar `PUT /api/progress` (blob inteiro) por *delta* com `updatedAt` e
   resolução "last write wins por bloco" + `id` estável (cuid no cliente). Isso resolve
   multi-dispositivo e derruba o payload de ~3 MB para alguns KB.

Ganhos colaterais: analytics agregado por usuário, base para limites de plano, relatórios por e-mail,
suporte consegue ver o cronograma do aluno, e backup profissional.

> Dá para faturar antes disso, mas com blob você vai ter suporte caro e reembolso por "perdi meus dados".

### 2.2 Assinatura: modelo de dados + gateway

Modelos sugeridos (Prisma):

```prisma
enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  UNPAID
  EXPIRED
}

model Plan {
  id          String  @id @default(cuid())
  code        String  @unique      // free, pro_mensal, pro_anual, escola
  name        String
  priceCents  Int
  interval    String               // month | year
  features    Json                 // { simulados: true, exportPdf: true, ... }
  limits      Json                 // { subjects: 20, aiGenerationsPerMonth: 60, ... }
  isActive    Boolean @default(true)
}

model Subscription {
  id                     String             @id @default(cuid())
  userId                 String             @unique
  planId                 String
  status                 SubscriptionStatus @default(TRIALING)
  provider               String             // stripe | mercadopago | asaas | pagarme
  providerCustomerId     String?
  providerSubscriptionId String?            @unique
  trialEndsAt            DateTime?
  currentPeriodEnd       DateTime?
  cancelAtPeriodEnd      Boolean            @default(false)
  canceledAt             DateTime?
  createdAt              DateTime           @default(now())
  updatedAt              DateTime           @updatedAt
  user                   User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  plan                   Plan               @relation(fields: [planId], references: [id])
  @@index([status])
}

model Payment {
  id                String   @id @default(cuid())
  userId            String
  provider          String
  providerPaymentId String   @unique
  amountCents       Int
  status            String   // paid | pending | failed | refunded
  paidAt            DateTime?
  dueDate           DateTime?
  receiptUrl        String?
  raw               Json?
  createdAt         DateTime @default(now())
  @@index([userId, status])
}

model WebhookEvent {          // idempotência — sem isso você cobra/libera duas vezes
  id          String   @id @default(cuid())
  provider    String
  eventId     String
  processedAt DateTime?
  payload     Json
  createdAt   DateTime @default(now())
  @@unique([provider, eventId])
}
```

**Gateway — como decidir:**

| Opção | Prós | Contras |
|---|---|---|
| **Stripe** | Checkout pronto, Billing Portal, cupons, trial, webhooks maduros, testes fáceis | PIX/boleto no Brasil exige checagem do suporte atual; repasse em 30 dias |
| **Mercado Pago / Pagar.me (Stone)** | PIX, boleto, cartão, parcelamento; familiar para o público BR | Assinatura recorrente via PIX/boleto é mais limitada; webhooks menos docilmente documentados |
| **Asaas** | PIX/boleto recorrentes, emissão de NF-e integrada, split | Ecossistema menor |
| **Kiwify/Hotmart** | Zero código, aceita PIX, nota fiscal | Você perde o controle do paywall/login, taxa maior |

Recomendação: **Stripe (Billing) para o MVP internacional/BR em cartão + Pix** e, se o público pedir
boleto/NF-e, **Asaas ou Pagar.me** como segundo provedor. Abstraia em `src/lib/billing/provider.ts`
para não ficar preso.

Fluxo mínimo de cobrança:
1. Trial de 7 dias **com cartão** (melhor conversão e evita abuso) ou sem cartão com limites duros.
2. Checkout hospedado (não crie formulário de cartão — PCI).
3. Webhook `POST /api/billing/webhook` → grava `WebhookEvent` → atualiza `Subscription`.
4. `src/lib/entitlements.ts` com `getEntitlements(userId)` + `assertWithinLimit(userId, 'aiGenerations')`.
5. Paywall: gate em `/planner` (geração de cronograma), nº de disciplinas, exportação, push.
6. Billing Portal para trocar plano/cancelar/baixar recibo (reduz suporte em ~50%).
7. Dunning: e-mail D-3, D0, D+3, D+7; `PAST_DUE` mantém acesso por 3 dias; `UNPAID` bloqueia.
8. Sempre libere/revogue acesso por **webhook**, nunca pelo retorno do navegador.

### 2.3 Segurança e abuso

- Rate limit por IP+usuário em `register`, `password-reset/request`, `notifications/test`,
  `planner/generate` (Upstash Redis ou tabela própria). Sem isso, um script queima seu SMTP.
- Remover o fallback de `NEXTAUTH_SECRET` para `CRON_SECRET` e para valor fixo em produção
  (`src/lib/env.ts`) — falhar o boot é melhor que aceitar token forjado.
- Validar tudo que é "gamificação" no servidor: XP só por bloco concluído que existe no banco do
  próprio usuário, com teto por dia (ex.: máx. 12h/dia).
- Headers: CSP, `X-Frame-Options`, `Referrer-Policy`, HSTS (`next.config.js`).
- Travar o modo demo: `if (NEXT_PUBLIC_LOCAL_DEMO_MODE === 'true' && process.env.NODE_ENV === 'production') throw`.
- Auditoria: log de eventos sensíveis (troca de senha, exclusão, mudança de plano).

### 2.4 Observabilidade mínima

- **Sentry** (erros de front/back + release tracking) — hoje um erro de produção é invisível.
- **PostHog** ou **Amplitude**: funil de ativação, retenção D1/D7/D30, uso de cada feature.
- **Better Stack / UptimeRobot**: `/api/health` com ping no banco.
- **Metabase** ou consultas SQL no painel: MRR, churn, LTV.
- Backup: CockroachDB/Neon com PITR + `pg_dump` semanal para storage frio.

---

## 3. P0 — Legal e fiscal (Brasil)

Sem isso você **não** consegue cobrar de forma sustentável:

- **CNPJ** (MEI não costuma servir para SaaS com NF-e de serviço; avalie ME no Simples Nacional).
- **Emissão de nota fiscal de serviço (NFS-e)**: Stripe não emite no Brasil; Asaas/Pagar.me emitem.
  Sem nota, escolas e pais pedem reembolso/estorno.
- **Termos de Uso + Política de Privacidade** (LGPD), com base legal, retenção e contato do DPO.
- **Menores de idade**: boa parte do público do ENEM tem 16–17 anos. LGPD art. 14 exige consentimento
  do responsável — implemente fluxo "conta do responsável" ou confirmação explícita no cadastro.
- **Direito de arrependimento (CDC art. 49)**: 7 dias, com estorno — deixe isso explícito e simples
  (reduz chargeback).
- **Recibos/estornos** dentro do app (o Billing Portal resolve).
- **Segurança de dados**: senha com bcrypt (ok), TLS, princípio do menor privilégio no banco,
  `delete-account` com cascata (já existe) + **exportar dados** (portabilidade).

---

## 4. O que vender (o que faz pagar todo mês)

O maior buraco atual: **o "simulado" não tem conteúdo** — é só um bloco na agenda. As pessoas não
pagam por agenda; pagam por **resultado**. Sugestão de pacote de valor:

1. **Banco de questões ENEM real** (por área/disciplina/tópico) + correção automática, com os
   simulados do cronograma apontando para uma prova de verdade.
2. **Correção de redação com IA** (nota por competência + reescrita). É a feature com maior disposição
   a pagar no público ENEM.
3. **Plano do dia no celular + push** ("sua aula de Matemática começa em 15 min"): a infra já existe,
   falta ligar de verdade (VAPID + cron + permissão em iOS 16.4+).
4. **Relatório semanal por e-mail** (a flag `weeklyReport` já está na tela — implemente o envio com
   horas, aderência, evolução e o que fazer na próxima semana).
5. **Multi-dispositivo real** (depende do item 2.1) + **backup/exportação**.
6. **Calendário**: gerar `.ics` / sincronizar Google Calendar.
7. **Metas com prova**: contagem regressiva, projeção de nota, "% da trilha concluída".
8. **Modo responsável/professor**: 1 conta acompanhando 1–5 alunos (ticket maior, B2B2C com escolas).

Roadmap de plano:

| Plano | Preço sugerido | O que entrega |
|---|---|---|
| Grátis | R$ 0 | 2 disciplinas, cronograma de 7 dias, sem simulados, sem push |
| **Pro mensal** | **R$ 24,90–34,90** | Tudo: disciplinas ilimitadas, trilha completa, simulados, push, relatório semanal |
| **Pro anual** | **R$ 197–249** (~2 meses grátis) | idem + redação com IA (limite mensal) |
| Escola / responsável | R$ 9–15 por aluno/mês | painel de acompanhamento, 5+ alunos |

Teste 2 preços (R$ 24,90 vs R$ 34,90) e 2 ofertas de trial (7 dias com cartão vs 3 dias sem cartão).
Métrica que importa: **conversão trial→pago entre 5% e 10%** e **churn mensal < 8%**.

---

## 5. Roteiro em fases

### Fase 1 — "Cobrável" (2–3 semanas de dev)
- [ ] Assinatura no schema + gateway + checkout + webhook idempotente + entitlement/paywall
- [ ] Billing Portal (trocar plano, cancelar, recibo) e e-mails de cobrança (dunning)
- [ ] Rate limit + headers + remover fallback de segredo + travar modo demo em produção
- [ ] Sentry + PostHog + `/api/health` + backup automatizado
- [ ] Termos, privacidade, CNPJ, NFS-e, fluxo de consentimento para menores
- [ ] Fechar o "shape" do MVP: trial 7 dias, paywall em 3 pontos, cupom de lançamento

### Fase 2 — "Não perder o aluno no mês 1" (2–3 semanas)
- [ ] Progresso no servidor por bloco + sync incremental + migração do blob (item 2.1)
- [ ] Relatório semanal por e-mail (usar `weeklyReport`)
- [ ] Push ligado de verdade (lembretes, início de bloco, streak em risco, backlog)
- [ ] Exportar meus dados (JSON/PDF) e restaurar backup
- [ ] Onboarding com meta de ativação: em 10 min o aluno tem disciplinas + cronograma + 1ª sessão

### Fase 3 — "Vale continuar pagando" (4–8 semanas)
- [ ] Banco de questões + correção automática
- [ ] Redação com IA (nota por competência)
- [ ] Calendário (ICS/Google) e widget/atalho no celular
- [ ] Painel do responsável/professor + plano escola
- [ ] Analytics de aprendizado (evolução por tópico, previsão de nota)

### Fase 4 — "Escalar" (contínuo)
- [ ] CI/CD com lint + type-check + testes + Playwright nas jornadas críticas
- [ ] App nativo (Capacitor) se push/PWA no iOS limitar conversão
- [ ] Testes A/B de preço/paywall, programa de indicação (1 mês grátis)
- [ ] Suporte: central de ajuda, WhatsApp, política de reembolso clara
- [ ] SLO de disponibilidade e plano de resposta a incidente

---

## 6. Checklist "100% pronto para cobrar"

**Produto**
- [ ] Onboarding leva ao "primeiro valor" em < 10 minutos
- [ ] Trilha de 12 meses gerada e estável (a simulação de 1 ano passa)
- [ ] Simulados com conteúdo real e correção
- [ ] Notificações e relatório semanal funcionando
- [ ] Dados do aluno no servidor, com backup e exportação

**Cobrança**
- [ ] Trial, upgrade, downgrade, cancelamento e reembolso testados ponta a ponta
- [ ] Webhooks idempotentes + reconciliação diária de assinaturas com o gateway
- [ ] Nota fiscal emitida automaticamente
- [ ] Paywall não bloqueia quem já paga (teste de regressão!)

**Confiança**
- [ ] Termos, privacidade, LGPD, consentimento de menor
- [ ] Sentry sem erros novos por 7 dias seguidos em produção
- [ ] Uptime > 99,5% e alerta de queda
- [ ] Sem segredo com fallback; sem endpoint público sem rate limit
- [ ] Suporte com SLA informal de 24h e FAQ das 10 dúvidas mais comuns

**Números para acompanhar desde o dia 1**
- Ativação: % que gera cronograma e conclui 3 sessões na 1ª semana
- Retenção D7/D30, churn mensal, MRR, LTV/CAC (alvo > 3), conversão trial→pago

---

## 7. Se eu fosse priorizar só 5 coisas

1. **Assinatura + paywall + webhook** (sem isso não existe SaaS) — Fase 1.
2. **Progresso no servidor por bloco** (sem isso, o produto pago perde dados e vira suporte) — Fase 2.
3. **Simulados com questões reais + redação com IA** (sem isso, o aluno não vê motivo para pagar no
   mês 2).
4. **Push + relatório semanal** (barato de implementar, infra já existe, segura o aluno).
5. **Observabilidade + rate limit + LGPD** (protege a receita e evita bloqueio de gateway/conta de
   anúncios).
