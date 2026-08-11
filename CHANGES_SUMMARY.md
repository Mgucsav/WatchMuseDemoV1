# Proje — Değişiklikler ve Çalıştırma Talimatları

Bu depo basitleştirildi ve gereksiz dökümanlar kaldırıldı. Aşağıda yapılan değişiklikler, nasıl çalıştıracağınız ve önemli notlar yer alıyor.

## Yapılan Değişiklikler
- `.env.local` düzenlendi: proje, `TMDB_ACCESS_TOKEN` ile TMDb'ye bağlanır. Geliştirme için `DEMO` değeri kullanılarak sahte veriler döndürülebilir.
- `src/lib/tmdb/client.ts` içine `DEMO` modu eklendi: `TMDB_ACCESS_TOKEN=DEMO` ise gerçek API çağrısı yapılmaz; `search` ve `providers` uç noktaları için sahte yanıtlar döner.
- `src/lib/tmdb/search.ts` güncellendi: arama sorgusunun dilini basitçe tespit eder (Türkçe karakter var mı), önce tercih edilen dilde arama yapar; sonuç yoksa diğer dilde tekrar dener. Böylece hem Türkçe hem İngilizce aramalar desteklenir.

## Kalan Dosyalar (Önemli)
- `src/lib/tmdb/*` — TMDb istemcisi ve yardımcı fonksiyonlar
- `src/app` — Next.js uygulama kodu (sayfalar, API route'ları, bileşenler)
- `.env.local` — ortam değişkenleri (lütfen gizli token'ınızı buraya yapıştırın)

## Nasıl Çalıştırılır
1. `.env.local` içindeki `TMDB_ACCESS_TOKEN` değerini ayarlayın:

   - Gerçek TMDb token'ınız varsa onu yapıştırın (örnek: `TMDB_ACCESS_TOKEN=eyJ...`).
   - Geliştirme/sahte veri için `TMDB_ACCESS_TOKEN=DEMO` bırakabilirsiniz.

2. Geliştirme sunucusunu başlatın:

```powershell
npm install
npm run dev
```

3. Tarayıcıda `http://localhost:3000` adresini açın ve arama kutusuna Türkçe veya İngilizce film isimleri girin.

## Önemli Notlar
- Demo modu poster URL'leri sahte `demo-poster.png` kullanıyor; eğer posterler görünmüyorsa bu normaldir. Gerçek token ile gerçek posterler gelecektir.
- Token hiçbir koşulda tarayıcıya gönderilmez — `server-only` kısıtlamaları uygulanır.

## İleride Yapılabilecekler
- Sahte posterleri `public/` içine ekleyip demo görselliğini iyileştirebilirim.
- Daha gelişmiş dil algılama veya lokalizasyon ekleyebilirim.

---
Eğer istiyorsanız, `.env.local` içine gerçek token'ı ekleyip ben sunucuyu tekrar başlatayım ve gerçek TMDb sonuçlarını doğrulayayım.
