export const SHARING_STALE_MS = 15000;
export function sharedDataFresh(observedAt: number | undefined, now = Date.now()) {
  return typeof observedAt === 'number' && Number.isFinite(observedAt) && observedAt <= now + 5000 && now - observedAt <= SHARING_STALE_MS;
}
