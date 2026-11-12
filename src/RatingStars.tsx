import { useState } from "react";
import { Star } from "lucide-react";

function StarGlyph({ fraction }: { fraction: number }) {
  return (
    <span className="star-symbol">
      <Star className="star-outline" aria-hidden="true" />
      <span
        className="star-fill"
        style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }}
      >
        <Star aria-hidden="true" />
      </span>
    </span>
  );
}

export function StarDisplay({ rating }: { rating: number }) {
  return (
    <span
      className="star-display"
      role="img"
      aria-label={`${rating / 2} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <StarGlyph key={i} fraction={rating / 2 - i} />
      ))}
    </span>
  );
}

export default function RatingStars({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  function valueAt(event: React.PointerEvent<HTMLDivElement>) {
    const stars = Array.from(event.currentTarget.children).map((element) =>
      element.getBoundingClientRect(),
    );
    const nearest = stars.reduce(
      (best, rect, index) =>
        Math.abs(event.clientX - (rect.left + rect.width / 2)) <
        Math.abs(event.clientX - (stars[best].left + stars[best].width / 2))
          ? index
          : best,
      0,
    );
    const rect = stars[nearest];
    return nearest * 2 + (event.clientX < rect.left + rect.width / 2 ? 1 : 2);
  }
  return (
    <div
      className="star-control"
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Your rating"
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={value / 2}
      aria-valuetext={`${value / 2} out of 5 stars`}
      aria-disabled={disabled}
      onKeyDown={(event) => {
        if (disabled) return;
        let next = value;
        if (event.key === "ArrowRight" || event.key === "ArrowUp")
          next = Math.min(10, Math.floor(value) + 1);
        else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
          next = Math.max(0, Math.ceil(value) - 1);
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = 10;
        else return;
        event.preventDefault();
        setPreview(null);
        onChange(next);
      }}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        onChange(valueAt(event));
        setPreview(null);
      }}
      onPointerMove={(event) => {
        if (disabled) return;
        const next = valueAt(event);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          onChange(next);
          setPreview(null);
        } else if (event.pointerType === "mouse") setPreview(next);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
          setPreview(null);
        }
      }}
      onPointerLeave={() => setPreview(null)}
      onPointerCancel={() => setPreview(null)}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <StarGlyph key={i} fraction={(preview ?? value) / 2 - i} />
      ))}
    </div>
  );
}
