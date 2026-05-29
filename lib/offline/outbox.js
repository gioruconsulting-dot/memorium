// Outbox stub (Chunk 2). Chunk 3 replaces this body with the real write-barrier
// check — true only when there are no queued offline grades waiting to sync.
// The cache manager uses it to avoid refreshing the cache while writes are pending.
export async function isOutboxEmpty() {
  return true;
}
