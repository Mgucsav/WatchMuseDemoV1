export const BOTH_SKIP_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
export const PRIORITY_RETURN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export interface EligibilityFacts {
  bothSkipDecidedAt: string | null;
  acceptedSelectionAt: string | null;
  pendingSelectionDeadline: string | null;
  priorityEarnedAt: string | null;
  priorityConsumedAt: string | null;
  /**
   * RR-01: bu space'in TÜM geçmişinde aday olmuş mu?
   * Yalnızca bir önceki tur değil — tam geçmiş.
   */
  shownInSpaceHistory: boolean;
}

export interface EligibilityDecision {
  hardSuppressed: boolean;
  priorityReturn: boolean;
  /**
   * Film bu odada daha önce görülmüştür; yalnızca `eligible_repeat` geçişinde
   * ve yalnızca son sınırlı denemede havuza girebilir.
   */
  requiresEligibleRepeatGate: boolean;
  /** Hiç görülmemiş: gerçek keşif slotunu doldurabilir. */
  isTrueDiscovery: boolean;
}

function elapsedSince(value: string | null, nowMs: number): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? nowMs - parsed : null;
}

/**
 * SQL'deki event-query politikasının saf sözleşmesi. Kişi bazlı oy veya
 * kütüphane verisi almaz; yalnızca kalıcı ortak olayları değerlendirir.
 */
export function decideEligibility(
  facts: EligibilityFacts,
  now: Date,
): EligibilityDecision {
  const skipAge = elapsedSince(facts.bothSkipDecidedAt, now.getTime());
  const priorityAge = elapsedSince(facts.priorityEarnedAt, now.getTime());
  const consumedAt = facts.priorityConsumedAt
    ? Date.parse(facts.priorityConsumedAt)
    : null;
  const earnedAt = facts.priorityEarnedAt
    ? Date.parse(facts.priorityEarnedAt)
    : null;

  const hardSuppressed =
    facts.acceptedSelectionAt !== null ||
    (facts.pendingSelectionDeadline !== null &&
      Date.parse(facts.pendingSelectionDeadline) > now.getTime()) ||
    (skipAge !== null && skipAge >= 0 && skipAge < BOTH_SKIP_COOLDOWN_MS);
  const consumed =
    consumedAt !== null &&
    earnedAt !== null &&
    Number.isFinite(consumedAt) &&
    Number.isFinite(earnedAt) &&
    consumedAt >= earnedAt;
  const priorityReturn =
    !hardSuppressed &&
    !consumed &&
    priorityAge !== null &&
    priorityAge >= 0 &&
    priorityAge < PRIORITY_RETURN_WINDOW_MS;

  // Hard suppression her şeyi ezer: son denemede bile açılamaz.
  // priority_return kendi geçişinden gelir ve repeat kapısına tabi değildir.
  const requiresEligibleRepeatGate =
    !hardSuppressed && !priorityReturn && facts.shownInSpaceHistory;

  return {
    hardSuppressed,
    priorityReturn,
    requiresEligibleRepeatGate,
    isTrueDiscovery: !hardSuppressed && !facts.shownInSpaceHistory,
  };
}

export type PriorityEvent =
  | { kind: "earned"; at: string }
  | { kind: "consumed"; at: string };

/** Son kazanımdan sonra tüketim yoksa açık fırsatı döndürür. */
export function resolvePriorityOpportunity(
  events: readonly PriorityEvent[],
): { earnedAt: string; consumedAt: string | null } | null {
  const ordered = [...events].sort(
    (left, right) => Date.parse(left.at) - Date.parse(right.at),
  );
  let current: { earnedAt: string; consumedAt: string | null } | null = null;
  for (const event of ordered) {
    if (event.kind === "earned") current = { earnedAt: event.at, consumedAt: null };
    else if (current) current.consumedAt = event.at;
  }
  return current;
}
