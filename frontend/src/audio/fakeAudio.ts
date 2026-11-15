/** A minimal Web Audio stand-in for engine tests. Records what was scheduled and stopped. */

class FakeParam {
  value: number;
  target: number | null = null;
  constructor(value = 0) {
    this.value = value;
  }
  setValueAtTime(value: number) {
    this.value = value;
    return this;
  }
  setTargetAtTime(value: number) {
    this.target = value;
    this.value = value;
    return this;
  }
  exponentialRampToValueAtTime() {
    return this;
  }
  linearRampToValueAtTime() {
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class FakeNode {
  disconnectCount = 0;
  connect(node: unknown) {
    return node;
  }
  disconnect() { this.disconnectCount += 1; }
}

export class FakeSource extends FakeNode {
  startAt: number | null = null;
  stopAt: number | null = null;
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
  type = "sine";
  buffer: unknown = null;
  loop = false;
  onended: ((event: Event) => void) | null = null;
  constructor(log: FakeSource[]) {
    super();
    log.push(this);
  }
  start(time = 0) {
    this.startAt = time;
  }
  stop(time = 0) {
    this.stopAt = this.stopAt === null ? time : Math.min(this.stopAt, time);
  }
  finish() {
    this.onended?.(new Event("ended"));
  }
}

export class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  currentTime = 0;
  sampleRate = 8000;
  state = "running";
  destination = new FakeNode();
  sources: FakeSource[] = [];
  gains: { gain: FakeParam }[] = [];
  nodes: FakeNode[] = [];
  constructor() {
    FakeAudioContext.last = this;
  }
  async resume() {}
  createGain() {
    const node = Object.assign(new FakeNode(), { gain: new FakeParam(1) });
    this.nodes.push(node);
    this.gains.push(node);
    return node;
  }
  createStereoPanner() {
    const node = Object.assign(new FakeNode(), { pan: new FakeParam(0) });
    this.nodes.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = Object.assign(new FakeNode(), { type: "lowpass", frequency: new FakeParam(350), Q: new FakeParam(1) });
    this.nodes.push(node);
    return node;
  }
  createDynamicsCompressor() {
    const node = Object.assign(new FakeNode(), {
      threshold: new FakeParam(),
      knee: new FakeParam(),
      ratio: new FakeParam(),
      attack: new FakeParam(),
      release: new FakeParam(),
    });
    this.nodes.push(node);
    return node;
  }
  createOscillator() {
    const source = new FakeSource(this.sources);
    this.nodes.push(source);
    return source;
  }
  createBufferSource() {
    const source = new FakeSource(this.sources);
    this.nodes.push(source);
    return source;
  }
  createBuffer(_channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length);
    return { duration: length / sampleRate, getChannelData: () => data };
  }
}
