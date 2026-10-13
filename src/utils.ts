/**
 * sleep for x milliseconds
 */
export function sleep(timeout: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

/**
 * timeout after x milliseconds
 */
export async function timeout<T>(
  prom: Promise<T>,
  timeout: number,
  msg: string = "timeout",
): Promise<T> {
  return await Promise.race([
    prom,
    sleep(timeout).then(() => {
      throw new Error(msg);
    }),
  ]);
}

// bun lowers `await using` to a lookup of the well-known symbol, falling back
// to this stand-in on an engine that hasn't got one, as chrome before 134
const ASYNC_DISPOSE: typeof Symbol.asyncDispose =
  Symbol.asyncDispose ?? Symbol.for("Symbol.asyncDispose");

/**
 * a fixed number of permits, each held for the scope of the block that takes it
 *
 * `await using permit = await semaphore.lock()` gives the permit back when the
 * block exits, by return or by throw, and waiters are served in the order they
 * asked. With one permit it's a mutex.
 *
 * ```ts
 * const limit = new Semaphore(4);
 * await using permit = await limit.lock();
 * ```
 */
export class Semaphore {
  #open: number;
  #waiting: (() => void)[] = [];

  /** a semaphore with `count` permits to hand out */
  constructor(count: number) {
    this.#open = count;
  }

  /** take a permit, waiting for one if they're all out */
  async lock(): Promise<AsyncDisposable> {
    if (this.#open) {
      this.#open -= 1;
    } else {
      await new Promise<void>((resolve) => {
        this.#waiting.push(resolve);
      });
    }
    // a permit goes straight to the next waiter rather than back to the count
    const release = async (): Promise<void> => {
      const next = this.#waiting.shift();
      if (next) {
        next();
      } else {
        this.#open += 1;
      }
    };
    return { [ASYNC_DISPOSE]: release };
  }
}

/**
 * assert val with optional error message
 */
export function assert(
  val: unknown,
  msg: string = "internal error",
): asserts val {
  if (!val) {
    throw new Error(msg);
  }
}

/** this could be improved see npm:sanitize-filename */
export function safeFilename(original: string): string {
  return (
    original
      // remove control characters
      .replace(/\p{C}/gu, "")
      // replace separators with spaces
      .replace(/\p{Z}/gu, " ")
      // replace problematic characters with underscores
      .replace(/[\\/:*?"<>|]/g, "_")
  );
}

export function errString(err: unknown): string {
  if (err === null) {
    return "null error";
  } else if (err === undefined) {
    return "undefined error";
  } else if (typeof err === "function") {
    return `function error: ${err.name}`;
  } else if (typeof err === "string") {
    return err;
  } else if (err instanceof Error) {
    return err.toString();
  } else {
    return "unknown object error";
  }
}
