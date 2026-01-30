# @yae/cli

Standalone CLI client for testing Y.A.E. REST endpoints. Zero dependencies — uses only Node/Bun built-ins and `fetch`.

## Commands

```bash
bun run cli                # Run the CLI (shows help)
bun run cli health         # Check server health
bun run cli chat           # Interactive chat session
```

## Architecture

Single file at `src/yae-cli.ts`. Config stored at `~/.yae/config.json`.

Supported commands: `health`, `verify`, `users list/create/delete`, `chat`, `config set-admin/set-user/show`.
