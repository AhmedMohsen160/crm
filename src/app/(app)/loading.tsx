export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-52 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200/70" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-slate-200/70" />
    </div>
  );
}
