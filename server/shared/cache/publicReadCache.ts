interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 30_000;

class PublicReadCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  async getOrLoad<T>(key: string, loader: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): Promise<T> {
    const now = Date.now();
    const cached = this.store.get(key) as CacheEntry<T> | undefined;
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) {
      return pending;
    }

    const loadPromise = loader()
      .then((value) => {
        this.store.set(key, {value, expiresAt: Date.now() + ttlMs});
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, loadPromise);
    return loadPromise;
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  invalidateClubs(): void {
    this.invalidatePrefix('clubs:');
    this.invalidatePrefix('hallOfFame:');
  }

  invalidateEvents(eventId?: string): void {
    this.invalidatePrefix('events:');
    if (eventId) {
      this.invalidatePrefix(`event:${eventId}`);
      this.invalidatePrefix(`form:${eventId}`);
    } else {
      this.invalidatePrefix('event:');
      this.invalidatePrefix('form:');
    }
    this.invalidatePrefix('clubs:');
  }

  invalidateAll(): void {
    this.store.clear();
  }
}

export const publicReadCache = new PublicReadCache();
