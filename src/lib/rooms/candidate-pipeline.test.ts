import { describe, expect, it } from "vitest";

import type { MovieSummary } from "@/lib/tmdb/types";
import { RoomServiceError } from "./service";
import { roomError } from "./errors";
import {
  assertRankerBoundary,
  discoverPageOrder,
  MAX_DISCOVER_PAGE_ATTEMPTS,
  RANKER_VERSION,
  rankCandidateSource,
  type RoundCandidatePlan,
  SELECTION_POLICY_VERSION,
  sourceAndPersistRoundCandidates,
} from "./candidate-pipeline";

function movie(id: number): MovieSummary {
  return {
    id,
    title: `Film ${id}`,
    originalTitle: null,
    releaseYear: 2020,
    posterPath: null,
    posterUrl: null,
    overview: null,
    voteAverage: 7,
  };
}

describe("candidate pipeline", () => {
  it("aynı seed ile sayfa ve rank sırası deterministiktir", () => {
    expect(discoverPageOrder("seed-1234567890123456")).toEqual(
      discoverPageOrder("seed-1234567890123456"),
    );
    expect(rankCandidateSource([movie(1), movie(2), movie(3)], "same")).toEqual(
      rankCandidateSource([movie(1), movie(2), movie(3)], "same"),
    );
  });

  it("ranker uygun küme dışından ID ekleyemez", () => {
    expect(() =>
      assertRankerBoundary([movie(1), movie(2)], [movie(1), movie(999)]),
    ).toThrow("ranker_introduced_unknown_movie");
  });

  it("kaynağı tekilleştirir", () => {
    const ranked = rankCandidateSource(
      [movie(1), movie(1), movie(2), movie(2), movie(3)],
      "unique",
    );
    expect(new Set(ranked.map((entry) => entry.id)).size).toBe(3);
  });

  it("filtreleme havuzu eksik bırakırsa ek TMDb sayfası dener", async () => {
    let persistenceAttempts = 0;
    const fetchedPages: number[] = [];
    const plan = await sourceAndPersistRoundCandidates(
      async () => {
        persistenceAttempts += 1;
        if (persistenceAttempts < 2) {
          throw new RoomServiceError(roomError("candidate_pool_incomplete"));
        }
      },
      {
        providerKeys: ["netflix", "prime_video"],
        seed: "multi-page-seed-1234567890",
        fetchPage: async (page) => {
          fetchedPages.push(page);
          const base = fetchedPages.length * 100;
          return Array.from({ length: 10 }, (_, index) => movie(base + index));
        },
      },
    );

    expect(fetchedPages.length).toBe(3);
    expect(persistenceAttempts).toBe(2);
    expect(new Set(plan.candidates.map((entry) => entry.id)).size).toBe(30);
  });

  it("tüm sayfalar yetersizse sınırlı ve güvenli hata verir", async () => {
    let pageCalls = 0;
    await expect(
      sourceAndPersistRoundCandidates(
        async () => {
          throw new RoomServiceError(roomError("candidate_pool_incomplete"));
        },
        {
          providerKeys: ["netflix", "prime_video"],
          seed: "bounded-failure-1234567890",
          fetchPage: async () => {
            pageCalls += 1;
            return Array.from({ length: 10 }, (_, index) => movie(index + 1));
          },
        },
      ),
    ).rejects.toMatchObject({
      roomError: { code: "candidate_pool_incomplete" },
    });
    expect(pageCalls).toBe(MAX_DISCOVER_PAGE_ATTEMPTS);
  });

  it("eligible repeat yalnızca son bounded denemede açılır", async () => {
    const attempts: boolean[] = [];
    await sourceAndPersistRoundCandidates(
      async (plan) => {
        attempts.push(plan.allowEligibleRepeats);
        if (!plan.allowEligibleRepeats) {
          throw new RoomServiceError(roomError("candidate_pool_incomplete"));
        }
      },
      {
        providerKeys: ["netflix", "prime_video"],
          seed: "repeat-last-resort-1234567890",
        fetchPage: async (page) =>
          Array.from({ length: 10 }, (_, index) => movie(page * 100 + index)),
      },
    );
    expect(attempts.at(-1)).toBe(true);
    expect(attempts.slice(0, -1).every((value) => value === false)).toBe(true);
  });

  it("son denemede bile havuz kurulamazsa DÜRÜSTÇE başarısız olur", async () => {
    // Veritabanı hard eligibility kurallarını son denemede de açmaz. Boru hattı
    // bu reddi yutup uydurma bir plan döndüremez.
    const attempts: boolean[] = [];

    await expect(
      sourceAndPersistRoundCandidates(
        async (plan) => {
          attempts.push(plan.allowEligibleRepeats);
          throw new RoomServiceError(roomError("candidate_pool_incomplete"));
        },
        {
          providerKeys: ["netflix", "prime_video"],
          seed: "honest-failure-1234567890abcd",
          fetchPage: async (page) =>
            Array.from({ length: 10 }, (_, index) => movie(page * 100 + index)),
        },
      ),
    ).rejects.toMatchObject({
      roomError: { code: "candidate_pool_incomplete" },
    });

    expect(attempts.at(-1)).toBe(true);
  });

  it("policy ve ranker sürümü sunucu sabitlerinden gelir", async () => {
    const plans: RoundCandidatePlan[] = [];
    await sourceAndPersistRoundCandidates(
      async (plan) => {
        plans.push(plan);
      },
      {
        providerKeys: ["netflix", "prime_video"],
          seed: "server-owned-metadata-123456",
        fetchPage: async (page) =>
          Array.from({ length: 10 }, (_, index) => movie(page * 100 + index)),
      },
    );

    const plan = plans.at(-1);
    expect(plan?.selectionPolicyVersion).toBe(SELECTION_POLICY_VERSION);
    expect(plan?.rankerVersion).toBe(RANKER_VERSION);
    // `selection_reason` boru hattında hiç üretilmez; onu SQL geçişi yazar.
    expect(JSON.stringify(plan)).not.toContain("selectionReason");
    expect(JSON.stringify(plan)).not.toContain("selection_reason");
  });

  it("ortak abonelik yoksa hiç TMDb isteği atmadan reddeder", async () => {
    let fetched = 0;
    await expect(
      sourceAndPersistRoundCandidates(
        async () => {
          throw new Error("kalıcılaştırma çağrılmamalıydı");
        },
        {
          providerKeys: [],
          seed: "no-shared-subscription-1234",
          fetchPage: async () => {
            fetched += 1;
            return [];
          },
        },
      ),
    ).rejects.toMatchObject({ roomError: { code: "no_shared_subscriptions" } });

    expect(fetched).toBe(0);
  });

  it("ortak abonelik kümesini plana yazar", async () => {
    const plans: RoundCandidatePlan[] = [];
    await sourceAndPersistRoundCandidates(
      async (plan) => {
        plans.push(plan);
      },
      {
        providerKeys: ["mubi", "netflix"],
        seed: "provider-keys-in-plan-12345",
        fetchPage: async (page) =>
          Array.from({ length: 10 }, (_, index) => movie(page * 100 + index)),
      },
    );

    expect(plans.at(-1)?.providerKeys).toEqual(["mubi", "netflix"]);
  });
});
