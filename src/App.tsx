import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Clapperboard,
  Bookmark,
  Aperture,
  Heart,
  Star,
  X,
  Check,
  Trash2,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { type Movie } from "./catalog";
import {
  catalogStatus,
  discoverPage,
  initialCatalog,
  enrichSavedTitles,
  ensureTitle,
  moreCandidates,
  searchCatalog,
  type CatalogStatus,
} from "./catalogService";
import { buildTasteProfile, recommend } from "./recommendations";
import {
  db,
  saveAction,
  removeEntry,
  revisitDismissed,
  type Entry,
  type Status,
} from "./db";
import Poster from "./Poster";
import Wordmark from "./Wordmark";
import { cardTheme } from "./cardTheme";
import RatingStars, { StarDisplay } from "./RatingStars";
const sections = [
  { id: "discover", label: "Discover", icon: Clapperboard },
  { id: "watchlist", label: "Watchlist", icon: Bookmark },
  { id: "rated", label: "Rated", icon: Star },
  { id: "for-you", label: "For You", icon: Aperture },
] as const;
type Section = (typeof sections)[number]["id"];
export default function App() {
  const [page, setPage] = useState<Section>("discover");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [ready, setReady] = useState(false);
  const [catalogState, setCatalogState] = useState<CatalogStatus | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const queryRef = useRef(query);
  queryRef.current = query;
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [searchError, setSearchError] = useState("");
  const candidateRequest = useRef(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const actionButtons = useRef<Partial<Record<Status, HTMLButtonElement>>>({});
  const [ratingMovie, setRatingMovie] = useState<Movie | null>(null);
  const [rating, setRating] = useState(7);
  const modal = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [titleFilter, setTitleFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "movie" | "tv">("");
  const [filterPage, setFilterPage] = useState(0);
  const [filterLoading, setFilterLoading] = useState(false);
  const [filterError, setFilterError] = useState(false);
  const [filterRetry, setFilterRetry] = useState(0);
  const [filterEnd, setFilterEnd] = useState(false);
  const [details, setDetails] = useState<Movie | null>(null);
  const detailsDialog = useRef<HTMLDialogElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drag, setDrag] = useState(0);
  const [exit, setExit] = useState(0);
  const pointer = useRef<{ id: number; x: number; y: number; poster: boolean; moved: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ranked = useMemo(() => recommend(movies, entries), [movies, entries]);
  const profile = useMemo(
    () => buildTasteProfile(movies, entries),
    [movies, entries],
  );
  const hasFilters = Boolean(titleFilter.trim() || genreFilter || typeFilter);
  function matchesFilters(movie: Movie) {
    return (!titleFilter.trim() || movie.title.toLocaleLowerCase().includes(titleFilter.trim().toLocaleLowerCase())) &&
      (!genreFilter || movie.genres.includes(genreFilter)) &&
      (!typeFilter || movie.mediaType === typeFilter);
  }
  const discoverRanked = hasFilters ? recommend(movies.filter(matchesFilters), entries) : ranked;
  const active =
    movies.find((movie) => movie.id === activeId && matchesFilters(movie) &&
      !entries.some((entry) => entry.movieId === movie.id)) ?? discoverRanked[0]?.movie;
  useEffect(() => {
    if (active?.id !== activeId) setActiveId(active?.id ?? null);
  }, [active?.id, activeId]);
  useEffect(() => {
    let live = true;
    if (page !== "discover" || !hasFilters || !catalogState) {
      setFilterLoading(false);
      return;
    }
    setFilterLoading(true);
    setFilterError(false);
    const delay = setTimeout(async () => {
      try {
        const found = await discoverPage(typeFilter, genreFilter, titleFilter.trim(), filterPage);
        if (live) {
          mergeTitles(found);
          setFilterEnd(found.length === 0);
        }
      } catch {
        if (live) setFilterError(true);
      } finally {
        if (live) setFilterLoading(false);
      }
    }, 250);
    return () => { live = false; clearTimeout(delay); };
  }, [page, hasFilters, catalogState, typeFilter, genreFilter, titleFilter, filterPage, filterRetry]);
  useEffect(() => {
    const dialog = detailsDialog.current;
    if (details && dialog && !dialog.open) dialog.showModal();
    if (!details && dialog?.open) dialog.close();
  }, [details]);
  useEffect(() => () => {
    if (pressTimer.current !== null) clearTimeout(pressTimer.current);
    pointer.current = null;
  }, [active?.id, page]);
  function openDetails(movie: Movie) {
    setDetails(movie);
    void ensureTitle(movie).then((full) => {
      mergeTitles([full]);
      setDetails((current) => current?.id === full.id ? { ...full, metadataComplete: true } : current);
    }).catch(() => {
      setDetails((current) => current?.id === movie.id ? { ...current, metadataComplete: true } : current);
    });
  }
  function mergeTitles(titles: Movie[]) {
    setMovies((current) => [
      ...new Map([...current, ...titles].map((m) => [m.id, m])).values(),
    ]);
  }
  async function refill(
    current: Entry[],
    pool = movies,
    online = Boolean(catalogState),
  ) {
    if (!online) return;
    const request = ++candidateRequest.current;
    try {
      const titles = await moreCandidates(pool, current);
      if (request === candidateRequest.current) mergeTitles(titles);
    } catch {
      /* Keep cached discovery usable during a local catalog interruption. */
    }
  }
  async function refresh() {
    const current = await db.entries.toArray();
    setEntries(current);
    void refill(current);
  }
  useEffect(() => {
    let live = true;
    db.entries
      .toArray()
      .then(async (e) => {
        const [m, status] = await Promise.all([
          initialCatalog(e),
          catalogStatus(),
        ]);
        if (!live) return;
        setMovies(m);
        setEntries(e);
        setCatalogState(status);
        setReady(true);
        void refill(e, m, Boolean(status));
        if (status) void enrichSavedTitles(e, m, (titles) => {
          if (live) mergeTitles(titles);
        }).catch(() => { /* Cached metadata stays available. */ });
      })
      .catch(() =>
        setError(
          "Your browser could not open local storage. Allow site storage, then reload to try again.",
        ),
      );
    return () => {
      live = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    let live = true;
    if (!query.trim()) {
      setSearchResults([]);
      setSearchError("");
      setSearching(false);
      setCanLoadMore(false);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const found = catalogState
          ? await searchCatalog(query)
          : movies.filter((m) =>
              m.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
            );
        if (live) {
          setSearchResults(found);
          setCanLoadMore(Boolean(catalogState) && found.length === 40);
          mergeTitles(found);
          setSearchError(
            catalogState
              ? ""
              : "Showing cached titles while the online catalog is unavailable.",
          );
        }
      } catch {
        if (live)
          setSearchError(
            "The online catalog is unavailable. Please try again.",
          );
      } finally {
        if (live) setSearching(false);
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [query, catalogState]);
  async function loadMoreSearch() {
    const currentQuery = query;
    setSearching(true);
    try {
      const found = await searchCatalog(currentQuery, searchResults.length);
      if (currentQuery === queryRef.current) {
        setSearchResults((current) => [
          ...new Map([...current, ...found].map((m) => [m.id, m])).values(),
        ]);
        mergeTitles(found);
        setCanLoadMore(found.length === 40);
      }
    } catch {
      if (currentQuery === queryRef.current)
        setSearchError("Could not load more titles. Please try again.");
    } finally {
      if (currentQuery === queryRef.current) setSearching(false);
    }
  }
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 2800);
    return () => clearTimeout(id);
  }, [notice]);
  function pulseAction(status: Status) {
    const button = actionButtons.current[status];
    if (!button) return;
    button.getAnimations().forEach((animation) => animation.cancel());
    const shadow = getComputedStyle(button).boxShadow;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    button.animate(
      reduced
        ? [
            { borderColor: "#974321", boxShadow: "0 0 0 3px #be8c5555" },
            { borderColor: "#d5b58d", boxShadow: shadow },
          ]
        : [
            { transform: "translateY(0) scale(1)", boxShadow: shadow },
            {
              transform: "translateY(2px) scale(.91)",
              boxShadow: "inset 0 3px 8px #9b714044,0 2px 5px #76532b16",
              offset: 0.28,
            },
            {
              transform: "translateY(-1px) scale(1.035)",
              boxShadow: "0 0 0 6px #d9b67c44,0 7px 14px #76532b20",
              offset: 0.7,
            },
            { transform: "translateY(0) scale(1)", boxShadow: shadow },
          ],
      { duration: reduced ? 180 : 360, easing: "cubic-bezier(.22,.7,.24,1)" },
    );
  }
  function openRating(movie: Movie) {
    if (page === "discover") pulseAction("rated");
    opener.current = document.activeElement as HTMLElement;
    setRating(entries.find((e) => e.movieId === movie.id)?.rating ?? 7);
    setRatingMovie(movie);
    void ensureTitle(movie).then((title) => mergeTitles([title])).catch(() => {});
  }
  useEffect(() => {
    if (ratingMovie) modal.current?.showModal();
    else {
      modal.current?.close();
      opener.current?.focus();
    }
  }, [ratingMovie]);
  async function act(movie: Movie, status: Status, value?: number) {
    if (lock.current) return;
    lock.current = true;
    if (page === "discover") pulseAction(status);
    setBusy(true);
    setError("");
    try {
      await saveAction(movie.id, status, value);
      void ensureTitle(movie).then(async (title) => {
        mergeTitles([title]);
        const current = await db.entries.toArray();
        const pool = [...new Map([...movies, title].map((m) => [m.id, m])).values()];
        await refill(current, pool);
      }).catch(() => {});
      if (page === "discover") {
        setExit(status === "dismissed" ? -1 : 1);
        await new Promise<void>((resolve) => {
          timer.current = setTimeout(
            resolve,
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? 0
              : 230,
          );
        });
      }
      await refresh();
      if (page !== "discover") setActiveId(null);
      setRatingMovie(null);
      setNotice(
        status === "watchlist"
          ? "Added to your watchlist"
          : status === "rated"
            ? "Your rating is saved"
            : "Dismissed.",
      );
    } catch {
      setError(
        "That change could not be saved. Your card is still here. Please try again.",
      );
    } finally {
      setExit(0);
      setDrag(0);
      setBusy(false);
      lock.current = false;
    }
  }
  async function remove(movie: Movie) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await removeEntry(movie.id);
      await refresh();
      setNotice("Removed.");
    } catch {
      setError("Could not remove this title. Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        page !== "discover" ||
        !active ||
        ratingMovie ||
        details ||
        busy ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        (e.target instanceof HTMLElement &&
          e.target.closest("button,input,select,textarea,a"))
      )
        return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        void act(active, "dismissed");
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        void act(active, "watchlist");
      }
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        openRating(active);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [page, active, ratingMovie, details, busy]);
  function clearPress() {
    if (pressTimer.current !== null) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }
  function cancelGesture() {
    clearPress();
    pointer.current = null;
    setDrag(0);
  }
  function release(e: React.PointerEvent) {
    const start = pointer.current;
    if (!start || start.id !== e.pointerId) return;
    cancelGesture();
    if (!active || busy) return;
    const distance = e.clientX - start.x;
    const vertical = e.clientY - start.y;
    if (Math.abs(distance) > 90 && Math.abs(distance) > Math.abs(vertical))
      void act(active, distance > 0 ? "watchlist" : "dismissed");
    else if (start.poster && !start.moved && Math.hypot(distance, vertical) <= 9)
      openDetails(active);
  }
  function resetFilterPage() {
    setFilterPage(0);
    setFilterEnd(false);
    setFilterError(false);
    setActiveId(null);
  }
  const shown = movies.filter((m) =>
    entries.some((e) => e.movieId === m.id && e.status === page),
  );
  const pageTitle = sections.find((section) => section.id === page)!.label;
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="wordmark"
          aria-label="filmer — Discover"
          href="#discover"
          onClick={(e) => {
            e.preventDefault();
            setPage("discover");
          }}
        >
          <Wordmark />
        </a>
        <nav
          aria-label="Main navigation"
          style={
            {
              "--nav-index": sections.findIndex(
                (section) => section.id === page,
              ),
            } as CSSProperties
          }
        >
          <span className="nav-selection" aria-hidden="true" />
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-current={page === id ? "page" : undefined}
              className={page === id ? "nav-item active" : "nav-item"}
              onClick={() => setPage(id)}
            >
              <span className={`nav-icon nav-icon-${id}`}>
                <Icon size={20} aria-hidden="true" />
              </span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="mobile-header">
          <a
            className="wordmark"
            href="#discover"
            aria-label="filmer — Discover"
            onClick={(e) => {
              e.preventDefault();
              setPage("discover");
            }}
          >
            <Wordmark />
          </a>
        </header>
        <main>
          <h1
            className={`page-heading ${page === "discover" ? "discovery-heading" : ""}`}
          >
            {pageTitle}
          </h1>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {page === "discover" ? (
            <section
              className="discovery"
              aria-label="Movie discovery"
              style={cardTheme(active?.id)}
            >
              <div className="discover-filter">
                <button type="button" className="filter-toggle" aria-expanded={filterOpen}
                  aria-controls="discover-filter-fields" onClick={() => setFilterOpen(!filterOpen)}>
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  Filters{hasFilters ? " · active" : ""}
                </button>
                {filterOpen && (
                  <div className="filter-fields" id="discover-filter-fields">
                    <label>Title<input type="search" value={titleFilter} placeholder="Search by title"
                      onChange={(e) => { setTitleFilter(e.target.value); resetFilterPage(); }} /></label>
                    <label>Type<select value={typeFilter} onChange={(e) => {
                      const type = e.target.value;
                      setTypeFilter(type === "movie" || type === "tv" ? type : "");
                      resetFilterPage();
                    }}>
                      <option value="">All types</option><option value="movie">Films</option><option value="tv">TV series</option>
                    </select></label>
                    <label>Genre<select value={genreFilter} onChange={(e) => {
                      setGenreFilter(e.target.value); resetFilterPage();
                    }}>
                      <option value="">All genres</option>
                      {["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "Horror", "Mystery", "Romance", "Sci-Fi", "Thriller"].map((genre) =>
                        <option key={genre}>{genre}</option>,
                      )}
                    </select></label>
                    {hasFilters && <button type="button" onClick={() => {
                      setTitleFilter(""); setTypeFilter(""); setGenreFilter(""); resetFilterPage();
                    }}>Clear filters</button>}
                  </div>
                )}
              </div>
              {!ready ? (
                <p className="empty" role="status">
                  Loading films…
                </p>
              ) : active ? (
                <>
                  <div className="card-stage">
                    <article
                      key={active.id}
                      className={`movie-card ${exit ? "exiting" : ""}`}
                      style={{
                        transform: `translateX(${exit ? exit * 600 : drag}px) rotate(${exit ? exit * 14 : drag / 25}deg)`,
                        opacity: exit ? 0 : 1,
                      }}
                      onPointerDown={(e) => {
                        if (busy || !e.isPrimary || e.button !== 0) return;
                        const poster = e.target instanceof Element && Boolean(e.target.closest(".poster-wrap"));
                        clearPress();
                        pointer.current = {
                          id: e.pointerId,
                          x: e.clientX,
                          y: e.clientY,
                          poster,
                          moved: false,
                        };
                        if (poster) {
                          pressTimer.current = setTimeout(() => {
                            if (pointer.current?.id !== e.pointerId) return;
                            cancelGesture();
                            openRating(active);
                          }, 550);
                        }
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={(e) => {
                        const start = pointer.current;
                        if (!start || start.id !== e.pointerId) return;
                        const x = e.clientX - start.x;
                        const y = e.clientY - start.y;
                        if (Math.hypot(x, y) > 9) {
                          start.moved = true;
                          clearPress();
                        }
                        setDrag(start.moved && Math.abs(x) > Math.abs(y) ? x : 0);
                      }}
                      onPointerUp={release}
                      onPointerCancel={cancelGesture}
                      onLostPointerCapture={cancelGesture}
                    >
                      <button
                        type="button"
                        className="poster-wrap discover-poster"
                        aria-label={`Read full description of ${active.title}`}
                        aria-haspopup="dialog"
                        title="Tap for details · Hold to rate"
                        onContextMenu={(event) => event.preventDefault()}
                        onClick={(event) => { if (event.detail === 0) openDetails(active); }}
                        style={{ background: active.palette[0] }}
                      >
                        <Poster movie={active} framing="discovery" />
                      </button>
                      <div className="movie-info">
                        <h2>{active.title}</h2>
                        <p className="metadata">
                          {[
                            active.year ?? "Year unknown",
                            active.mediaType === "movie" ? "Film" : "TV series",
                            active.runtime && active.runtime !== "TV series"
                              ? active.runtime
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <p className="genres">{active.genres.join(", ")}</p>
                        {active.publicRating && (
                          <p className="metadata">
                            IMDb {active.publicRating.value.toFixed(1)}
                            {active.publicRating.votes !== undefined && ` · ${active.publicRating.votes.toLocaleString()} votes`}
                          </p>
                        )}
                        <p className="synopsis">{active.synopsis}</p>
                      </div>
                      {Math.abs(drag) > 25 && (
                        <div
                          className={`swipe-indicator ${drag > 0 ? "yes" : "no"}`}
                        >
                          {drag > 0 ? "Save" : "Dismiss"}
                        </div>
                      )}
                    </article>
                  </div>
                  <div className="actions" aria-label="Movie actions">
                    <button
                      className="action pass"
                      ref={(node) => {
                        if (node) actionButtons.current.dismissed = node;
                        else delete actionButtons.current.dismissed;
                      }}
                      data-swipe-preview={drag < -24 ? "true" : undefined}
                      disabled={busy}
                      aria-label="Dismiss"
                      title="Dismiss (Left arrow)"
                      onClick={() => void act(active, "dismissed")}
                    >
                      <X aria-hidden="true" />
                    </button>
                    <button
                      className="action watched"
                      ref={(node) => {
                        if (node) actionButtons.current.rated = node;
                        else delete actionButtons.current.rated;
                      }}
                      disabled={busy}
                      aria-label="Already watched — rate this title"
                      title="Already watched / Rate (S)"
                      onClick={() => openRating(active)}
                    >
                      <Star aria-hidden="true" />
                    </button>
                    <button
                      className="action save"
                      ref={(node) => {
                        if (node) actionButtons.current.watchlist = node;
                        else delete actionButtons.current.watchlist;
                      }}
                      data-swipe-preview={drag > 24 ? "true" : undefined}
                      disabled={busy}
                      aria-label="Save to watchlist"
                      title="Save to watchlist (Right arrow)"
                      onClick={() => void act(active, "watchlist")}
                    >
                      <Heart aria-hidden="true" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty">
                  <p role="status">{filterLoading ? "Finding titles…" : filterError
                    ? "Could not load more titles." : hasFilters
                    ? "No matching titles in this batch." : "No more films to discover."}</p>
                  {hasFilters && catalogState && !filterLoading && !filterEnd && (
                    <button className="primary" onClick={() => {
                      if (filterError) setFilterRetry((n) => n + 1);
                      else setFilterPage((n) => n + 1);
                    }}>
                      {filterError ? "Retry" : "Search next batch"}
                    </button>
                  )}
                  {entries.some((e) => e.status === "dismissed") && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await revisitDismissed();
                          await refresh();
                        } catch {
                          setError(
                            "Could not revisit passed titles. Please try again.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <RotateCcw size={16} aria-hidden="true" />
                      Revisit dismissed films
                    </button>
                  )}
                </div>
              )}
            </section>
          ) : page === "for-you" ? (
            <section className="recommendation-page">
              <p className="catalog-status">
                {catalogState
                  ? "Film, series & animation · Cinemeta"
                  : "Cached titles · online catalog unavailable"}
              </p>
              <label className="catalog-search">
                Find a film or series
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Interstellar, animation, a favourite title…"
                />
              </label>
              {searching && (
                <p className="search-status" role="status">
                  Searching…
                </p>
              )}
              {searchError && (
                <p className="search-status" role="status">
                  {searchError}
                </p>
              )}
              {!query.trim() && (
                <p className="search-status">
                  {profile.signals
                    ? "Based on your saved titles, ratings and dismissals."
                    : "Save or rate a title to personalize discovery."}
                </p>
              )}
              {query.trim() && !searching && !searchResults.length && (
                <p className="empty">No matching titles.</p>
              )}
              <div className="collection">
                {(query.trim()
                  ? searchResults
                  : ranked.slice(0, 24).map((r) => r.movie)
                ).map((movie) => (
                  <article
                    className="collection-card"
                    key={movie.id}
                    style={cardTheme(movie.id)}
                  >
                    <Poster movie={movie} />
                    <div className="collection-info">
                      <h2>{movie.title}</h2>
                      <p className="metadata">
                        {movie.year ?? "Year unknown"} ·{" "}
                        {movie.mediaType === "tv" ? "TV series" : "Film"}
                      </p>
                      <p className="genres">{movie.genres.join(", ")}</p>
                      <div className="collection-controls">
                        <button
                          disabled={busy}
                          onClick={() => openRating(movie)}
                        >
                          <Star size={16} aria-hidden="true" /> Rate
                        </button>
                        {!entries.some((e) => e.movieId === movie.id) && (
                          <button
                            disabled={busy}
                            aria-label={`Save ${movie.title} to watchlist`}
                            onClick={() => void act(movie, "watchlist")}
                          >
                            <Heart size={17} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      {!entries.some((e) => e.movieId === movie.id) && (
                        <button
                          className="recommendation-discover"
                          onClick={() => {
                            void ensureTitle(movie).then((title) => mergeTitles([title])).catch(() => {});
                            setActiveId(movie.id);
                            setPage("discover");
                          }}
                        >
                          Discover this title
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              {query.trim() && canLoadMore && (
                <button
                  className="primary"
                  disabled={searching}
                  onClick={() => void loadMoreSearch()}
                >
                  {searching ? "Loading…" : "Load more titles"}
                </button>
              )}
            </section>
          ) : !ready ? (
            <p className="empty" role="status">
              Loading collection…
            </p>
          ) : shown.length ? (
            <section
              className="collection"
              aria-label={page === "rated" ? "Rated titles" : "Saved titles"}
            >
              {shown.map((movie) => (
                <article
                  className="collection-card"
                  key={movie.id}
                  style={cardTheme(movie.id)}
                >
                  <Poster movie={movie} />
                  <div className="collection-info">
                    <h2>{movie.title}</h2>
                    <p className="metadata">
                      {movie.year} ·{" "}
                      {movie.mediaType === "movie" ? "Film" : "TV series"}
                    </p>
                    {page === "rated" && (
                      <div className="personal-rating">
                        <StarDisplay
                          rating={
                            entries.find((e) => e.movieId === movie.id)
                              ?.rating ?? 0
                          }
                        />
                        <span>
                          {(
                            (entries.find((e) => e.movieId === movie.id)
                              ?.rating ?? 0) / 2
                          ).toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}{" "}
                          / 5
                        </span>
                      </div>
                    )}
                    <div className="collection-controls">
                      <button disabled={busy} onClick={() => openRating(movie)}>
                        {page === "rated" ? "Edit rating" : "Rate"}
                      </button>
                      <button
                        disabled={busy}
                        aria-label={`Remove ${movie.title} ${page === "rated" ? "rating" : "from watchlist"}`}
                        title="Remove"
                        onClick={() => void remove(movie)}
                      >
                        <Trash2 size={17} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          ) : (
            <section className="empty">
              <p>
                {page === "watchlist"
                  ? "Your watchlist is empty."
                  : "No rated films yet."}
              </p>
              <button className="primary" onClick={() => setPage("discover")}>
                Discover films
              </button>
            </section>
          )}
        </main>
      </div>
      <div className="toast" role="status" aria-live="polite">
        {notice && (
          <>
            <Check size={16} aria-hidden="true" />
            {notice}
          </>
        )}
      </div>
      <dialog className="title-details" ref={detailsDialog} aria-labelledby="details-title"
        onClose={() => setDetails(null)}
        onClick={(e) => { if (e.target === e.currentTarget) setDetails(null); }}>
        {details && <div className="modal-inner">
          <button type="button" className="details-close" aria-label="Close description"
            onClick={() => setDetails(null)}><X size={20} aria-hidden="true" /></button>
          <h2 id="details-title">{details.title}</h2>
          <p className="metadata">{[details.year, ...details.genres].filter(Boolean).join(" · ")}</p>
          <p className="full-synopsis">{details.synopsis || (details.metadataComplete ? "No description available." : "Loading description…")}</p>
        </div>}
      </dialog>
      <dialog
        ref={modal}
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) setRatingMovie(null);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !busy) setRatingMovie(null);
        }}
        aria-labelledby="rating-title"
        aria-describedby="rating-movie"
      >
        <div className="modal-inner">
          {ratingMovie && (
            <div className="rating-poster">
              <Poster movie={ratingMovie} />
            </div>
          )}
          <h2 id="rating-title">Rate this title</h2>
          <p id="rating-movie">{ratingMovie?.title}</p>
          <RatingStars value={rating} onChange={setRating} disabled={busy} />
          <output className="rating-value" aria-live="polite">
            {(rating / 2).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
            <span> / 5</span>
          </output>
          <div className="modal-actions">
            <button
              className="cancel"
              disabled={busy}
              onClick={() => setRatingMovie(null)}
            >
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                ratingMovie && void act(ratingMovie, "rated", rating)
              }
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
