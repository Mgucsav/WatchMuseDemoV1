# WatchMuse — Mevcut Vercel + Supabase Yapısına Güvenli Entegrasyon Teslimi

**Tarih:** 24 Ağustos 2026  
**Kaynak çalışma dalı:** `feature/reusable-room-candidates`  
**Başlangıç commit'i:** `ccce84b` (`feat: add shared room film selection`)  
**Hedef:** Halihazırda çalışan ve mevcut bir Supabase projesine bağlı Vercel
uygulamasına reusable-room değişikliklerini veri kaybetmeden entegre etmek.

## 1. Mevcut altyapı hakkında bağlayıcı bilgi

- Kullanıcının çalışan bir Vercel deployment'ı vardır.
- Vercel uygulaması hâlihazırda çalışan bir Supabase projesine bağlıdır.
- Yeni bir production Supabase projesi oluşturulmayacaktır.
- Mevcut Supabase projesi silinmeyecek, sıfırlanmayacak veya yeniden
  oluşturulmayacaktır.
- `.env.local`, Vercel environment değerleri ve Supabase anahtarları
  paylaşılmayacak ya da Git'e eklenmeyecektir.
- Bu teslim hazırlanırken Vercel'e deploy, Supabase'e migration, Git commit veya
  Git push yapılmamıştır.

> Ayrı staging/Supabase Branch kullanılması yalnızca production verisini korumak
> için önerilen bir doğrulama yöntemidir. Mevcut production projesinin yerine yeni
> bir proje kurma talebi değildir.

## 2. Uygulanan kod değişikliğinin özeti

Bekleyen çalışma, mevcut iki kişilik oda sistemini kalıcı ve tekrar kullanılabilir
hale getirir:

- Bir odada geçmişi silmeden birden fazla append-only tur tutulur.
- Her tur `round_number`, seçim seed'i ve politika/ranker sürümleriyle kaydedilir.
- Her yeni tur tam 10 benzersiz aday üretir.
- Ortak `skip + skip` sonucu filmi aynı odada 30 gün bastırır.
- Ortak `want + want` olup çarkta seçilmeyen film 14 gün içinde bir kez öncelikli
  dönebilir.
- Çarkın seçtiği film için 7 günlük kişisel kabul penceresi açılır.
- Kabul yalnızca işlemi yapan kullanıcının kişisel watchlist kaydını etkiler.
- Eski turlar, adaylar, oylar ve seçim olayları silinmez.
- Polling yalnız gerekli durumlarda çalışacak şekilde azaltılmıştır.
- Partner oyları, partner kütüphanesi ve partner kabul bilgisi API yanıtına
  eklenmemiştir.

Ana migration:

```text
supabase/migrations/20260813000100_reusable_rounds.sql
```

Yeni ana API:

```text
POST /api/rooms/[spaceId]/selection
```

## 3. Şu ana kadarki doğrulama sonuçları

24 Ağustos 2026 tarihinde çalışma ağacında aşağıdaki kontroller çalıştırılmıştır:

| Kontrol | Sonuç |
| --- | --- |
| `npm.cmd run lint` | PASS |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd test` | PASS — 19 dosya, 203 test |
| `npm.cmd run build` | PASS — Next.js 16.3 production build |
| `git diff --check` | PASS |
| Manuel kod incelemesi | Bloklayıcı uygulama hatası görülmedi |

İlk build denemesi yalnız sandbox içinden Google Fonts'a erişilemediği için
durmuş, ağ erişimi olan ikinci denemede eksiksiz geçmiştir.

### Açık güvenlik bulgusu

`npm.cmd audit --omit=dev` şu bulguyu vermiştir:

```text
nanoid 3.3.17
GHSA-2v37-7h3g-55p8
Severity: high
Fix available
```

Bağımlılık yolu:

```text
next@16.3.0 -> postcss -> nanoid@3.3.17
@tailwindcss/postcss -> postcss -> nanoid@3.3.17
```

Bu Supabase migration hatası değildir. Commit öncesinde güvenli bağımlılık/lock
file güncellemesi yapılmalı; ardından lint, typecheck, test, build ve audit yeniden
çalıştırılmalıdır. Körlemesine geniş sürüm yükseltmesi yapılmamalıdır.

## 4. En önemli açık risk

`20260813000100_reusable_rounds.sql` statik test ve kod incelemesinden geçmiştir,
ancak gerçek Supabase/Postgres üzerinde henüz uygulanıp doğrulanmamıştır.

Henüz gerçek veritabanında doğrulanmayanlar:

- SQL parse/execution sonucu,
- RLS ve GRANT/REVOKE davranışı,
- eşzamanlı iki yeni tur isteğinin kilit davranışı,
- acceptance ile yeni tur yarışının transaction sırası,
- mevcut production verisinin migration sonrası backfill sonucu,
- constraint, trigger ve foreign-key davranışları.

Bu nedenle migration doğrulanmadan production deployment tetiklenmemelidir.

## 5. Mevcut Supabase için zorunlu preflight

Ana çalışma ortamındaki kişi/ajan önce Vercel'in hangi Supabase projesine bağlı
olduğunu doğrulamalıdır. Proje URL'si karşılaştırılabilir; anahtar değerleri loga,
sohbete veya Git'e yazılmamalıdır.

Supabase SQL Editor'da salt-okunur olarak çalıştır:

```sql
select
  to_regclass('public.spaces') as spaces,
  to_regclass('public.participants') as participants,
  to_regclass('public.space_rounds') as space_rounds,
  to_regclass('public.room_candidates') as room_candidates,
  to_regclass('public.room_votes') as room_votes,
  to_regclass('public.library_items') as library_items;
```

Altı değer de `null` olmamalıdır. Ardından mevcut yeni migration durumunu kontrol
et:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'space_rounds'
  and column_name in (
    'round_number',
    'selection_seed',
    'selection_policy_version',
    'ranker_version'
  )
order by column_name;
```

- Sıfır satır: yeni reusable-room migration büyük olasılıkla uygulanmamıştır.
- Dört satır: migration tamamen veya kısmen uygulanmış olabilir; yeniden
  çalıştırmadan önce tablolar, fonksiyonlar ve migration geçmişi incelenmelidir.
- Bir ile üç satır: muhtemel yarım/manuel uygulama vardır; migration kesinlikle
  tekrar körlemesine çalıştırılmamalıdır.

Migration geçmişi CLI ile yönetiliyorsa ayrıca:

```bash
supabase migration list
```

Manuel SQL Editor ve `supabase db push` yöntemleri kontrolsüz biçimde
karıştırılmamalıdır. `migration repair` yalnız gerçek şema ile migration geçmişi
ayrıntılı karşılaştırıldıktan sonra kullanılmalıdır.

## 6. Güvenli uygulama sırası

Tercih edilen sıra:

1. Mevcut Supabase veritabanının güncel yedeğini al.
2. Mümkünse Supabase Branch veya mevcut production şemasının staging kopyasında
   migration'ı doğrula.
3. Mevcut veritabanında önceki oda migration'larının uygulanmış olduğunu preflight
   sorgularıyla doğrula.
4. Production'da önceki beş migration zaten varsa yalnız şu yeni migration'ı
   uygula:

   ```text
   20260813000100_reusable_rounds.sql
   ```

5. Migration sonrası doğrulama sorgularını çalıştır.
6. İki ayrı tarayıcı oturumuyla uçtan uca oda testini tamamla.
7. Ancak bundan sonra yeni uygulama kodunu Vercel'e deploy et.
8. Deploy sonrası aynı smoke testi bir kez daha çalıştır.

Migration-first sıra bilinçlidir. Yeni migration eski
`create_or_reset_space_round(uuid,jsonb,boolean)` imzasını append-only compatibility
wrapper olarak korur. Buna rağmen gerçek DB testi yapılmadan bu uyumluluk
production için doğrulanmış sayılmamalıdır.

Vercel ana dala yapılan push ile otomatik production deploy ediyorsa migration ve
smoke test tamamlanmadan ana dala push/merge yapılmamalıdır. Önce feature branch'e
push yapılacaksa Preview environment'ın hangi Supabase projesine bağlı olduğu
mutlaka kontrol edilmelidir; Preview'ın yanlışlıkla production Supabase'e yazması
engellenmelidir.

## 7. Migration sonrası veritabanı doğrulaması

### RLS

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'space_rounds',
    'room_candidates',
    'room_votes',
    'room_selections',
    'room_selection_acceptances'
  )
order by tablename;
```

Beklenen: Beş satır ve tamamında `rowsecurity = true`.

### Fonksiyon güvenliği

```sql
select
  p.proname,
  p.prosecdef as security_definer,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'start_next_space_round',
    'get_space_round_state',
    'accept_room_selection'
  )
order by p.proname;
```

Beklenen: Üç fonksiyon, `security_definer = true`, sabit boş `search_path`.

### RPC ayrıcalıkları

```sql
select
  has_function_privilege(
    'anon',
    'public.accept_room_selection(uuid,uuid)',
    'execute'
  ) as anon_can_accept,
  has_function_privilege(
    'authenticated',
    'public.accept_room_selection(uuid,uuid)',
    'execute'
  ) as authenticated_can_accept;
```

Beklenen:

```text
anon_can_accept = false
authenticated_can_accept = true
```

### Aynı odada birden fazla aktif tur kontrolü

```sql
select space_id, count(*) as active_rounds
from public.space_rounds
where status in ('voting', 'matching', 'spinning')
group by space_id
having count(*) > 1;
```

Beklenen: Sıfır satır.

## 8. İki tarayıcı uçtan uca testi

1. Supabase Dashboard'da Anonymous Sign-Ins açık olmalıdır.
2. Test için normal pencere ve gizli pencere kullan.
3. Normal pencerede oda oluştur, daveti gizli pencerede aç.
4. İki tarafta aynı 10 film ve aynı sıra görünmelidir.
5. Her iki tarafta 10 oyu tamamla; en az iki ortak `want` oluştur.
6. Ortak adaylar yalnız iki taraf da bitirince görünmelidir.
7. Bir taraftan çarkı başlat; iki tarafta aynı kazanan görünmelidir.
8. Yalnız bir kullanıcı `İzleme listeme ekle` seçsin.
9. Yalnız o kullanıcının `library_items` kaydı değişmelidir.
10. Partnerin kabul/kütüphane bilgisi API yanıtında görünmemelidir.
11. Yeni tur başlat; `round_number` artmalı, eski adaylar ve oylar kalmalıdır.
12. İki pencereden eşzamanlı yeni tur başlatmayı dene; tek aktif tur oluşmalıdır.
13. Aynı acceptance butonunu tekrar dene; ikinci acceptance satırı oluşmamalıdır.

Test sırasında production kullanıcılarının gerçek odaları kullanılmamalıdır. Ayrı
test kullanıcıları/anonim tarayıcı oturumları ve ayrı bir test odası kullanılmalıdır.

## 9. Git çalışma ağacı ve commit kapsamı

İnceleme sırasında dalın HEAD'i `ccce84b` idi ve yeni çalışma henüz commitli
değildi. Toplam 10 değiştirilmiş ve 15 takip edilmeyen dosya bulunuyordu; bu teslim
dosyası oluşturulduktan sonra takip edilmeyen dosya sayısı bir artar.

`git add .` önerilmez. Şu iki takip edilmeyen mimari belge daha önce özellikle
korunmuş ve stage edilmemiştir:

```text
WATCHMUSE_CURRENT_ARCHITECTURE_AND_HANDOFF_2026-08-12.md
WATCHMUSE_REUSABLE_ROOM_CANDIDATE_ARCHITECTURE_AUDIT.md
```

Commit kapsamına alınıp alınmayacaklarına bilinçli karar verilmelidir.

Önerilen feature branch push hedefi:

```bash
git push -u origin feature/reusable-room-candidates
```

Bu komut ancak bağımlılık düzeltmesi, yeniden doğrulama ve bilinçli staging/commit
sonrasında çalıştırılmalıdır.

## 10. Kesinlikle yapılmaması gerekenler

- Mevcut Supabase projesini resetlemek veya silmek.
- Production'da `supabase db reset` çalıştırmak.
- Altı migration'ı mevcut veritabanına durum kontrolü yapmadan baştan uygulamak.
- Yeni migration'ı aynı veritabanında tekrar tekrar çalıştırmak.
- Uygulanmış migration dosyasını sonradan değiştirip yeniden çalıştırmak.
- `service_role` anahtarını `.env.local`, Vercel client environment veya Git'e
  eklemek.
- Migration uygulanmadan yeni kodu production'a deploy etmek.
- Vercel Preview'ın production Supabase'e bağlı olduğunu kontrol etmeden uçtan uca
  yazma testi yapmak.
- Yedek almadan production şemasını değiştirmek.

## 11. Ana çalışma ortamından beklenen çıktı

Ana çalışma ortamındaki kişi/ajan aşağıdaki sonuçları açıkça raporlamalıdır:

1. Vercel Production ve Preview'ın hangi Supabase ortamına bağlı olduğu
   doğrulandı mı? Anahtarlar açıklanmadan yalnız ortam eşlemesi raporlanmalı.
2. Yeni migration daha önce uygulanmış mı?
3. Yedek alındı mı?
4. Migration hangi ortamda denendi ve sonucu ne oldu?
5. RLS/fonksiyon/privilege sorgularının sonucu ne oldu?
6. İki tarayıcı testi geçti mi?
7. `nanoid` bildirimi giderildi mi ve audit sonucu ne oldu?
8. Lint, typecheck, 203 test ve production build yeniden geçti mi?
9. Hangi dosyalar commitlendi?
10. Feature branch pushlandı mı, Vercel Preview/Production deploy sonucu ne oldu?

Bu maddeler tamamlanmadan “production için doğrulandı” denmemelidir.
