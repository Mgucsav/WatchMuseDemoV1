import { describe, expect, it } from "vitest";

import {
  BOTH_SKIP_COOLDOWN_MS,
  decideEligibility,
  PRIORITY_RETURN_WINDOW_MS,
  resolvePriorityOpportunity,
  type EligibilityFacts,
} from "./eligibility";

const NOW = new Date("2026-08-12T12:00:00.000Z");

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

function facts(patch: Partial<EligibilityFacts> = {}): EligibilityFacts {
  return {
    bothSkipDecidedAt: null,
    acceptedSelectionAt: null,
    pendingSelectionDeadline: null,
    priorityEarnedAt: null,
    priorityConsumedAt: null,
    shownInSpaceHistory: false,
    ...patch,
  };
}

describe("reusable-room eligibility", () => {
  it.each([
    [29, true],
    [30, false],
    [31, false],
  ])("both_skip %i günde suppression=%s", (days, expected) => {
    const decision = decideEligibility(
      facts({ bothSkipDecidedAt: ago(days * 24 * 60 * 60 * 1000) }),
      NOW,
    );
    expect(decision.hardSuppressed).toBe(expected);
  });

  it("30 günlük sınırı milisaniye hassasiyetinde uygular", () => {
    expect(
      decideEligibility(
        facts({ bothSkipDecidedAt: ago(BOTH_SKIP_COOLDOWN_MS - 1) }),
        NOW,
      ).hardSuppressed,
    ).toBe(true);
    expect(
      decideEligibility(
        facts({ bothSkipDecidedAt: ago(BOTH_SKIP_COOLDOWN_MS) }),
        NOW,
      ).hardSuppressed,
    ).toBe(false);
  });

  it("mixed sonuç hard suppression üretmez", () => {
    expect(decideEligibility(facts(), NOW).hardSuppressed).toBe(false);
  });

  it("kalıcı acceptance olayı daha sonra kütüphane silinse de suppress eder", () => {
    expect(
      decideEligibility(
        facts({ acceptedSelectionAt: ago(90 * 24 * 60 * 60 * 1000) }),
        NOW,
      ).hardSuppressed,
    ).toBe(true);
  });

  it("yanıt penceresi açıkken seçilen film yeniden gösterilmez", () => {
    expect(
      decideEligibility(
        facts({
          pendingSelectionDeadline: new Date(
            NOW.getTime() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }),
        NOW,
      ).hardSuppressed,
    ).toBe(true);
  });

  it("yedi gün sonunda acceptance yoksa yeniden uygun olur", () => {
    expect(
      decideEligibility(
        facts({ pendingSelectionDeadline: NOW.toISOString() }),
        NOW,
      ).hardSuppressed,
    ).toBe(false);
  });

  it("priority return 14 gün içinde açık, sınırda ve sonrasında kapalıdır", () => {
    expect(
      decideEligibility(
        facts({ priorityEarnedAt: ago(PRIORITY_RETURN_WINDOW_MS - 1) }),
        NOW,
      ).priorityReturn,
    ).toBe(true);
    expect(
      decideEligibility(
        facts({ priorityEarnedAt: ago(PRIORITY_RETURN_WINDOW_MS) }),
        NOW,
      ).priorityReturn,
    ).toBe(false);
    expect(
      decideEligibility(
        facts({ priorityEarnedAt: ago(PRIORITY_RETURN_WINDOW_MS + 1) }),
        NOW,
      ).priorityReturn,
    ).toBe(false);
  });

  it("priority bir kez tüketilince kapanır", () => {
    expect(
      decideEligibility(
        facts({
          priorityEarnedAt: ago(2 * 24 * 60 * 60 * 1000),
          priorityConsumedAt: ago(1 * 24 * 60 * 60 * 1000),
        }),
        NOW,
      ).priorityReturn,
    ).toBe(false);
  });

  it("ikinci both_want-unselected olayı yeni fırsat yaratır", () => {
    const opportunity = resolvePriorityOpportunity([
      { kind: "earned", at: ago(10_000) },
      { kind: "consumed", at: ago(8_000) },
      { kind: "earned", at: ago(2_000) },
    ]);
    expect(opportunity).toEqual({ earnedAt: ago(2_000), consumedAt: null });
    expect(
      decideEligibility(
        facts({
          priorityEarnedAt: opportunity?.earnedAt ?? null,
          priorityConsumedAt: opportunity?.consumedAt ?? null,
        }),
        NOW,
      ).priorityReturn,
    ).toBe(true);
  });

  it("priority return, eligible-repeat kapısına tabi değildir", () => {
    const decision = decideEligibility(
      facts({ shownInSpaceHistory: true, priorityEarnedAt: ago(1_000) }),
      NOW,
    );

    expect(decision.priorityReturn).toBe(true);
    expect(decision.requiresEligibleRepeatGate).toBe(false);
  });
});

describe("decideEligibility — RR-01 tam geçmiş sınırı", () => {
  it("hiç görülmemiş film gerçek keşiftir", () => {
    const decision = decideEligibility(facts({ shownInSpaceHistory: false }), NOW);

    expect(decision.isTrueDiscovery).toBe(true);
    expect(decision.requiresEligibleRepeatGate).toBe(false);
  });

  it("İKİ VEYA DAHA ESKİ turda görülmüş film gerçek keşif SAYILMAZ", () => {
    // RR-01'in çekirdeği: eski davranış yalnızca bir önceki tura bakıyordu,
    // bu yüzden iki tur önce gösterilen film "fresh" olarak geçebiliyordu.
    const decision = decideEligibility(facts({ shownInSpaceHistory: true }), NOW);

    expect(decision.isTrueDiscovery).toBe(false);
    expect(decision.requiresEligibleRepeatGate).toBe(true);
  });

  it("hard suppression, tekrar kapısını ve keşif etiketini ezer", () => {
    const suppressed = decideEligibility(
      facts({ shownInSpaceHistory: false, acceptedSelectionAt: ago(1_000) }),
      NOW,
    );

    expect(suppressed.hardSuppressed).toBe(true);
    // Bastırılmış film son denemede bile keşif slotunu dolduramaz.
    expect(suppressed.isTrueDiscovery).toBe(false);
    expect(suppressed.requiresEligibleRepeatGate).toBe(false);
  });

  it("30 günlük both-skip penceresindeki film keşif sayılmaz", () => {
    const decision = decideEligibility(
      facts({ shownInSpaceHistory: true, bothSkipDecidedAt: ago(29 * 24 * 3_600_000) }),
      NOW,
    );

    expect(decision.hardSuppressed).toBe(true);
    expect(decision.isTrueDiscovery).toBe(false);
  });
});
