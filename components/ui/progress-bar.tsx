/**
 * A share of the to-do list, drawn as a bar with the same figure stated in
 * words beneath it.
 *
 * The fill is graphite rather than the signal blue: blue is reserved for links
 * and focus rings, and a blue bar would read as something to click. The track
 * carries a hairline because `raised` on `surface` is too faint on its own to
 * show where an almost-empty bar ends.
 *
 * `label` is the accessible value as well as the visible one — a bar whose only
 * channel is the length of a rectangle tells a screen reader nothing.
 */
export function ProgressBar({
  value,
  label,
}: {
  /** The share to fill, 0 to 1. Anything outside that range is clamped. */
  value: number;
  label: string;
}) {
  const percent = Math.round(Math.min(Math.max(value, 0), 1) * 100);

  return (
    <div className="w-full">
      <div
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        aria-valuetext={label}
        className="h-2 w-full border border-edge bg-raised"
        role="progressbar"
      >
        <div className="h-full bg-ink" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-ink-soft text-sm tabular-nums">{label}</p>
    </div>
  );
}
