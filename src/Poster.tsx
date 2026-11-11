import type { Movie } from "./catalog";
import posters from "./imdb-posters.json";
import { useEffect, useState } from "react";
import { Film } from "lucide-react";
export default function Poster({
  movie,
  framing,
}: {
  movie: Movie;
  framing?: "discovery";
}) {
  const poster = posters[movie.id as keyof typeof posters];
  const [missing, setMissing] = useState(false);
  useEffect(() => setMissing(false), [movie.id]);
  const id = movie.imdbId ?? poster?.imdbId ?? movie.id;
  const fallback = poster
    ? new URL(poster.fallback, new URL(".", document.baseURI)).href
    : `https://images.metahub.space/poster/medium/${encodeURIComponent(id)}/img`;
  if (missing)
    return (
      <div
        className="poster poster-unavailable"
        role="img"
        aria-label={`Poster unavailable for ${movie.title}`}
      >
        <Film size={26} />
        <span>Poster unavailable</span>
      </div>
    );
  return (
    <img
      className="poster poster-cinematic"
      key={movie.id}
      src={movie.posterUrl ?? poster?.src ?? fallback}
      alt={`${movie.title} — original poster`}
      data-imdb-id={id}
      referrerPolicy="no-referrer"
      onError={(event) => {
        if (event.currentTarget.src !== fallback)
          event.currentTarget.src = fallback;
        else setMissing(true);
      }}
      draggable={false}
      loading={framing ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
