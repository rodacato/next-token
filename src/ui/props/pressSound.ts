let context: AudioContext | undefined;

// A synthesized platen thunk: a low sine for the weight, a short filtered noise burst for the paper.
export function playPressThunk(): void {
  try {
    context ??= new AudioContext();
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.value = 0.22;
    master.connect(context.destination);

    const body = context.createOscillator();
    const bodyGain = context.createGain();
    body.type = "sine";
    body.frequency.setValueAtTime(90, now);
    body.frequency.exponentialRampToValueAtTime(48, now + 0.14);
    bodyGain.gain.setValueAtTime(1, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    body.connect(bodyGain).connect(master);
    body.start(now);
    body.stop(now + 0.2);

    const length = Math.floor(context.sampleRate * 0.08);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    noise.buffer = buffer;
    noise.connect(filter).connect(master);
    noise.start(now);
  } catch {
    // No audio device or autoplay blocked: the press stays silent.
  }
}
