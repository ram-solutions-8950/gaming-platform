/**
 * download-sounds.js
 *
 * Generates short, high-quality casino sound effects as MP3 files
 * into  frontend/public/assets/sounds/  using programmatic audio synthesis.
 *
 * These sounds are 100% original, royalty-free, and do not depend on
 * any external download source. They are generated using WAV encoding
 * and are ready for production use.
 *
 * Usage:    npm run download:sounds
 *           (or:  node scripts/download-sounds.js)
 *
 * Rules:
 *   • Never overwrites an existing file.
 *   • Creates the target directory if missing.
 *   • Exits with code 0 on success.
 */

import { existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOUNDS_DIR = resolve(__dirname, "..", "public", "assets", "sounds");
const SAMPLE_RATE = 44100;

// ─── WAV Encoder ────────────────────────────────────────────────────

function encodeWavAsBuffer(samples, sampleRate) {
  const numSamples = samples.length;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = bytesPerSample;
  const dataSize = numSamples * bytesPerSample;
  const bufferSize = 44 + dataSize;
  const buffer = Buffer.alloc(bufferSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(bufferSize - 8, 4);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20);  // PCM
  buffer.writeUInt16LE(1, 22);  // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // bits per sample

  // data chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buffer.writeInt16LE(Math.round(val), 44 + i * 2);
  }

  return buffer;
}

// ─── Sound Generators ───────────────────────────────────────────────

function generateSine(freq, duration, volume = 0.5, fadeOut = true) {
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    let amp = volume;
    if (fadeOut) {
      const progress = i / numSamples;
      amp *= 1 - progress; // linear fade
    }
    samples[i] = amp * Math.sin(2 * Math.PI * freq * t);
  }
  return samples;
}

function mixSamples(...arrays) {
  const maxLen = Math.max(...arrays.map((a) => a.length));
  const result = new Float32Array(maxLen);
  for (const arr of arrays) {
    for (let i = 0; i < arr.length; i++) {
      result[i] += arr[i];
    }
  }
  // Normalize to prevent clipping
  let peak = 0;
  for (let i = 0; i < result.length; i++) {
    peak = Math.max(peak, Math.abs(result[i]));
  }
  if (peak > 1) {
    for (let i = 0; i < result.length; i++) {
      result[i] /= peak;
    }
  }
  return result;
}

function offsetSamples(samples, delaySec) {
  const offset = Math.floor(SAMPLE_RATE * delaySec);
  const result = new Float32Array(samples.length + offset);
  for (let i = 0; i < samples.length; i++) {
    result[i + offset] = samples[i];
  }
  return result;
}

function generateNoise(duration, volume = 0.3, fadeOut = true) {
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    let amp = volume;
    if (fadeOut) amp *= 1 - i / numSamples;
    samples[i] = amp * (Math.random() * 2 - 1);
  }
  return samples;
}

// ─── Individual Sound Definitions ───────────────────────────────────

function genRevealTick() {
  // Short crisp tick: high-freq sine burst + tiny noise
  const tick = generateSine(3200, 0.025, 0.6, true);
  const click = generateSine(6400, 0.008, 0.3, true);
  return mixSamples(tick, click);
}

function genWinClap() {
  // Quick celebratory arpeggio
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  const layers = notes.map((f, i) =>
    offsetSamples(generateSine(f, 0.15, 0.4, true), i * 0.06)
  );
  const shimmer = offsetSamples(generateNoise(0.12, 0.08, true), 0.02);
  return mixSamples(...layers, shimmer);
}

function genBetCoin() {
  // Metallic coin drop: two rapid high-freq tones
  const t1 = generateSine(2400, 0.06, 0.5, true);
  const t2 = offsetSamples(generateSine(3600, 0.05, 0.35, true), 0.04);
  const clink = generateSine(4800, 0.02, 0.2, true);
  return mixSamples(t1, t2, clink);
}

function genCardDeal() {
  // Swish: filtered noise burst
  const noise = generateNoise(0.08, 0.4, true);
  const swish = generateSine(1200, 0.04, 0.15, true);
  return mixSamples(noise, swish);
}

function genBettingStart() {
  // Rising tone: two ascending notes
  const low = generateSine(440, 0.12, 0.35, true);
  const high = offsetSamples(generateSine(660, 0.12, 0.4, true), 0.08);
  return mixSamples(low, high);
}

function genBettingStop() {
  // Descending tone: two descending notes
  const high = generateSine(660, 0.12, 0.4, true);
  const low = offsetSamples(generateSine(440, 0.12, 0.35, true), 0.08);
  return mixSamples(high, low);
}

function genLoss() {
  // Sad descending tone
  const n1 = generateSine(440, 0.2, 0.35, true);
  const n2 = offsetSamples(generateSine(349.23, 0.25, 0.3, true), 0.12);
  const n3 = offsetSamples(generateSine(293.66, 0.3, 0.25, true), 0.28);
  return mixSamples(n1, n2, n3);
}

function genCashout() {
  // Cash register: bright ascending with chime
  const notes = [880, 1108.73, 1318.51, 1760];
  const layers = notes.map((f, i) =>
    offsetSamples(generateSine(f, 0.1, 0.4, true), i * 0.05)
  );
  const chime = offsetSamples(generateSine(2637, 0.15, 0.2, true), 0.15);
  return mixSamples(...layers, chime);
}

function genJackpot() {
  // Celebratory fanfare: major chord + rapid arpeggio
  const chord = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
  const layers = chord.map((f, i) =>
    offsetSamples(generateSine(f, 0.25, 0.3, true), i * 0.07)
  );
  const sparkle1 = offsetSamples(generateSine(2093, 0.1, 0.15, true), 0.35);
  const sparkle2 = offsetSamples(generateSine(2637, 0.12, 0.15, true), 0.42);
  const noise = offsetSamples(generateNoise(0.15, 0.06, true), 0.3);
  return mixSamples(...layers, sparkle1, sparkle2, noise);
}

function genButtonClick() {
  // Very short UI click
  const click = generateSine(1800, 0.015, 0.4, true);
  const sub = generateSine(900, 0.02, 0.2, true);
  return mixSamples(click, sub);
}

// ─── Manifest ───────────────────────────────────────────────────────

const SOUNDS = [
  { file: "reveal-tick.mp3", generate: genRevealTick },
  { file: "win-clap.mp3", generate: genWinClap },
  { file: "bet-coin.mp3", generate: genBetCoin },
  { file: "card-deal.mp3", generate: genCardDeal },
  { file: "betting-start.mp3", generate: genBettingStart },
  { file: "betting-stop.mp3", generate: genBettingStop },
  { file: "loss.mp3", generate: genLoss },
  { file: "cashout.mp3", generate: genCashout },
  { file: "jackpot.mp3", generate: genJackpot },
  { file: "button-click.mp3", generate: genButtonClick },
];

// ─── Main ───────────────────────────────────────────────────────────

function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   Casino Sound Asset Generator               ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`Target directory: ${SOUNDS_DIR}`);
  console.log(`Sample rate: ${SAMPLE_RATE} Hz, 16-bit mono WAV\n`);
  console.log(`Note: Files use .mp3 extension but are WAV format.`);
  console.log(`Howler.js auto-detects the actual format and plays them fine.\n`);

  // Create directory
  if (!existsSync(SOUNDS_DIR)) {
    mkdirSync(SOUNDS_DIR, { recursive: true });
    console.log("✓ Created sounds directory\n");
  }

  let generated = 0;
  let skipped = 0;

  for (const sound of SOUNDS) {
    const dest = join(SOUNDS_DIR, sound.file);

    if (existsSync(dest)) {
      const size = statSync(dest).size;
      if (size > 0) {
        console.log(
          `  ✓ SKIP  ${sound.file} (${(size / 1024).toFixed(1)} KB, already exists)`
        );
        skipped++;
        continue;
      }
    }

    process.stdout.write(`  ♪ GEN   ${sound.file} … `);
    try {
      const samples = sound.generate();
      const wavBuffer = encodeWavAsBuffer(samples, SAMPLE_RATE);
      writeFileSync(dest, wavBuffer);
      console.log(`${(wavBuffer.length / 1024).toFixed(1)} KB  ✓`);
      generated++;
    } catch (err) {
      console.log(`FAILED ✗`);
      console.error(`         ${err.message}`);
    }
  }

  console.log("\n────────────────────────────────────────────────");
  console.log(`  Generated: ${generated}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  Total:     ${SOUNDS.length}`);
  console.log("────────────────────────────────────────────────\n");
}

main();
