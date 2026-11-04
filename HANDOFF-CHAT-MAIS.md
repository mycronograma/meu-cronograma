Você está retomando o desenvolvimento do **Nexora** (`mycronograma/meu-cronograma`) — app de cronograma de estudos para estudantes (ENEM/concursos), em português do Brasil. Stack: Next.js 15 (App Router) + TypeScript + Tailwind + NextAuth + Prisma (CockroachDB) + framer-motion. Deploy previsto na Vercel.

Leia tudo antes de escrever qualquer código.

**TL;DR:** existe agora uma **terceira versão** (branch `arena/01a0d51e-meu-cronograma`, `6f19f1a`, já no remoto) que contém **tudo**: o produto inteiro (dados server-side, design, horas conferidas, botões sem ambiguidade, páginas legais) **e** o trabalho do branch antigo (rótulos de bloco + limpeza de progresso ao sair da conta). O PR **#2** leva essa versão para a `main` — que é a *Production Branch* da Vercel. **O app oficial é https://my-cronograma.vercel.app/** e, hoje, ele ainda serve a base antiga (`/termos` e `/api/health` respondem 404). Antes de codar: alinhe a base com a versão certa (seção 1) e siga as regras do dono do projeto (seção 2).

---

## 1. Situação do git (importante — os dois galhos foram unidos)

- `main` = `fbefdeb` "Initial commit" — **só a base**, quase nada de produto pronto.
- `arena/01a0d51e-meu-cronograma` = `6f19f1a` — **a terceira versão**: produto inteiro **+** o trabalho do branch antigo, já mergeado e testado (ver seção 3).
- `arena/01a0d5b8-meu-cronograma` (a branch da sessão que você está, PR #1) = `a3f99d8` — o commit "Fix study block labels and clear local progress on sign-out" **já está dentro da terceira versão**.

**Primeiro passo obrigatório:** alinhe a base da sua branch com a versão certa.

```bash
git fetch origin
git rebase origin/arena/01a0d51e-meu-cronograma   # ou, depois do PR #2 mergeado: git rebase origin/main
```

O que a terceira versão já contém do teu commit (nada se perdeu):
- `src/lib/signOutAndClearProgress.ts` — helper de saída com limpeza de progresso (usado no `TopBar` e em "Sair da conta" das Configurações).
- Rótulos de bloco na ordem canônica (`REVISAO_ATIVA` por último, igual em `src/types/index.ts`, `src/lib/studyBlockLabels.ts` e `src/components/planner/TimeBlock.tsx`).
- `scripts/check-e2e-prerequisites.cjs` + `npm run test:e2e:check`.

**Dois NÃO:**

1. **O merge deixou chaves duplicadas** (`REVISAO_ATIVA` duas vezes) em `studyBlockLabels.ts` e `TimeBlock.tsx` — já corrigido na terceira versão (`6f19f1a`). Se ao rebasear você ver `TS1117: An object literal cannot have multiple properties with the same name`, é sinal de que pegou a versão intermediária: pegue `6f19f1a`.
2. **O helper de logout foi completado** (ainda é a mesma função, com o mesmo nome e o mesmo propósito): agora ele também reseta o cursor do sync (`resetSyncState()`) e limpa `nexora_pending_reviews` / `nexora_backlog_notification_day`. Sem isso, a próxima conta que entrasse no mesmo navegador herdaria o cursor da conta anterior. Há teste guarding isso: `npm run test:signout`.

Depois de alinhar a base, rode as 10 suítes da seção 4 — se algo quebrar, o problema está na base, não no teu código.

Existe também o **PR #2 aberto** (`arena/01a0d51e-meu-cronograma` → `main`) com a terceira versão completa — é ele que leva o app para a Vercel: https://github.com/mycronograma/meu-cronograma/pull/2.

**Se você tem alterações novas do Antigravity ainda só na sua máquina** (não commitadas nesse branch): faça commit e push para `arena/01a0d5b8-meu-cronograma` e avise — eu faço o merge de novo em cima da terceira versão e revalido tudo.

---

## 1b. A versão "oficial" é a que a Vercel está servindo

A Vercel não guarda uma cópia do código: ela **compila a branch configurada como *Production Branch*** do projeto. Logo, "a versão oficial que está rodando" = o commit dessa branch no momento do deploy.

**Situação de hoje:** a *Production Branch* é a `main` (padrão da Vercel), e a `main` ainda está em `fbefdeb` (base antiga) → **o site publicado ainda é a base velha**, não o produto. Todo o produto está em `arena/01a0d51e-meu-cronograma` (`4550b64`).

Escolha uma das duas formas de alinhar e siga:

**Forma A — produção = `main` (recomendada, com PR):**
1. O dono do projeto mergeia o PR #2 → a `main` passa a ter o produto e a Vercel redeploya sozinha.
2. Aqui: `git fetch origin && git rebase origin/main` (ou `git merge origin/main`) → a branch desta sessão passa a nascer do código que está no ar.
3. Trabalho novo → push da branch da sessão → PR para `main` → merge → novo deploy.

**Forma B — a branch desta sessão vira a produção (ciclo mais rápido, sem PR):**
1. Vercel → Project → Settings → **Git → Production Branch** = a branch desta sessão.
2. A partir daí, **cada push da branch desta sessão vai direto para produção** (push → deploy automático → conferir no site).
3. Antes disso, alinhe a base: `git fetch origin && git rebase origin/arena/01a0d51e-meu-cronograma` (traz produto + design + horas + sync; o commit de labels/sign-out reaparece no topo).

### Como conferir qual versão está no ar
- Vercel → Project → **Deployments** → deployment ativo: o topo mostra "Source: <branch> @ <sha>".
- Compare com `git rev-parse origin/main` (forma A) ou `git rev-parse origin/<sua branch>` (forma B).
- O GitHub **não** registra deployments deste projeto (nenhum status check do Vercel nos commits), então a fonte da verdade é o painel da Vercel.
- Endereço do app oficial: **https://my-cronograma.vercel.app/** (Vercel → Domains; ou `npx vercel ls` / `npx vercel inspect <url>` se tiver a CLI).

### Marcadores objetivos de qual versão está no ar

| Rota | O que está publicado hoje (base antiga `fbefdeb`) | O que passa a existir após o merge do PR #2 |
|---|---|---|
| `/login` | "Termos de Uso" e "Política de Privacidade" apontam para `#` | apontam para `/termos` e `/privacidade` |
| `/termos` | **404** (página de erro do próprio app) | 200 com o texto dos termos |
| `/privacidade` | **404** | 200 com a política |
| `/api/health` | **404** (rota não existe) | 200 (ou 503 degradado sem banco) |

Use essa tabela para conferir, a qualquer momento, qual versão está servindo: se `/termos` ainda der 404, a `main` ainda não recebeu o PR #2 e o site está na base antiga.

Obs. de rede: neste sandbox o `curl` para `vercel.app` retorna `000` (sem saída direta para a internet). Para consultar o site no ar, use a ferramenta de busca/fetch da plataforma, que tem acesso (ex.: buscar `https://my-cronograma.vercel.app/termos`).

### O que falta para a produção ficar completa depois do merge

- No deploy novo, `/api/health` precisa responder 200 → isso exige `DATABASE_URL` (CockroachDB) configurado no projeto Vercel.
- `prisma migrate deploy` roda no build e aplica a migração de sync incremental — o `/api/sync` só funciona com essa migração aplicada.
- A URL do app está em `NEXTAUTH_URL`; se divergir do domínio real, o login (Google/e-mail) quebra no redirecionamento.

### Antes de mexer na produção
- Variáveis de ambiente do projeto Vercel (Production): `DATABASE_URL` (CockroachDB), `NEXTAUTH_URL` (domínio final, ex.: `https://<dominio>.vercel.app`) e `NEXTAUTH_SECRET`. Sem o `NEXTAUTH_URL` correto, o login redireciona errado.
- `npm run vercel-build` executa `prisma generate` → `prisma migrate deploy` → `next build`: **toda mudança em `prisma/schema.prisma` exige migration** (`prisma/migrations/<timestamp>_<nome>/migration.sql`, SQL estilo CockroachDB — coluna `NOT NULL` nova em tabela não-vazia precisa de `DEFAULT`). Sem a migration, a build de produção quebra.
- O Prisma CLI não roda offline no sandbox: migration é escrita à mão e revisada.
- Depois do deploy: `/api/health` (200 com banco, 503 degradado sem), `/api/sync` (401 sem sessão — esperado), `/login`, `/register`, `/planner` (exige sessão).
- **Produção não tem o bypass de demo**: `NEXT_PUBLIC_LOCAL_DEMO_MODE` só vale em dev (`.env.local`, gitignored). Não teste a produção esperando entrar sem login.
- Para reproduzir localmente igual à produção: copie as env vars do projeto Vercel para o `.env.local` (fora do git) e rode `npx next dev -H 0.0.0.0 -p 3111`.

---

## 2. Decisões do dono do projeto (respeite; não rever sem perguntar)

1. **Falar/responder sempre em português.**
2. **Ordem de implementação escolhida:** camada de dados **server-side primeiro**, assinatura (billing) **depois**.
3. **Gateway de pagamento: Mercado Pago**, com abstração de provedor para permitir trocar por outro depois.
4. Qualidade do app é requisito de aceite, não extra: deve estar **"visivelmente agradável", sem confusões de botões, sem lógicas quebradas e com os cálculos de horas conferidos e corretos**.
5. O produto deve ser avaliado do ponto de vista de **um estudante que usa o app continuamente por ~1 ano** (sessões longas, acúmulo de dados, progresso real).
6. Fluxo do agente: trabalhar só na branch da sessão, commitar em português, dar push para a branch da sessão, abrir PR com `gh`. Nunca mexer em branches de outra sessão.

---

## 3. O que já está pronto (branch `ecaf9bc`, 7 commits)

| Commit | Entrega |
|---|---|
| `9756cb4` | Caça a bugs de um ano de uso → `RELATORIO-BUGS.md` (simulação de 1 ano: 2754 blocos, 1383 concluídos, 203 pulados, XP 54420, streak 307, 8 conquistas, store 3.320 KB, **0 anomalias**) |
| `7158034` | Plano de assinatura → `PLANO-SUBSCRICAO.md` (modelos Free/Pro/anual/Escola, `src/lib/entitlements.ts`, trial 7 dias → checkout → webhook idempotente → portal + dunning) |
| `89205fb` | **Camada de dados server-side**: Prisma schema + migração de sync incremental, `src/lib/{syncDelta,syncServer,clientSync}.ts`, `POST/GET /api/sync`, `GET /api/health`, `src/hooks/useServerProgressSync.ts` |
| `8821e97` | Design/UX: contraste AA, `prefers-reduced-motion`, foco de teclado visível, banner de falha de sync, tokens em `globals.css`/`tailwind.config.ts` |
| `6fd3fac` | Microcopy: acentos e textos visíveis corrigidos (auth, planejador, gamificação) |
| `ecaf9bc` | **Auditoria de horas** + **botões sem ambiguidade** + regras de reagendamento testadas + `/termos` + `/privacidade` + analytics (heatmap com seletor de período + card "Horário de maior rendimento") |

Detalhe do último commit (é o que mais toca no teu branch):

- `src/lib/plannerRules.ts` (novo) concentra as regras: `isLockedScheduleBlock` (concluído/em andamento **nunca** é movido nem perde status), `isPendingStudyBlock`, `isCapacityStudyBlock`, `selectReschedulableBlocks`, `sumStudyMinutes`, `selectOverflowBlocks`, `buildRescheduledBlock`, `getBlockDurationMinutes`. O `WeeklyPlanner` consome esse módulo nos dois caminhos de movimentação.
- **Botões:** vocabulário separado — "mover" = você escolhe o dia ("Mover estudos de dia", "Mover este estudo", "Mover" na linha), "replanejar" = o app decide ("Replanejar automaticamente", só o automático). As antigas "Reagendar pendências"/"Reagendar manualmente" sumiram. Zona de perigo: "Apagar todo o progresso" → "Apagar tudo"; "Reiniciar tutorial" → "Confirmar reinício"; "Excluir minha conta" → "Excluir definitivamente".
- **Horas:** `src/lib/utils.ts` passou a devolver minutos exatos ("48 min", "1:48") — nunca reintroduzir arredondamento legado (dava "50 min" para 48 min e "1:50" para 108 min). Datas/dias em pt-BR; formato 24h; inválido → "0 min". A "meta da semana" das disciplinas compara só as horas da semana (`buildWeeklyCompletedHoursBySubject` em `src/lib/progressSnapshot.ts`), não o total histórico.
- Páginas legais novas: `src/app/termos/page.tsx`, `src/app/privacidade/page.tsx` + `src/components/legal/LegalPage.tsx` (o login tinha `href="#"`).

O teu commit `a3f99d8` (rótulos de blocos + limpar progresso local ao sair) **complementa** isso e não conflita conceitualmente: ele impede que a próxima conta logada no mesmo navegador herde os dados de estudo do usuário anterior, e ajusta a ordem das chaves `REVISAO_ATIVA` nos mapas de rótulo (para manter a ordem canônica de `src/types/index.ts`, onde `REVISAO_ATIVA` ficou marcado como legado do gerador semanal antigo).

---

## 4. Como verificar (obrigatório antes de dizer que terminou)

```bash
npm run test:hours        # auditoria de horas/horários sobre o motor real
npm run test:ui           # acessibilidade de botões + tokens de contraste
npm run test:signout      # toda chave de usuário é apagada ao sair da conta
npm run test:sync         # delta de sync no servidor
npm run test:sync-client  # motor de sync no cliente
npm run test:roadmap
npm run test:student-audit
npm run test:backlog
npm run test:gamification
npm run test:year-simulation
npx next lint && npx tsc --noEmit
```

Estado atual: as 10 suítes passam, `next lint` limpo, `tsc` sem erros novos (os 33 restantes são do client Prisma não gerado por falta de rede no sandbox — na Vercel o `prisma generate` roda antes do build e eles somem; o mesmo `tsc` no commit anterior ao merge dá exatamente os mesmos 33). O `test:ui` reportou "0 botões só com ícone sem nome acessível (de 54 arquivos analisados)".

Para ver rodando: `npx next dev -H 0.0.0.0 -p 3111`. Em dev, as rotas `(app)` redirecionam para `/login` **a menos** que exista `.env.local` (gitignored) com `NEXT_PUBLIC_LOCAL_DEMO_MODE="true"` — sem isso você não consegue navegar no planner. Smoke testado: `/planner`, `/settings`, `/subjects`, `/dashboard`, `/analytics` → 200, `/` → 307 para `/dashboard`.

---

## 5. Armadilhas conhecidas (não repita o erro)

- **O repositório pode ser reclonado silenciosamente entre sessões** (o HEAD volta para `fbefdeb` "Initial commit"). Se isso acontecer: `git fetch origin 'refs/heads/<branch>:refs/remotes/origin/<branch>'` + `git reset --mixed origin/<branch>` — a árvore de trabalho é preservada. Nunca reclone nem refaça o trabalho.
- **Prisma CLI não funciona offline**: nunca rode `prisma generate`/`migrate`. Migração foi escrita à mão, em SQL estilo CockroachDB (`NOT NULL` em tabela não-vazia precisa de `DEFAULT`).
- **`npx next build` falha** em `src/app/api/auth/delete-account/route.ts:22` (`Prisma.PrismaClientKnownRequestError` — client Prisma gerado desatualizado). O `tsc` não acusa. Build na Vercel ou corrija essa linha.
- `npm install` reescreve o `package-lock.json` (campos `libc`) → depois `git checkout package-lock.json`.
- Se `node_modules` sumir: `npm install --no-audit --no-fund` (a falha do `prisma generate` no postinstall é esperada e não é fatal).
- **Playwright/Docker indisponíveis** no sandbox — o `test:trainer-dashboard` e o `test:e2e:check` (teu) não rodam aqui; servem só como detector de pré-requisitos.
- Ao rodar smoke test logo depois de um `next build`, espere e refaça (o `.next` é reescrito e o dev server reinicia) — 500/000 falsos não são bug do app.
- Nunca passar um bloco já concluído para `calculateTrainerCompletionReward`.
- No `tsx` em CommonJS, usar `async function main()`; scripts de `/tmp` precisam de import absoluto.

---

## 6. Próximo passo combinado

A assinatura (billing) é a próxima frente, conforme o `PLANO-SUBSCRICAO.md` §2.2: **Mercado Pago** atrás de `src/lib/billing/provider.ts` (abstração de provedor), com trial de 7 dias → checkout → webhook idempotente → portal do cliente + dunning. A camada de dados server-side (§2.1) já está pronta e é a base disso.

Modelos de preço já definidos no plano: Free (2 disciplinas / 7 dias de histórico) · Pro R$ 24,90–34,90/mês · anual R$ 197–249 · Escola R$ 9–15 por aluno.

Antes de começar a implementar, confirme com o dono do projeto o que ele quer atacar primeiro nessa frente e leia `PLANO-SUBSCRICAO.md` e `RELATORIO-BUGS.md` (em português, na raiz do repo).

---

## 7. Arquivos que importam

- `src/lib/plannerRules.ts` — regras de agendamento/reagendamento (fonte da verdade)
- `src/lib/progressSnapshot.ts` — `buildWeeklyCompletedHoursBySubject` (horas da semana)
- `src/lib/utils.ts` — formatação de duração/data/hora (minutos exatos, pt-BR)
- `src/lib/clientSync.ts`, `src/lib/syncDelta.ts`, `src/lib/syncServer.ts` — motor de sync (cliente/servidor/delta)
- `src/hooks/useServerProgressSync.ts` — `SERVER_PROGRESS_STORE_KEYS`, evento `nexora-sync-status`
- `src/components/planner/WeeklyPlanner.tsx` — planejador semanal (botões "Mover"/"Replanejar")
- `src/app/(app)/settings/page.tsx` — zona de perigo (rótulos finais)
- `src/types/index.ts` — `StudyBlockType` (inclui simulados), `Subject.studyPrefs?`
- `prisma/schema.prisma` + `prisma/migrations/20260924120000_add_incremental_sync_fields/migration.sql`
- `scripts/` — `hours-audit.test.ts`, `ui-audit.test.ts`, `sync-delta.test.ts`, `client-sync.test.ts`, `year-simulation.test.ts`, `roadmap.test.ts`, `student-product-audit.test.ts`, `backlog-rescheduler.test.ts`, `gamification.test.ts`, `helpers/memoryPrisma.ts`
- Docs: `PLANO-SUBSCRICAO.md`, `RELATORIO-BUGS.md`, `README.md` (tabela de suítes), `COMO_USAR.md`, `SETUP_VERCEL.md`
