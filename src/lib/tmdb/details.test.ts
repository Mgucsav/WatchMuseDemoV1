import { describe, expect, it } from "vitest";

import {
  extractDirector,
  normalizeGenres,
  normalizeMovieDetails,
} from "./details";

/** TMDb `movie/{id}?append_to_response=credits` yanıtını taklit eder. */
function detailsResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 27205,
    title: "Başlangıç",
    original_title: "Inception",
    overview: "Bir hırsız rüyalar üzerinden fikir çalar.",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    release_date: "2010-07-15",
    vote_average: 8.4,
    runtime: 148,
    genres: [
      { id: 28, name: "Aksiyon" },
      { id: 878, name: "Bilim Kurgu" },
    ],
    credits: {
      crew: [
        { job: "Director", name: "Christopher Nolan" },
        { job: "Producer", name: "Emma Thomas" },
      ],
    },
    ...overrides,
  };
}

describe("normalizeMovieDetails — gösterime özel dönüşüm", () => {
  it("künyeyi eksiksiz normalize eder", () => {
    const details = normalizeMovieDetails(detailsResponse(), 27205);

    expect(details).toMatchObject({
      id: 27205,
      title: "Başlangıç",
      originalTitle: "Inception",
      releaseYear: 2010,
      overview: "Bir hırsız rüyalar üzerinden fikir çalar.",
      posterPath: "/poster.jpg",
      runtimeMinutes: 148,
      voteAverage: 8.4,
      genres: ["Aksiyon", "Bilim Kurgu"],
      director: "Christopher Nolan",
    });
  });

  it("afiş ve arka plan için tam TMDb adresi üretir", () => {
    const details = normalizeMovieDetails(detailsResponse(), 27205);

    expect(details?.posterUrl).toBe(
      "https://image.tmdb.org/t/p/w342/poster.jpg",
    );
    expect(details?.backdropUrl).toBe(
      "https://image.tmdb.org/t/p/w780/backdrop.jpg",
    );
  });

  it("göreli olmayan görsel yolunu reddeder", () => {
    const details = normalizeMovieDetails(
      detailsResponse({
        poster_path: "https://evil.example.com/x.jpg",
        backdrop_path: "javascript:alert(1)",
      }),
      27205,
    );

    expect(details?.posterUrl).toBeNull();
    expect(details?.backdropUrl).toBeNull();
  });

  it("orijinal ad Türkçe ad ile aynıysa tekrar göstermez", () => {
    const details = normalizeMovieDetails(
      detailsResponse({ title: "Inception", original_title: "Inception" }),
      27205,
    );

    expect(details?.originalTitle).toBeNull();
  });

  it("puanlanmamış filmi puansız sayar", () => {
    const details = normalizeMovieDetails(
      detailsResponse({ vote_average: 0 }),
      27205,
    );

    expect(details?.voteAverage).toBeNull();
  });

  it("süresi bilinmeyen filmi null süreli sayar", () => {
    for (const runtime of [0, null, undefined, "148", 148.5, -10]) {
      const details = normalizeMovieDetails(
        detailsResponse({ runtime }),
        27205,
      );
      expect(details?.runtimeMinutes).toBeNull();
    }
  });

  it("eksik ve beklenmedik tipteki alanlarda hata fırlatmaz", () => {
    const details = normalizeMovieDetails(
      {
        id: 550,
        title: "Dövüş Kulübü",
        genres: "aksiyon",
        credits: 42,
        release_date: 1999,
        overview: "   ",
      },
      550,
    );

    expect(details).toMatchObject({
      id: 550,
      title: "Dövüş Kulübü",
      genres: [],
      director: null,
      releaseYear: null,
      overview: null,
    });
  });

  it("adı okunamayan kaydı reddeder", () => {
    expect(normalizeMovieDetails({ id: 550 }, 550)).toBeNull();
    expect(normalizeMovieDetails({ id: 550, title: "  " }, 550)).toBeNull();
    expect(normalizeMovieDetails(null, 550)).toBeNull();
    expect(normalizeMovieDetails("film", 550)).toBeNull();
  });

  it("kimlik okunamazsa istenen TMDb kimliğine düşer", () => {
    const details = normalizeMovieDetails(
      detailsResponse({ id: "abc" }),
      27205,
    );

    expect(details?.id).toBe(27205);
  });

  it("aynı başlıklı farklı TMDb kayıtları ayrı kimlik taşır", () => {
    // "Esaretin Bedeli" TMDb'de birden fazla kayıt olarak bulunabilir.
    // Kimlik her zaman TMDb ID'sidir; başlık ayırt edici değildir.
    const first = normalizeMovieDetails(
      detailsResponse({ id: 238, title: "Esaretin Bedeli" }),
      238,
    );
    const second = normalizeMovieDetails(
      detailsResponse({ id: 278, title: "Esaretin Bedeli" }),
      278,
    );

    expect(first?.title).toBe(second?.title);
    expect(first?.id).toBe(238);
    expect(second?.id).toBe(278);
    expect(first?.id).not.toBe(second?.id);
  });

  it("gösterime özel alanların dışında ham TMDb alanı taşımaz", () => {
    const details = normalizeMovieDetails(
      detailsResponse({
        budget: 160000000,
        production_companies: [{ id: 1, name: "Legendary" }],
        imdb_id: "tt1375666",
      }),
      27205,
    );

    expect(Object.keys(details ?? {}).sort()).toEqual([
      "backdropUrl",
      "director",
      "genres",
      "id",
      "originalTitle",
      "overview",
      "posterPath",
      "posterUrl",
      "releaseYear",
      "runtimeMinutes",
      "title",
      "voteAverage",
    ]);
  });
});

describe("extractDirector — credits içinden yönetmen", () => {
  it("job değeri Director olan kişiyi seçer", () => {
    expect(
      extractDirector({
        crew: [
          { job: "Producer", name: "Emma Thomas" },
          { job: "Director", name: "Christopher Nolan" },
        ],
      }),
    ).toBe("Christopher Nolan");
  });

  it("birden fazla yönetmeni sırayla birleştirir", () => {
    expect(
      extractDirector({
        crew: [
          { job: "Director", name: "Joel Coen" },
          { job: "Director", name: "Ethan Coen" },
        ],
      }),
    ).toBe("Joel Coen, Ethan Coen");
  });

  it("aynı yönetmeni tekrar etmez", () => {
    expect(
      extractDirector({
        crew: [
          { job: "Director", name: "Bong Joon-ho" },
          { job: "Director", name: "Bong Joon-ho" },
        ],
      }),
    ).toBe("Bong Joon-ho");
  });

  it("Directing departmanındaki diğer rolleri yönetmen saymaz", () => {
    expect(
      extractDirector({
        crew: [
          { department: "Directing", job: "Assistant Director", name: "Yardımcı" },
          { department: "Directing", job: "Script Supervisor", name: "Süpervizör" },
        ],
      }),
    ).toBeNull();
  });

  it("yönetmen yoksa null döner", () => {
    expect(extractDirector({ crew: [] })).toBeNull();
    expect(extractDirector({ crew: [{ job: "Director" }] })).toBeNull();
    expect(extractDirector({})).toBeNull();
    expect(extractDirector(null)).toBeNull();
    expect(extractDirector({ crew: "Christopher Nolan" })).toBeNull();
  });
});

describe("normalizeGenres", () => {
  it("tür adlarını sırayla ve tekilleştirerek çıkarır", () => {
    expect(
      normalizeGenres([
        { id: 28, name: "Aksiyon" },
        { id: 12, name: "Macera" },
        { id: 99, name: "Aksiyon" },
        { id: 1 },
        "Dram",
      ]),
    ).toEqual(["Aksiyon", "Macera"]);
  });

  it("dizi olmayan girdide boş liste döner", () => {
    expect(normalizeGenres(null)).toEqual([]);
    expect(normalizeGenres("Aksiyon")).toEqual([]);
  });
});
