import { describe, expect, it } from "vitest";

import { normalizeProvidersResponse } from "./providers";
import type { MovieProvidersResult, TargetProviderKey } from "./types";

/** TMDb provider ID'leri (bkz. `constants.ts` → TARGET_PROVIDERS). */
const NETFLIX = 8;
const NETFLIX_ADS = 1796;
const PRIME = 119;
const PRIME_ADS = 2100;

function providerEntry(id: number, name: string) {
  return { provider_id: id, provider_name: name };
}

/** TMDb `watch/providers` yanıtını taklit eden fixture üreticisi. */
function response(tr: Record<string, unknown> | null) {
  return { id: 550, results: tr === null ? {} : { TR: tr } };
}

function availabilityOf(
  result: MovieProvidersResult,
  key: TargetProviderKey,
): boolean {
  const provider = result.providers.find((p) => p.key === key);
  if (!provider) throw new Error(`beklenen sağlayıcı yok: ${key}`);
  return provider.available;
}

describe("normalizeProvidersResponse — flatrate sınıflandırması", () => {
  it("flatrate'teki Netflix'i aboneliğe dahil sayar", () => {
    const result = normalizeProvidersResponse(
      response({ flatrate: [providerEntry(NETFLIX, "Netflix")] }),
      550,
    );

    expect(availabilityOf(result, "netflix")).toBe(true);
    expect(availabilityOf(result, "prime_video")).toBe(false);
  });

  it("flatrate'teki Prime Video'yu aboneliğe dahil sayar", () => {
    const result = normalizeProvidersResponse(
      response({ flatrate: [providerEntry(PRIME, "Amazon Prime Video")] }),
      550,
    );

    expect(availabilityOf(result, "prime_video")).toBe(true);
    expect(availabilityOf(result, "netflix")).toBe(false);
  });

  it("reklamlı paket varyantlarını da aboneliğe dahil sayar", () => {
    const netflixAds = normalizeProvidersResponse(
      response({ flatrate: [providerEntry(NETFLIX_ADS, "Netflix with Ads")] }),
      550,
    );
    expect(availabilityOf(netflixAds, "netflix")).toBe(true);

    const primeAds = normalizeProvidersResponse(
      response({ flatrate: [providerEntry(PRIME_ADS, "Prime Video with Ads")] }),
      550,
    );
    expect(availabilityOf(primeAds, "prime_video")).toBe(true);
  });

  it("SADECE rent altındaki sağlayıcıyı aboneliğe dahil SAYMAZ", () => {
    const result = normalizeProvidersResponse(
      response({ rent: [providerEntry(NETFLIX, "Netflix")] }),
      550,
    );

    expect(availabilityOf(result, "netflix")).toBe(false);
  });

  it("SADECE buy altındaki sağlayıcıyı aboneliğe dahil SAYMAZ", () => {
    const result = normalizeProvidersResponse(
      response({ buy: [providerEntry(PRIME, "Amazon Prime Video")] }),
      550,
    );

    expect(availabilityOf(result, "prime_video")).toBe(false);
  });

  it("rent ve buy dolu, flatrate boşken hiçbirini dahil saymaz", () => {
    const result = normalizeProvidersResponse(
      response({
        rent: [providerEntry(NETFLIX, "Netflix"), providerEntry(PRIME, "Prime")],
        buy: [providerEntry(NETFLIX, "Netflix")],
        flatrate: [],
      }),
      550,
    );

    expect(availabilityOf(result, "netflix")).toBe(false);
    expect(availabilityOf(result, "prime_video")).toBe(false);
    // TR kaydı var: bu "bilgi yok" değil, "abonelikte yok" demektir.
    expect(result.hasRegionData).toBe(true);
  });

  it("aynı sağlayıcı hem rent hem flatrate'teyse flatrate belirleyicidir", () => {
    const result = normalizeProvidersResponse(
      response({
        flatrate: [providerEntry(NETFLIX, "Netflix")],
        rent: [providerEntry(NETFLIX, "Netflix")],
      }),
      550,
    );

    expect(availabilityOf(result, "netflix")).toBe(true);
  });
});

describe("normalizeProvidersResponse — ID ile eşleştirme", () => {
  it("adı Netflix olsa bile yanlış ID'yi eşleştirmez", () => {
    const result = normalizeProvidersResponse(
      response({ flatrate: [providerEntry(9999, "Netflix")] }),
      550,
    );

    expect(availabilityOf(result, "netflix")).toBe(false);
  });

  it("benzer adlı farklı hizmeti eşleştirmez", () => {
    // "Amazon Video" (kiralama hizmeti) ile "Amazon Prime Video" farklıdır.
    const result = normalizeProvidersResponse(
      response({ flatrate: [providerEntry(10, "Amazon Video")] }),
      550,
    );

    expect(availabilityOf(result, "prime_video")).toBe(false);
  });

  it("eşleşen provider ID'sini raporlar", () => {
    const result = normalizeProvidersResponse(
      response({ flatrate: [providerEntry(NETFLIX_ADS, "Netflix with Ads")] }),
      550,
    );

    const netflix = result.providers.find((p) => p.key === "netflix");
    expect(netflix?.matchedProviderId).toBe(NETFLIX_ADS);
  });
});

describe("normalizeProvidersResponse — bölge yalıtımı", () => {
  it("TR kaydı yoksa hasRegionData false döner", () => {
    const result = normalizeProvidersResponse(response(null), 550);

    expect(result.hasRegionData).toBe(false);
    expect(availabilityOf(result, "netflix")).toBe(false);
    expect(availabilityOf(result, "prime_video")).toBe(false);
  });

  it("yalnızca başka bölge varsa TR verisi yok sayılır", () => {
    const result = normalizeProvidersResponse(
      {
        id: 550,
        results: { US: { flatrate: [providerEntry(NETFLIX, "Netflix")] } },
      },
      550,
    );

    expect(result.hasRegionData).toBe(false);
    expect(availabilityOf(result, "netflix")).toBe(false);
  });

  it("TR var ama flatrate yoksa bölge verisi vardır, sağlayıcı yoktur", () => {
    const result = normalizeProvidersResponse(response({ link: "x" }), 550);

    expect(result.hasRegionData).toBe(true);
    expect(availabilityOf(result, "netflix")).toBe(false);
  });
});

describe("normalizeProvidersResponse — bozuk girdi", () => {
  it("beklenmeyen yapılarda hata fırlatmaz", () => {
    const malformed: unknown[] = [
      null,
      undefined,
      [],
      "metin",
      42,
      {},
      { results: null },
      { results: [] },
      { results: { TR: null } },
      { results: { TR: "metin" } },
      { results: { TR: { flatrate: "dizi degil" } } },
      { results: { TR: { flatrate: [null, 5, {}, "x"] } } },
      { results: { TR: { flatrate: [{ provider_id: "8" }] } } },
      { results: { TR: { flatrate: [{ provider_id: -1 }] } } },
    ];

    for (const input of malformed) {
      expect(() => normalizeProvidersResponse(input, 550)).not.toThrow();

      const result = normalizeProvidersResponse(input, 550);
      expect(result.providers).toHaveLength(2);
      expect(result.movieId).toBe(550);
      expect(result.region).toBe("TR");
    }
  });

  it("provider_id metin olarak geldiğinde eşleşme saymaz", () => {
    const result = normalizeProvidersResponse(
      response({ flatrate: [{ provider_id: "8", provider_name: "Netflix" }] }),
      550,
    );

    expect(availabilityOf(result, "netflix")).toBe(false);
  });

  it("adı olmayan sağlayıcıya yedek etiket üretir", () => {
    const result = normalizeProvidersResponse(
      response({ flatrate: [{ provider_id: 4242 }] }),
      550,
    );

    expect(result.otherFlatrateProviders).toEqual([
      { id: 4242, name: "Sağlayıcı #4242" },
    ]);
  });

  it("yinelenen sağlayıcıları tekilleştirir", () => {
    const result = normalizeProvidersResponse(
      response({
        flatrate: [providerEntry(4242, "TV+"), providerEntry(4242, "TV+")],
      }),
      550,
    );

    expect(result.otherFlatrateProviders).toHaveLength(1);
  });
});

describe("normalizeProvidersResponse — çıktı sözleşmesi", () => {
  it("hedef dışındaki flatrate sağlayıcılarını ayrı listeler", () => {
    const result = normalizeProvidersResponse(
      response({
        flatrate: [
          providerEntry(NETFLIX, "Netflix"),
          providerEntry(337, "Disney Plus"),
        ],
      }),
      550,
    );

    expect(result.otherFlatrateProviders).toEqual([
      { id: 337, name: "Disney Plus" },
    ]);
  });

  it("izleme seçenekleri bağlantısını yalnızca güvenilen alan adından alır", () => {
    const trusted = normalizeProvidersResponse(
      response({ link: "https://www.themoviedb.org/movie/550/watch?locale=TR" }),
      550,
    );
    expect(trusted.watchOptionsUrl).toBe(
      "https://www.themoviedb.org/movie/550/watch?locale=TR",
    );

    const untrusted = normalizeProvidersResponse(
      response({ link: "https://www.justwatch.com/tr/film/550" }),
      550,
    );
    expect(untrusted.watchOptionsUrl).toBeNull();
  });

  it("checkedAt geçerli bir ISO 8601 zaman damgasıdır", () => {
    const result = normalizeProvidersResponse(response({}), 550);

    expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    expect(Number.isNaN(Date.parse(result.checkedAt))).toBe(false);
  });
});
