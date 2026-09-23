# Como rodar localmente antes de publicar

Esta e a versao local do Nexora para voce editar, testar e deixar perfeito antes de mandar para a nuvem.

## O que a versao local usa

- Next.js rodando em `http://localhost:3000`
- Modo demo local sem login obrigatorio para editar as telas
- Opcional: CockroachDB local via Docker em `localhost:26257`
- Opcional: Prisma aplicando as migrations localmente
- `.env` local, ignorado pelo Git

## 1. Instalar ferramentas

Abra o PowerShell e instale:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Docker.DockerDesktop
winget install Git.Git
```

Depois feche e abra o PowerShell novamente.

Confira:

```powershell
node --version
npm --version
docker --version
git --version
```

Abra o Docker Desktop pelo menu iniciar antes de rodar o setup.

## 2. Entrar na pasta do projeto

```powershell
cd C:\Users\Lucas\Downloads\meu--main\meu--main
```

## 3. Rodar agora em modo demo local

O arquivo `.env` ja vem com:

```env
NEXT_PUBLIC_LOCAL_DEMO_MODE="true"
```

Com isso, voce consegue abrir dashboard, planner, subjects, analytics e settings sem login enquanto edita o app.

Rode:

```powershell
npm run dev
```

Se o PowerShell bloquear `npm.ps1`, use:

```powershell
npm.cmd run dev
```

Acesse:

```text
http://localhost:3000
```

## 4. Preparar banco local completo

Rode:

```powershell
npm run local:setup
```

Esse comando faz:

- sobe o CockroachDB local com Docker
- cria o banco `nexora`
- instala dependencias com `npm ci`
- gera o Prisma Client
- aplica migrations
- popula dados de exemplo

## 5. Rodar o app local com banco

```powershell
npm run local:dev
```

Acesse:

```text
http://localhost:3000
```

## Login de demonstracao

Depois do seed local:

```text
Email: alex.chen@nexora.dev
Senha: Nexora@123
```

Voce tambem pode criar uma conta nova. Em ambiente local, se SMTP nao estiver configurado, o app mostra o codigo de verificacao na tela.

Quando quiser testar login real com banco, desligue o modo demo no `.env`:

```env
NEXT_PUBLIC_LOCAL_DEMO_MODE="false"
```

## Editar o app

Arquivos principais:

- Telas: `src/app`
- Componentes: `src/components`
- Regras de estudo: `src/services`
- Banco: `prisma/schema.prisma`
- Estilos globais: `src/app/globals.css`

Sempre que alterar o banco:

```powershell
npm run prisma:generate
npm run db:push
```

## Verificar antes de publicar

```powershell
npm run build
npm run test:roadmap
npm run test:smoke:presets
npm run test:backlog
```

## Parar o banco local

```powershell
npm run local:db:down
```

## Subir o banco local novamente

```powershell
npm run local:db:up
```

## Problemas comuns

### `node` ou `npm` nao reconhecido

Instale o Node.js e abra um novo terminal:

```powershell
winget install OpenJS.NodeJS.LTS
```

### Docker nao esta rodando

Abra o Docker Desktop e espere aparecer como ativo.

### Porta 3000 ocupada

Use:

```powershell
npm run dev -- -p 3001
```

### Porta 26257 ocupada

Outro banco local esta usando a porta do CockroachDB. Pare o outro servico ou altere a porta em `docker-compose.local.yml` e no `.env`.
