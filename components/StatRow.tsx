export function StatRow({ stats }: { stats: { label: string; value: string | number }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-secondary rounded-xl px-5 py-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{stat.label}</div>
          <div className="text-2xl font-semibold text-foreground">{stat.value}</div>
        </div>
      ))}
    </div>
  );
}
