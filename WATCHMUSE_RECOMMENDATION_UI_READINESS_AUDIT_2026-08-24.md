# WatchMuse Recommendation & UI Readiness Audit — 2026-08-24

Bu belge salt-okunur bir mimari, migration, öneri sistemi ve UI entegrasyon incelemesidir. İnceleme sırasında mevcut kaynak, SQL, test, yapılandırma ve dokümantasyon dosyaları değiştirilmedi; migration uygulanmadı; Supabase’e bağlanılmadı; branch değiştirilmedi; commit, stage, push veya deploy yapılmadı.

## 1. Executive verdict

Mevcut reusable-room çalışması iyi bir append-only round temeli, SQL seviyesinde önemli uygunluk kuralları, kişisel kabul akışı ve daha kontrollü polling davranışı getiriyor. Ancak üretim migration’ı veya yeni recommendation/UI uygulamasına güvenli temel sayılmadan önce giderilmesi gereken High seviyeli sorunlar var:

| Kimlik | Seviye | Bulgu | Etki |
|---|---|---|---|
| RR-01 | High | “Eligible repeat yalnız son bounded denemede” sınırı SQL’de uygulanmıyor | İki veya daha eski round’da gösterilmiş film erken denemede yeniden seçilebilir; discovery garantisi doğru değildir |
| RR-02 | High | authenticated rolü yeni ve legacy round RPC’lerini doğrudan çağırabiliyor | Next.js aday kaynağı, seed ve gelecekteki ranker baypas edilebilir; aday/policy metadata istemci tarafından şekillendirilebilir |
| RR-03 | High | Migration-first penceresinde legacy RPC tam geriye uyumlu değil | Eski Vercel kodu suppression sonrası 10 aday üretemeyip no-match/reset akışında hata verebilir |
| DEP-01 | High | npm audit üretim bağımlılık ağacında nanoid <3.3.18 buldu | GHSA-2v37-7h3g-55p8; bağımlılık yükseltmesi ayrıca doğrulanmalı |
| DB-01 | Release gate | Gerçek PostgreSQL/Supabase migration, RLS ve concurrency testi yok | Statik SQL testi üretim davranışını kanıtlamaz |

Critical bulgu yoktur. High bulgular nedeniyle bu denetim reusable-room migration’ına, production deployment’a veya Recommendation + UI implementasyonuna geçiş onayı vermez.

En küçük remediation paketi:

1. Fresh-discovery SQL dalında aynı space’in bütün geçmiş candidate kayıtlarını dışla; eligible-repeat dalını yalnız p_allow_eligible_repeats = true iken aç.
2. Onuncu slotu gerçek discovery için ayır; priority ve repeat seçimlerinin toplamını en fazla dokuzla sınırla ve reason değerini gerçek seçim dalından üret.
3. Client’ın aday payload’ı ve policy/ranker metadata’sı ile round başlatmasını engelleyen güvenilir bir server sınırı kur; legacy RPC’yi rollout sonrası revoke et veya yeni round üretmesini durdur.
4. Legacy Vercel sürümü + yeni schema senaryosunu gerçek PostgreSQL’de test et ve wrapper’ın hard eligibility’yi bozmadan çalışabildiğini göster; aksi halde kısa koordineli bakım penceresi kullan.
5. Tam migration zincirini boş ve production-benzeri upgrade veritabanlarında; iki eşzamanlı kullanıcı, RLS ve acceptance yarışlarıyla test et.
6. nanoid advisory’sini kontrollü dependency değişikliği ve tam validation ile gider. Bu audit sırasında paket değiştirilmemiştir.

## 2. Current Git and branch state

- Repository: C:\Users\editör_01\Desktop\Movie Search Demo
- Aktif branch: feature/reusable-room-candidates
- HEAD/production base: ccce84b feat: add shared room film selection
- Research branch: research/recommendation-prototype
- Research commit: 3bb120f research: preserve recommendation prototype
- Branch değiştirilmedi ve research branch yalnız read-only Git komutlarıyla incelendi.
- Tracked diff: 10 dosya, 506 insertion, 91 deletion.
- Hedef audit dosyası inceleme başında mevcut değildi.

Tracked modified files:

- ROOM_SELECTION_AND_WHEEL_SETUP.md
- docs/ROOMS_ARCHITECTURE.md
- src/app/api/rooms/[spaceId]/round/route.ts
- src/components/rooms/RoomRound.tsx
- src/lib/rooms/errors.test.ts
- src/lib/rooms/errors.ts
- src/lib/rooms/round-service.ts
- src/lib/rooms/types.ts
- src/lib/tmdb/client.ts
- src/lib/tmdb/search.ts

Untracked implementation/support files:

- WATCHMUSE_CURRENT_ARCHITECTURE_AND_HANDOFF_2026-08-12.md
- WATCHMUSE_EXISTING_VERCEL_SUPABASE_DEPLOYMENT_HANDOFF.md
- WATCHMUSE_REUSABLE_ROOM_CANDIDATE_ARCHITECTURE_AUDIT.md
- WATCHMUSE_REUSABLE_ROOM_IMPLEMENTATION_REPORT.md
- src/app/api/rooms/[spaceId]/selection/route.ts
- src/lib/rooms/candidate-pipeline.ts
- src/lib/rooms/candidate-pipeline.test.ts
- src/lib/rooms/eligibility.ts
- src/lib/rooms/eligibility.test.ts
- src/lib/rooms/polling-policy.ts
- src/lib/rooms/polling-policy.test.ts
- src/lib/rooms/reusable-round-migration.test.ts
- src/lib/rooms/round-service.test.ts
- src/lib/rooms/seeded-random.ts
- src/lib/rooms/seeded-random.test.ts
- supabase/migrations/20260813000100_reusable_rounds.sql

Bu dosyaların hiçbiri stage edilmedi. Audit oluşturulmadan önceki Git uyarıları yalnız kullanıcının global ignore dosyasına sandbox erişimiyle ilgiliydi; repository durumunun okunmasını engellemedi.

## 3. Production versus working-tree versus research-prototype map

| Katman | Kaynak | Gerçek davranış |
|---|---|---|
| Production | ccce84b | Space başına unique tek space_rounds satırı; reset/no_match sırasında eski round silinir ve cascade ile aday/oy geçmişi kaybolur; bir rastgele TMDb discover sayfasından ilk 10 aday; sürekli yaklaşık 1200 ms polling; search sonucu detayları listenin altında ProviderPanel ile açılır |
| Dirty reusable-room worktree | feature/reusable-room-candidates üzerindeki uncommitted dosyalar | Append-only çoklu round, round_number ve policy metadata; seeded çok-sayfalı aday toplama; SQL hard suppression/priority; kişisel selection acceptance; state-aware polling |
| Research-only prototype | research/recommendation-prototype, 3bb120f | Preference signals migration’ı, user/movie kimliği ağırlıklı deterministic heuristic scoring, client-callable signal RPC’leri ve eski destructive-round route entegrasyonu |
| Proposed, henüz yok | Bu rapordaki V1 hedefi | Normalize genre profili, partner-safe room profile, eligibility-before-ranking, decaying exposure, gerçek discovery slotu ve ortak MovieDetailModal |

Production ccce84b davranışı ile dirty worktree aynı şey değildir. Research prototipi de current branch’e dahil değildir. Bu raporda önerilen Recommendation V1 ve MovieDetailModal henüz implement edilmemiştir.

## 4. Files inspected

Repository/Git:

- package.json
- git branch --show-current
- git status --short
- git diff --stat
- git diff
- git diff --name-status
- git log --all --decorate --oneline -20
- git branch --list
- untracked dosyaların doğrudan içerikleri

Migration zinciri, kronolojik:

1. supabase/migrations/20260811000100_rooms_schema.sql
2. supabase/migrations/20260811000200_rooms_rls.sql
3. supabase/migrations/20260811000300_rooms_functions.sql
4. supabase/migrations/20260812000100_profiles_and_library.sql
5. supabase/migrations/20260812000200_room_rounds_votes_and_wheel.sql
6. supabase/migrations/20260813000100_reusable_rounds.sql

Room/application katmanı:

- src/app/api/rooms/route.ts
- src/app/api/rooms/join/route.ts
- src/app/api/rooms/[spaceId]/route.ts
- src/app/api/rooms/[spaceId]/round/route.ts
- src/app/api/rooms/[spaceId]/round/votes/route.ts
- src/app/api/rooms/[spaceId]/round/spin/route.ts
- src/app/api/rooms/[spaceId]/selection/route.ts
- src/components/rooms/RoomCreator.tsx
- src/components/rooms/InviteRedeemer.tsx
- src/components/rooms/RoomWaiting.tsx
- src/components/rooms/RoomRound.tsx
- src/lib/rooms/backend.ts
- src/lib/rooms/service.ts
- src/lib/rooms/round-service.ts
- src/lib/rooms/candidate-pipeline.ts
- src/lib/rooms/eligibility.ts
- src/lib/rooms/polling-policy.ts
- src/lib/rooms/seeded-random.ts
- src/lib/rooms/types.ts
- src/lib/rooms/errors.ts
- ilgili bütün mevcut room testleri

TMDb, search, provider ve library:

- src/components/MovieSearch.tsx
- src/components/MovieResultList.tsx
- src/components/ProviderPanel.tsx
- src/app/api/movies/search/route.ts
- src/app/api/movies/[id]/providers/route.ts
- src/lib/tmdb/client.ts
- src/lib/tmdb/search.ts
- src/lib/tmdb/providers.ts
- src/lib/tmdb/normalize.ts
- src/lib/tmdb/types.ts
- src/lib/tmdb/errors.ts
- src/lib/tmdb/constants.ts
- ilgili TMDb testleri
- profile/library migration’ı ve LibraryActions kullanım yolları

Dokümantasyon:

- WATCHMUSE_REUSABLE_ROOM_IMPLEMENTATION_REPORT.md
- WATCHMUSE_CURRENT_ARCHITECTURE_AND_HANDOFF_2026-08-12.md
- WATCHMUSE_REUSABLE_ROOM_CANDIDATE_ARCHITECTURE_AUDIT.md
- docs/ROOMS_ARCHITECTURE.md
- ROOM_SELECTION_AND_WHEEL_SETUP.md

Research branch, read-only:

- docs/RECOMMENDATIONS.md
- docs/RECOMMENDATIONS_OPEN_ISSUES.md
- src/lib/recommendations/scoring.ts
- src/lib/recommendations/weights.ts
- src/lib/recommendations/service.ts
- src/lib/recommendations/scoring.test.ts
- supabase/migrations/20260812000300_preference_signals.sql
- round route ve TMDb search değişiklikleri
- branch file tree, ccce84b..research/recommendation-prototype stat ve diff

## 5. Reusable-room implementation assessment

Olumlu yönler:

- space_rounds artık round_number ile append-only geçmişe dönüşüyor.
- Partial unique active-round index’i space başına tek aktif round hedefliyor.
- Seed, source/policy/ranker version ve attempt metadata’sı reproducibility için doğru yönde.
- Aday toplama tek bir rastgele sayfadan çıkıp seeded sayfa sırasına ve bounded retry’ye geçiyor.
- SQL, 30 günlük iki taraf skip suppression, yedi günlük selection window, acceptance sonrası durable suppression ve 14 günlük want+want priority dönüşünü merkezi olarak uygulamaya çalışıyor.
- Selection acceptance caller’ın kişisel library satırını mutasyona uğratıyor ve mevcut watched durumunu düşürmüyor.
- API cevapları partner oylarını ve acceptance durumunu doğrudan ifşa etmeyecek şekilde filtreleniyor.
- Polling aktif kullanıcı durumuna göre yavaşlıyor veya terminal aşamada duruyor.

Eksikler/riskler:

- RR-01: Fresh-discovery dalı yalnız immediately previous round adayını dışlıyor. Aynı space’te iki veya daha eski round’da gösterilen film p_allow_eligible_repeats false iken bile fresh olarak seçilebilir. Sonraki reason üretimi bunu eligible_repeat diye etiketleyebilir, fakat seçim sınırı daha önce ihlal edilmiştir.
- Priority listenin dokuzla sınırlandırılması tek başına gerçek discovery slotu garantilemez. Final attempt’te onuncu slot eligible repeat olabilir.
- RR-02: Candidate pipeline ve ranker sınırı uygulama kodunda olsa da, authenticated kullanıcının Supabase RPC’yi doğrudan çağırması halinde bu sınır atlanabilir.
- Result/no_match terminal durumunda polling durduğu için diğer üyenin başlattığı yeni round bu sekmede otomatik görünmez; kullanıcı aksiyonu veya reload gerekir.
- Pending selection görüntüsü client’ta açıkken süre dolarsa terminal polling olmadığı için stale kalabilir. Accept hatası bugün bütün RoomRound’u hata görünümüne taşıyabilir.
- Geçici poll hatası retry/recovery yerine kalıcı hata ekranına dönüşebilir.
- room_selections içinde space_id, round_id, candidate_id ve tmdb_movie_id ayrı ayrı tutuluyor; bunların aynı zincire ait olmasını zorunlu kılan composite referential constraint yok. Function kontrolü mevcut olsa da schema bütünlüğü tek başına yeterli değil.
- winner_candidate_id için de schema-level ilişki function doğrulamasına dayanıyor.

Genel değerlendirme: Tasarım yönü production’daki destructive modelden belirgin biçimde daha iyi, ancak henüz güvenilir checkpoint seviyesinde değildir.

## 6. Pre-migration SQL review

Ordering ve dependency:

- Migration dosyası önceki beş migration’dan sonra doğru kronolojik konumda.
- Önceki schema’daki space_rounds_space_id_key constraint adıyla uyumlu drop işlemi bulundu.
- Legacy round satırlarının round_number = 1 ile backfill edilmesi, ardından NOT NULL/uniqueness yapısına geçiş mantıksal olarak doğru sırada.
- Mevcut status enum/check değerleri yeni akışla genel olarak uyumlu.
- Yeni selection tabloları round/candidate/space referansları ve cascade davranışları bakımından incelendi.

Append-only ve active round:

- Yeni migration içinde eski round/candidate/vote satırlarını silen bir akış bulunmadı.
- Bir space satırının kilitlenmesi ve partial unique active index, tek aktif round ve monoton round_number için doğru temel sunuyor.
- Yine de gerçek PostgreSQL’de iki eşzamanlı start_next_space_round çağrısı ile kanıtlanmamıştır.

Eligibility:

- 30 günlük both-skip suppression SQL tarafında hard rule olarak yer alıyor.
- Son yedi gün içinde seçilmiş fakat henüz kabul penceresi kapanmamış film bastırılıyor.
- En az bir kabul sonrasında film kalıcı olarak bastırılıyor.
- Kabul edilmemiş seçim yedi gün sonra yeniden uygun hale gelebiliyor.
- 14 günlük want+want geçmişi priority dönüşe kaynak oluyor.
- RR-01 nedeniyle “eligible repeats yalnız final bounded attempt” ve “en az bir gerçek discovery” vaatleri migration’ın mevcut halinde doğru değil.

Input güvenliği:

- JSON alanlarında regex kontrolü ile numeric cast aynı boolean ifadesinde kullanılıyor. PostgreSQL boolean evaluation sırası güvenlik garantisi değildir; malformed doğrudan RPC girdisi cast exception üretebilir. Transaction rollback olsa da bu istemci kontrollü hata/DoS yüzeyidir.
- En küçük düzeltme: cast işlemlerini önce kontrollü CASE veya ayrı validated CTE’ye almak; geçersiz payload’ı tanımlı domain error ile reddetmek.

Schema integrity:

- Selection ilişkilerine candidate_id + round_id + space_id tutarlılığını garanti eden composite unique/FK eklenmeli veya redundant kimlikler azaltılmalı.
- Candidate’ın tmdb_movie_id değeri ile selection tmdb_movie_id değerinin aynı olduğu constraint seviyesinde doğrulanmalı.

Bu inceleme statiktir. Migration’ın parser tarafından kabul edilmesi, function body’lerin runtime’da çalışması veya index/lock davranışı gerçek veritabanında kanıtlanmış değildir.

## 7. Concurrency analysis

Round creation:

- Space-row lock round_number hesaplamasını serialize etmeyi hedefliyor.
- Partial unique active index ikinci savunma hattı.
- Test edilmesi gereken yarış: aynı space için iki authenticated üye aynı anda ilk round’u veya next round’u başlatır; tam olarak biri başarıyla yeni aktif round oluşturmalı, diğeri mevcut round’u dönmeli veya deterministik domain error almalı.

Wheel:

- Spin function’ı ve status kontrolleri duplicate winner üretimini sınırlandırıyor.
- Aynı anda iki spin çağrısı, spin ile yeni round çağrısı ve stale candidate ID ile spin senaryoları gerçek PostgreSQL isolation altında test edilmedi.

Acceptance:

- Function önce space ve selection kayıtlarını kilitlediği için iki üyenin eşzamanlı kabulü serialize olur.
- Unique acceptance kısıtı ve upsert yolu aynı kullanıcının retry’sini idempotent yapar.
- Her kabul yalnız auth.uid() sahibinin library_items kaydını ekler/günceller.
- Mevcut watched library satırında status/rating/watched_at alanlarının watchlist seviyesine düşürülmemesi olumlu.
- İki kullanıcı aynı anda kabul ettiğinde her ikisinin ayrı kişisel library kaydı oluşmalıdır; mevcut statik okuma bunu destekliyor ancak DB testi yoktur.

Stale clients:

- Stale vote/spin/start çağrıları current round doğrulamasına dayanmalı.
- Terminal polling’in tamamen durması partnerin yeni round’unu otomatik keşfetmez.
- En küçük UI düzeltmesi: terminal görünümde çok düşük frekanslı metadata refresh, Realtime subscription veya görünür bir “durumu yenile” mekanizması. Bu değişiklik yeni round yarışının server-side kontrolünün yerine geçmez.

## 8. RLS and privacy analysis

Olumlu kontroller:

- Yeni selection tablolarında RLS etkin.
- Table privileges public/anon/authenticated’dan revoke edilmiş; doğrudan table policy ile geniş erişim açılmamış.
- SECURITY DEFINER function’lar boş search_path kullanıyor.
- İncelenen SQL objeleri schema-qualified.
- Function’larda auth.uid() ve room membership kontrolleri var.
- public/anon EXECUTE revoke edilmiş.
- Application response yalnız kullanıcının kendi oylarını, iki üye tamamladıktan sonra ortak match listesini ve kendi kabul durumunu gönderiyor.

High risk — RPC trust boundary:

- start_next_space_round ve legacy create_or_reset_space_round EXECUTE yetkisi authenticated rolünde.
- Server Supabase client’ı service-role değil, kullanıcı JWT’si + publishable/anon key ile çalışıyor. Bu nedenle yalnız Next route üzerinden çağrı yapıldığı varsayımı bir güvenlik sınırı değildir.
- Bir room üyesi Supabase Data API üzerinden doğrudan RPC çağırıp arbitrary candidate payload, seed, source/policy/ranker version ve reason benzeri metadata gönderebilir.
- SQL hard suppression uygulanmaya devam ettiği için bu yol hard eligibility’yi bütünüyle devre dışı bırakmaz; fakat aday kaynağı, tam 10 seçimi, randomness, öneri sıralaması ve audit metadata bütünlüğünü bozar.
- Legacy wrapper ayrıca rollout sonrasında kalıcı alternatif üretim yolu olur.

En küçük güvenli tasarım seçenekleri:

1. Aday planını yalnız trusted backend/Edge Function üretsin; database function yalnız dar kapsamlı trusted credential ile çağrılabilsin.
2. Kullanıcı JWT’si korunacaksa, candidate planı server tarafından imzalanıp SQL’de doğrulansın ve metadata istemciden serbest metin olarak kabul edilmesin.
3. Alternatif olarak aday kaynakları DB-owned staging tablosunda server tarafından oluşturulsun; start function yalnız plan_id alsın ve membership’i doğrulasın.
4. Legacy function yeni uygulama rollout’u tamamlanınca authenticated’dan revoke edilmeli veya yalnız mevcut migration geçiş koşulunda çalışacak şekilde sonlandırılmalı.

Service-role anahtarı browser’a asla verilmemeli. Bu rapor mevcut secret yönetimini değiştirmez.

Partner privacy:

- Current reusable implementation response filtreleme bakımından iyi yönde.
- Gelecek recommendation profile’ı, ham sinyaller, individual genre weights, partner watched IDs ve score breakdown client’a dönmemeli.
- Internal explainability server log/private table seviyesinde kalmalı; UI’ye “partnerin X türünü sevmesi” gibi çıkarım yaptıran açıklama gönderilmemeli.

## 9. Recommendation prototype assessment

Research prototipi bir trained ML model değildir. Mevcut hali deterministic, elle belirlenmiş ağırlıklara dayalı explainable heuristic/content ranking denemesidir. Bu dürüstçe “recommendation/ranking engine prototype” olarak adlandırılabilir; model training veya öğrenilmiş kişiselleştirme iddiası desteklenmez.

Başlıca sorunlar:

- Sinyaller ağırlıklı olarak movie ID kimliklerine dayanıyor; normalize genre preference profile yok.
- Ağırlıklar deneysel doğrulama veya mevcut veri dağılımı olmadan tahmin edilmiş.
- Watched filmler candidate dışına çıkarıldığı için bazı rating katkıları yapısal olarak etkisiz kalıyor.
- shownCount cezası kalıcı ve sınırsız büyüyor; zamanla alakasız geçmiş bütün gelecekteki skoru bastırabilir.
- Scoring’in bir adımı skipped filmleri yeniden havuza ekleyebilir; reusable-room hard suppression ile çatışır.
- Fallback, RPC sinyali alınamadığında veya pool eksik kaldığında excluded filtresini atlayarak fresh slice döndürebilir. “Watched asla dönmez” invariant’ını bozar.
- Eski destructive single-round şemasına ve shown trigger yaklaşımına bağlanmıştır.
- library_items delete işlemi signal trigger’ında ele alınmadığı için silinen watched/watchlist sinyali kalabilir.
- Testler pure scorer + mock input düzeyindedir; RPC, SQL, privacy, RLS, service fallback ve concurrency doğrulanmamıştır.

Sonuç: Branch’in tamamı merge veya cherry-pick edilmemeli.

## 10. Safe-to-reuse recommendation components

Dosya bazında doğrudan kopyalama değil, seçici kavramsal/strüktürel port önerilir:

- src/lib/recommendations/scoring.ts:
  - Pure ve deterministic score function yaklaşımı.
  - Explicit score breakdown üretme fikri.
  - Ranker’ın source candidate kimlikleri dışına çıkmadığını test etme fikri.
- src/lib/recommendations/weights.ts:
  - Ağırlıkları versioned tek policy objesinde tutma organizasyonu.
  - Magic number’ları service katmanına dağıtmama yaklaşımı.
- src/lib/recommendations/scoring.test.ts:
  - Determinism, uniqueness ve discovery quota test kalıpları.
  - Test verisinin açık fixture olarak kurulması.
- src/lib/recommendations/service.ts:
  - Server-only orchestration ve parser sınırı fikri.
  - Implementation ve fallback içeriği değil, katman ayrımı.
- TMDb değişikliği:
  - TMDb ID ile tek filmi server-side getirme ihtiyacı doğru; yeni details client’ı mevcut TMDb client/error/normalize kurallarına uygun yeniden yazılmalı.
- docs:
  - Açık soruları ve ertelenen kapsamı ayrı belgelemek faydalı; mevcut gerçeklik iddiaları yeniden doğrulanmalı.

“Safe-to-reuse”, mevcut dosyayı production’a aynen taşımak anlamına gelmez.

## 11. Components requiring redesign

- scoring.ts içindeki movie-identity merkezli score formülü: normalize per-user genre profile + room-level combination ile değişmeli.
- weights.ts değerleri: versioned Recommendation V1 policy’si olarak yeniden adlandırılmalı, bounded aralıklar ve açıklanmış units kullanılmalı.
- service.ts: eligibility sonucunu input olarak almalı; kendisi skipped/watched filmi yeniden ekleyememeli; unsafe fresh fallback kaldırılmalı.
- Preference signal toplama: trigger tabanlı stale user_movie_signals yerine library_items ve doğrulanmış movie metadata’dan güvenli, güncellenebilir genre facts/profile yolu tasarlanmalı.
- shownCount: zaman pencereli veya decay fonksiyonlu exposure’a dönüşmeli.
- Round route entegrasyonu: reusable candidate pipeline ve trusted plan sınırına bağlanmalı.
- TMDb details: poster/title/year/director/runtime/rating/overview/provider bilgisini TMDb ID ile server-side birleştiren, sanitize edilmiş response’a dönüşmeli.
- Testler: mock-only scorer testlerinden gerçek DB/RLS/concurrency ve UI accessibility testlerine genişletilmeli.

## 12. Components prohibited from direct production reuse

Aşağıdakiler aynen kopyalanmamalı:

- supabase/migrations/20260812000300_preference_signals.sql
- get_room_signal_facts RPC’si
- get_room_excluded_movies RPC’si
- Research round route diff’i
- Research service.ts dosyasının fallback ve pool-building implementasyonu
- Research scoring.ts içindeki mevcut identity weights ve skipped filmi yeniden ekleyen davranış
- Permanent shownCount trigger/penalty yaklaşımı
- Client-callable aggregate/raw signal response’ları
- Eski single-round/destructive schema varsayımları

Privacy gerekçesi:

- get_room_signal_facts içindeki room aggregate count/average ile kullanıcının kendi sinyallerini birleştiren client, partnerin want/maybe/skip/watchlist/rating davranışını çıkarabilir.
- get_room_excluded_movies tarafından dönen union watched IDs’den kendi watched listesi çıkarılınca partnerin watched listesi elde edilebilir.
- Aggregate olması partner-safe olduğu anlamına gelmez; room iki kişilik olduğunda differencing attack doğrudandır.

## 13. Recommendation V1 target architecture

V1 bir explainable personalized ranking layer olmalıdır:

1. TMDb source pool, birden çok seeded discover sayfasından yeterli sayıda benzersiz film ve genre_ids toplar.
2. Database hard eligibility katmanı watched, accepted, active selection window, both-skip window ve round-history kurallarını uygular.
3. Her üye için watched ve açıkça belirlenmiş “positive rating” policy’sinden genre ağırlıkları üretilir.
4. Her kullanıcı profili kendi toplamına göre normalize edilir; çok aktif kullanıcının diğerini hacimle ezmesi önlenir.
5. İki normalize profil eşit room-level profile’a dönüştürülür. Ham veya individual profil client’a çıkmaz.
6. Yalnız eligible candidate set score edilir.
7. Score = room genre affinity + bounded recency/quality terms − decaying exposure penalty + küçük seeded tie-break.
8. Priority want+want adayları hard eligibility’den geçtikten sonra en fazla dokuz slot kullanır.
9. En az bir slot gerçek unseen/discovery havuzundan seeded seçimle ayrılır.
10. Tam 10 unique candidate persistence öncesi yeniden doğrulanır.
11. Round’a source_version, eligibility_policy_version, recommendation_policy_version, profile_version, seed ve attempt kaydedilir.
12. Score components private/internal tutulur; public room API partner davranışı türettirmez.

V1 dışında bırakılanlar:

- actor/director/year preference
- collaborative filtering
- embedding modeller
- model training
- online experimentation
- actor/director search
- subscription-aware room filtering
- guaranteed streaming deep links
- Teleparty
- Seçim Sonrası Akış V1

Bu mimari daha sonra metadata feature’ları eklenmesine engel olmaz; ranker input contract’ı versioned feature map kabul edecek şekilde dar tutulmalıdır.

## 14. Candidate pipeline and ranking boundary

Önerilen kesin sınır:

TMDb sourcing → input validation/deduplication → SQL hard eligibility → partner-safe profile scoring → priority/discovery slot allocator → seeded deterministic tie-break → exactly-10 invariant → trusted persistence

Kurallar:

- Eligibility authoritative ve SQL tarafında olmalı.
- Ranker yalnız kendisine verilen eligible IDs’leri yeniden sıralayabilir; yeni film ekleyemez.
- Ranker sonucu source set’in subset’i olmalı ve tam benzersizlik kontrolünden geçmeli.
- Eligible repeats final bounded attempt öncesi ranker’a hiç verilmemeli.
- Final attempt’te bile hard suppressions açılamaz.
- Discovery, “priority olmayan herhangi bir film” değil, room geçmişinde gerçekten gösterilmemiş eligible film olarak tanımlanmalı.
- Final 10 içinde en az bir discovery slotu persistence transaction’ında doğrulanmalı.
- Havuz 10’a ulaşmazsa daha fazla bounded TMDb page denenmeli; yine olmazsa no_match/candidate_pool_incomplete gibi dürüst bir terminal sonuç dönmeli. Ineligible filmi fallback ile eklemek yasaktır.
- Seed page order, tie-break ve discovery seçiminde aynı round planına bağlı olmalı.
- Score breakdown candidate ID, policy version ve feature version ile private olarak audit edilebilir olmalı.

RR-02 çözülmeden bu boundary yalnız convention olur; güvenlik sınırı olmaz.

## 15. MovieDetailModal V1 design

Tek reusable client component:

- Ad: MovieDetailModal
- Identity prop: movieId: number
- Opsiyonel hızlı ilk görünüm: initialSummary
- Kullanım alanları: search sonuçları, room match kartları, wheel winner ve pending selection.

Data:

- GET /api/movies/[id] ile TMDb movie details ve credits alınır.
- Director credits’ten server-side çıkarılır.
- Runtime, vote_average, overview, release year ve poster normalize edilir.
- Netflix/Prime availability mevcut providers katmanıyla paralel veya ortak service üzerinden alınır.
- Response yalnız gösterim verisi içerir; recommendation score, profile veya partner signal içermez.

Interaction/accessibility:

- Portal ile document.body altında render.
- role="dialog", aria-modal="true", aria-labelledby ve gerektiğinde aria-describedby.
- Açılışta close button veya ilk mantıklı kontrol focus alır.
- Tab/Shift+Tab focus modal içinde döner.
- Escape, explicit close button ve backdrop’un yalnız kendi hedef click’i kapatır.
- Kapanınca tam olarak modalı açan elemente focus geri döner.
- Body scroll lock uygulanır; scrollbar width compensation ile layout shift önlenir.
- Arka plan koyulaşır ve blur olur.
- Desktop’ta büyük centered modal; küçük ekranda max-height: 90dvh benzeri scrollable near-full-screen dialog/sheet.
- Poster için sabit aspect ratio ve boyut ayrılır; image load layout shift üretmez.

Stale response:

- Her movieId değişiminde yeni AbortController.
- Kapanışta veya başka filme geçişte önceki request abort edilir.
- State, movieId/request generation ile etiketlenir; eski response yeni modal içeriğini boyayamaz.
- Error ve loading UI mevcut modalı kapatmadan erişilebilir biçimde gösterilir.

Entegrasyon:

- MovieSearch altında ayrı ProviderPanel’a scroll etmek yerine sonuç butonu modalı açar.
- MovieResultList aynı-title filmleri TMDb ID ile ayırır.
- RoomRound içindeki kartlar accessible detail button açar; vote/swipe/spin button içine nested button konmaz.
- ProviderPanel’ın gösterim bölümü reusable detail content’e ayrılabilir; veri fetch ownership modal/API katmanında tekleştirilir.

## 16. Exact create/modify/do-not-copy file plan

Reusable foundation düzeltmeleri — modify:

- supabase/migrations/20260813000100_reusable_rounds.sql
- src/lib/rooms/reusable-round-migration.test.ts
- src/lib/rooms/candidate-pipeline.ts
- src/lib/rooms/candidate-pipeline.test.ts
- src/lib/rooms/round-service.ts
- src/lib/rooms/round-service.test.ts
- src/app/api/rooms/[spaceId]/round/route.ts
- docs/ROOMS_ARCHITECTURE.md
- ROOM_SELECTION_AND_WHEEL_SETUP.md

Recommendation V1 — create:

- src/lib/recommendations/types.ts
- src/lib/recommendations/profile.ts
- src/lib/recommendations/profile.test.ts
- src/lib/recommendations/scoring.ts
- src/lib/recommendations/scoring.test.ts
- src/lib/recommendations/weights.ts
- src/lib/recommendations/service.ts
- src/lib/recommendations/service.test.ts
- supabase/migrations/20260824000100_recommendation_genre_profiles.sql

Recommendation V1 — modify:

- src/lib/rooms/candidate-pipeline.ts
- src/lib/rooms/round-service.ts
- src/app/api/rooms/[spaceId]/round/route.ts
- src/lib/tmdb/types.ts
- src/lib/tmdb/search.ts
- src/lib/tmdb/normalize.ts
- docs/ROOMS_ARCHITECTURE.md

MovieDetailModal V1 — create:

- src/components/MovieDetailModal.tsx
- src/components/MovieDetailModal.test.tsx
- src/app/api/movies/[id]/route.ts
- src/lib/tmdb/details.ts
- src/lib/tmdb/details.test.ts

MovieDetailModal V1 — modify:

- src/components/MovieSearch.tsx
- src/components/MovieResultList.tsx
- src/components/ProviderPanel.tsx
- src/components/rooms/RoomRound.tsx
- src/lib/tmdb/types.ts
- src/lib/tmdb/client.ts
- src/lib/tmdb/providers.ts, yalnız ortak fetch/normalize gerekiyorsa

Research branch’ten seçici olarak port edilebilecek fikir kaynakları:

- src/lib/recommendations/scoring.ts — pure scoring şekli
- src/lib/recommendations/weights.ts — versioned config şekli
- src/lib/recommendations/scoring.test.ts — determinism/uniqueness test kalıpları
- src/lib/recommendations/service.ts — yalnız orchestration katmanı fikri

Do not copy:

- supabase/migrations/20260812000300_preference_signals.sql
- research branch round route diff’i
- research service.ts implementasyonunun tamamı
- get_room_signal_facts ve get_room_excluded_movies
- permanent shown trigger/penalty
- existing identity-weight score formülü

Dirty overlap:

- candidate-pipeline.ts, round-service.ts, round route, RoomRound ve reusable migration zaten untracked/modified çalışmanın merkezinde. Recommendation/UI değişiklikleri reusable checkpoint alınmadan bunların üzerine bindirilmemeli.
- Research dosyaları topluca checkout/cherry-pick edilmemeli; yeni dosyalar reviewed checkpoint üzerinden elle ve seçici olarak yazılmalı.

## 17. Schema and migration plan

Önce reusable migration’ın mevcut High bulguları aynı migration dosyasında düzeltilmeli; migration henüz hiçbir ortama uygulanmadığı için yeni fix migration yerine tek temiz migration tercih edilebilir.

Reusable schema düzeltmeleri:

- Fresh discovery için space’in tüm geçmiş candidate kayıtlarını dışlayan predicate.
- eligible_repeat için açık p_allow_eligible_repeats gate.
- Gerçek discovery slot constraint/transaction check.
- Selection composite integrity:
  - room_candidates üzerinde candidate_id ile round_id/space_id/tmdb_movie_id’yi bağlayan uygun unique key; veya
  - room_selections’tan redundant alanları kaldıran daha sade model.
- Legacy RPC lifecycle ve grants düzeltmesi.
- Malformed JSON için cast-safe validation.

Recommendation migration:

- Research 20260812000300_preference_signals.sql kullanılmamalı.
- Yeni migration mevcut 20260813000100 sonrasına sıralanmalı.
- Önerilen partner-safe metadata:
  - movie_genre_facts(tmdb_movie_id, genre_id, source_version, observed_at)
  - gerekiyorsa server-private user_genre_profiles(user_id, profile_version, normalized_profile, computed_at)
  - veya profile’ı library_items + private movie facts üzerinden transaction/CTE içinde hesaplama.
- Profile tablosu kullanılırsa authenticated table SELECT tamamen revoke edilmeli ve partner profili döndüren user-callable RPC olmamalı.
- Round metadata’ya recommendation_policy_version ve profile_version eklenmeli.
- Candidate private score breakdown ayrı server-private tabloda tutulmalı veya public candidate response’dan kesin olarak çıkarılmalı.

Positive rating threshold, decay yarı ömrü ve library delete/update davranışı migration yazılmadan önce versioned policy olarak açıkça tanımlanmalı. Bunlar ürün kapsamını genişletmez; V1 davranışının deterministik olmasını sağlar.

## 18. Required tests

Gerçek PostgreSQL/Supabase integration:

- Boş DB’ye tüm migration zinciri.
- ccce84b production schema + legacy rows üzerinden upgrade.
- Legacy active/result/no_match round backfill.
- Eski Vercel kodunun yeni schema üzerinde create/reset/get/vote/spin yolları.
- İki simultaneous round start; tek active round ve unique round_number.
- İki simultaneous spin.
- İki simultaneous accept; iki ayrı caller library kaydı.
- Aynı kullanıcının duplicate accept retry’si.
- Existing watched item acceptance sonrası watched/rating/watched_at korunması.
- Selection expiry sınırının hemen öncesi/sonrası.
- 30 gün ve 14 gün timestamp sınırları.
- İki round önce gösterilmiş film final attempt öncesi kabul edilmemeli.
- Final 10’da en az bir gerçek discovery.
- Tam 10 unique veya dürüst incomplete/no_match.
- Malformed JSON payload controlled error.

RLS/privacy:

- Üye A, üye B ve outsider JWT fixture’ları.
- Outsider hiçbir round/selection mutation yapamamalı.
- A yalnız kendi oy/kabul bilgisini görmeli.
- Direct RPC ile arbitrary candidate plan/policy metadata reddedilmeli.
- Partner watched IDs, raw signals, normalized profile ve score components hiçbir response’tan çıkarılamamalı.
- SECURITY DEFINER search_path hijack testi.

Recommendation:

- Per-user normalization.
- İki profilin simetrik/eşit room kombinasyonu.
- Eligibility-before-ranking.
- Ranker input dışından ID ekleyemez.
- Hard-suppressed film hiçbir fallback’te dönmez.
- Seed determinism.
- Unique 10.
- Gerçek discovery slot.
- Decay zaman ilerledikçe azalır; permanent birikmez.
- Library update/delete profile refresh.
- Signal/RPC failure fail-closed veya açık tanımlı non-personalized ama eligible fallback.

Modal:

- Close button, Escape ve backdrop close.
- Modal content click’i kapatmaz.
- Focus trap ve exact invoker focus restore.
- aria dialog semantics.
- Body scroll lock cleanup.
- Same-title/different TMDb ID.
- Fast movie switching’de stale response boyanmaz.
- Close sırasında abort.
- Loading/error/empty provider durumları.
- Mobile viewport/responsive visual test.
- Search ve RoomRound entegrasyonunda nested interactive element olmaması.

## 19. Existing test-quality assessment

Mevcut test sonucu güçlü görünse de kapsamın niteliği sınırlıdır:

- 19 test dosyası ve 203 test geçiyor.
- candidate-pipeline ve eligibility pure logic testleri determinism ve policy intent’i için değerli.
- reusable-round-migration.test.ts gerçek SQL çalıştırmıyor; SQL metninde regex/string arıyor. Constraint/function semantiğini, transaction’ı, planner davranışını, cast sırasını veya lock yarışını kanıtlamaz.
- round-service testleri mock Supabase response’larına dayanıyor; RLS/grant ve gerçek RPC davranışını kanıtlamaz.
- “final attempt’te allow repeats” TypeScript testi var, fakat SQL fresh branch’inin bütün geçmişi dışlamadığını yakalamıyor.
- Gerçek PostgreSQL migration upgrade testi yok.
- Concurrency/isolation testi yok.
- İki-user RLS/privacy testi yok.
- Direct authenticated RPC bypass testi yok.
- Research scorer testleri mock/pure input düzeyinde; service fallback ve privacy yüzeyini kapsamıyor.
- MovieDetailModal henüz olmadığı için accessibility, close, stale response ve responsive testleri yok.

Bu nedenle yeşil unit/static test sonucu production DB güvenliği veya migration hazırlığı anlamına gelmez.

## 20. Validation commands and actual results

Komutlar mevcut package.json scripts ve kurulu node_modules ile çalıştırıldı. Hiçbir dependency kurulmadı veya güncellenmedi.

| Exact command | Exit code | Sonuç |
|---|---:|---|
| npm.cmd test | 0 | Vitest: 19 test file passed, 203 tests passed, 915 ms |
| npm.cmd run typecheck | 0 | tsc --noEmit başarılı |
| npm.cmd run lint | 0 | eslint başarılı |
| npm.cmd run build | 0 | Next.js 16.3.0 production build başarılı; 12 static page üretildi ve tüm dynamic routes derlendi |
| npm.cmd audit --omit=dev | 1 | İlk sandbox denemesi registry erişimi nedeniyle sonuç üretemedi |
| npm.cmd audit --omit=dev | 1 | Ağ erişimli read-only tekrar: 1 high severity; nanoid <3.3.18, GHSA-2v37-7h3g-55p8; fix available |

Build çıktısı .env.local dosyasının varlığını yalnız Next.js environment etiketi olarak gösterdi. Dosyanın içeriği okunmadı, yazdırılmadı veya değiştirilmedi.

Audit için npm audit fix çalıştırılmadı. Advisory remediation ayrı dependency değişikliği olarak ele alınmalı ve test/typecheck/lint/build tekrar edilmelidir.

## 21. Migration and deployment order

Mevcut durumda production’a hiçbir adım atılmamalı. High bulgular giderildikten sonra en güvenli sıra:

1. feature/reusable-room-candidates üzerinde yalnız reusable remediation’ları tamamla.
2. Unit/static testleri güncelle.
3. Production’dan bağımsız gerçek PostgreSQL/Supabase test ortamında:
   - fresh migration,
   - production-benzeri upgrade,
   - legacy app compatibility,
   - RLS ve concurrency testlerini çalıştır.
4. Sonuçları yeni pre-migration review/checkpoint raporunda kaydet.
5. Reusable-room kodunu tek reviewable checkpoint olarak commit et.
6. Backup/PITR doğrulamasından sonra backward-compatible DB migration’ını uygula.
7. Eski Vercel sürümünde read/create/reset/no-match smoke test yap.
8. Yeni Vercel sürümünü hemen deploy et ve iki-user smoke test yap.
9. Gözlem penceresi sonunda legacy RPC EXECUTE yolunu revoke/disable et.
10. Recommendation V1’i reusable checkpoint’ten açılan ayrı çalışma hattında seçici olarak uygula; research branch’i merge etme.
11. Recommendation schema + backend’i önce backward-compatible ve client’a kapalı deploy et; sonra app ranker entegrasyonunu aç.
12. MovieDetailModal veri endpoint’ini deploy et; ardından search ve RoomRound UI entegrasyonunu aç.

RR-03 giderilmezse adım 6 ile 8 arası güvenli değildir. Bu durumda migration-first yerine kısa koordineli bakım penceresi gerekir; application-first de yeni RPC/schema henüz yokken güvenli değildir.

## 22. Backup and rollback precautions

- Production migration öncesi Supabase backup/PITR kullanılabilirliğini ve restore prosedürünü gerçekten doğrula.
- Space, members, rounds, candidates, votes, selections, acceptances, library_items için sayım ve örnek checksum/snapshot kaydet.
- Migration transaction süresi, lock süresi ve function grants sonrasını gözle.
- App rollback boundary: Yeni Vercel’i önceki sürüme döndürmek ancak legacy RPC gerçekten backward-compatible ise güvenlidir.
- DB rollback boundary: Append-only dönüşüm ve yeni constraint/index/function’ları veri varken elle tersine çevirmek risklidir. Ad-hoc down migration veya DELETE kullanılmamalı; başarısız production migration’da doğrulanmış PITR/backup restore planı esas olmalı.
- Recommendation feature flag/backend fallback yalnız eligible set üzerinde çalışmalı; recommendation kapatıldığında reusable random/seeded eligible pipeline’a dönmeli.
- Modal rollback bağımsız olmalı: Search/RoomRound eski detay davranışına dönebilir; schema rollback gerektirmemeli.
- Legacy RPC revoke adımı yeni app’in stabilitesi doğrulandıktan sonra yapılmalı; revoke için ayrıca rollback script’i önceden hazırlanmalı.

## 23. Phased implementation order

Phase A — Reusable foundation repair:

- RR-01 fresh/repeat/discovery SQL düzeltmesi.
- RR-02 trusted candidate-plan boundary ve legacy RPC lifecycle.
- RR-03 legacy compatibility.
- Composite integrity ve cast-safe validation.
- Real DB/RLS/concurrency tests.
- Dependency advisory remediation.

Phase B — Reusable checkpoint:

- Dokümantasyon gerçek davranışla eşleştirilir.
- Bütün validations tekrar çalışır.
- Ayrı review ve checkpoint commit’i.
- Henüz Recommendation/UI kapsamı eklenmez.

Phase C — Recommendation data foundation:

- movie genre facts ve partner-safe profile schema.
- Profile normalization/refresh.
- Client’a kapalı grants.
- Real privacy tests.

Phase D — Recommendation ranking:

- Eligibility output contract.
- Pure scorer, decaying exposure, seed tie-break.
- Priority en fazla dokuz + bir gerçek discovery.
- Exactly-10 persistence ve version metadata.
- Eligible-only fallback.

Phase E — MovieDetailModal:

- TMDb detail endpoint/service.
- Reusable accessible modal.
- Önce search, sonra RoomRound/winner/pending entegrasyonu.
- Accessibility, stale-request ve responsive testleri.

Phase F — Staging/release:

- İki gerçek kullanıcıyla uçtan uca rehearsal.
- Migration/deployment sırası ve rollback provası.
- Gözlem sonrası legacy yolun kapatılması.

## 24. Blocking decisions, only if genuinely unavoidable

Şu anda kullanıcıdan ürün kapsamını değiştiren zorunlu bir karar gerekmiyor. Teknik güvenlik ve migration düzeltmeleri mevcut gereksinimlerden doğrudan çıkarılabilir.

Implementasyon başlamadan önce versioned policy içinde açıkça sabitlenmesi gereken, fakat bu audit’i bloke etmeyen üç değer vardır:

- “Positively rated” için rating eşiği.
- Exposure decay window/half-life.
- Legacy RPC’nin revoke edileceği rollout gözlem süresi.

Bunlar varsayılanlarla kod içine gizlenmemeli; policy version ile kaydedilmelidir.

## 25. Final verdict

NO-GO — reusable-room foundation requires fixes
