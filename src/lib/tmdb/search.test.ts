import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { discoverRoomCandidatePage } from "./search";

/**
 * Oda aday havuzunun ORTAK abonelik filtresi.
 *
 * Buradaki asıl iddia şudur: filtre, dönen listeden sonradan eleme yaparak
 * değil, TMDb isteğinin KENDİSİNDE uygulanır. Bu yüzden testler istek
 * adresine bakar.
 */

const originalToken = process.env.TMDB_ACCESS_TOKEN;

function movieResponse(ids: number[], totalPages: number) {
  return new Response(
    JSON.stringify({
      page: 1,
      total_pages: totalPages,
      results: ids.map((id) => ({
        id,
        title: `Film ${id}`,
        original_title: `Film ${id}`,
        poster_path: null,
        overview: null,
        release_date: "2020-01-01",
        vote_average: 7,
      })),
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function requestedUrls(fetchMock: ReturnType<typeof vi.fn>): URL[] {
  return fetchMock.mock.calls.map((call) => new URL(String(call[0])));
}

describe("discoverRoomCandidatePage — ortak abonelik filtresi", () => {
  beforeEach(() => {
    // Demo modu TMDb'ye hiç istek atmadığı için gerçek bir token taklit edilir.
    process.env.TMDB_ACCESS_TOKEN = "test-token";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalToken === undefined) delete process.env.TMDB_ACCESS_TOKEN;
    else process.env.TMDB_ACCESS_TOKEN = originalToken;
  });

  it("sağlayıcı, bölge ve flatrate sınırını isteğe koyar", async () => {
    const fetchMock = vi.fn(async () => movieResponse([1, 2, 3], 20));
    vi.stubGlobal("fetch", fetchMock);

    await discoverRoomCandidatePage(2, [8, 119, 1796]);

    const [url] = requestedUrls(fetchMock);
    expect(url.pathname).toBe("/3/discover/movie");
    expect(url.searchParams.get("watch_region")).toBe("TR");
    // TMDb bu listeyi VEYA olarak yorumlar: ortak platformlardan HERHANGİ biri.
    expect(url.searchParams.get("with_watch_providers")).toBe("8|119|1796");
    // Kiralama ve satın alma "aboneliğe dahil" değildir; listeye girmez.
    expect(url.searchParams.get("with_watch_monetization_types")).toBe("flatrate");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("ortak sağlayıcı yoksa hiç istek atmadan durur", async () => {
    const fetchMock = vi.fn(async () => movieResponse([1], 20));
    vi.stubGlobal("fetch", fetchMock);

    await expect(discoverRoomCandidatePage(1, [])).rejects.toThrow(
      "room_requires_shared_providers",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dar katalogda aralık dışı sayfayı bir kez aralığa katlar", async () => {
    // Tek platformun katalogu üç sayfa olabilir; seed'li sayfa sırası ise
    // 20'ye kadar çıkar. Aralık dışı sayfa havuzu boş yere daraltmamalıdır.
    const fetchMock = vi.fn(async (input: unknown) => {
      const page = new URL(String(input)).searchParams.get("page");
      return page === "18" ? movieResponse([], 3) : movieResponse([7, 8], 3);
    });
    vi.stubGlobal("fetch", fetchMock);

    const movies = await discoverRoomCandidatePage(18, [11]);

    const pages = requestedUrls(fetchMock).map((url) =>
      url.searchParams.get("page"),
    );
    expect(pages).toEqual(["18", "3"]);
    expect(movies.map((movie) => movie.id)).toEqual([7, 8]);
  });

  it("aralık içindeki sayfa boş dönerse dürüstçe başarısız olur", async () => {
    const fetchMock = vi.fn(async () => movieResponse([], 20));
    vi.stubGlobal("fetch", fetchMock);

    await expect(discoverRoomCandidatePage(2, [8])).rejects.toThrow(
      "room_candidate_pool_incomplete",
    );
  });
});
