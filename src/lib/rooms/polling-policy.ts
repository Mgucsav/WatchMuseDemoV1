import type { RoomRound } from "./types";

export const WAITING_POLL_INTERVAL_MS = 3000;
export const SPINNING_POLL_INTERVAL_MS = 1200;

/**
 * Terminal turda (result / no_match) DÜŞÜK FREKANSLI yenileme.
 *
 * Daha önce burada polling tamamen duruyordu; partnerin başlattığı yeni turu
 * görmek için tam sayfa yenilemesi gerekiyordu. Otuz saniyelik aralık bunu
 * çözerken 1,2 sn'lik agresif polling'e de geri dönmez.
 */
export const TERMINAL_POLL_INTERVAL_MS = 30_000;

/** Kalıcı hata ekranına geçmeden önce tolere edilen ardışık poll hatası. */
export const MAX_TRANSIENT_POLL_FAILURES = 3;

/** null, sürekli polling'in durması gerektiğini ifade eder. */
export function pollingIntervalFor(round: RoomRound | null): number | null {
  if (!round) return WAITING_POLL_INTERVAL_MS;
  if (round.status === "spinning") return SPINNING_POLL_INTERVAL_MS;
  if (round.status === "matching") return WAITING_POLL_INTERVAL_MS;
  // Terminal: partnerin yeni turunu keşfetmek için seyrek yenileme.
  if (round.status !== "voting") return TERMINAL_POLL_INTERVAL_MS;
  return round.myVoteCount === round.candidateCount
    ? WAITING_POLL_INTERVAL_MS
    : null;
}

/**
 * Geçici ağ/servis hatası ile kalıcı hatayı ayırır.
 *
 * Tek bir başarısız yoklama, kullanıcının bütün oda görünümünü hata ekranıyla
 * değiştirmemelidir. Saf fonksiyondur; doğrudan test edilir.
 */
export function classifyPollFailure(
  consecutiveFailures: number,
): "retry" | "surface" {
  return consecutiveFailures < MAX_TRANSIENT_POLL_FAILURES ? "retry" : "surface";
}

/** Kabul penceresi dolmuş mu? Saf; `now` dışarıdan verilir. */
export function isSelectionExpired(
  responseDeadline: string | null | undefined,
  now: Date,
): boolean {
  if (!responseDeadline) return false;
  const deadline = Date.parse(responseDeadline);
  if (!Number.isFinite(deadline)) return false;
  return deadline <= now.getTime();
}

export function startPollingLoop(
  poll: (signal: AbortSignal) => Promise<void>,
  intervalMs: number,
  options: { immediate?: boolean } = {},
): () => void {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = async () => {
    try {
      await poll(controller.signal);
    } finally {
      if (!controller.signal.aborted) {
        timer = setTimeout(run, intervalMs);
      }
    }
  };

  timer = setTimeout(run, options.immediate ? 0 : intervalMs);

  return () => {
    controller.abort();
    if (timer) clearTimeout(timer);
  };
}
