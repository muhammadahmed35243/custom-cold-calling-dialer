export function StatRow({ stats }: { stats: { label: string; value: string | number }[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="card px-4 py-4 sm:px-5">
          <div className="eyebrow mb-2">{stat.label}</div>
          <div className="text-2xl sm:text-[28px] leading-none font-semibold tracking-tight text-foreground tabular-nums">{stat.value}</div>
        </div>
      ))}
    </div>
  );
}
