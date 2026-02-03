# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Y.A.E. is an AI agent orchestrator built with Bun, Elysia, and Drizzle ORM. Organized as a Turborepo monorepo with Bun workspaces.

## Monorepo Structure

```
apps/server/     → @yae/server   Main server app (Elysia, Drizzle, TanStack AI)
apps/cli/        → @yae/cli      Standalone CLI client (zero deps)
packages/graph/  → @yae/graph    Graph execution engine (zero deps)
packages/baml/   → @yae/baml     BAML wrapper for LLM calls
```

## Commands

```bash
bun test            # Run all tests across packages
bun lint            # Lint all packages
bun run format      # Prettier format (root)
```

Package-specific commands are documented in each package's CLAUDE.md.

## Workspace Dependencies

- `@yae/server` depends on `@yae/graph` via `workspace:*`
- `@yae/graph` and `@yae/cli` have zero workspace deps
- Shared devDeps (eslint, typescript, prettier) live at the root

## Config

- `tsconfig.base.json` — shared compiler options (all packages extend this)
- `turbo.json` — task pipeline (`build`, `dev`, `test`, `lint`)
- `eslint.config.js` — shared ESLint config
- `package.json` — workspace root, `packageManager: bun@1.3.5`
