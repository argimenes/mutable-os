// Persistent block IDs describe content. A lease addresses one mounted endpoint.
export type LeafSide = 'left' | 'right';
export type Navigation =
  | { type: 'navigation/page'; page: number }
  | { type: 'navigation/progress'; position: number };

export interface Descriptor {
  type: Navigation['type'];
  version: number;
  pagination?: string;
}
export interface Binding {
  type: Navigation['type'];
  direction: 'left-to-right' | 'right-to-left' | 'bidirectional';
  enabled: boolean;
}
export interface LeafEndpoint {
  publishes: readonly Descriptor[];
  subscribes: readonly Descriptor[];
  receive(event: Navigation): void;
}

const opposite = (side: LeafSide) => side === 'left' ? 'right' : 'left';
function valid(event: Navigation) {
  if (event.type === 'navigation/page') return Number.isSafeInteger(event.page) && event.page >= 1;
  return event.type === 'navigation/progress' && Number.isFinite(event.position) && event.position >= 0 && event.position <= 1;
}

export class LeafGateway {
  private endpoints = new Map<LeafSide, LeafEndpoint>();
  private pending = new Map<Navigation['type'], { side: LeafSide; event: Navigation }>();
  private frame?: number;
  private generation = 0;
  private activeSide?: LeafSide;
  private receiving?: LeafSide;
  private bindings: readonly Binding[] = [];

  constructor(
    private schedule = requestAnimationFrame.bind(globalThis),
    private cancel = cancelAnimationFrame.bind(globalThis),
    private changed = () => {},
  ) {}

  configure(bindings: readonly Binding[]) {
    this.reset();
    this.bindings = bindings;
  }

  private reset() {
    this.generation++;
    this.activeSide = undefined;
    this.pending.clear();
    if (this.frame !== undefined) this.cancel(this.frame);
    this.frame = undefined;
  }

  compatible(side: LeafSide, type: Navigation['type']) {
    const from = this.endpoints.get(side), to = this.endpoints.get(opposite(side));
    return !!from?.publishes.some(p => p.type === type && p.version === 1 && to?.subscribes.some(s =>
      s.type === type && s.version === p.version && (type !== 'navigation/page' || (!!p.pagination && p.pagination === s.pagination))));
  }

  private linked(side: LeafSide, type: Navigation['type']) {
    const direction = side === 'left' ? 'left-to-right' : 'right-to-left';
    return this.bindings.some(b => b.enabled && b.type === type && (b.direction === 'bidirectional' || b.direction === direction))
      && this.compatible(side, type);
  }

  private flush() {
    this.frame = undefined;
    const generation = this.generation, queue = [...this.pending.values()];
    this.pending.clear();
    for (const {side, event} of queue) {
      if (generation !== this.generation || !this.linked(side, event.type)) continue;
      this.receiving = opposite(side);
      try {
        this.endpoints.get(this.receiving)?.receive(event);
      } finally {
        this.receiving = undefined;
      }
    }
  }

  register(side: LeafSide, endpoint: LeafEndpoint) {
    this.reset();
    // Wrap registrations so even re-registering the same adapter object issues a new lease.
    const registered = {...endpoint, receive: (event: Navigation) => endpoint.receive(event)};
    this.endpoints.set(side, registered);
    this.changed();
    const ownsEndpoint = () => this.endpoints.get(side) === registered;
    let gesture = -1;
    return {
      intent: () => {
        if (!ownsEndpoint()) return;
        if (this.activeSide !== side) {
          this.reset();
          this.activeSide = side;
        }
        gesture = this.generation;
      },
      currentIntent: () => gesture === this.generation && ownsEndpoint(),
      publish: (event: Navigation) => {
        if (!ownsEndpoint() || this.receiving === side || !valid(event) || !this.linked(side, event.type)) return;
        this.pending.set(event.type, {side, event});
        this.frame ??= this.schedule(() => this.flush());
      },
      release: () => {
        if (!ownsEndpoint()) return;
        this.reset();
        this.endpoints.delete(side);
        this.changed();
      },
    };
  }

  dispose() {
    this.reset();
    this.endpoints.clear();
  }
}
