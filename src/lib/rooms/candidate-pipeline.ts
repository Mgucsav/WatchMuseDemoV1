import "server-only";

import { randomBytes } from "node:crypto";

import { discoverRoomCandidatePage } from "@/lib/tmdb/search";
import type { MovieSummary, TargetProviderKey } from "@/lib/tmdb/types";
import { roomError } from "./errors";
import { RoomServiceError } from "./service";
import { seededShuffle } from "./seeded-random";
import { tmdbProviderIdsFor } from "./subscriptions";

export const ROUND_CANDIDATE_COUNT = 10;
export const MAX_DISCOVER_PAGE_ATTEMPTS = 8;
export const MIN_PAGES_BEFORE_PERSIST = 2;
const MAX_DISCOVER_PAGE = 20;

export const SELECTION_POLICY_VERSION = "reusable-room-v1";
export const RANKER_VERSION = "seeded-random-v1";

export interface RoundCandidatePlan {
  seed: string;
  candidates: MovieSummary[];
  selectionPolicyVersion: string;
  rankerVersion: string;
  allowEligibleRepeats: boolean;
  /**
   * Bu havuzun toplandığı ORTAK abonelikler. Veritabanına turla birlikte
   * yazılır: geçmiş turlardan tekrar aday alınırken, o turun toplandığı
   * platform kümesinin bugünün ortak kümesinin alt kümesi olması aranır.
   */
  providerKeys: TargetProviderKey[];
}

export type CandidatePageFetcher = (page: number) => Promise<MovieSummary[]>;
export type CandidatePlanPersister = (plan: RoundCandidatePlan) => Promise<void>;

export function createSelectionSeed(): string {
  return randomBytes(24).toString("hex");
}

export function discoverPageOrder(seed: string): number[] {
  return seededShuffle(
    Array.from({ length: MAX_DISCOVER_PAGE }, (_, index) => index + 1),
    `${seed}:pages`,
  ).slice(0, MAX_DISCOVER_PAGE_ATTEMPTS);
}

export function rankCandidateSource(
  candidates: readonly MovieSummary[],
  seed: string,
): MovieSummary[] {
  const unique = new Map<number, MovieSummary>();
  for (const movie of candidates) {
    if (movie.id > 0 && movie.title.trim() !== "" && !unique.has(movie.id)) {
      unique.set(movie.id, movie);
    }
  }
  return seededShuffle([...unique.values()], `${seed}:rank`);
}

/** Ranker'ın kaynak kümesine yeni film sokmasını yapısal olarak reddeder. */
export function assertRankerBoundary(
  source: readonly MovieSummary[],
  ranked: readonly MovieSummary[],
): void {
  const sourceIds = new Set(source.map((movie) => movie.id));
  if (ranked.some((movie) => !sourceIds.has(movie.id))) {
    throw new Error("ranker_introduced_unknown_movie");
  }
}

/**
 * TMDb sayfalarını sınırlı ve seed'li sırada toplar. Veritabanı hard filtreler
 * nedeniyle havuz yetersiz derse bir sayfa daha ekleyip aynı seed ile tekrar
 * dener. Başarısız RPC transaction'ı hiçbir tur/aday yazmaz.
 *
 * Havuz, YALNIZCA iki katılımcının ortak aboneliklerinden toplanır: sağlayıcı
 * filtresi TMDb keşif isteğinin kendisinde uygulanır (bkz.
 * `discoverRoomCandidatePage`), dönen listeden sonradan elenmez. Böylece ortak
 * platformda olmayan bir film havuza hiç girmez.
 *
 * `allowEligibleRepeats` YALNIZCA son bounded denemede açılır. Bu bayrak
 * veritabanına bir izin değil, bir *talep*tir ve orada şu değişmez kurallara
 * tabidir (bkz. `start_next_space_round`):
 *
 *   * hard suppression (kabul edilmiş seçim, açık yedi günlük pencere, son 30
 *     gün içinde iki taraflı skip) son denemede bile AÇILMAZ;
 *   * `priority_return` + `eligible_repeat` toplamı en fazla 9 slot alabilir;
 *   * en az 1 slot, bu space'in TÜM geçmişinde hiç görülmemiş gerçek bir
 *     keşif olmak zorundadır.
 *
 * Bu kurallar sağlanamıyorsa RPC `candidate_pool_incomplete` ile durur ve bu
 * fonksiyon hatayı yukarı taşır. Havuz ASLA uygun olmayan filmle doldurulmaz.
 *
 * Aday planındaki `selectionPolicyVersion` / `rankerVersion` bu modüldeki
 * sabitlerden gelir; istemciden alınmaz. `selection_reason` ise hiç
 * üretilmez — onu yalnızca adayı seçen SQL geçişi yazar.
 */
export async function sourceAndPersistRoundCandidates(
  persist: CandidatePlanPersister,
  options: {
    /** İki katılımcının ORTAK abonelikleri. Boş olamaz. */
    providerKeys: readonly TargetProviderKey[];
    seed?: string;
    fetchPage?: CandidatePageFetcher;
  },
): Promise<RoundCandidatePlan> {
  const providerKeys = [...options.providerKeys];
  if (providerKeys.length === 0) {
    throw new RoomServiceError(roomError("no_shared_subscriptions"));
  }

  const seed = options.seed ?? createSelectionSeed();
  const providerIds = tmdbProviderIdsFor(providerKeys);
  const fetchPage =
    options.fetchPage ?? ((page: number) => discoverRoomCandidatePage(page, providerIds));
  const unique = new Map<number, MovieSummary>();

  for (const [index, page] of discoverPageOrder(seed).entries()) {
    const movies = await fetchPage(page);
    for (const movie of movies) {
      if (!unique.has(movie.id)) unique.set(movie.id, movie);
    }

    if (index + 1 < MIN_PAGES_BEFORE_PERSIST || unique.size < ROUND_CANDIDATE_COUNT) {
      continue;
    }

    const source = [...unique.values()];
    const ranked = rankCandidateSource(source, seed);
    assertRankerBoundary(source, ranked);
    const plan: RoundCandidatePlan = {
      seed,
      candidates: ranked,
      selectionPolicyVersion: SELECTION_POLICY_VERSION,
      rankerVersion: RANKER_VERSION,
      allowEligibleRepeats: index + 1 === MAX_DISCOVER_PAGE_ATTEMPTS,
      providerKeys,
    };

    try {
      await persist(plan);
      return plan;
    } catch (error) {
      if (
        error instanceof RoomServiceError &&
        error.roomError.code === "candidate_pool_incomplete"
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new RoomServiceError(roomError("candidate_pool_incomplete"));
}
