/**
 * Barramento de eventos tipado. Os sistemas se comunicam por aqui em vez de
 * importar uns aos outros (GDD §21.2: sem dependências circulares).
 */
export type Handler<T> = (payload: T) => void;

export class EventBus<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();

  /** Registra um ouvinte. Retorna a função que o remove. */
  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(type, handler);
  }

  off<K extends keyof Events>(type: K, handler: Handler<Events[K]>): void {
    this.handlers.get(type)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    // Copia para que um ouvinte possa se remover durante o emit.
    for (const handler of [...set]) {
      (handler as Handler<Events[K]>)(payload);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
