const TONES = {
  info: "border-line-10 bg-fill-subtle text-ink-70",
  error:
    "border-error-border bg-error-surface text-error-text",
  warning:
    "border-warning-border bg-warning-surface text-warning-text",
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
