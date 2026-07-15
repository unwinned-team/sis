export function BackgroundOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <span className="orb orb-drift-1 left-[-10%] top-[-15%] h-[45vmax] w-[45vmax] bg-emerald-400/60" />
      <span className="orb orb-drift-2 right-[-12%] top-[10%] h-[40vmax] w-[40vmax] bg-sky-400/60" />
      <span className="orb orb-drift-3 bottom-[-20%] left-[15%] h-[42vmax] w-[42vmax] bg-teal-300/55" />
      <span className="orb orb-drift-4 bottom-[5%] right-[20%] h-[30vmax] w-[30vmax] bg-blue-500/50" />
      <span className="orb orb-drift-2 left-[35%] top-[30%] h-[24vmax] w-[24vmax] bg-green-300/50" />
    </div>
  );
}
