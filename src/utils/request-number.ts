/** Human-readable, collision-resistant identifiers for service requests + work orders. */

function datePart(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}
function rand3(): string {
  return Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
}

/** e.g. SR-20240101-001 */
export function generateRequestNumber(): string {
  return `SR-${datePart()}-${rand3()}`;
}

/** e.g. WO-20240101-001 */
export function generateOrderNumber(): string {
  return `WO-${datePart()}-${rand3()}`;
}

/**
 * Insert a row whose unique number may collide, retrying with a fresh number on a
 * Postgres unique-violation (23505). The guide's random 3-digit suffix collides often at
 * demo volume; this makes creation deterministic-safe.
 */
export async function insertWithUniqueNumber(opts: {
  generate: () => string;
  attempts?: number;
  // Supabase query builders are thenable (PromiseLike), not Promise instances.
  insert: (num: string) => PromiseLike<{ data: any; error: any }>;
}): Promise<{ data: any; error: any }> {
  const attempts = opts.attempts ?? 5;
  let last: { data: any; error: any } = {
    data: null,
    error: { message: 'no attempt made' },
  };
  for (let i = 0; i < attempts; i++) {
    last = await opts.insert(opts.generate());
    if (!last.error) return last;
    if (last.error.code !== '23505') return last; // non-collision error → bail immediately
  }
  return last;
}
