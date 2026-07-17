export const ROLE_ME = 0;
export const ROLE_THEM = 1;

const CHUNK_SECONDS = 4;
// Whisper hallucinates ("you", "thank you", repeated garbage tokens) when fed
// near-silent audio. Skip chunks quiet enough that there's nothing to transcribe.
const SILENCE_RMS_THRESHOLD = 0.008;

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

// Whisper rejects MediaRecorder's webm/opus container ("Invalid audio input").
// Capture raw PCM via Web Audio instead and encode it as a WAV file per chunk.
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

export interface PcmCapture {
  ctx: AudioContext;
  stop: () => void;
}

export function startPcmCapture(
  stream: MediaStream,
  roleByte: number,
  agent: { send: (data: ArrayBuffer) => void }
): PcmCapture {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const silentGain = ctx.createGain();
  silentGain.gain.value = 0;

  const targetSamples = ctx.sampleRate * CHUNK_SECONDS;
  let buffers: Float32Array[] = [];
  let collected = 0;

  processor.onaudioprocess = (e) => {
    buffers.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    collected += e.inputBuffer.length;
    if (collected < targetSamples) return;

    const merged = new Float32Array(collected);
    let pos = 0;
    for (const buf of buffers) {
      merged.set(buf, pos);
      pos += buf.length;
    }
    buffers = [];
    collected = 0;

    if (rms(merged) < SILENCE_RMS_THRESHOLD) return;

    const wav = encodeWav(merged, ctx.sampleRate);
    const framed = new Uint8Array(wav.byteLength + 1);
    framed[0] = roleByte;
    framed.set(new Uint8Array(wav), 1);
    agent.send(framed.buffer);
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(ctx.destination);

  return {
    ctx,
    stop: () => {
      processor.disconnect();
      source.disconnect();
      silentGain.disconnect();
      void ctx.close();
    }
  };
}
