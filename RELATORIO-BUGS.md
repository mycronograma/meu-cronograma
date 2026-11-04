# Relatório de bugs — Nexora (uso real de 1 ano)

Data: 24/09/2026 · Branch: `arena/01a0d51e-meu-cronograma`

Método: subi o app em modo demo local (`NEXT_PUBLIC_LOCAL_DEMO_MODE=true`), naveguei pelas telas e
rodei o motor de verdade em Node com uma estudante fictícia (ENEM, ~5h/dia, 6 dias por semana,
14 disciplinas do preset oficial do ENEM) durante **365 dias**, gerando o cronograma **semana a
semana** como o wizard/botão do planejador fazem, concluindo os blocos (86% de adesão), deixando
alguns para trás, rodando backlog, gamificação e analytics.

O roteiro completo está versionado em `scripts/year-simulation.test.ts` (`npm run test:year-simulation`),
então qualquer mudança futura pode ser revalidada.

---

## 1. Resumo

| # | Bug | Gravidade | Status |
|---|-----|-----------|--------|
| 1 | Todas as telas do app respondiam **HTTP 500** sem banco/Prisma gerado — inclusive no modo demo, que é documentado como "sem login e sem banco" | 🔴 Crítico | ✅ Corrigido |
| 2 | Onboarding travava no fim (`Falha ao salvar onboarding`) por 401 no modo demo | 🔴 Crítico | ✅ Corrigido |
| 3 | Dados crescem ~3,3 MB por ano e a falha ao salvar (cota cheia) era **silenciosa** → perda de progresso | 🔴 Crítico | ⚠️ Parcial |
| 4 | **Simulado e correção (ANALISE) nunca apareciam** gerando semana a semana — a fase de consolidação não existia no fluxo real | 🟠 Alto | ✅ Corrigido |
| 5 | **Revisão espaçada (7 e 30 dias) era descartada**: só funcionava gerando um ano inteiro de uma vez | 🟠 Alto | ✅ Corrigido |
| 6 | **Streak travava em 6 dias** para quem descansa 1 dia/semana; conquistas de 7 e 30 dias eram impossíveis | 🟠 Alto | ✅ Corrigido |
| 7 | "Resetar progresso" e "Reiniciar tutorial" não funcionavam no modo demo (401 → erro na tela) | 🟠 Alto | ✅ Corrigido |
| 8 | Tipos do domínio dessincronizados (`StudyBlockType`, `sessionType`, `StudySessionKind`) → rótulos vazios, comparações mortas e `npm run type-check` quebrado | 🟡 Médio | ✅ Corrigido |
| 9 | Cada bloco guarda uma cópia inteira da disciplina (tópicos/pré-requisitos) | 🟡 Médio | 📋 Documentado |
| 10 | `nexora_xp_events` e `nexora_analytics` crescem sem limite | 🟡 Médio | 📋 Documentado |
| 11 | `completingBlockIdsRef` nunca é limpo (bug latente se algum dia existir "reabrir bloco") | 🔵 Baixo | 📋 Documentado |

---

## 2. Bugs corrigidos neste branch

### 2.1 🔴 App inteiro fora do ar sem banco (e no modo demo)

**Sintoma:** `/`, `/dashboard`, `/planner`, `/subjects`, `/analytics`, `/settings` → **HTTP 500**.

```
⨯ Error: @prisma/client did not initialize yet. Please run "prisma generate" and try to import it again.
    at src/lib/prisma.ts:28 (new PrismaClient)
    at src/lib/auth.ts
    at src/app/(app)/layout.tsx
```

**Causa:** o layout do grupo `(app)` fazia `import { authOptions } from '@/lib/auth'` no topo do
arquivo. Esse import executa `new PrismaClient()` em tempo de módulo, mesmo no caminho em que o
layout retorna mais cedo por estar em modo demo (que não precisa de banco). Qualquer falha de
Prisma (`prisma generate` que falhou no install, banco fora do ar, env ausente) derrubava o app
inteiro.

**Correção:**
- `src/lib/prisma.ts`: client **lazy** via `Proxy` — importar o módulo não instancia mais nada; o
  erro só aparece quando o banco é realmente usado (e é logado de forma clara).
- `src/app/(app)/layout.tsx`: `dynamic import` de `next-auth`/`@/lib/auth` apenas quando não é demo.

**Verificação:** todas as telas voltaram a responder 200 no modo demo, sem banco.

---

### 2.2 🔴 Onboarding travava no modo demo

`POST /api/onboarding/complete` devolvia **401 Unauthorized** (exige sessão), e a página
`/onboarding` só aceita `res.ok` → a estudante via *"Falha ao salvar onboarding"* e não conseguia
finalizar o questionário.

**Correção:** a rota agora entende o modo demo local (como `/api/planner/generate` e `/api/presets`
já faziam), monta o setup localmente e não tenta gravar no banco. Verificado: resposta 200 com o
perfil, disciplinas e cronograma.

### 2.3 🟠 Simulados/consolidação nunca aconteciam no fluxo semanal

O motor usava `config.startDate` (início da **janela gerada**) como "início da jornada". Gerando a
semana de 07/09→13/09, `daysSinceStart` é 0–6, e as regras pedem 7 dias (simulado por área) e 14
dias (simulado completo) → **nunca liberava**. Além disso o ciclo pedagógico
(aula → exercícios → revisão → simulado) reiniciava a cada geração, então nenhuma disciplina
chegava à etapa de simulado.

Prova (52 semanas, geração semanal):

| Geração | AULA | EXERCÍCIOS | REVISÃO | SIMULADO | ANÁLISE |
|---|---|---|---|---|---|
| Antes (semana a semana) | 728 | 312 | 260 | **0** | **0** |
| Antes (ano inteiro de uma vez) | 193 | 294 | 603 | 145 | 88 |
| Depois (semana a semana) | 231 | 530 | 659 | 22 | 12 |

**Correção em `src/services/roadmapEngine.ts`:**
- novo campo `pedagogicalStartDate` (início real da jornada, usado por fases e liberação de simulados);
- novo campo `lastSimuladoDate`, para o intervalo entre simulados (`frequencyDays`) valer também
  entre gerações;
- `completedReviewsBySubject` / `completedSimuladosBySubject`: o ciclo pedagógico é **semeado** com
  o que a estudante já concluiu, em vez de recomeçar em "aula" toda semana;
- simulado por área também respeita o intervalo entre simulados (antes virava uma fila de simulados
  engolindo aulas e exercícios);
- quando o simulado é adiado só por causa do intervalo, o ciclo é liberado para a disciplina voltar
  a conteúdo novo (senão ficava presa na etapa de simulado para sempre).

O planejador (`src/app/(app)/planner/page.tsx`) calcula e envia esses dados: início real vem de
`studyPrefs.startDate` (ou do bloco mais antigo), contagens vêm dos blocos já concluídos.

### 2.4 🟠 Revisão espaçada (24h/7d/30d) não funcionava no fluxo semanal

Ao agendar uma aula, o motor enfileirava revisões em +1, +7 e +30 dias, mas
`if (reviewDate < config.startDate || reviewDate > config.endDate) return;` **descartava** tudo o
que caía fora da janela. Gerando semana a semana, as revisões de 7 e 30 dias nunca existiam —
justamente o maior ganho pedagógico do produto.

**Correção:**
- o motor passa a devolver `pendingReviews` (data → disciplinas) para o que caiu depois da janela;
- a página do planejador guarda isso em `nexora_pending_reviews` e reenvia na próxima geração, onde
  as revisões são cobradas;
- revisões que cairiam em dia de descanso são empurradas para o próximo dia de estudo válido;
- revisões atrasadas (de gerações anteriores) entram no começo da janela.

Efeito no ano simulado: **659 blocos de revisão** contra 260 antes, com 0 revisões perdidas por
estarem fora da janela.

### 2.5 🟠 Streak impossível para quem descansa no domingo

`computeStudyStreak` quebrava a sequência em qualquer dia sem estudo — inclusive no dia de descanso
**que o próprio app configura por padrão** (`excludeDays: [0]`, `dom: 0h`). Resultado: quem estuda
6 dias por semana nunca passa de **6 dias** de sequência e as conquistas "7 dias" (`streak-7`) e
"30 dias" (`streak-30`) são **inalcançáveis**. Na simulação de 1 ano: streak 6 (recorde 6).

**Correção (`src/lib/progressSnapshot.ts` + `src/services/studyTrainer.ts`):** dias sem estudo
planejado (`excludeDays` / `dailyHoursByWeekday` = 0) não contam como dia estudado, mas **não
quebram** a sequência. Dias de descanso também são considerados no cálculo do recorde.
Resultado na mesma simulação: **307 dias** de sequência, com conquistas desbloqueando normalmente.

### 2.6 🟠 Botões de reset quebrados no modo demo

"Resetar progresso" e "Reiniciar tutorial" (Configurações → Zona de risco) chamavam
`DELETE /api/progress` **antes** de limpar o armazenamento local. No modo demo a rota responde 401,
a exceção interrompia o fluxo e a tela mostrava *"Falha ao resetar progresso"* sem limpar nada.

**Correção:** no modo demo a limpeza é local e o servidor é ignorado.

### 2.7 🟡 Tipos do domínio dessincronizados (gerava rótulo vazio e comparações mortas)

`StudyBlockType` (em `src/types/index.ts`) não tinha `SIMULADO_AREA`/`SIMULADO_COMPLETO` — tipos que
o Prisma e o motor usam — e tinha `REVISAO_ATIVA`, que **não existia em nenhum mapa de rótulos**.
Consequências reais:
- `getStudyBlockTypeLabel('REVISAO_ATIVA')` devolvia `undefined` → título do bloco virava
  `"Matéria - undefined"` na interface;
- o selo de tipo em `TimeBlock` não renderizava para esses blocos;
- `sessionType` não aceitava `'simulado'` e `StudySessionKind` não tinha `SIMULADO`, gerando ~20
  comparações que o TypeScript considerava impossíveis (escondendo bugs de verdade);
- `npm run type-check` falhava com **62 erros**.

**Correção:** união de tipos alinhada com o domínio (`SIMULADO_AREA`, `SIMULADO_COMPLETO`,
`REVISAO_ATIVA` marcado como legado, `'simulado'` no `sessionType`, `SIMULADO` no `StudySessionKind`)
e mapas de rótulos completos (`studyBlockLabels.ts`, `TimeBlock.tsx`). De 62 erros de tipo restam 30,
todos em rotas que dependem do client Prisma gerado (não gerado neste sandbox por bloqueio de rede
em `binaries.prisma.sh`) — revalidar com `npm run prisma:generate && npm run type-check`.

Também deixei `getPhaseForDate` tolerante a `startDate` ausente: antes uma chamada sem o segundo
argumento derrubava a tela com `Cannot read properties of undefined`.

---

## 3. Problemas abertos (não corrigidos neste branch)

### 3.1 🔴 Armazenamento do navegador (o mais perigoso no longo prazo)

Todo o progresso vive em `localStorage`. Medições da simulação de 1 ano (5h/dia):

| Chave | Tamanho |
|---|---|
| `nexora_planner_blocks` | 2.379 KB (2.754 blocos) |
| `nexora_xp_events` | ~570 KB |
| `nexora_analytics` | ~350 KB |
| **Total** | **~3,3 MB em 1 ano** |

- Cada bloco tem **1.438 bytes**, dos quais **830 são uma cópia da disciplina** (376 só de
  `topicos` + `prerequisitos`). Sem essa cópia o bloco cai para ~608 bytes (**−58%**).
- A cota típica é de ~5 MB — e no Safari/iOS a cota é contada em bytes UTF-16, o que na prática
  corta o espaço útil pela metade. Ou seja: **um estudante de cursinho intensivo chega no limite
  antes de terminar o primeiro ano**, especialmente pelo PWA no celular.
- Pior: a falha de gravação era **silenciosa** (`console.warn`). A tela continuava funcionando
  (estado em memória) e o progresso simplesmente **desaparecia ao recarregar**.

**O que foi feito:** agora o app dispara um aviso visível
(`StorageWarningBanner`, no layout do app) explicando que os dados não estão sendo salvos.

**Recomendação (próximo passo):** não guardar a disciplina dentro do bloco (resolver por
`subjectId` na renderização — o planejador já faz isso ao carregar), arquivar/compactar blocos
antigos e podar `nexora_xp_events` antigos, guardando o XP acumulado em um total à parte.

### 3.2 🟡 Outros pontos observados

- **Blocos antigos ficam "pendentes" para sempre:** após 1 ano havia ~30 blocos atrasados; eles só
  somem se o backlog automático rodar (depende de `backlogReminderEnabled` estar ligado).
- **`completingBlockIdsRef`** (dashboard e planner) marca ids concluídos e nunca limpa. Hoje não há
  caminho na UI para reabrir um bloco concluído, mas no dia em que existir, a segunda conclusão será
  ignorada silenciosamente.
- **Heatmap fixo em 12 semanas** (`<ActivityHeatmap weeks={12} />`): para quem usa há um ano, a tela
  de analytics mostra sempre o mesmo recorte.
- **Payload de sincronização:** o app envia todo o `localStorage` em um único `PUT /api/progress`;
  com 3+ MB de dados isso se aproxima do limite de corpo de requisição (4,5 MB na Vercel) e a falha
  também é só `console.warn`.
- **`REVISAO_ATIVA`**: tipo legado do gerador antigo (`studyAlgorithm`) que não existe no enum do
  Prisma. Continua apenas em código legado/mocks; ao persistir esses blocos no banco, o Prisma vai
  rejeitar.

---

## 4. Como reproduzir / validar

```bash
npm install
npm run prisma:generate          # necessário para as rotas de banco
cp .env.local.example .env.local # modo demo local

npm run test:roadmap             # inclui os novos testes de geração semanal
npm run test:student-audit       # inclui os testes de streak com dia de descanso
npm run test:year-simulation     # simulação determinística de 1 ano
npm run test:backlog
npm run test:gamification
```

Saída atual da simulação de 1 ano:

```
Blocos por tipo: { AULA: 231, REVISAO: 659, EXERCICIOS: 530, SIMULADO_COMPLETO: 21, SIMULADO_AREA: 1, ANALISE: 12 }
Blocos: 2754 | concluídos: 1383 | não feitos: 203
Geração de semana: média 2,8ms, máx 14ms
XP: 54.420 | nível 15 | sequência: 307 dias | conquistas: 8
Dados no navegador: 3.320 KB
Anomalias: nenhuma (sem sobreposição, sem bloco em dia de descanso, sem estourar o limite diário)
```
