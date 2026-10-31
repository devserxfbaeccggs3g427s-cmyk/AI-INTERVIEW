/**
 * Bio panel — sinh trắc hôm nay (task §20).
 *
 * ⚠️ Thiếu dữ liệu hiện "—", **không** hiện 0 (0 là một giá trị có nghĩa —
 * tâm trạng = 0 khác với "chưa ghi nhận").
 */
export interface BioPanelProps {
  mood: number | null;
  energy: number | null;
  sleep: number | null;
  focus: number | null;
}

export function BioPanel({ mood, energy, sleep, focus }: BioPanelProps) {
  const tiles: Array<{ label: string; value: number | null; suffix: string }> = [
    { label: "Tâm trạng", value: mood, suffix: "/5" },
    { label: "Năng lượng", value: energy, suffix: "/5" },
    { label: "Độ tập trung", value: focus, suffix: "/5" },
    { label: "Giấc ngủ", value: sleep, suffix: "h" },
  ];

  const hasAny = tiles.some((tile) => tile.value !== null);

  return (
    <div className="flex flex-col justify-between rounded-xl bg-surface-container-low p-space-lg shadow-md">
      <div>
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
          Sinh trắc & nhịp độ
        </span>
        <div className="mt-space-sm grid grid-cols-2 gap-space-sm">
          {tiles.map((tile) => (
            <BioTile key={tile.label} {...tile} />
          ))}
        </div>
      </div>

      {!hasAny && (
        <p className="mt-space-md font-label-sm text-label-sm text-tertiary">
          Chưa có dữ liệu sinh trắc hôm nay
        </p>
      )}
    </div>
  );
}

function BioTile({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | null;
  suffix: string;
}) {
  return (
    <div className="rounded-lg bg-surface-container p-space-sm">
      <div className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
        {label}
      </div>
      <div className="mt-space-xs font-headline-sm text-headline-sm text-on-surface tabular">
        {value === null ? "—" : `${value}${suffix}`}
      </div>
    </div>
  );
}
