export class WeaponAudio {
  noise: AudioBuffer;
  active = 0;
  readonly context: AudioContext;
  constructor(context: AudioContext) {
    this.context = context;
    this.noise = context.createBuffer(
      1,
      context.sampleRate,
      context.sampleRate,
    );
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  burst(
    duration: number,
    volume: number,
    frequency: number,
    pan: number,
    low: number,
  ) {
    if (this.active >= 32 || volume < 0.001 || this.context.state !== 'running')
      return;
    this.active++;
    const c = this.context,
      at = c.currentTime;
    const source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      gain = c.createGain(),
      stereo = c.createStereoPanner();
    source.buffer = this.noise;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(frequency, at);
    filter.frequency.exponentialRampToValueAtTime(180, at + duration);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    stereo.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(filter);
    filter.connect(gain);
    gain.connect(stereo);
    stereo.connect(c.destination);
    const body = c.createOscillator(),
      bodyGain = c.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(low, at);
    body.frequency.exponentialRampToValueAtTime(
      Math.max(30, low * 0.3),
      at + duration,
    );
    bodyGain.gain.setValueAtTime(volume * 0.7, at);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    body.connect(bodyGain);
    bodyGain.connect(stereo);
    source.onended = () => {
      this.active--;
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      stereo.disconnect();
      body.disconnect();
      bodyGain.disconnect();
    };
    source.start(at);
    body.start(at);
    source.stop(at + duration);
    body.stop(at + duration);
  }
  shot(index: number, distance = 0, pan = 0) {
    const presets = [
      [0.13, 0.09, 2600, 140],
      [0.26, 0.13, 1500, 75],
      [0.36, 0.12, 4200, 105],
    ];
    const [duration, volume, frequency, low] = presets[index];
    const attenuation = Math.max(0, 1 - distance / 90) ** 2;
    this.burst(duration, volume * attenuation, frequency, pan, low);
  }
  mechanical(index: number, phase = 0) {
    this.burst(
      phase === 2 ? 0.11 : 0.055,
      0.025,
      index === 1 ? 1600 : 3000,
      0,
      phase === 2 ? 240 : 430,
    );
  }
}
