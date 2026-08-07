const TONES = {
  info: "border-black/10 bg-black/[0.03] text-black/70 dark:border-white/15 dark:bg-white/5 dark:text-white/70",
  error:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200",
  warning:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200",
} as const;

/** Boş sonuç, yapılandırma hatası ve API hatası gibi durumlar için ortak kutu. */
export function StatusMessage({
  tone = "info",
  title,
  children,
}: {
  tone?: keyof typeof TONES;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3 py-3 text-sm ${TONES[tone]}`}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}
