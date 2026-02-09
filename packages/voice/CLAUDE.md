# @yae/voice

Provider-agnostic voice integration (STT + TTS). Defines interfaces — concrete adapters are added separately.

## Commands

```bash
bun test    # Run tests
eslint .    # Lint
```

## Architecture

### Interfaces (`src/types.ts`)

- **STTProvider** — `transcribe(audio, options?) → Transcript`
- **TTSProvider** — `synthesize(text, options?) → AudioResult`

### Types

- `Transcript` — `{ text, segments? }` where segments have `start`, `end`, `text`
- `AudioResult` — `{ audio: Buffer, format, durationMs? }`
- `STTOptions` — `{ language?, model?, prompt? }`
- `TTSOptions` — `{ voice?, model?, speed?, format? }`

## Exports

All public API re-exported from `src/index.ts`. Consumed as `@yae/voice` via Bun workspace resolution.
