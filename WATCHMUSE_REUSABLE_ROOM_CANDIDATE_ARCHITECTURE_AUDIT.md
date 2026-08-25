# WatchMuse — Reusable Room & Candidate Architecture Audit

**Tarih:** 12 Ağustos 2026
**Kapsam:** salt-okunur denetim. Hiçbir dosya değiştirilmedi, migration uygulanmadı, commit/push yapılmadı.
**Gizlilik:** `.env.local` okunmadı. Bu belgede token, proje referansı, veritabanı kimlik bilgisi, çerez, davet token'ı veya kişisel veri **yoktur**. Yalnızca ortam değişkeni **adları** geçer.
**Doğrulama sınırı:** Docker / Supabase CLI / psql bu makinede yok. **Hiçbir veritabanı davranışı (RLS, trigger, yarış koşulu) çalıştırılarak doğrulanmamıştır.** Tüm SQL iddiaları kod incelemesidir ve öyle etiketlenmiştir.

---

# 1. Executive verdict

### Mevcut 10 film gerçekten her turda farklı mı?

**HAYIR — ve sorun bundan daha temel: "her tur" diye bir şey yok.**

`supabase/migrations/20260812000200_room_rounds_votes_and_wheel.sql:31` satırında
`space_id` sütunu **`unique`**. Yani bir odada aynı anda yalnızca **bir**
`space_rounds` satırı bulunabilir. Yeni tur açmanın tek yolu eskisini silmektir
(`create_or_reset_space_round`, satır 176: `delete from public.space_rounds`).

Ayrıca yeni aday seti üretimi (`discoverRoomCandidates`, `src/lib/tmdb/search.ts`)
TMDb popülerlik listesinden **1–20 arası rastgele bir sayfa** çeker ve
**hiçbir geçmiş eleme uygulamaz**. Aynı sayfanın tekrar seçilme olasılığı 1/20'dir
ve farklı sayfalar bile popülerlik sıralaması nedeniyle örtüşebilir.

### Aynı space kalıcı çift bağlamı olarak güvenle kullanılabilir mi?

**EVET — ama yalnızca `spaces` + `participants` katmanı için.**

Bu iki tablo zaten kalıcıdır: katılımcılar tur bittikten sonra bağlı kalır, davet
tekrar gerekmez, `unique(space_id, role)` iki kişi garantisini verir.

**Tur katmanı ise kalıcı değildir** ve şema değişmeden yeniden kullanılamaz.

### Yeni bir `pairs` tablosu şimdi gerekli mi?

**HAYIR.**

`spaces` + `participants` zaten çift konteyneridir. `pairs` tablosu ancak *"aynı
iki kullanıcı **farklı** odalarda da aynı çift olarak tanınsın"* gereksinimi
olsaydı gerekirdi. Verdiğiniz ürün tanımı bunu istemiyor — "oda yeniden
kullanılabilir olsun" diyor. `pairs` eklemek bugün **karşılığı olmayan bir
dolaylılık** olur.

### Hangi mimari seçeneği öneriliyor?

**Option A — Event-query only**, minimum eksik olay eklenerek.

Gerekçe §7'de sayısallaştırılmış: bir odanın tüm geçmişi 50 tur sonunda bile
~500 aday + ~1.000 oy satırıdır. `space_id` indeksli tek bir sorgu bunu
önemsiz maliyetle tarar. Option B'nin trigger + bayat durum riski bu ölçekte
**karşılığı olmayan karmaşıklıktır**.

### Minimum şema eklemesi nedir?

**Tek yeni migration**, dört iş:
1. `space_rounds.space_id` üzerindeki `unique` kısıtını kaldır → çok tur
2. Tur oluşturmayı "sil ve yeniden yarat" yerine **"yeni satır ekle"** yap
3. `space_rounds`'a `selection_seed` + `selection_policy_version`, `room_candidates`'a `selection_reason` ekle
4. **Çift bazlı "birlikte izlendi" onay olayı** ekle (bugün hiç yok)

### Mevcut kodda baskın altyapı maliyeti nedir?

**Polling — TMDb değil.**

`src/components/rooms/RoomRound.tsx:16` → `POLL_INTERVAL_MS = 1200`.
Bir turda çift başına **300–1.000 istek** (§8), buna karşılık **1 TMDb isteği**.
Oran yaklaşık **300–1000 : 1**. TMDb maliyeti gürültü seviyesindedir.

### Commit edilmemiş öneri prototipine ne olmalı?

**Production'a gitmemeli.** Ayrı bir araştırma dalında saklanmalı.
İki RPC'si (`get_room_signal_facts`, `get_room_excluded_movies`) **partner
gizliliğini ihlal ediyor** (§11) — mevcut oda tasarımının bilinçli olarak
sakladığı bilgiyi çıkarım yoluyla açık ediyorlar. Bu haliyle uygulanamaz.

---

# 2. Production vs uncommitted working tree

| | Değer |
| --- | --- |
| Production commit | `ccce84b` — `feat: add shared room film selection` |
| Çalışma ağacı | `ccce84b` + commit edilmemiş öneri prototipi |
| Uygulanmış migration'lar | `…000100`, `…000200`, `…000300` (rooms), `20260812000100` (profiles+library), `20260812000200` (rounds) — handoff §9'a göre |
| Uygulanmamış migration | `20260812000300_preference_signals.sql` |

`git status --short`:

```
 M src/app/api/rooms/[spaceId]/round/route.ts
 M src/lib/tmdb/search.ts
?? WATCHMUSE_CURRENT_ARCHITECTURE_AND_HANDOFF_2026-08-12.md
?? docs/RECOMMENDATIONS.md
?? docs/RECOMMENDATIONS_OPEN_ISSUES.md
?? src/lib/recommendations/
?? supabase/migrations/20260812000300_preference_signals.sql
```

`git diff --stat`: 2 dosya, +27 / −3.

**İki kapsam net biçimde ayrıdır.** Production round route'u hâlâ
`discoverRoomCandidates()` çağırıyor; prototip onu `buildRoomCandidatePool()`
ile değiştiriyor.

### Handoff dokümanı ile kod uyumu

Handoff belgesindeki teknik iddiaları kodla karşılaştırdım. **Bulduğum tüm
iddialar doğrudur.** İki eksik vurgu var:

| Konu | Handoff | Kod gerçeği |
| --- | --- | --- |
| Tur sayısı | "no_match sonrası yeni aday turu" (§7) | `space_id unique` → oda başına **tek tur satırı**; `result` sonrası yeni tur **imkânsız** |
| Reset davranışı | belirtilmemiş | Reset **eski turu ve tüm oylarını siler** (cascade) |

Bu ikisi belgede eksik olduğu için, belgeyi okuyan biri odanın yeniden
kullanılabilir olduğunu varsayabilir. Değil.

---

# 3. Current round-generation trace

## Gerçek uygulama sırası (production, `ccce84b`)

```
[Tarayıcı] RoomRound.tsx
    │ POST /api/rooms/<spaceId>/round   (gövde: {} veya {reset:true})
    ▼
[Route] src/app/api/rooms/[spaceId]/round/route.ts
    │ 1. isRoomUuid(spaceId) — biçim kontrolü
    │ 2. reset değilse:
    │      getRoomRoundState(spaceId)
    │        └─► RPC get_space_round_state          ◄── DB okuma #1
    │      round varsa → 200 döndür, DUR
    │ 3. discoverRoomCandidates()
    │        └─► TMDb GET /discover/movie            ◄── TMDb isteği #1 (TEK)
    │ 4. initializeRoomRound(spaceId, candidates, reset)
    │        └─► RPC create_or_reset_space_round     ◄── DB yazma
    │ 5. getRoomRoundState(spaceId)
    │        └─► RPC get_space_round_state          ◄── DB okuma #2
    ▼
  201 + tur durumu
```

**Yeni tur başına toplam: 3 RPC + 1 TMDb isteği + 1 Vercel invocation.**

## Servis fonksiyonları

| Katman | Dosya | Fonksiyon |
| --- | --- | --- |
| Route | `src/app/api/rooms/[spaceId]/round/route.ts` | `GET`, `POST` |
| Servis | `src/lib/rooms/round-service.ts` | `getRoomRoundState`, `initializeRoomRound` |
| TMDb | `src/lib/tmdb/search.ts` | `discoverRoomCandidates`, `normalizeMovie` |
| İstemci | `src/lib/tmdb/client.ts` | `tmdbRequest` |

## RPC'ler

| RPC | Tip | Okuduğu tablolar | Yazdığı tablolar |
| --- | --- | --- | --- |
| `get_space_round_state` | SECURITY DEFINER | `participants`, `space_rounds`, `room_candidates`, `room_votes` | `space_rounds` (spinning→result geçişi) |
| `create_or_reset_space_round` | SECURITY DEFINER | `spaces`, `participants`, `space_rounds` | `space_rounds` (**DELETE + INSERT**), `room_candidates` (10 INSERT) |
| `cast_space_round_vote` | SECURITY DEFINER | `participants`, `space_rounds`, `room_candidates`, `room_votes` | `room_votes` (upsert), `space_rounds` (durum) |
| `start_space_round_wheel` | SECURITY DEFINER | `participants`, `space_rounds`, `room_candidates`, `room_votes` | `space_rounds` (kazanan + zaman) |

## 10 aday tam olarak nasıl elde ediliyor

`src/lib/tmdb/search.ts`, `discoverRoomCandidates()`:

```
page = 1 + floor(Math.random() * 20)          ← 1..20 arası tam sayı
GET /discover/movie
    language=tr-TR
    include_adult=false
    include_video=false
    sort_by=popularity.desc
    vote_count.gte=50
    page=<page>
→ results dizisi normalize edilir
→ Map ile tekilleştirilir
→ ilk 10'da durulur
→ 10'dan az ise Error("room_candidate_pool_incomplete") FIRLATIR
```

## Soru bazlı cevaplar

| Soru | Cevap | Kanıt |
| --- | --- | --- |
| TMDb discover sayfaları rastgele mi? | **Evet**, 1–20 | `search.ts` `Math.random() * 20` |
| Rastgelelik nasıl üretiliyor? | `Math.random()` — kriptografik değil, tohumlanabilir değil | aynı satır |
| Seed saklanıyor mu? | **HAYIR** | `space_rounds`'da seed sütunu yok (`…000200.sql:29-43`) |
| Yeni tur başına kaç TMDb isteği? | **Tam 1** | tek `tmdbRequest` çağrısı |
| İstekler önbellekleniyor mu? | **HAYIR** | `tmdbRequest` `cache:"no-store"`; TTL cache yalnızca `searchMovies` ve `providers.ts` için kurulmuş — discover **kapsam dışı** |
| Ardışık turlarda aynı filmler gelebilir mi? | **EVET** | 1/20 aynı sayfa + hiçbir geçmiş eleme yok |
| İzlenmiş/reddedilmiş filmler eleniyor mu? | **HAYIR** | discover'da filtre yok, RPC'de de yok |
| Tur içinde aynı TMDb ID iki kez olabilir mi? | **HAYIR** — 3 katmanlı koruma | TS `Map`; RPC `v_seen_ids` (satır 196); `unique(round_id, tmdb_movie_id)` (satır 58) |
| 10'dan az geçerli aday olursa? | **Hata fırlatılır**, tur açılmaz, yedek yok | `search.ts` `throw`; RPC `invalid_candidates` (satır 179) |
| Her aday için provider sorgulanıyor mu? | **HAYIR — 0 provider çağrısı** | `room_candidates` provider sütunu içermiyor; oda kodunda `getMovieWatchProviders` çağrısı yok (grep ile doğrulandı) |

> **Not:** Provider maliyeti tur akışında **sıfırdır**. Provider sorgusu yalnızca
> arama ekranında, kullanıcı bir film seçtiğinde çalışır ve 6 saatlik TTL
> önbelleğine sahiptir (`src/lib/tmdb/providers.ts`).

---

# 4. Current room/history behavior

| Soru | Cevap | Kanıt |
| --- | --- | --- |
| Aynı space birden çok tur oluşturabilir mi? | **HAYIR** | `space_rounds.space_id` **`unique`** — `…000200.sql:31` |
| Katılımcılar tur sonrası bağlı kalıyor mu? | **EVET** | `participants` satırı tura bağlı değil; `spaces`'e bağlı |
| Tamamlanmış tur saklanıyor mu? | **Kısmen** — tek tur satırı saklanır, ama bir sonraki reset onu **siler** | satır 176 |
| Tur oluşturma/sıfırlama geçmişi siliyor mu? | **EVET, tamamen** | `delete from space_rounds` → `room_candidates` ve `room_votes` **cascade** ile gider (satır 47, 64) |
| Eski turların oyları erişilebilir kalıyor mu? | **HAYIR** | cascade delete |
| Davet tekrar gerekiyor mu? | **HAYIR** | katılım kalıcı |
| Aynı iki auth kullanıcı yeni bir odada aynı çift olarak tanınır mı? | **HAYIR** | çift kimliği yalnızca `space_id` üzerinden |
| `space_id`'yi çift kimliği saymak güvenli mi? | **EVET**, hedeflenen akış için | `unique(space_id, user_id)` + `unique(space_id, role)` iki kişiyi garantiler |
| Ayrı `pairs` tablosu şimdi gerekli mi? | **HAYIR** | §1 gerekçesi |

## Tıkanma senaryosu (kod incelemesinden çıkarılan)

```
Tur açılır          status = voting
Oylar tamamlanır    status = matching   (ortak want varsa)
                 veya no_match          (yoksa)
Çark döner          status = spinning → result
```

`create_or_reset_space_round` satır 171:

```sql
if found and not (p_reset and v_round.status = 'no_match') then
  return v_round.id;   -- eski turu döndür
end if;
```

`status = 'result'` iken `p_reset = true` gönderilse bile koşul sağlanmaz →
**mevcut (bitmiş) tur döndürülür**. Yeni tur açılamaz.

**Sonuç:** başarılı bir çarktan sonra oda kalıcı olarak `result` durumunda kalır.
Yeniden kullanım için tek yol yeni bir oda + yeni davet oluşturmaktır.

> Bu bir kod-inceleme çıkarımıdır; canlı ortamda çalıştırılarak doğrulanmamıştır.

---

# 5. Gap table

| # | Madde | Durum |
| --- | --- | --- |
| 1 | Her turda farklı 10 film | **NOT IMPLEMENTED** — çapraz-tur eleme yok; zaten çok tur yok |
| 2 | Tur içinde duplike aday olmaması | **WORKING** — 3 katmanlı |
| 3 | 30 gün "izlendi" bastırma | **NOT IMPLEMENTED** |
| 4 | 30 gün "iki taraf da skip" bastırma | **NOT IMPLEMENTED** |
| 5 | Karışık karar (skip + maybe/want) uygunluğu | **NOT IMPLEMENTED** |
| 6 | 14 gün "iki taraf da want" öncelikli dönüş | **NOT IMPLEMENTED** |
| 7 | Öncelikli dönüşün tek kez tüketilmesi | **NOT IMPLEMENTED** |
| 8 | Space'in çok turda yeniden kullanılabilmesi | **NOT IMPLEMENTED** — `unique` + `DELETE` |
| 9 | Çift bazlı izleme onayı | **NOT IMPLEMENTED** — hiçbir tablo/sütun yok |
| 10 | Tohumlanmış, tekrarlanabilir rastgelelik | **NOT IMPLEMENTED** — `Math.random()`, seed saklanmıyor |
| 11 | Saklanan seçim politikası sürümü | **NOT IMPLEMENTED** |
| 12 | Gelecek ranker sınırı | **PARTIALLY WORKING** — prototipte şekil var (`selectCandidatePool`), production'da yok, prototip commit edilmemiş |
| 13 | Production uçtan uca doğrulama | **CANNOT VERIFY** — handoff §10: canlı URL'de iki kişilik tur *"yeniden test edilmeli"*, kayıtlı kanıt yok |

---

# 6. Existing-data sufficiency

Her kural için **mevcut** kaynak satır/alan:

| Gereken bilgi | Mevcut kaynak | Yeterli mi? |
| --- | --- | --- |
| İki taraf da skip | `room_votes.choice='skip'`, aynı `candidate_id`, 2 farklı `user_id` | **Hesaplanabilir** — ama yalnızca **aktif tur** için; reset silince kaybolur |
| Karışık karar | aynı kaynak, choice kombinasyonu | **Hesaplanabilir** — aynı sınırlama |
| İki taraf da want | aynı kaynak — `cast_space_round_vote:274-279` bunu zaten sayıyor | **Hesaplanabilir** — aynı sınırlama |
| Çark kazananı | `space_rounds.winner_candidate_id` | **Var** — ama tek tur; reset silince kaybolur |
| Seçilmiş ama izlendiği onaylanmamış | — | **YOK** |
| Birlikte izlendiği onaylanmış | — | **YOK** |
| Son gösterim zamanı | `room_candidates.created_at` (tur satırı üzerinden) | **Var** — ama reset silince kaybolur |
| Son ortak karar zamanı | `room_votes.updated_at` | **Var** — ama reset silince kaybolur |
| Öncelikli dönüş tüketildi mi | — | **YOK** |

## Özet

**Mevcut şemada hiçbir kural güvenilir biçimde hesaplanamaz.** Sebep tek başına
eksik alan değil, **saklama modeli**:

1. Oda başına tek tur satırı var (`unique`)
2. Yeni tur açmak eskisini **siliyor** (cascade ile oylar dahil)

Yani veri var ama **kalıcı değil**. Kuralların hepsi geçmiş turlar arası
karşılaştırma gerektiriyor; o geçmiş bugün tutulmuyor.

## "Birlikte izlendi" olayı — kritik eksik

**Bugün böyle bir olay yoktur.**

`library_items.status = 'watched'` (`20260812000100_profiles_and_library.sql`)
**kişiseldir** ve `unique(user_id, tmdb_movie_id)` ile kullanıcıya bağlıdır.
Bunu çiftin birlikte izlediğinin kanıtı saymak **yanlış olur**:

- Kullanıcı filmi tek başına, odadan bağımsız izlemiş olabilir
- Odada seçilmiş ama izlenmemiş olabilir (çark döndü, film izlenmedi)
- İki kullanıcıdan yalnızca biri işaretlemiş olabilir

Handoff §11 bunu doğruluyor: *"Oda turu sonucu kişisel kütüphaneye otomatik
izlendi olarak yazılmaz."*

**Kural 2 (30 gün izlendi bastırma) için açık, çift bazlı ve kasıtlı bir onay
olayı gereklidir.** Bu, §13'teki migration'ın zorunlu parçasıdır.

---

# 7. Option A / B / C comparison

Üç seçenek de §5'teki 8. maddeyi (çok turlu oda) **zorunlu ön koşul** olarak
kabul eder; fark, uygunluk/cooldown hesabının nerede yaşadığıdır.

| Ölçüt | **A — Event-query** | **B — Materialized state** | **C — Hybrid** |
| --- | --- | --- | --- |
| Şema karmaşıklığı | Düşük | Orta | Orta-yüksek |
| Migration karmaşıklığı | 1 migration | 1 migration + trigger seti | 1 migration + kısmi trigger |
| Yeni tablo | **1** (izleme onayı) | 2 (onay + `space_movie_state`) | 2 |
| Yeni fonksiyon | 1 uygunluk RPC + tur açma RPC güncellemesi | + upsert fonksiyonu | + upsert + rebuild |
| Yeni trigger | **0** | 3–4 | 1–2 |
| Tur başına okuma | 1 uygunluk sorgusu (oda geçmişi taraması) | 1 indeksli lookup | 1 indeksli lookup |
| Tamamlanan tur başına yazma | ~31 satır (bugünküyle aynı) | ~31 + 10–20 upsert | ~31 + 10 upsert |
| Sorgu şekli | `space_rounds ⋈ room_candidates ⋈ room_votes`, `space_id` filtreli, `tmdb_movie_id` grupla | `space_movie_state` üzerinde `(space_id, suppress_until)` | karma |
| Gereken indeks | `space_rounds(space_id)`, `room_candidates(round_id)` ✔, `room_votes(round_id, candidate_id)` ✔ | + `space_movie_state(space_id, suppress_until)` | her ikisi |
| Eşzamanlılık doğruluğu | **Yüksek** — tek sorgu, türetilmiş durum yok | Orta — upsert yarışları, trigger sırası | Orta |
| Bayat durum riski | **Yok** | **Var** — kaçırılan yol = sessiz yanlış öneri | Var (daha dar) |
| Hata ayıklama kolaylığı | **Yüksek** — tek sorgu çalıştırılır | Düşük — iki kaynak karşılaştırılır | Orta |
| Durumu yeniden kurma | **Gereksiz** (kaynak zaten olay) | Rebuild fonksiyonu şart | Rebuild şart |
| Küçük portföy uygulamasına uygunluk | **Çok uygun** | Aşırı | Fazla |
| Gelecek kural/ML uygunluğu | **Yüksek** — ham olaylar korunur | Yüksek (olaylar da tutulursa) | Yüksek |
| Gizlilik yüzeyi | Düşük — RPC yalnızca ortak sonuç döner | Aynı, ama tablo daha fazla türetilmiş bilgi tutar | Aynı |
| Bakım yükü | **Düşük** | Yüksek (trigger'lar ürün kuralı değişince güncellenmeli) | Orta-yüksek |
| Geri alınabilirlik | **Kolay** — RPC'yi eski haline döndür | Zor — tablo doldurulmuş olur | Orta |
| Eğitim verisi korunuyor mu | **Evet** | Evet | Evet |

## Ölçek gerçeği (A'nın maliyeti)

Bir odanın **tüm ömrü** boyunca biriken satır:

```
50 tur × 10 aday  =    500 room_candidates satırı
50 tur × 20 oy    =  1.000 room_votes satırı
50 tur            =     50 space_rounds satırı
                     ─────
                     ~1.550 satır / oda
```

`space_id` indeksli bir sorgu için bu **önemsizdir**. Option B'nin sunduğu
"indeksli lookup" avantajı, taranan veri zaten küçük olduğu için gerçek bir
kazanç sağlamaz — buna karşılık trigger bakımı ve bayat durum riski getirir.

## Karar

> ## **Option A önerilir.**

Maliyet ve basitlik açıkça A'yı işaret ediyor. B'nin tek gerçek avantajı (sabit
zamanlı okuma) bu ölçekte ölçülemez; dezavantajları (trigger karmaşıklığı, bayat
durum, zor hata ayıklama) ise somuttur.

**C'ye kapı açık bırakılmalı:** ileride profil gerçekten yavaş uygunluk sorgusu
gösterirse, aynı olaylardan türetilen küçük bir indeks tablosu **sonradan**
eklenebilir. Olaylar kaynak olarak kaldığı için bu geçiş yıkıcı değildir ve
tarihsel veri yeniden toplanmasını gerektirmez (gereksinim 10 karşılanır).

---

# 8. Cost and scale model

> **Parasal tahmin yapılmamıştır.** Yapılandırılmış planlardan doğrulanamayan
> hiçbir fiyat iddiası bu belgede yoktur. Tüm ölçümler **işlem / istek / satır**
> cinsindendir.

## Varsayımlar (açıkça belirtilmiştir)

| Varsayım | Değer | Kaynak |
| --- | --- | --- |
| Tur süresi | **3–10 dakika** | **Kullanıcı tarafından belirlenen aralık; gerçek kullanım verisi yok** |
| Tur başına katılımcı | 2 | Şema garantisi |
| Aday sayısı | 10 | `candidate_count = 10` kısıtı |
| Round polling | 1,2 sn | `RoomRound.tsx:16` |
| Bekleme odası polling | 5 sn | `RoomWaiting.tsx:12` |
| Bekleme süresi | modellenmedi (değişken) | — |

## Formüller

```
polling_istek/tur      = 2 × (tur_süresi_sn ÷ poll_aralığı_sn)
oy_isteği/tur          = 2 × 10 = 20
tur_açma_isteği/tur    = 1        (3 RPC + 1 TMDb içerir)
çark_isteği/tur        ≈ 1–2
Vercel_invocation/tur  = polling + oy + tur_açma + çark
RPC/tur                = polling + oy + 3 (tur açma) + 1–2 (çark)
TMDb/tur               = 1
satır/tur              = 1 (round) + 10 (candidates) + 20 (votes) ≈ 31
```

**1,2 sn polling, tur başına:**
- 3 dk → `2 × (180 ÷ 1,2)` = **300**
- 10 dk → `2 × (600 ÷ 1,2)` = **1.000**

## Senaryo tabloları

### Aylık hacim

| | Small | Medium | Growth |
| --- | --- | --- | --- |
| Oda sayısı | 10 | 1.000 | 10.000 |
| Tur/oda/ay | 2 | 4 | 8 |
| **Yeni tur/ay** | **20** | **4.000** | **80.000** |

### Supabase — RPC yürütmesi (okuma ağırlıklı)

| | Small | Medium | Growth |
| --- | --- | --- | --- |
| Polling RPC | 6.000 – 20.000 | 1,20M – 4,00M | 24,0M – 80,0M |
| Oy RPC | 400 | 80.000 | 1,60M |
| Tur açma RPC (×3) | 60 | 12.000 | 240.000 |
| Çark RPC | 20 – 40 | 4.000 – 8.000 | 80.000 – 160.000 |
| **Toplam RPC/ay** | **~6.500 – 20.500** | **~1,30M – 4,10M** | **~25,9M – 82,0M** |

> Polling toplam RPC'nin **%92–98'ini** oluşturuyor.

### Supabase — yazma

| | Small | Medium | Growth |
| --- | --- | --- | --- |
| Eklenen satır/ay | ~620 | ~124.000 | ~2,48M |
| Eklenen satır/yıl | ~7.400 | ~1,49M | ~29,8M |
| Güncelleme/ay (durum + oy değişimi) | ~100 | ~20.000 | ~400.000 |

**Depolamayı domine eden tablolar:** `room_votes` (tur başına 20 satır → yıllık
toplamın ~%65'i), ardından `room_candidates` (10 satır → ~%32). `space_rounds`
ihmal edilebilir.

### Vercel route invocation

| | Small | Medium | Growth |
| --- | --- | --- | --- |
| Invocation/ay | ~6.500 – 20.500 | ~1,30M – 4,10M | ~25,9M – 82,0M |

(RPC sayısıyla neredeyse birebir; her polling isteği 1 route invocation'dır.)

### TMDb

| | Small | Medium | Growth |
| --- | --- | --- | --- |
| İstek/ay | **20** | **4.000** | **80.000** |

> TMDb'nin güncel oran sınırı bu denetimde **doğrulanmadı**; hafızadan sayı
> vermiyorum. Önbelleklemenin **hiç olmaması** (discover `no-store`) not
> edilmelidir: aynı sayfa arka arkaya çekilse bile her seferinde ağ isteği olur.

## Polling karşılaştırması

Tur başına istek (2 kullanıcı, 3–10 dk):

| Yöntem | İstek/tur | Growth senaryosunda aylık | Azalma |
| --- | --- | --- | --- |
| **1,2 sn (mevcut)** | 300 – 1.000 | 24,0M – 80,0M | — |
| **3,0 sn** | 120 – 400 | 9,6M – 32,0M | **%60** |
| **Supabase Realtime** | ~2 abonelik + ~25–40 olay mesajı | ~2,0M – 3,2M mesaj + 160K bağlantı | **>%95** |

### Realtime önerilmeli mi?

**Small ve Medium için: hayır.**
`1200` → `3000` tek satırlık bir değişikliktir (`RoomRound.tsx:16`), yeni altyapı
gerektirmez ve istek sayısını %60 düşürür. Kullanıcı deneyimine etkisi sınırlıdır
— oy sonucu 1,2 sn yerine 3 sn'de görünür.

**Growth için: değerlendirilmeli.** 24–80M invocation/ay bu ölçekte baskın
maliyettir ve Realtime bunu >%95 düşürür. Ancak Realtime kalıcı WebSocket
bağlantısı, yeniden bağlanma mantığı ve ayrı bir yetkilendirme yüzeyi getirir.

**Ara adım (önerilen):** çark animasyonu sırasında 1,2 sn, bekleme/oylama
sırasında 3 sn — durum bazlı aralık. Tek dosyada, altyapı değişikliği olmadan.

## Depolamadan önce gelen operasyonel darboğaz

Growth senaryosunda **29,8M satır/yıl** Postgres için sorun değildir
(uygun indekslerle rahat yönetilir).

**Gerçek darboğaz sırası:**

1. **Vercel function invocation sayısı** (25,9M–82,0M/ay) — polling kaynaklı
2. **`get_space_round_state` içindeki satır kilidi** — bu fonksiyon her çağrıda
   `select … from space_rounds … for update` alıyor (`…000200.sql:364`).
   Tur başına 300–1.000 kilit; iki kullanıcı aynı satırı hedefliyor →
   **serileşme**. Bu, ölçek büyüdükçe gecikme olarak görünür.
3. Supabase bağlantı havuzu
4. Depolama — en son

> **Öneri:** `get_space_round_state` salt-okunur bir yol için `FOR UPDATE`
> kullanmamalı. Kilit yalnızca `spinning → result` geçişini yazacağı durumda
> gereklidir; bu, koşullu bir yola ayrılabilir. Bu **tek başına** en yüksek
> getirili teknik düzeltmedir.

---

# 9. Recommended minimal architecture

**Option A + tek migration.**

## Şema değişikliği (minimum)

| İş | Neden zorunlu |
| --- | --- |
| `space_rounds.space_id` üzerindeki `unique` kısıtını kaldır | Çok turlu oda için tek engel |
| `space_rounds`'a `round_number` (veya `created_at` sıralaması) + terminal durum | Turları ayırt etmek |
| Tur açmayı `DELETE`+`INSERT` yerine **sadece `INSERT`** yap | Geçmişin korunması — tüm kuralların ön koşulu |
| `space_rounds`: `selection_seed`, `selection_policy_version` | Tekrarlanabilirlik + gelecek ranker sürümleme |
| `room_candidates`: `selection_reason` | Neden seçildiği; ML etiketi |
| **Yeni tablo:** çift bazlı izleme onayı | Kural 2'nin tek kaynağı; bugün yok |

## Uygunluk hesabı

Tek bir SECURITY DEFINER RPC, tur açılmadan **önce** çağrılır ve odanın geçmişini
`tmdb_movie_id` bazında özetler:

```
her film için →  son_ortak_sonuç ∈ {both_skip, mixed, both_want, selected, watched}
                 son_gösterim_zamanı
                 son_ortak_karar_zamanı
                 öncelikli_dönüş_hakkı_var_mı
```

Bu çıktı **kişi bazlı bilgi içermez** (§12). Uygulama katmanı bu listeyi alır,
sert kuralları uygular ve kalan slotları TMDb keşfiyle doldurur.

## Bu mimarinin karşıladığı kurallar

| Kural | Nasıl |
| --- | --- |
| 1. Yeniden kullanılabilir oda | `unique` kaldırıldı, tur eklenerek açılıyor |
| 2. 30 gün izlendi bastırma | izleme onayı tablosu + `now() - confirmed_at < 30d` |
| 3. 30 gün iki-taraf-skip | `room_votes` üzerinden ortak sonuç + `updated_at` |
| 4. Karışık karar bastırılmaz | ortak sonuç `mixed` ise bastırma uygulanmaz |
| 5-6. 14 gün öncelikli dönüş, tek sefer | ortak sonuç `both_want` + kazanan değil → `selection_reason='priority_return'` ile **bir kez** yerleştirilir; bir sonraki turda aynı film için bu etiket zaten kullanılmış olur |
| 7. Tam 10 benzersiz film | mevcut 3 katmanlı koruma korunur |
| 8. Ranker sınırı | §10 |

---

# 10. Future ranker boundary

## Boru hattı (yalnızca arayüz düzeyi — uygulanmadı)

```
1. CANDIDATE SOURCING        → ham aday akışı (TMDb discover, ileride kütüphane/tür)
2. HARD ELIGIBILITY FILTER   → ★ SQL'de, atlanamaz
3. MANDATORY / PRIORITY      → ★ deterministik yerleştirme
4. RANKING STRATEGY          → değiştirilebilir (bugün: kimlik/rastgele)
5. DIVERSITY SELECTION       → tohumlanmış rastgelelik
6. PERSISTENCE OF FINAL 10   → ★ deterministik + atomik
```

## Hangi adımlar deterministik kalmalı

| Adım | Deterministik? | Gerekçe |
| --- | --- | --- |
| 1. Sourcing | Hayır | Ağ + tohumlanmış sayfa seçimi |
| **2. Eligibility** | **EVET — zorunlu** | Ürün kuralı; ranker'ın atlayamayacağı tek nokta |
| **3. Priority return** | **EVET — zorunlu** | "Tek sefer" garantisi |
| 4. Ranking | Hayır | Bugün rastgele, yarın ML |
| 5. Diversity | Tohumlanmış | Aynı seed → aynı sonuç |
| **6. Persistence** | **EVET** | Aynı 10, aynı sıra, iki kullanıcıya |

## Tohumlanmış rastgelelik nerede

- **Adım 1:** TMDb sayfa seçimi → seed'den türetilir
- **Adım 5:** eşitlik bozma ve çeşitlilik → aynı seed
- **Adım 4'te asla değil:** ranker skor döndürür, rastgelelik uygulamaz

## Saklanacak metadata

| Alan | Yer | Amaç |
| --- | --- | --- |
| `selection_seed` | `space_rounds` | Turu birebir yeniden üretebilmek |
| `selection_policy_version` | `space_rounds` | Hangi sert kural setinin uygulandığı |
| `ranker_version` | `space_rounds` | Hangi sıralama modelinin çalıştığı (bugün `"none"`) |
| `selection_reason` | `room_candidates` | Filmin neden geldiği |
| `position` | `room_candidates` ✔ zaten var | Sıra etkisi (ML'de konum yanlılığı) |

## `selection_reason` değerleri (önerilen)

```
priority_return    → both_want ama çark seçmedi, 14 gün içinde dönüş hakkı
ranked             → ranker sıralamasından geldi
discover_seed      → TMDb keşfinden, tohumlanmış sayfa
backfill           → havuz dolmadı, doldurma
```

## Gelecek ranker cooldown'ı nasıl atlayamaz

**Sözleşme:** ranker'a **yalnızca uygunluk filtresinden geçmiş küme** verilir ve
ranker **yalnızca sıralama döndürür — kümeye ID ekleyemez**.

```
eligible_ids = SQL_eligibility(space_id)     ← ranker bunu göremez/değiştiremez
ranked       = ranker.rank(eligible_ids)     ← yalnızca sıralar
final        = take_unique_10(priority ++ ranked)
assert final ⊆ eligible_ids                  ← kalıcılaştırmadan önce doğrulanır
```

Son satır kritik: kalıcılaştırma adımı, ranker çıktısının uygun küme içinde
kaldığını **doğrular**. Bir ranker hatası kuralı ihlal edemez.

## Mevcut kodda kullanılabilir soyutlama var mı

| Yer | Değerlendirme |
| --- | --- |
| `discoverRoomCandidates()` | Adım 1'in embriyosu — parametresiz, seed almıyor |
| `initializeRoomRound()` | Adım 6'nın karşılığı — **iyi konumlanmış**, doğrulama burada yapılabilir |
| `create_or_reset_space_round` RPC | Atomik kalıcılaştırma + kilit — **korunmalı** |
| Prototip `selectCandidatePool()` | Adım 3+5'in şekli doğru, **ama eleme TS'te** — atlanabilir, bu yüzden yeniden konumlanmalı |

## Şimdi gereken minimum refactor

1. `discoverRoomCandidates(seed, count)` — seed parametresi al, sayfayı ondan türet
2. Yeni `buildRoundCandidates(spaceId)` — boru hattının 6 adımını sırayla çağıran tek giriş noktası
3. Uygunluk **SQL'e** taşınır (yeni RPC)
4. `initializeRoomRound` çağrısına seed + policy version + reason eklenir

**Boru hattı bu denetimde uygulanmadı.**

---

# 11. Recommendation prototype disposition

## Sınıflandırma

| Parça | Karar | Gerekçe |
| --- | --- | --- |
| `weights.ts` | **KEEP FOR LATER** | Ayarların tek yerde toplanması doğru; değerler tahmin |
| `scoring.ts` — saf fonksiyonlar + 24 test | **KEEP FOR LATER** | Sıralama/havuz şekli yeniden kullanılabilir |
| `scoring.ts` — eleme mantığı | **REDESIGN** | Eleme TS'te; ranker atlayabilir. SQL'e taşınmalı (§10) |
| `service.ts` | **REDESIGN** | Sessiz fallback + TS tarafı eleme |
| `user_movie_signals` tablosu | **REDESIGN** | Kişisel + oda sinyalleri aynı tabloda; gizlilik sınırı belirsiz |
| `handle_room_vote_signal` trigger | **KEEP FOR LATER** | Fikir doğru |
| `handle_library_signal` trigger | **KEEP FOR LATER** | Fikir doğru |
| `handle_candidate_shown_signal` trigger | **REDESIGN** | Sınırsız `occurrence_count`; tur açma transaction'ına 20 upsert ekliyor |
| **`get_room_signal_facts` RPC** | **REDESIGN — gizlilik ihlali** | Aşağıya bakınız |
| **`get_room_excluded_movies` RPC** | **REDESIGN — gizlilik ihlali** | Aşağıya bakınız |
| Shown-count cezası | **REDESIGN** | `shownCount × 12` sınırsız büyür; film kalıcı olarak ölür |
| Kütüphane puanları (`ratingBonusPerPoint`) | **DISCARD (bu haliyle)** | Yapısal olarak ölü — aşağıya bakınız |
| `round/route.ts` değişikliği | **DISCARD** | HEAD'e döndürülmeli |
| `fetchMovieSummaryById` (`search.ts`) | **REUSE NOW** | Bağımsız, faydalı, öneri katmanına bağlı değil |
| `docs/RECOMMENDATIONS*.md` | **KEEP FOR LATER** | Karar geçmişi |

## ⚠️ Gizlilik sızıntısı — en ciddi bulgu

Mevcut oda tasarımı partner oylarını **bilinçli olarak** gizliyor
(`…000200.sql:118-120`: *"room_votes için politika BİLİNÇLİ olarak yoktur"*).

Prototipin iki RPC'si bunu **çıkarım yoluyla geri açıyor**:

**`get_room_signal_facts`** — çiftin **toplam** sayılarını döndürüyor
(`want_count`, `maybe_count`, `skip_count`, `watchlist_count`, `avg_rating`).

```
Kullanıcı kendi sinyalini zaten bilir.
toplam − kendi = partnerin sinyali
```

Örnek: `want_count = 1` dönüyor ve ben "want" demedim → **partner o filme want
demiş**. Tek bir çıkarma işlemi partnerin gizli oyunu açığa çıkarıyor.

**`get_room_excluded_movies`** — iki kullanıcının **izlediği** filmlerin
birleşimini döndürüyor. Kendi izlediklerimi bildiğim için **kalan her ID
partnerin izleme geçmişidir**. Bu, kişisel kütüphanenin doğrudan sızmasıdır.

**Sonuç:** bu iki RPC mevcut haliyle **uygulanmamalıdır**. Doğru tasarım, ham/
toplam olguyu istemciye hiç döndürmemek; nihai aday setini **tamamen sunucuda**
kurup yalnızca onu döndürmektir.

## ⚠️ Puanlar yapısal olarak ölü

```
Puan vermek için  → filmi izlemiş olmak gerekir
İzlenen filmler   → havuzdan kesin elenir
────────────────────────────────────────────
Puanlı hiçbir film aday olamaz → avg_rating pratikte daima null
```

`ratingBonusPerPoint` hiçbir zaman çalışmaz. Puanların anlam kazanması için
**film kimliği değil içerik özelliği** (tür/kişi) profili gerekir. Bu, prototipin
kapsamı dışındadır ve handoff §14.2 ile `docs/RECOMMENDATIONS_OPEN_ISSUES.md`
§2'de zaten kayıtlıdır.

## Prototipi güvenle saklama — önerilen yöntem

**Öneri: production dışı bir dalda commit.**

```
research/recommendation-prototype
```

Gerekçe:

| Yöntem | Değerlendirme |
| --- | --- |
| `git stash` | Kırılgan — stash listesi kolayca kaybolur, gözden geçirilemez |
| `.patch` dosyası | Takip edilmeyen dosyaları elle eklemek gerekir; çürür |
| **Araştırma dalı + commit** | **Önerilen** — tam, gözden geçirilebilir, `main`'i etkilemez, `git diff main..research/…` ile karşılaştırılabilir |

Dala alınması gerekenler: `src/lib/recommendations/`,
`supabase/migrations/20260812000300_preference_signals.sql`,
`docs/RECOMMENDATIONS*.md` ve iki değişmiş dosya.

Ardından `main` çalışma ağacı temizlenmeli; `fetchMovieSummaryById` istenirse
ayrı ve küçük bir commit olarak `main`'e alınabilir.

> **Hiçbir git komutu çalıştırılmadı.** Bunlar öneridir.

---

# 12. Security and concurrency requirements

Önerilen yeni SQL/RPC tasarımı için zorunlu gereksinimler:

## RLS

| Tablo | Politika |
| --- | --- |
| `space_rounds` | Mevcut `select` politikası korunur (katılımcı) |
| `room_candidates` | Mevcut korunur |
| `room_votes` | **Politika eklenmemeli** — mevcut "hiç politika yok" durumu korunmalı |
| Yeni izleme onayı tablosu | `select`: yalnızca odanın katılımcıları; `insert/update/delete`: **politika yok**, yalnızca RPC |

## SECURITY DEFINER gereksinimleri

Uygunluk RPC'si ve tur açma RPC'si `SECURITY DEFINER` **olmak zorundadır**
(iki kullanıcının oylarını okumaları gerekir). Zorunlu sertleştirme:

- `set search_path = ''`
- Tüm nesneler şema nitelikli (`public.…`, `auth.…`)
- `auth.uid()` fonksiyon **içinde** doğrulanır
- `revoke all … from public, anon`
- `grant execute … to authenticated`

Bu kalıp mevcut RPC'lerde zaten uygulanıyor (`…000200.sql:423-430`) ve korunmalı.

## Kullanıcının odaya ait olduğu nasıl kanıtlanır

Her RPC'nin ilk işi:

```
auth.uid() IS NOT NULL  →  değilse 'unauthenticated'
EXISTS(participants WHERE space_id = ? AND user_id = auth.uid())
                        →  değilse 'invalid_invitation'  (varlık bilgisi sızdırmaz)
```

Bu, mevcut dört RPC'nin tamamında zaten var.

## Partner oyları nasıl gizli kalır

- `room_votes` istemciye **hiç** açılmaz
- Uygunluk RPC'si **kişi bazlı satır döndürmez** — yalnızca **ortak sonuç
  etiketi** (`both_skip` / `mixed` / `both_want`) ve zaman damgaları
- **Sayaç döndürülmez.** `want_count = 1` gibi bir değer bile çıkarım yoluyla
  partnerin oyunu açık eder (§11). Yalnızca kategorik ortak sonuç dönmelidir.

## Dönen adaylar partnerin bireysel geçmişini nasıl ele vermez

- Uygunluk çıktısı yalnızca **bu odada gösterilmiş** filmleri kapsar; partnerin
  kişisel kütüphanesi kaynak olarak kullanılmaz
- Bastırılan filmler istemciye **hiç gösterilmez** — "şu film elendi" bilgisi
  bile dönmez; kullanıcı yalnızca nihai 10 filmi görür
- Bir filmin neden gelmediği istemciden **gözlemlenemez** olmalıdır

## Eşzamanlılık — iki istemci aynı anda yeni tur açarsa

Mevcut kalıp korunmalı ve genişletilmeli:

```
select … from public.spaces where id = p_space_id for update;   -- oda kilidi
-- aktif (terminal olmayan) tur var mı?
--   varsa → onun id'sini döndür (yeni tur AÇMA)
--   yoksa → yeni tur satırı ekle
```

Oda satırı kilidi iki eşzamanlı isteği serileştirir; ikinci istek birincinin
turunu görür ve onu döndürür. Bu, bugünkü `create_or_reset_space_round`
davranışıyla aynı ilkedir (satır 155, 170).

**Ek gereksinim:** "aktif tur" tanımı net olmalı. `result` artık terminal
sayılacağı için, `result` durumundaki bir tur yeni tur açılmasını
engellememelidir — bugünkü tıkanmanın kaynağı budur (§4).

## Idempotency

- `POST /round` aynı space için tekrar çağrıldığında **yeni tur açmamalı**;
  aktif tur varsa onu döndürmeli (bugünkü davranış doğru)
- İzleme onayı **idempotent** olmalı: aynı (space, film) için ikinci onay
  yeni satır üretmemeli veya `confirmed_at`'i ilerletmemeli
- Öncelikli dönüş **tam olarak bir kez** tüketilmeli; bu, `selection_reason`
  sorgusuyla belirlenir ve tur açma transaction'ı içinde kontrol edilmelidir

> Bu bölümdeki eşzamanlılık iddiaları **kod incelemesine dayanır**; yarış
> koşulları çalıştırılarak test edilmemiştir.

---

# 13. Proposed migration outline

> **Yalnızca isim ve sorumluluk.** SQL gövdesi bilinçli olarak yazılmamıştır.
> Uygulanmış migration'lar **değiştirilmez**; bu yeni ve ayrı bir dosyadır.

**Dosya:** `supabase/migrations/20260813000100_reusable_rounds.sql`

| # | Nesne | Sorumluluk |
| --- | --- | --- |
| 1 | `alter table public.space_rounds drop constraint …_space_id_key` | Oda başına tek tur kısıtını kaldırır — çok turun tek engeli |
| 2 | `alter table public.space_rounds add column round_number` | Turları sıralar; `(space_id, round_number)` benzersiz |
| 3 | `alter table public.space_rounds add column selection_seed` | Tohum — turu yeniden üretebilmek |
| 4 | `alter table public.space_rounds add column selection_policy_version` | Hangi sert kural setinin uygulandığı |
| 5 | `alter table public.space_rounds add column ranker_version` | Hangi sıralama modelinin çalıştığı (başlangıç: `'none'`) |
| 6 | `alter table public.room_candidates add column selection_reason` | Filmin neden seçildiği — ML etiketi |
| 7 | `create table public.space_watch_confirmations` | **Çift bazlı "birlikte izledik" olayı.** `(space_id, tmdb_movie_id)` benzersiz, `confirmed_at`, `confirmed_by_user_id`, `round_id` |
| 8 | `alter table … enable row level security` + `select` politikası | Yalnızca odanın katılımcıları okur; yazma yalnızca RPC'den |
| 9 | `create index` — `space_rounds(space_id, created_at desc)` | Uygunluk sorgusunun ana erişim yolu |
| 10 | `create or replace function public.get_space_candidate_eligibility(uuid)` | **Ortak sonuç özeti.** Film başına: son ortak sonuç, son gösterim, son karar zamanı, öncelikli dönüş hakkı. **Kişi bazlı bilgi ve sayaç DÖNDÜRMEZ** (§12) |
| 11 | `create or replace function public.start_next_space_round(...)` | `create_or_reset_space_round`'un yerine geçer: **silmez, yeni satır ekler**; oda kilidi alır; aktif tur varsa onu döndürür; seed/version/reason kaydeder |
| 12 | `create or replace function public.confirm_pair_watched(uuid, integer)` | İzleme onayını idempotent yazar |
| 13 | `revoke … / grant execute … to authenticated` | Üç yeni/güncellenmiş fonksiyon için minimum yetki |
| 14 | `comment on function …` | Güvenlik gerekçeleri (mevcut migration'ların kalıbı) |

**Geriye dönük uyumluluk:** `create_or_reset_space_round` bir süre bırakılabilir
(çağıran kalmayınca kaldırılır) veya aynı migration'da yeni fonksiyona
yönlendirilebilir. Yıkıcı olmayan yol tercih edilmelidir.

---

# 14. Proposed application file-change outline

| Dosya | Değişiklik | Kapsam |
| --- | --- | --- |
| `src/lib/rooms/round-service.ts` | `initializeRoomRound` → `startNextRound`; yeni RPC'yi çağırır; seed/version/reason iletir | Orta |
| `src/lib/rooms/round-service.ts` | Yeni `getCandidateEligibility(spaceId)` — uygunluk RPC sarmalayıcısı | Küçük |
| `src/lib/rooms/candidate-pipeline.ts` **(yeni)** | §10'daki 6 adımlı boru hattı; tek giriş: `buildRoundCandidates(spaceId)` | Orta |
| `src/lib/rooms/eligibility.ts` **(yeni)** | Saf: SQL çıktısını sert kural kararlarına çevirir (30/14 gün); **test edilebilir** | Küçük |
| `src/lib/tmdb/search.ts` | `discoverRoomCandidates(seed, count)` — seed parametresi; sayfa ondan türetilir | Küçük |
| `src/app/api/rooms/[spaceId]/round/route.ts` | `buildRoundCandidates` çağırır; **prototip değişikliği geri alınır** | Küçük |
| `src/lib/rooms/types.ts` | `SelectionReason`, `JointOutcome`, eligibility tipleri | Küçük |
| `src/components/rooms/RoomRound.tsx` | Tur bitince "yeni tur" aksiyonu; **izleme onayı arayüzü** | Orta |
| `src/components/rooms/RoomRound.tsx:16` | Polling aralığı — durum bazlı (oylama 3 sn / çark 1,2 sn) | **Tek satır, yüksek getiri** |
| `src/app/api/rooms/[spaceId]/watched/route.ts` **(yeni)** | İzleme onayı ucu | Küçük |

**Geri alınacak (prototip):** `round/route.ts` HEAD'e döner;
`src/lib/recommendations/` `main`'den çıkar (araştırma dalında kalır).
`fetchMovieSummaryById` istenirse korunur.

---

# 15. Test strategy

## Saf birim testleri (bugün mümkün, Docker gerekmez)

| Hedef | Senaryolar |
| --- | --- |
| `eligibility.ts` | 30 gün sınırında (29/30/31 gün) izlendi bastırma; iki-taraf-skip bastırma; **karışık kararın bastırılmaması**; 14 gün içinde/dışında öncelikli dönüş; dönüşün **tek kez** tüketilmesi |
| `candidate-pipeline.ts` | Tam 10 benzersiz sonuç; öncelikli filmin ilk sıraya girmesi; ranker çıktısının uygun küme dışına çıkamaması (**assert testi**); havuz dolmazsa davranış |
| Seed | Aynı seed → aynı sayfa ve aynı sıra; farklı seed → farklı sonuç |
| `selection_reason` | Her adayın bir nedeni olması |

## Veritabanı entegrasyon testleri (Docker + Supabase CLI gerektirir — **bugün yok**)

| Hedef | Senaryolar |
| --- | --- |
| Çok tur | Aynı space'te ardışık turlar; **eski turların ve oyların korunması** |
| Eşzamanlılık | İki istemci aynı anda yeni tur → tam olarak bir tur oluşur |
| Uygunluk RPC | Katılımcı olmayan çağrı reddedilir; **çıktıda kişi bazlı bilgi/sayaç yok** |
| Gizlilik | Partnerin oyu hiçbir uçtan okunamaz; bastırılan filmler gözlemlenemez |
| İzleme onayı | Idempotent; yalnızca katılımcı yazabilir |
| RLS | `room_votes` doğrudan okunamaz |

> Bu testler **çalıştırılamadı**. Docker/Supabase CLI kurulana kadar
> yukarıdaki veritabanı davranışları **doğrulanmamış** sayılmalıdır.

## Manuel doğrulama (iki tarayıcı profili)

1. Oda kur, katıl, tur 1 oyna, çark döndür
2. **Tur 2 aç** → yeni 10 film gelmeli, tur 1 kayıtları durmalı
3. Tur 1'in kazananını "birlikte izledik" olarak onayla
4. Tur 3 → onaylanan film **gelmemeli**
5. İki tarafın da skip'lediği bir filmi işaretle → sonraki turda gelmemeli
6. İki tarafın da want dediği ama çarkın seçmediği film → **sonraki turda gelmeli**
7. Aynı film **ikinci kez** öncelikli dönüş almamalı

---

# 16. Open product decisions

| # | Karar | Seçenekler | Etki |
| --- | --- | --- | --- |
| 1 | **İzleme onayını kim verir?** | Tek katılımcı yeter / **ikisi de onaylamalı** / çark sonrası otomatik sorulur | Kural 2'nin güvenilirliği. Tek kişi yeterse yanlış bastırma olur |
| 2 | **Onay ne zaman istenir?** | Çark sonucu ekranında hemen / sonraki oda ziyaretinde / hiç sorulmaz (elle) | Veri toplama oranı |
| 3 | **Çark seçti ama izlenmedi** durumu ne olsun? | Normal uygunluğa döner / kısa bir cooldown alır / öncelikli dönüş hakkı kazanır | Kural 5 ile etkileşir |
| 4 | **`no_match` turu geçmişe sayılsın mı?** | Evet (skip'ler kaydedilir) / hayır | Kural 3'ün hızı |
| 5 | **Bastırma çift bazlı mı, kullanıcı bazlı mı?** | Yalnızca oda (önerilen) / kullanıcının tüm odaları | Gizlilik + basitlik |
| 6 | **Öncelikli dönüş tüketildi ama yine both_want olursa?** | Yeni bir dönüş hakkı / kalıcı normal uygunluk | Sonsuz döngü riski |
| 7 | **Polling aralığı** | 1,2 sn koru / 3 sn / duruma göre değişken (önerilen) | Baskın maliyet kalemi (§8) |
| 8 | Oda kaç tur sonra "eski" sayılır? | Sınırsız / N tur sonra arşiv | Depolama (düşük öncelik) |

---

# 17. Exact implementation sequence

Her adım tek başına gönderilebilir ve geri alınabilir.

| # | Adım | Bağımlılık | Risk |
| --- | --- | --- | --- |
| **0** | **Prototipi `research/recommendation-prototype` dalına al, `main` çalışma ağacını temizle** | — | Yok |
| **1** | **`get_space_round_state` içindeki gereksiz `FOR UPDATE`'i koşullu hale getir** | — | Düşük — **en yüksek getirili tek düzeltme** (§8) |
| **2** | **Polling aralığını duruma göre ayarla** (oylama 3 sn) | — | Düşük — tek satır, %60 istek azalması |
| 3 | Migration `20260813000100_reusable_rounds.sql` yaz (**uygulama**) | — | Düşük (yalnızca dosya) |
| 4 | `eligibility.ts` + saf testler | 3 | Düşük |
| 5 | Migration'ı **staging/geliştirme** projesine uygula ve doğrula | 3 | Orta |
| 6 | `round-service.ts` + `candidate-pipeline.ts` — yeni RPC'lere geçiş | 5 | Orta |
| 7 | Route'u boru hattına bağla, prototip değişikliğini geri al | 6 | Düşük |
| 8 | "Yeni tur" arayüzü | 7 | Düşük |
| 9 | İzleme onayı ucu + arayüzü | 7, ürün kararı #1 | Orta |
| 10 | İki profille uçtan uca manuel doğrulama (§15) | 9 | — |
| 11 | Production migration + deploy | 10 | Orta |

**Adım 1 ve 2 diğer her şeyden bağımsızdır** ve bugün yapılabilir; ölçüldüğünde
en büyük operasyonel kazancı sağlarlar.

---

# 18. Files inspected

**Belgeler**
```
WATCHMUSE_CURRENT_ARCHITECTURE_AND_HANDOFF_2026-08-12.md   (tam, 607 satır)
docs/RECOMMENDATIONS.md                                    (prototip belgesi)
docs/RECOMMENDATIONS_OPEN_ISSUES.md                        (prototip sorunları)
```

**Migration'lar**
```
supabase/migrations/20260811000100_rooms_schema.sql
supabase/migrations/20260811000200_rooms_rls.sql
supabase/migrations/20260811000300_rooms_functions.sql
supabase/migrations/20260812000100_profiles_and_library.sql
supabase/migrations/20260812000200_room_rounds_votes_and_wheel.sql   (tam, 431 satır)
supabase/migrations/20260812000300_preference_signals.sql            (uygulanmamış prototip)
```

**Oda katmanı**
```
src/lib/rooms/{backend,errors,localStore,round-service,service,tokens,types,validation}.ts
src/lib/rooms/{errors,tokens,validation}.test.ts
src/app/api/rooms/route.ts
src/app/api/rooms/join/route.ts
src/app/api/rooms/[spaceId]/route.ts
src/app/api/rooms/[spaceId]/round/route.ts          (HEAD + çalışma ağacı)
src/app/api/rooms/[spaceId]/round/votes/route.ts
src/app/api/rooms/[spaceId]/round/spin/route.ts
src/components/rooms/{RoomCreator,InviteRedeemer,RoomWaiting,RoomRound}.tsx
```

**TMDb**
```
src/lib/tmdb/search.ts        (HEAD + çalışma ağacı)
src/lib/tmdb/client.ts
src/lib/tmdb/providers.ts
src/lib/ttl-cache.ts
```

**Prototip**
```
src/lib/recommendations/{weights,scoring,service}.ts
src/lib/recommendations/scoring.test.ts
```

**Yapılandırma**
```
package.json
```

> `.env.local` **okunmadı**. Kullanılan ortam değişkeni **adları**:
> `TMDB_ACCESS_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
> `NEXT_PUBLIC_SITE_URL`, `USE_LOCAL_ROOMS`, `NEXT_PUBLIC_USE_LOCAL_ROOMS`.

---

# 19. Commands actually run and results

Tümü salt-okunur. **Hiçbir migration uygulanmadı, commit/push/deploy yapılmadı,
paket kurulmadı.**

| Komut | Sonuç |
| --- | --- |
| `git log -5 --oneline` | `ccce84b`, `f14926e`, `edd3acc`, `fd74c55`, `ad6a03b` |
| `git status --short` | 2 değişmiş, 5 takip edilmeyen (§2) |
| `git diff --stat` | `2 files changed, 27 insertions(+), 3 deletions(-)` |
| `git diff` | Tam çıktı incelendi (§11) |
| `git show HEAD:…/round/route.ts` | Production sürümü incelendi |
| `git show HEAD:src/lib/tmdb/search.ts` | Production `discoverRoomCandidates` incelendi |
| `npm test` | **14 dosya, 174 test geçti** — exit 0 |
| `npm run typecheck` | **Geçti** — exit 0 |
| `npm run lint` | **Geçti** — exit 0 |
| `npm run build` | **Geçti** — exit 0 |

```
 Test Files  14 passed (14)
      Tests  174 passed (174)
   Duration  543ms
```

> Bu sonuçlar **çalışma ağacına** (production + commit edilmemiş prototip)
> aittir; tek başına production kanıtı değildir. Handoff §10, `ccce84b`
> öncesinde 13 dosya / 154 test geçtiğini kaydediyor.

**Kasıtlı olarak çalıştırılmayanlar:** `npm audit` (kapsam dışı),
Supabase CLI / psql / Docker (**kurulu değil** — veritabanı entegrasyon testi
bu yüzden mümkün olmadı).
