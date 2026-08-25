# WatchMuse — Reusable Room Implementation Report

**Tarih:** 12 Ağustos 2026  
**Dal:** `feature/reusable-room-candidates`  
**Başlangıç:** `ccce84b`  
**Durum:** Kod tamamlandı ve yerel statik/ünite/build kontrolleri geçti. Migration uygulanmadı; commit, push veya deploy yapılmadı.

> `.env.local` okunmadı veya değiştirilmedi. Bu raporda token, anahtar, Supabase
> proje referansı, davet bilgisi, çerez ya da kişisel veri yoktur.

## 1. Executive summary

WatchMuse odaları artık aynı iki katılımcı için kalıcı bir bağlam ve birden çok
append-only tur taşıyacak biçimde hazırlandı. Terminal turlar silinmez; adaylar,
oylar, kazananlar ve seçim kabul olayları gelecekteki eligibility/ranker
çalışmaları için saklanır.

Yeni aday politikası:

- 30 gün `skip + skip` suppression,
- 14 gün içinde bir kez priority-return (`want + want`, çarkta seçilmedi),
- açık 7 günlük seçili-film penceresi boyunca geçici suppression,
- pencere içinde en az bir acceptance varsa space için kalıcı suppression,
- acceptance yoksa deadline sonrası normal eligibility,
- önceki tur filmlerinden ek TMDb sayfalarıyla kaçınma,
- bounded son denemede yalnız uygun repeat,
- tam 10 benzersiz film ve en az bir discovery slotu.

Öneri prototipindeki sinyal tablosu/RPC'leri yeniden eklenmedi. Partner oyları,
kütüphane satırları, acceptance bilgisi ve suppression nedenleri istemciye
dönmez.

## 2. Dosyalar

### Değiştirilen

- `ROOM_SELECTION_AND_WHEEL_SETUP.md`
- `docs/ROOMS_ARCHITECTURE.md`
- `src/app/api/rooms/[spaceId]/round/route.ts`
- `src/components/rooms/RoomRound.tsx`
- `src/lib/rooms/errors.ts`
- `src/lib/rooms/errors.test.ts`
- `src/lib/rooms/round-service.ts`
- `src/lib/rooms/types.ts`
- `src/lib/tmdb/search.ts`
- `src/lib/tmdb/client.ts` (yalnız DEMO discover sayfalarını kalıcı turlara uygun çeşitlendirme)

### Oluşturulan

- `supabase/migrations/20260813000100_reusable_rounds.sql`
- `src/app/api/rooms/[spaceId]/selection/route.ts`
- `src/lib/rooms/candidate-pipeline.ts`
- `src/lib/rooms/candidate-pipeline.test.ts`
- `src/lib/rooms/eligibility.ts`
- `src/lib/rooms/eligibility.test.ts`
- `src/lib/rooms/polling-policy.ts`
- `src/lib/rooms/polling-policy.test.ts`
- `src/lib/rooms/reusable-round-migration.test.ts`
- `src/lib/rooms/round-service.test.ts`
- `src/lib/rooms/seeded-random.ts`
- `src/lib/rooms/seeded-random.test.ts`
- `WATCHMUSE_REUSABLE_ROOM_IMPLEMENTATION_REPORT.md`

Korunması istenen iki takip edilmeyen mimari belge silinmedi, yeniden
adlandırılmadı, üzerine yazılmadı veya stage edilmedi.

## 3. Kesin şema kararları

### `space_rounds`

- `unique(space_id)` kaldırılır.
- `round_number` eklenir ve `unique(space_id, round_number)` uygulanır.
- `selection_seed`, `selection_policy_version`, `ranker_version` zorunludur.
- `voting`, `matching`, `spinning` statülerine göre partial unique index, bir
  space'te en fazla bir aktif/non-terminal turu garanti eder.
- Legacy tek tur varsa `round_number=1` ve `legacy-*` metadata ile backfill edilir.

### `room_candidates`

- `selection_reason` eklenir.
- İzinli değerler check constraint ile sınırlıdır:
  `priority_return`, `fresh_discovery`, `eligible_repeat`, `backfill`.
- Mevcut `(round_id, position)` ve `(round_id, tmdb_movie_id)` benzersizlikleri
  korunur.

### Seçim olayları

`room_selections` şunları saklar:

- space, round ve winner candidate bağlantısı,
- TMDb movie ID,
- seçim zamanı,
- tam yedi günlük response deadline,
- ilk acceptance zamanı.

`room_selection_acceptances`:

- selection + user kabul olayını saklar,
- `unique(selection_id, user_id)` ile idempotenttir,
- kişisel library state'in kopyası değildir.

Acceptance sırasında aynı transaction içinde yalnız çağıranın
`library_items` kaydı upsert edilir. Mevcut `watched` kayıt watchlist'e geri
çekilmez. Kütüphane satırı sonradan silinse bile acceptance olayı kalır.

## 4. Candidate-rule implementation

Pipeline sınırları:

1. Next.js, kriptografik sunucu seed'i üretir.
2. Seed'li PRNG en fazla sekiz farklı TMDb discover sayfasını sıralar.
3. Kaynak normalize/tekilleştirilir ve değiştirilmez ranker boundary kontrolü yapılır.
4. `start_next_space_round` oda satırını kilitler.
5. Postgres kalıcı geçmişten hard suppression ve priority fırsatlarını hesaplar.
6. En eski priority fırsatları önce, en fazla dokuz slotta yerleştirilir.
7. Yalnız eligible discovery kümesi seed ile sıralanır.
8. Tam 10 benzersiz aday, metadata ve reason'larıyla atomik yazılır.

Hard eligibility bir future ranker tarafından atlanamaz; ranker yalnız SQL
filtrelerinden geçen kümede sıralama yapar. TMDb gelecekte değişebileceği için
seed tek başına replay garantisi değildir; kalıcı final 10 otoritatif audit
kaydıdır.

Priority fırsatı, sonraki bir candidate satırında `priority_return` reason'ı
görülerek tüketilir. Yeni appearance yeniden `want + want` olup seçilmezse yeni
bir fırsat doğabilir.

## 5. Cost/traffic improvements

Eski tur ekranı her durumda 1,2 saniye polling yapıyordu. Yeni politika:

- kullanıcı kartları aktif oylarken: sürekli polling yok,
- kendi 10 oyunu bitmiş ve partner bekleniyorsa: 3 saniye,
- `matching`: 3 saniye,
- `spinning`: 1,2 saniye,
- `result` ve `no_match`: polling durur.

State değişiminde timeout temizlenir ve in-flight fetch `AbortController` ile
iptal edilir. `get_space_round_state` normal okumalarda `FOR UPDATE` almaz;
yalnız süresi bitmiş `spinning → result` koşullu update'i kısa satır kilidi alır.
Realtime eklenmedi. Aday başına provider çağrısı eklenmedi.

## 6. Privacy ve RLS

- `room_votes` için doğrudan istemci policy'si hâlâ yoktur.
- `room_selections` ve `room_selection_acceptances` üzerinde RLS açık, doğrudan
  istemci policy'si yoktur.
- Yeni tablolarda `anon` ve `authenticated` tablo ayrıcalıkları geri alınır.
- Bütün yeni/değişen privileged RPC'ler `SECURITY DEFINER`, boş sabit
  `search_path`, şema nitelikli nesneler, internal `auth.uid()` ve space
  membership doğrulaması kullanır.
- Execute `public`/`anon` rollerinden geri alınır ve yalnız `authenticated`a verilir.
- Eski RPC imzası deployment uyumluluğu için korunur fakat gövdesi append-only
  `start_next_space_round` wrapper'ıdır; artık hiçbir geçmişi silmez.
- Round state yalnız çağıranın kendi oylarını ve kendi `myAccepted` değerini
  döndürür. Parser beklenmeyen kişi/sinyal alanlarını reddeder.
- Suppressed movie listesi, reason'ları, partner library veya vote counters için
  ayrı RPC yoktur.
- `SUPABASE_SERVICE_ROLE_KEY` eklenmedi; TMDb token server-only kaldı.

## 7. Test sonuçları

Son doğrulama sıralı çalıştırıldı:

| Komut | Sonuç |
| --- | --- |
| `npm run build` | PASS — Next.js 16.3 production build, yeni selection route dahil |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 19 dosya, 203 test |
| `npm audit --omit=dev` | PASS — 0 vulnerability |

Test kapsamı:

- both-skip 29/30/31 gün ve milisaniye sınırı,
- mixed outcome eligibility,
- kalıcı acceptance ve açık/expired 7 günlük pencere,
- priority 14 günlük sınır, tek tüketim ve ikinci kazanım,
- aynı seed/farklı seed davranışı,
- ranker'ın kaynak dışı ID ekleyememesi,
- çok sayfalı TMDb backfill ve bounded failure,
- eligible repeat'in yalnız son denemede açılması,
- polling durumları, timer cleanup ve abort,
- response parser'da benzersiz final adaylar ve partner alanlarının reddi,
- migration için append-only, partial unique, priority, acceptance ve privilege
  statik sözleşmeleri.

## 8. Veritabanında entegrasyon testi yapılmayanlar

Migration **Supabase'e uygulanmadı**. Bu nedenle aşağıdakiler çalıştırılarak
doğrulanmış değildir:

- SQL'in gerçek Supabase/Postgres üzerinde parse ve execution sonucu,
- RLS/GRANT/REVOKE davranışı,
- iki eşzamanlı `start_next_space_round` çağrısının gerçek kilit davranışı,
- acceptance ile yeni tur yarışının gerçek transaction sırası,
- trigger/foreign-key/check constraint davranışı,
- gerçek geçmiş verisi üzerinde 30/14/7 günlük sorguların sonucu.

Migration statik sözleşme testlerinden ve kod incelemesinden geçmiştir; bunlar
DB entegrasyon testi yerine geçmez.

## 9. Migration ve manuel uygulama sırası

Yeni dosya:

```text
supabase/migrations/20260813000100_reusable_rounds.sql
```

Uygulama sırası:

```text
20260811000100_rooms_schema.sql
20260811000200_rooms_rls.sql
20260811000300_rooms_functions.sql
20260812000100_profiles_and_library.sql
20260812000200_room_rounds_votes_and_wheel.sql
20260813000100_reusable_rounds.sql
```

Prototype `20260812000300_preference_signals.sql` uygulanmaz. Bu görevde hiçbir
migration uygulanmadı.

Rollback: migration-first rollout güvenlidir; eski RPC imzası append-only
wrapper olarak kalır ve geçmişi silmez. Yeni tur üretildikten sonra eski
`ccce84b` arayüzü yeni tur/selection özelliklerini gösteremeyeceğinden uzun
süreli rollback önerilmez. Önce yazımı durdurmak, yedek almak ve forward-fix
migration hazırlamak gerekir.

## 10. İki tarayıcı manuel test prosedürü

1. Migration'ı ayrı staging/test Supabase projesinde yukarıdaki sırada uygula.
2. Uygulama sunucusunu yeniden başlat.
3. Normal pencerede oda oluştur; gizli pencerede aynı davetle katıl.
4. İki tarafta aynı 10 film ve aynı sırayı doğrula.
5. Her iki tarafta 10 oyu tamamla; en az iki ortak `want` üret.
6. Oy sırasında sürekli network polling olmadığını, kendi oyları bitince yaklaşık
   3 saniyelik polling başladığını geliştirici araçlarından kontrol et.
7. Çarkı bir taraftan başlat; iki tarafta aynı çark ve sonucu doğrula.
8. Sonuçtan sonra iki tarafta aynı pending film ve yedi günlük deadline'ı gör.
9. Yalnız bir tarafta “İzleme listeme ekle” seç. Yalnız o kullanıcının
   kütüphanesinin değiştiğini doğrula; tekrarlanan tıklama ek satır üretmemeli.
10. Diğer tarafın kütüphanesinin değişmediğini ve partner acceptance bilgisinin
    API response'ta olmadığını doğrula.
11. Yeni 10 film başlat; `round_number` artmalı ve tur 1'in candidates/votes
    satırları kalmalıdır.
12. İki pencereden aynı anda yeni tur başlat; tek aktif tur ve aynı 10 film olmalı.
13. No-match turu oluşturup yeni tur başlat; no-match oyları geçmişte kalmalı.
14. Test verisinde ortak skip'i 29/30/31 gün sınırlarında kontrol et.
15. Ortak want olup seçilmeyen filmi 14 gün içinde sonraki turda
    `priority_return` olarak bir kez gör; tekrar tüketilmediğini doğrula.
16. Aynı yeni görünüm tekrar ortak want + kayıp üretirse yeni fırsat oluştuğunu doğrula.
17. Seçilen filmi hiç kabul etmeden deadline'ı geçir; sonraki istekte normal
    eligible olduğunu fakat zorunlu gelmediğini doğrula.
18. Acceptance sonrası kişisel library satırını sil; space suppression'ın
    acceptance event nedeniyle devam ettiğini doğrula.

## 11. Kalan riskler

- Gerçek DB integration testi yoktur; en önemli kalan risk budur.
- Event-query sorguları küçük portföy ölçeği için tasarlandı; gerçek ölçüm yoktur.
- TMDb discover cevapları zamanla değişir; final audit kaydı bu yüzden DB'deki
  persisted candidates'tır.
- İki kullanıcı terminal ekranda sürekli poll etmez; yeni tura geçmek için her
  kullanıcı aksiyona basabilir veya sayfayı yenileyebilir.
- Rate limiting/abuse koruması bu fazın dışında kaldı.
- Production migration geri alma yıkıcı SQL ile otomatikleştirilmedi; forward-fix
  yaklaşımı gerekir.

## 12. İstenen davranıştan farklar

- Ayrı bir client-callable eligibility RPC yazılmadı. Eligibility, suppression
  listesini dışarı vermemek ve priority tüketimini aynı kilitli transaction'da
  tutmak için `start_next_space_round` içinde hesaplanır.
- Saf `eligibility.ts`, SQL politikasının test edilebilir sözleşmesidir; production
  runtime'da partner/history verisini uygulama katmanına çekmez.
- DB entegrasyon testi mümkün olmadığı için SQL/RLS/concurrency “doğrulandı”
  olarak raporlanmadı.
- Bunun dışında specification'daki vote seçenekleri, library davranışı,
  reusable-room, cooldown, priority, seven-day acceptance, polling ve privacy
  kararları korunmuştur.

## 13. `git status --short`

```text
 M ROOM_SELECTION_AND_WHEEL_SETUP.md
 M docs/ROOMS_ARCHITECTURE.md
 M src/app/api/rooms/[spaceId]/round/route.ts
 M src/components/rooms/RoomRound.tsx
 M src/lib/rooms/errors.test.ts
 M src/lib/rooms/errors.ts
 M src/lib/rooms/round-service.ts
 M src/lib/rooms/types.ts
 M src/lib/tmdb/client.ts
 M src/lib/tmdb/search.ts
?? WATCHMUSE_CURRENT_ARCHITECTURE_AND_HANDOFF_2026-08-12.md
?? WATCHMUSE_REUSABLE_ROOM_CANDIDATE_ARCHITECTURE_AUDIT.md
?? WATCHMUSE_REUSABLE_ROOM_IMPLEMENTATION_REPORT.md
?? src/app/api/rooms/[spaceId]/selection/
?? src/lib/rooms/candidate-pipeline.test.ts
?? src/lib/rooms/candidate-pipeline.ts
?? src/lib/rooms/eligibility.test.ts
?? src/lib/rooms/eligibility.ts
?? src/lib/rooms/polling-policy.test.ts
?? src/lib/rooms/polling-policy.ts
?? src/lib/rooms/reusable-round-migration.test.ts
?? src/lib/rooms/round-service.test.ts
?? src/lib/rooms/seeded-random.test.ts
?? src/lib/rooms/seeded-random.ts
?? supabase/migrations/20260813000100_reusable_rounds.sql
```

## 14. `git diff --stat`

```text
 ROOM_SELECTION_AND_WHEEL_SETUP.md          |  77 +++++++++--
 docs/ROOMS_ARCHITECTURE.md                 | 112 +++++++++++++++-
 src/app/api/rooms/[spaceId]/round/route.ts |  29 ++--
 src/components/rooms/RoomRound.tsx         | 207 +++++++++++++++++++++++------
 src/lib/rooms/errors.test.ts               |   7 +
 src/lib/rooms/errors.ts                    |  10 ++
 src/lib/rooms/round-service.ts             | 115 ++++++++++++++--
 src/lib/rooms/types.ts                     |  16 +++
 src/lib/tmdb/client.ts                     |   8 +-
 src/lib/tmdb/search.ts                     |  16 ++-
 10 files changed, 506 insertions(+), 91 deletions(-)
```

`git diff --stat` takip edilmeyen yeni dosyaları doğal olarak saymaz; bunların
tam listesi §13 ve §2'de kayıtlıdır.
