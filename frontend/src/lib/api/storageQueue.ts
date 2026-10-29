// Shared across adapters in this runtime. Different storage namespaces have independent queues.
const queues = new Map<string, Promise<void>>();

export function withStorageLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).then(operation);
  const settled = next.then(() => undefined, () => undefined);
  queues.set(key, settled);
  void settled.then(() => { if (queues.get(key) === settled) queues.delete(key); });
  return next;
}
