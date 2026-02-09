// @yae/voice — Provider-agnostic voice interfaces

/** A single timed segment within a transcript. */
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

/** Result of a speech-to-text transcription. */
export interface Transcript {
  text: string;
  segments?: TranscriptSegment[];
}

/** Options passed to an STT provider. */
export interface STTOptions {
  language?: string;
  model?: string;
  prompt?: string;
}

/** Provider that converts audio to text. */
export interface STTProvider {
  transcribe(
    audio: Blob | Buffer,
    options?: STTOptions,
  ): Promise<Transcript>;
}

/** Result of a text-to-speech synthesis. */
export interface AudioResult {
  audio: Buffer;
  format: string;
  durationMs?: number;
}

/** Options passed to a TTS provider. */
export interface TTSOptions {
  voice?: string;
  model?: string;
  speed?: number;
  format?: string;
}

/** Provider that converts text to audio. */
export interface TTSProvider {
  synthesize(
    text: string,
    options?: TTSOptions,
  ): Promise<AudioResult>;
}
