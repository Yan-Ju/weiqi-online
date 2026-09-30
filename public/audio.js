// Layered, softly limited impacts. Generated locally; no media downloads.
class SoundEngine {
  constructor() { this.ctx = null; this.enabled = localStorage.getItem('boardroom_sound') !== 'false'; this.unlocked = false; }
  init() {
    if (!this.unlocked) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!this.ctx && AudioContext) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain(); this.master.gain.value = .38;
      this.limiter = this.ctx.createDynamicsCompressor(); this.limiter.threshold.value = -12;
      this.master.connect(this.limiter); this.limiter.connect(this.ctx.destination);
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  }
  tone(frequency, time, duration, volume, type='sine') {
    const osc=this.ctx.createOscillator(), gain=this.ctx.createGain(); osc.type=type; osc.frequency.setValueAtTime(frequency,time);
    gain.gain.setValueAtTime(0,time); gain.gain.linearRampToValueAtTime(volume,time+.003); gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
    osc.connect(gain); gain.connect(this.master); osc.onended=() => {osc.disconnect();gain.disconnect();}; osc.start(time); osc.stop(time+duration+.02);
  }
  playStoneClick(game='go') {
    if(!this.enabled) return; this.init(); if(!this.ctx || this.ctx.state !== 'running') return;
    const t=this.ctx.currentTime, chess=game==='chess';
    const duration=chess ? .09 : .055, n=Math.ceil(this.ctx.sampleRate*duration), buffer=this.ctx.createBuffer(1,n,this.ctx.sampleRate), data=buffer.getChannelData(0);
    for(let i=0;i<n;i++) data[i]=(Math.random()*2-1)*Math.exp(-i/(n*.16));
    const noise=this.ctx.createBufferSource(), filter=this.ctx.createBiquadFilter(), gain=this.ctx.createGain();
    noise.buffer=buffer; filter.type='bandpass'; filter.frequency.value=chess ? 850 : 2400; filter.Q.value=.7; gain.gain.value=chess ? .6 : .42;
    noise.connect(filter); filter.connect(gain); gain.connect(this.master); noise.onended=() => {noise.disconnect();filter.disconnect();gain.disconnect();}; noise.start(t);
    this.tone(chess ? 190 : 670,t,chess ? .16 : .09,.3); this.tone(chess ? 410 : 1380,t,.05,.12);
  }
  playCaptureSound() { if(!this.enabled) return; this.init(); if(!this.ctx || this.ctx.state !== 'running') return; this.tone(520,this.ctx.currentTime+.035,.1,.12); this.tone(780,this.ctx.currentTime+.065,.14,.08); }
  playAlertSound() { if(!this.enabled) return; this.init(); if(!this.ctx || this.ctx.state !== 'running') return; const t=this.ctx.currentTime; this.tone(330,t,.16,.16); this.tone(440,t+.08,.2,.1); }
}
export const sound = new SoundEngine();
for(const event of ['pointerdown','keydown']) document.addEventListener(event,() => { sound.unlocked=true; sound.init(); },{once:true});
