import { test, expect } from "bun:test";
import type {
  STTProvider,
  TTSProvider,
  Transcript,
  AudioResult,
} from "@yae/voice";

test("STTProvider contract returns a Transcript", async () => {
  const provider: STTProvider = {
    async transcribe() {
      return { text: "hello world" };
    },
  };

  const result: Transcript = await provider.transcribe(Buffer.from("fake"));
  expect(result.text).toBe("hello world");
  expect(result.segments).toBeUndefined();
});

test("STTProvider can return segments", async () => {
  const provider: STTProvider = {
    async transcribe() {
      return {
        text: "hello world",
        segments: [{ start: 0, end: 1.5, text: "hello world" }],
      };
    },
  };

  const result = await provider.transcribe(Buffer.from("fake"));
  expect(result.segments).toHaveLength(1);
  expect(result.segments?.[0]?.start).toBe(0);
});

test("TTSProvider contract returns an AudioResult", async () => {
  const provider: TTSProvider = {
    async synthesize() {
      return { audio: Buffer.from("audio-data"), format: "mp3" };
    },
  };

  const result: AudioResult = await provider.synthesize("hello");
  expect(result.audio).toBeInstanceOf(Buffer);
  expect(result.format).toBe("mp3");
  expect(result.durationMs).toBeUndefined();
});

test("TTSProvider can include duration", async () => {
  const provider: TTSProvider = {
    async synthesize() {
      return {
        audio: Buffer.from("audio-data"),
        format: "wav",
        durationMs: 1200,
      };
    },
  };

  const result = await provider.synthesize("hello", { voice: "alloy" });
  expect(result.durationMs).toBe(1200);
});
