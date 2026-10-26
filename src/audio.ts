const AudioContextClass = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext

export class AmbientAudio {
  private context = new AudioContextClass()
  private master = this.context.createGain()
  private oscillators: OscillatorNode[] = []
  constructor() {
    this.master.gain.value = 0
    this.master.connect(this.context.destination)
    for (const frequency of [55, 82.41, 110.15]) {
      const oscillator = this.context.createOscillator()
      const gain = this.context.createGain()
      oscillator.type = 'sine'; oscillator.frequency.value = frequency; gain.gain.value = 0.12
      oscillator.connect(gain).connect(this.master); oscillator.start()
      this.oscillators.push(oscillator)
    }
  }
  async start() {
    if (this.context.state === 'suspended') {
      await this.context.resume().catch(() => {})
    }
  }
  async setAudible(on: boolean) {
    if (on && this.context.state === 'suspended') {
      await this.context.resume().catch(() => {})
    }
    this.master.gain.setTargetAtTime(on ? 0.22 : 0, this.context.currentTime, 0.4)
  }
  dispose() {
    this.oscillators.forEach(oscillator => {
      try { oscillator.stop() } catch { /* ignore */ }
    })
    void this.context.close().catch(() => {})
  }
}
