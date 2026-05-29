// Static, auth-free offline fallback. Rendered by the service worker when a
// document navigation fails with no network. No data fetch, no Clerk, no DB —
// it must work entirely from cache.
export const metadata = {
  title: "Offline — Repetita",
};

export default function OfflinePage() {
  return (
    <div
      className="min-h-dvh flex items-center justify-center px-6"
      style={{ color: "var(--color-foreground)" }}
    >
      <div className="text-center max-w-sm">
        <div
          className="mx-auto mb-6 flex items-center justify-center rounded-full"
          style={{
            width: 64,
            height: 64,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <span style={{ fontSize: 28 }}>📡</span>
        </div>
        <h1
          className="mb-3"
          style={{
            fontFamily: "var(--font-dm-serif-display), serif",
            fontSize: 28,
          }}
        >
          You&rsquo;re offline
        </h1>
        <p style={{ color: "var(--color-muted)", lineHeight: 1.6 }}>
          Repetita can&rsquo;t reach the network right now. Check your connection —
          the app will pick up where you left off as soon as you&rsquo;re back online.
        </p>
      </div>
    </div>
  );
}
