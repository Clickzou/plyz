// Génère un petit son de notification « ding » (2 notes ascendantes, type cloche douce)
// dans assets/sounds/fan-joined.wav. WAV PCM 16-bit mono 44.1 kHz, ~0.6 s.
// Usage : node scripts/gen-notification-sound.js
const fs = require('fs');
const path = require('path');

const sampleRate = 44100;
const duration = 0.6;
const numSamples = Math.floor(sampleRate * duration);
const samples = new Float32Array(numSamples);

// Deux notes ascendantes façon « bi-bip » de notification : C6 (1047 Hz) puis E6 (1319 Hz).
// Chaque note = fondamentale + harmonique (timbre de cloche) avec une enveloppe de décroissance.
const note = (t, t0, freq) => {
  if (t < t0) return 0;
  const dt = t - t0;
  const env = Math.exp(-7 * dt); // décroissance douce
  const fundamental = Math.sin(2 * Math.PI * freq * dt);
  const harmonic = 0.35 * Math.sin(2 * Math.PI * freq * 2 * dt);
  return (fundamental + harmonic) * env;
};

for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  let v = 0;
  v += note(t, 0.0, 1047); // 1ère note
  v += note(t, 0.13, 1319); // 2ème note (légèrement plus aiguë)
  samples[i] = Math.max(-1, Math.min(1, v * 0.5));
}

// Fade-out final pour éviter un clic
const fade = Math.floor(sampleRate * 0.03);
for (let i = 0; i < fade; i++) {
  samples[numSamples - 1 - i] *= i / fade;
}

const buffer = Buffer.alloc(44 + numSamples * 2);
buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + numSamples * 2, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20); // PCM
buffer.writeUInt16LE(1, 22); // mono
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write('data', 36);
buffer.writeUInt32LE(numSamples * 2, 40);
for (let i = 0; i < numSamples; i++) {
  buffer.writeInt16LE(Math.round(samples[i] * 32767), 44 + i * 2);
}

const outDir = path.join(__dirname, '..', 'assets', 'sounds');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'fan-joined.wav');
fs.writeFileSync(outPath, buffer);
console.log('Son généré :', outPath, `(${buffer.length} octets)`);
