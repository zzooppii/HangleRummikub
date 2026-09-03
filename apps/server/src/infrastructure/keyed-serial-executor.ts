export class KeyedSerialExecutor<TKey> {
  readonly #tails = new Map<TKey, Promise<void>>();

  get activeKeyCount(): number {
    return this.#tails.size;
  }

  run<TResult>(key: TKey, task: () => Promise<TResult>): Promise<TResult> {
    const previous = this.#tails.get(key) ?? Promise.resolve();
    const result = previous.then(task);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );

    this.#tails.set(key, tail);

    return result.finally(() => {
      if (this.#tails.get(key) === tail) {
        this.#tails.delete(key);
      }
    });
  }
}
