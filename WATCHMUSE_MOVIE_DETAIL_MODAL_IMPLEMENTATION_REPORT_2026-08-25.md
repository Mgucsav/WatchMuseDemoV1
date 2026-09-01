# WatchMuse — MovieDetailModal V1 Implementation Report

**Tarih:** 2026-08-25
**Dal:** `feature/reusable-room-candidates` (doğrulandı; dal değiştirilmedi)
**Kapsam:** Yalnızca arama sonuçlarından açılan reusable MovieDetailModal V1

---

## 1. Özet

Arama sonucundan bir film seçildiğinde artık sayfanın altındaki `ProviderPanel`
yerine **modal** açılıyor. Modal, künye + yönetmen + özet + Türkiye abonelik
durumunu tek bir uçtan (`GET /api/movies/<tmdbId>`) alıyor.

Bileşen **yeniden kullanılabilir** olacak şekilde yazıldı: kimlik her zaman TMDb
ID'sidir, film değişimini kendi içinde güvenle karşılar ve çağıran taraftan
yalnızca `movie` + `onClose` bekler. RoomRound entegrasyonu bilinçli olarak
**bu dilimin dışında bırakıldı** (bkz. §7).

Tüm doğrulamalar temiz: 23 test dosyası / 294 test, typecheck temiz, lint temiz,
build 21 route, `npm audit --omit=dev` → 0 vulnerabilities.

**Önemli dürüstlük notu:** depoda component test altyapısı yok
(`environment: "node"`, `include: ["src/**/*.test.ts"]`, jsdom/testing-library
bağımlılığı yok). Talimat gereği **yeni test bağımlılığı eklenmedi**. Bunun
yerine modal davranışının kuralları saf fonksiyonlara ayrıldı ve orada test
edildi; tarayıcı seviyesindeki bağlama **manual/NOT RUN** olarak §6'da
listelendi.

---

## 2. Oluşturulan dosyalar

| Dosya | Rolü |
| --- | --- |
| `src/app/api/movies/[id]/route.ts` | `GET /api/movies/<tmdbId>` — künye + sağlayıcı tek yanıtta |
| `src/lib/tmdb/details.ts` | TMDb künye katmanı, TTL önbellek, `normalizeMovieDetails`, `extractDirector`, `normalizeGenres` |
| `src/lib/tmdb/details.test.ts` | 18 test — normalize + yönetmen çıkarımı |
| `src/lib/ui/modal.ts` | Modal davranışının saf kuralları (DOM'dan bağımsız) |
| `src/lib/ui/modal.test.ts` | 29 test — kapanma kararı, kaydırma kilidi, odak tuzağı, bayat yanıt |
| `src/components/MovieDetailModal.tsx` | Modalın kendisi |
| `src/components/ProviderAvailability.tsx` | Ortak abonelik sunumu (modal + panel paylaşır) |

## 3. Değiştirilen dosyalar

| Dosya | Değişiklik |
| --- | --- |
| `src/components/MovieSearch.tsx` | Sağlayıcı efekti ve `ProviderPanel` render'ı kaldırıldı; seçim modalı açıyor. `closeDetail` `useCallback` ile kararlı |
| `src/components/MovieResultList.tsx` | `aria-pressed` → `aria-haspopup="dialog"` + `aria-expanded` (düğme artık bir diyalog açıyor) |
| `src/components/ProviderPanel.tsx` | Sunum gövdesi `ProviderAvailabilitySection`'a taşındı; dosya ve export korundu |
| `src/lib/tmdb/types.ts` | `MovieDetails`, `MovieDetailsResult` eklendi |
| `src/lib/tmdb/constants.ts` | `TMDB_BACKDROP_SIZE`, `DETAILS_CACHE_TTL_MS`, `DETAILS_CACHE_MAX_ENTRIES` |
| `src/lib/tmdb/normalize.ts` | `toBackdropUrl` (yalnız `/` ile başlayan TMDb yolları) |
| `src/lib/tmdb/client.ts` | DEMO önizleme moduna `/movie/{id}` künye dalı (mevcut dallar değişmedi) |

**Yeni bağımlılık eklenmedi.** `package.json` bu görevde değişmedi.

---

## 4. Gerçek davranış

### 4.1 Endpoint — `GET /api/movies/<tmdbId>`

- `parseMovieId` ile **tam olarak** pozitif, güvenli tam sayı doğrulaması;
  geçersizse `400 invalid_movie_id`. Değer TMDb URL'ine konmadan önce doğrulanır.
- Künye ve sağlayıcı `Promise.all` ile **paralel** alınır; modal tek bekleme
  görür. Her ikisi de kendi TTL önbelleğini kullanır.
- Künye TMDb'den `append_to_response=credits` ile çekilir — yönetmen için
  **ikinci bir TMDb isteği harcanmaz**.
- Yanıt gösterime özeldir: `id, title, originalTitle, releaseYear, overview,
  posterPath, posterUrl, backdropUrl, runtimeMinutes, voteAverage, genres,
  director` + `providers`. Bir test, dönen nesnenin anahtar kümesini birebir
  doğruluyor; `budget`, `imdb_id`, `production_companies` gibi ham TMDb alanları
  **sızmıyor**.
- Hatalar mevcut `toErrorResponse` yolundan geçer: token, istek başlığı, TMDb
  ham gövdesi ve yığın izi istemciye ulaşmaz.

**Yönetmen çıkarımı:** eşleşme yalnızca `job === "Director"` üzerinden yapılır.
`department === "Directing"` bilinçli **kullanılmadı** — o alan Assistant
Director ve Script Supervisor gibi rolleri de kapsar ve yanlış isim üretir.
Birden fazla yönetmen (ör. Coen kardeşler) sırayla, tekilleştirilerek birleşir.

### 4.2 Modal

| Gereksinim | Uygulama |
| --- | --- |
| `document.body` portal | `createPortal(..., document.body)`; SSR'de `typeof document` koruması |
| Koyu + blur arka plan | `bg-black/70 backdrop-blur-sm` |
| Desktop büyük centered | `sm:items-center sm:max-w-2xl sm:max-h-[88dvh] sm:rounded-2xl` |
| Mobil near-full-screen | `items-end`, `h-[92dvh]`, `rounded-t-2xl`, `overflow-y-auto overscroll-contain` |
| Ayrılmış aspect ratio | Arka plan `aspect-[16/9]`, afiş `aspect-[2/3]` — görsel gelmeden **önce** ayrılır |
| Loading / error / provider-empty | Üçü de ayrı ayrı ele alınıyor (aşağıda) |
| Close button | Sağ üstte, 44×44, `aria-label` film adını içerir |
| Escape | `document` üzerinde keydown; `preventDefault` + `onClose` |
| Yalnız backdrop kapatır | `shouldCloseOnBackdropClick` kimlik eşitliği + pointerdown koruması |
| İçerik tıklaması kapatmaz | Aynı kural; köpüren olaylar elenir |
| `role`/`aria` | `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby` |
| Focus trap | `FOCUSABLE_SELECTOR` + `resolveFocusTrapTarget`, Tab/Shift+Tab sarma |
| Açılışta odak | Kapatma düğmesi |
| Kapanışta odak restore | Mount anındaki `document.activeElement` saklanır, cleanup'ta geri verilir |
| Body scroll lock + cleanup | `lockBodyScroll` — **önceki satır içi değerleri** geri yükler |
| Scrollbar compensation | `innerWidth - clientWidth` kadar `padding-right` |

**Loading:** modal boş iskelet göstermez. Arama sonucundaki başlık, yıl, afiş ve
özet **anında** görünür; yalnızca arka plan görseli, süre, tür, yönetmen ve
abonelik bölümü yüklenirken bekler.

**Error:** künye alınamazsa modal kapanmaz — bilinen özet bilgi ekranda kalır ve
üstüne `StatusMessage` ile hata gösterilir.

**Provider-empty:** iki ayrı durum ayrıldı. TMDb'de Türkiye kaydı **yoksa**
"bilgi mevcut değil" uyarısı; kayıt **var ama hiçbir platform abonelikle
sunmuyorsa** ayrı bir açıklama gösterilir. Önceden bu ikinci durum iki gri
"Bulunamadı" rozetiyle eksik veri izlenimi bırakıyordu.

### 4.3 Bayat istek güvenliği

Üç katman:

1. **Yeni AbortController** — efekt `movieId`'ye bağlı; film değişince yeni
   controller kurulur, temizlik eskisini iptal eder.
2. **Kapanışta abort** — modal unmount olduğunda aynı temizlik çalışır.
3. **Kimlikten türetilen durum** — tamamlanan istekler ait oldukları `movieId`
   ile saklanır; `stateForMovie` yalnızca kimlik eşleşiyorsa sonucu gösterir.
   Geç gelen eski yanıt yeni filmin ekranını **boyayamaz**.

Karşılaştırma her yerde **TMDb ID** üzerinden; başlık hiçbir noktada eşleştirme
ölçütü değil. Aynı adı taşıyan farklı kayıtlar (ör. iki ayrı "Esaretin Bedeli")
bu yüzden karışmaz — hem `details.test.ts` hem `modal.test.ts` bunu ayrı ayrı
doğruluyor.

`MovieSearch` modala bilinçli olarak **`key` vermiyor**: yeniden kurmak kaydırma
kilidini ve odağı gereksiz yere sıfırlardı, ayrıca bileşenin kendi koruması
zaten yeterli. Bu, modalın gelecekte değişen bir `movieId` ile kullanılmasını da
mümkün kılar.

### 4.4 Sürükleyip bırakma koruması

Modal içinde metin seçip fareyi arka planda bırakmak, `click` olayını ortak ata
olan arka planda tetikler ve saf hedef karşılaştırması bunu kapanma sayardı.
`onPointerDown` ile basma anının da arka planda olması şart koşuldu.

### 4.5 Search entegrasyonu ve ProviderPanel

- Seçim artık sayfa altına kaydırmıyor; modal açıyor.
- Sonuç satırı **tek etkileşimli öğe**; içinde iç içe düğme veya bağlantı yok.
- `ProviderPanel` **silinmedi**. Sunum gövdesi `ProviderAvailabilitySection`'a
  ayrıldı ve modal ile paylaşılıyor; iki yüzey arasında metin veya sınıflandırma
  farkı oluşamaz. `ProviderState` tipi geriye dönük uyumluluk için
  `ProviderPanel`'den yeniden export ediliyor.
- **Dürüst not:** bu değişiklikten sonra `ProviderPanel` hiçbir yerden
  render edilmiyor. Talimat gereği ("gereksiz yere silme") dosya korundu;
  paylaşılan bölümü kullanacak şekilde güncellendi ve tekrar kullanıma hazır.

### 4.6 Stil

Mevcut görsel dil korundu: aynı `border-black/10 dark:border-white/15` çerçeve
dili, aynı rozet renkleri, aynı `min-h-11` dokunma hedefi, `globals.css`
içindeki genel `img { filter: grayscale(...) }` kuralı modalda da geçerli.
Arka plan `bg-black/70 + backdrop-blur-sm` — belirgin ama aşırı değil.
Hiyerarşi: başlık `text-xl sm:text-2xl font-bold`, altında orijinal ad, sonra
tek satır metadata, sonra tür etiketleri ve yönetmen. Genel sayfa redesign'ı
yapılmadı.

---

## 5. Test sonuçları

```
$ npm test
 Test Files  23 passed (23)
      Tests  294 passed | 16 todo (310)

$ npm run typecheck
> tsc --noEmit
(çıktı yok — temiz)

$ npm run lint
> eslint
(çıktı yok — temiz)

$ npm run build
✓ Generating static pages using 15 workers (12/12)
21 route derlendi; /api/movies/[id] kayıtlı

$ npm audit --omit=dev
found 0 vulnerabilities
```

16 `todo`, önceki fazdan kalan çalıştırılmamış veritabanı senaryolarıdır ve bu
görevle ilgili değildir.

Bu görevde eklenen **47 yeni test**:

| Test | Kapsam |
| --- | --- |
| `details.test.ts` (18) | Künye normalize · afiş/arka plan URL · göreli olmayan yol reddi · orijinal ad tekrarı · puansız film · süresiz film · bozuk girdi · **yönetmen çıkarımı** (tek/çoklu/tekrar/Directing departmanı tuzağı/yok) · **aynı başlık farklı TMDb ID** · yanıt anahtar kümesi |
| `modal.test.ts` (29) | **Backdrop close** · **content click kapatmaz** · köpüren olay · **scroll-lock cleanup** (önceki değerler, çift çağrı, çubuksuz ortam) · scrollbar compensation · **focus trap** sarma/dışarıdan geri çekme/tek öğe/boş · `FOCUSABLE_SELECTOR` · **stale response** (film değişimi, geç gelen yanıt, aynı başlık farklı ID) · runtime biçimi |

---

## 6. Manual / NOT RUN kontroller

Depoda component test altyapısı yok (`vitest` `environment: "node"`,
`include: ["src/**/*.test.ts"]`; jsdom/happy-dom ve testing-library **yok**).
Talimat gereği yeni test bağımlılığı eklenmedi.

Aşağıdaki davranışların **kuralları** saf fonksiyonlarda test edildi; ancak
**DOM'a bağlanması** yalnızca typecheck/lint/build ile doğrulandı, çalıştırılarak
değil. Bunlar tarayıcıda elle kontrol edilmelidir:

| # | Kontrol | Durum |
| --- | --- | --- |
| 1 | Modalın gerçekten `document.body` altına portal edilmesi | NOT RUN |
| 2 | Escape'in tarayıcıda modalı kapatması | NOT RUN |
| 3 | Arka plana tıklamanın kapatması, içeriğe tıklamanın kapatmaması | NOT RUN |
| 4 | Tab / Shift+Tab ile odağın modal içinde kalması | NOT RUN |
| 5 | Kapanışta odağın **tam olarak** açan sonuç satırına dönmesi | NOT RUN |
| 6 | Body scroll lock'un uygulanması ve kapanışta tam temizlenmesi | NOT RUN |
| 7 | Scrollbar compensation ile layout kaymasının olmaması | NOT RUN |
| 8 | Desktop centered / mobil near-full-screen yerleşimi | NOT RUN |
| 9 | Aspect ratio sayesinde görsel yüklenirken sıçrama olmaması | NOT RUN |
| 10 | Ekran okuyucunun diyalogu başlık + açıklama ile duyurması | NOT RUN |
| 11 | Hızlı film değişiminde yanlış filmin gösterilmemesi (gerçek ağ) | NOT RUN |
| 12 | Gerçek TMDb anahtarıyla künye/yönetmen/sağlayıcı doğruluğu | NOT RUN |

Elle test için: `npm run dev` → arama yap → bir sonuca tıkla.

**Test altyapısı eklenirse** (`jsdom` + `@testing-library/react`), 1–11 arası
maddeler otomatikleştirilebilir. Bu bir bağımlılık kararı olduğu için bu
oturumda yapılmadı; istenirse ayrı bir dilim olarak önerilir.

---

## 7. Ertelenen: RoomRound entegrasyonu

Kapsam sınırı gereği **yapılmadı**. Modal bu entegrasyona hazır olacak şekilde
yazıldı:

- Çağıran taraftan yalnızca `movie: MovieSummary` + `onClose: () => void` bekler;
  arama akışına dair hiçbir varsayımı yoktur.
- `movieId` değişimini kendi içinde karşılar (yeni AbortController + kimlikten
  türetilen durum), bu yüzden çağıran `key` vermek zorunda değildir.
- Sunum, `ProviderAvailabilitySection` üzerinden paylaşılır.

RoomRound'a bağlanırken çözülmesi gereken açık noktalar:

1. **Oy verme akışıyla çakışma** — modal açıkken kart kaydırma/oy kısayolları
   devre dışı bırakılmalı mı?
2. **Polling ile etkileşim** — modal açıkken tur durumu değişirse (partner
   bitirdi, çark döndü) modal kapanmalı mı, yoksa üstte mi kalmalı?
3. **`LibraryActions`** — oda turu içinde "izleme listeme ekle" gösterilmeli mi,
   yoksa yalnızca seçim sonrası mı?
4. **Aday künyesi** — oda adayları `room_candidates` satırlarından gelir;
   `MovieSummary`'ye dönüştürecek bir eşleme gerekir.

Bunların hepsi ürün kararı içerir ve ayrı bir dilim olarak ele alınmalıdır.

---

## 8. Yapılmayanlar

- Commit, push, deploy yapılmadı
- Dal değiştirilmedi (`feature/reusable-room-candidates` üzerinde kalındı)
- Migration uygulanmadı, Supabase'e bağlanılmadı
- `.env.local` okunmadı, yazdırılmadı
- Mevcut reusable-room SQL/backend davranışı değiştirilmedi
- Recommendation research dalı merge/cherry-pick edilmedi
- Yeni bağımlılık eklenmedi
- Görev dışı dosyalara dokunulmadı (kirli worktree'deki önceki faz değişiklikleri
  olduğu gibi korundu)

---

## 9. `git status --short`

```
 M .env.example
 M ROOM_SELECTION_AND_WHEEL_SETUP.md
 M docs/ROOMS_ARCHITECTURE.md
 M package-lock.json
 M package.json
 M src/components/MovieResultList.tsx
 M src/components/MovieSearch.tsx
 M src/components/ProviderPanel.tsx
 M src/components/rooms/RoomRound.tsx
 M src/lib/rooms/candidate-pipeline.test.ts
 M src/lib/rooms/candidate-pipeline.ts
 M src/lib/rooms/eligibility.test.ts
 M src/lib/rooms/eligibility.ts
 M src/lib/rooms/errors.ts
 M src/lib/rooms/polling-policy.test.ts
 M src/lib/rooms/polling-policy.ts
 M src/lib/rooms/reusable-round-migration.test.ts
 M src/lib/rooms/round-service.ts
 M src/lib/tmdb/client.ts
 M src/lib/tmdb/constants.ts
 M src/lib/tmdb/normalize.ts
 M src/lib/tmdb/types.ts
 M supabase/migrations/20260813000100_reusable_rounds.sql
?? WATCHMUSE_REUSABLE_ROOM_REMEDIATION_REPORT_2026-08-25.md
?? src/app/api/movies/[id]/route.ts
?? src/components/MovieDetailModal.tsx
?? src/components/ProviderAvailability.tsx
?? src/lib/rooms/db-integration-harness.test.ts
?? src/lib/supabase/admin.test.ts
?? src/lib/supabase/admin.ts
?? src/lib/tmdb/details.test.ts
?? src/lib/tmdb/details.ts
?? src/lib/ui/
?? supabase/tests/
```

> Not: `?? supabase/tests/`, `?? src/lib/supabase/admin*`, `?? WATCHMUSE_REUSABLE_ROOM_*`
> ve `M src/lib/rooms/*`, `M supabase/migrations/*`, `M docs/*` girdileri **önceki
> fazdan** (reusable room remediation) gelir; bu görevde onlara dokunulmadı.

## 10. `git diff --stat`

```
 .env.example                                       |  30 +-
 ROOM_SELECTION_AND_WHEEL_SETUP.md                  | 178 +++++++-
 docs/ROOMS_ARCHITECTURE.md                         | 192 +++++++-
 package-lock.json                                  |   6 +-
 package.json                                       |   3 +
 src/components/MovieResultList.tsx                 |   9 +-
 src/components/MovieSearch.tsx                     |  58 +--
 src/components/ProviderPanel.tsx                   | 158 +------
 src/components/rooms/RoomRound.tsx                 | 104 ++++-
 src/lib/rooms/candidate-pipeline.test.ts           |  48 ++
 src/lib/rooms/candidate-pipeline.ts                |  17 +
 src/lib/rooms/eligibility.test.ts                  |  60 ++-
 src/lib/rooms/eligibility.ts                       |  22 +-
 src/lib/rooms/errors.ts                            |   4 +
 src/lib/rooms/polling-policy.test.ts               |  55 ++-
 src/lib/rooms/polling-policy.ts                    |  38 +-
 src/lib/rooms/reusable-round-migration.test.ts     | 103 ++++-
 src/lib/rooms/round-service.ts                     |  60 ++-
 src/lib/tmdb/client.ts                             |  29 ++
 src/lib/tmdb/constants.ts                          |  15 +
 src/lib/tmdb/normalize.ts                          |  13 +
 src/lib/tmdb/types.ts                              |  27 ++
 .../migrations/20260813000100_reusable_rounds.sql  | 505 ++++++++++++---------
 23 files changed, 1259 insertions(+), 475 deletions(-)
```

Bu görevin kendi payı: `MovieResultList` (9), `MovieSearch` (58),
`ProviderPanel` (158), `tmdb/client` (29), `tmdb/constants` (15),
`tmdb/normalize` (13), `tmdb/types` (27) + yedi yeni dosya.

---

## 11. Verdict

Dilim tamamlandı ve bağımsız çalışıyor; beş doğrulamanın hepsi temiz. Tarayıcı
seviyesindeki kontroller §6'da açıkça NOT RUN olarak işaretlendi — bunlar yeni
bir test bağımlılığı gerektirdiği için kapsam dışıdır ve dilimin tamamlanmasını
engellemez.

**READY FOR LOCAL CHECKPOINT COMMIT**
