import { formatNaira } from "./format";

export function BarChart({
  data,
  height = 160,
  label,
  money = true,
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
  label: string;
  money?: boolean;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barWidth = 100 / Math.max(1, data.length);
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <figure>
      <svg viewBox={`0 0 100 ${height / 4}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label={`${label}: total ${money ? formatNaira(total) : total}`}>
        {data.map((d, i) => {
          const h = (d.value / max) * (height / 4 - 1);
          return (
            <rect key={d.label} x={i * barWidth + barWidth * 0.15} y={height / 4 - h} width={barWidth * 0.7} height={Math.max(0.3, h)} className={d.value ? "fill-persimmon" : "fill-ink/10"}>
              <title>{`${d.label}: ${money ? formatNaira(d.value) : d.value}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex justify-between text-[10px] pl-mono text-ink/50">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </figcaption>
    </figure>
  );
}
