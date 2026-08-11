/**
 * `server-only` paketinin test çalıştırıcısı için no-op karşılığı.
 *
 * Gerçek paket yalnızca bir bundler bağlamında çözülebilir ve istemci
 * bileşenlerinden import edildiğinde derlemeyi kasıtlı olarak kırar.
 * Bu stub SADECE Vitest tarafından kullanılır (bkz. `vitest.config.ts`);
 * uygulama kaynağındaki `import "server-only"` koruması olduğu gibi kalır,
 * hiçbir sunucu/istemci sınırı gevşetilmez.
 */
export {};
