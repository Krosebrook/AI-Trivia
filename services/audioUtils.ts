
export const PCM_WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const float32Data = input[0];
      this.port.postMessage(float32Data);
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

export class SFXService {
  private ctx: AudioContext | null = null;
  private volume: number = 0.5;

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  private createOscillator(type: OscillatorType, freq: number, duration: number, startTime: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    
    // Scale gain by volume
    const peakGain = 0.1 * this.volume;
    gain.gain.setValueAtTime(peakGain, startTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peakGain * 0.1), startTime + duration);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  playCorrect() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.createOscillator('sine', 600, 0.1, now);
    this.createOscillator('sine', 800, 0.2, now + 0.1);
  }

  playIncorrect() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.createOscillator('sawtooth', 200, 0.3, now);
    this.createOscillator('sawtooth', 150, 0.3, now + 0.1);
  }

  playClick() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.createOscillator('triangle', 400, 0.05, now);
  }

  playPing() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.createOscillator('sine', 1200, 0.3, now);
  }
}
