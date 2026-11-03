/**
 * Owner-serialized single-writer queue.
 *
 * Customer mutating work (writeChunk, session/log writes) has priority over
 * housekeeping (retention, log prune). Housekeeping jobs receive
 * `yieldToCustomer` and must call it between short batches so a pending
 * writeChunk waits < ~500 ms.
 */

let customerQueue = [];
let housekeepingQueue = [];
let running = false;

function settleJob(job, result) {
  try {
    job.resolve(result);
  } catch {
    // ignore double-settle
  }
}

async function runJob(job, extraArg) {
  try {
    const result = extraArg === undefined ? await job.fn() : await job.fn(extraArg);
    settleJob(job, result);
  } catch {
    settleJob(job, { error: 'database_unavailable', class: 'permanent' });
  }
}

/**
 * Drain queued customer jobs. Called by housekeeping between batches and by
 * the pump. Safe to call while `running` is true.
 */
export async function yieldToCustomer() {
  while (customerQueue.length > 0) {
    const job = customerQueue.shift();
    await runJob(job);
  }
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (customerQueue.length > 0 || housekeepingQueue.length > 0) {
      if (customerQueue.length > 0) {
        const job = customerQueue.shift();
        await runJob(job);
      } else {
        const job = housekeepingQueue.shift();
        await runJob(job, yieldToCustomer);
      }
    }
  } finally {
    running = false;
  }
}

/**
 * Enqueue a customer mutation. Runs ahead of any queued housekeeping.
 * @param {() => Promise<unknown>} fn
 * @returns {Promise<unknown>}
 */
export function enqueueCustomer(fn) {
  return new Promise((resolve) => {
    customerQueue.push({ fn, resolve });
    pump();
  });
}

/**
 * Enqueue housekeeping. `fn` is called with `yieldToCustomer`.
 * @param {(yieldToCustomer: () => Promise<void>) => Promise<unknown>} fn
 * @returns {Promise<unknown>}
 */
export function enqueueHousekeeping(fn) {
  return new Promise((resolve) => {
    housekeepingQueue.push({ fn, resolve });
    pump();
  });
}

export function resetScheduler() {
  customerQueue = [];
  housekeepingQueue = [];
  running = false;
}

export function customerQueueLength() {
  return customerQueue.length;
}

export function isSchedulerRunning() {
  return running;
}
