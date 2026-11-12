import {
  startTransition,
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
  Search,
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
import { imdbId, localTitleId, movieKey } from "./titleIdentity";
import { getTitleContext, type TitleContext } from "./titleContext";
import {
  db,
  saveAction,
  removeEntry,
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
const handoffDuration = 360;
type Section = (typeof sections)[number]["id"];
type DiscoverOrder = "recommended" | "newest" | "imdb";
function MovieFacts({ movie }: { movie: Movie }) {
  return (
    <>
      <h2>{movie.title}</h2>
      <p className="metadata">
        {[
          movie.year ?? "Year unknown",
          movie.mediaType === "movie" ? "Film" : "TV series",
          movie.runtime && movie.runtime !== "TV series" ? movie.runtime : null,
        ].filter(Boolean).join(" · ")}
      </p>
      <p className="genres">{movie.genres.join(", ")}</p>
      {movie.publicRating && (
        <p className="metadata">
          IMDb {movie.publicRating.value.toFixed(1)}
          {movie.publicRating.votes !== undefined && ` · ${movie.publicRating.votes.toLocaleString()} votes`}
        </p>
      )}
    </>
  );
}

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
  const [rating, setRating] = useState(0);
  const modal = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterControl = useRef<HTMLDivElement>(null);
  const filterToggle = useRef<HTMLButtonElement>(null);
  const [titleFilter, setTitleFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "movie" | "tv">("");
  const [minimumRating, setMinimumRating] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [discoverOrder, setDiscoverOrder] = useState<DiscoverOrder>("recommended");
  const [filterPage, setFilterPage] = useState(0);
  const [filterLoading, setFilterLoading] = useState(false);
  const [filterError, setFilterError] = useState(false);
  const [filterRetry, setFilterRetry] = useState(0);
  const [filterEnd, setFilterEnd] = useState(false);
  const [details, setDetails] = useState<Movie | null>(null);
  const [titleContext, setTitleContext] = useState<TitleContext | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drag, setDrag] = useState(0);
  const [deckLoading, setDeckLoading] = useState(false);
  const cardNode = useRef<HTMLElement>(null);
  const dragFrame = useRef<number | null>(null);
  const pendingDrag = useRef(0);
  const [departureCard, setDepartureCard] = useState<{ movie: Movie; next?: Movie; direction: number } | null>(null);
  const pointer = useRef<{ id: number; x: number; y: number; scrollable: boolean; moved: boolean; axis: "x" | "y" | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishHandoff = useRef<(() => void) | null>(null);
  const ranked = useMemo(() => recommend(movies, entries), [movies, entries]);
  const profile = useMemo(
    () => buildTasteProfile(movies, entries),
    [movies, entries],
  );
  const firstYear = /^\d{4}$/.test(yearFrom) ? Number(yearFrom) : 0;
  const lastYear = /^\d{4}$/.test(yearTo) ? Number(yearTo) : 0;
  const invalidYears = Boolean(firstYear && lastYear && firstYear > lastYear);
  const filterByYear = !invalidYears && Boolean(firstYear || lastYear);
  const hasFilters = Boolean(titleFilter.trim() || genreFilter || typeFilter || minimumRating || filterByYear);
  const discoverPool = useMemo(() => hasFilters ? movies.filter((movie) =>
    (!titleFilter.trim() || movie.title.toLocaleLowerCase().includes(titleFilter.trim().toLocaleLowerCase())) &&
      (!genreFilter || movie.genres.includes(genreFilter)) &&
      (!typeFilter || movie.mediaType === typeFilter) &&
      (!minimumRating || (movie.publicRating?.value ?? 0) >= Number(minimumRating)) &&
      (!filterByYear || (movie.year !== null && (!firstYear || movie.year >= firstYear) && (!lastYear || movie.year <= lastYear)))
    ) : movies, [movies, hasFilters, titleFilter, genreFilter, typeFilter, minimumRating, filterByYear, firstYear, lastYear]);
  const discoverRanked = useMemo(() => hasFilters && discoverOrder === "recommended"
    ? recommend(discoverPool, entries, 200, movies) : ranked,
    [discoverPool, entries, movies, ranked, hasFilters, discoverOrder]);
  const reviewed = useMemo(() => new Set(entries.map((entry) => localTitleId(entry.movieId))), [entries]);
  const queue = useMemo(() => {
    if (discoverOrder === "recommended") return discoverRanked.map(({ movie }) => movie);
    return [...new Map(discoverPool.map((movie) => [movieKey(movie), movie]))].flatMap(([id, movie]) =>
      reviewed.has(id) ? [] : [movie],
    ).sort((a, b) => discoverOrder === "newest" ? (b.year ?? 0) - (a.year ?? 0) :
      (b.publicRating?.value ?? 0) - (a.publicRating?.value ?? 0));
  }, [discoverOrder, discoverRanked, discoverPool, reviewed]);
  const active = departureCard?.movie ??
    discoverPool.find((movie) => movieKey(movie) === activeId && !reviewed.has(movieKey(movie))) ?? queue[0];
  const queued = departureCard ? departureCard.next : queue.find((movie) => !active || movieKey(movie) !== movieKey(active));
  const exit = departureCard?.direction ?? 0;
  const expandedDetails = details && details.id === active?.id ? details : null;
  useEffect(() => {
    const id = active ? movieKey(active) : null;
    if (id !== activeId) setActiveId(id);
  }, [active, activeId]);
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
        const found = await discoverPage(typeFilter, genreFilter, titleFilter.trim(), filterPage, {
          year: filterByYear,
          rating: Boolean(minimumRating),
        });
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
  }, [page, hasFilters, catalogState, typeFilter, genreFilter, titleFilter, filterByYear, firstYear, lastYear, minimumRating, filterPage, filterRetry]);
  useEffect(() => {
    if (!filterOpen || page !== "discover") return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !filterControl.current?.contains(event.target)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [filterOpen, page]);
  useEffect(() => {
    setDetails(null);
  }, [active?.id, page]);
  const contextId = expandedDetails ? imdbId(expandedDetails) : null;
  useEffect(() => {
    setTitleContext(null);
    if (!contextId) return;
    let current = true;
    void getTitleContext(contextId).then((context) => {
      if (current) setTitleContext(context);
    });
    return () => { current = false; };
  }, [contextId]);
  useEffect(() => () => {
    if (pressTimer.current !== null) clearTimeout(pressTimer.current);
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    pointer.current = null;
  }, [active?.id, page]);
  function toggleDetails(movie: Movie) {
    if (expandedDetails) {
      setDetails(null);
      return;
    }
    setDetails(movie);
    void ensureTitle(movie).then((full) => {
      setDetails((current) => current?.id === full.id ? { ...full, metadataComplete: true } : current);
    }).catch(() => {
      setDetails((current) => current?.id === movie.id ? { ...current, metadataComplete: true } : current);
    });
  }
  function mergeTitles(titles: Movie[]) {
    startTransition(() => setMovies((current) => [
      ...new Map([...current, ...titles].map((m) => [movieKey(m), m])).values(),
    ]));
  }
  async function refill(
    current: Entry[],
    pool = movies,
    online = Boolean(catalogState),
    advance = false,
  ) {
    if (!online) return;
    const request = ++candidateRequest.current;
    try {
      const titles = await moreCandidates(pool, current, advance);
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
    setRating(entries.find((e) => localTitleId(e.movieId) === movieKey(movie))?.rating ?? 0);
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
      const next = page === "discover" ? queued : undefined;
      const departure = page === "discover" ? new Promise<void>((resolve) => {
        setDepartureCard({ movie, next, direction: status === "dismissed" ? -1 : 1 });
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          resolve();
        } else {
          const finish = () => {
            if (timer.current !== null) clearTimeout(timer.current);
            timer.current = null;
            finishHandoff.current = null;
            resolve();
          };
          finishHandoff.current = finish;
          timer.current = setTimeout(finish, handoffDuration + 85);
        }
      }) : Promise.resolve();
      const saved = await saveAction(movieKey(movie), status, value);
      await departure;
      const current = [...entries.filter((entry) => localTitleId(entry.movieId) !== saved.movieId), saved];
      setEntries(current);
      setActiveId(next ? movieKey(next) : null);
      void refill(current);
      void ensureTitle(movie).then(async (title) => {
        if (title === movie || !title.metadataComplete) return;
        mergeTitles([title]);
        const latest = await db.entries.toArray();
        const pool = [...new Map([...movies, title].map((m) => [m.id, m])).values()];
        if (latest.some((entry) => entry.movieId === saved.movieId && entry.updatedAt === saved.updatedAt)) {
          await refill(latest, pool);
        }
      }).catch(() => {});
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
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      finishHandoff.current = null;
      resetDrag();
      setDepartureCard(null);
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
        expandedDetails ||
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
  }, [page, active, ratingMovie, expandedDetails, busy]);
  function clearPress() {
    if (pressTimer.current !== null) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }
  function stopTracking() {
    clearPress();
    pointer.current = null;
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    cardNode.current?.removeAttribute("data-swiping");
  }
  function resetDrag() {
    cardNode.current?.style.removeProperty("--drag-x");
    cardNode.current?.style.removeProperty("--drag-angle");
    setDrag(0);
  }
  function cancelGesture() {
    if (!pointer.current) return;
    stopTracking();
    resetDrag();
  }
  function moveCard(distance: number) {
    pendingDrag.current = distance;
    if (dragFrame.current !== null) return;
    dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = null;
      const card = cardNode.current;
      if (!card) return;
      if (!card.hasAttribute("data-swiping")) card.dataset.swiping = "true";
      const distance = pendingDrag.current;
      card.style.setProperty("--drag-x", `${distance}px`);
      card.style.setProperty("--drag-angle", `${Math.max(-14, Math.min(14, distance / 30))}deg`);
      setDrag(Math.abs(distance) > 25 ? Math.sign(distance) : 0);
    });
  }
  function release(e: React.PointerEvent) {
    const start = pointer.current;
    if (!start || start.id !== e.pointerId) return;
    const distance = e.clientX - start.x;
    const vertical = e.clientY - start.y;
    stopTracking();
    if (active && !busy && !start.scrollable && start.axis !== "y" && Math.abs(distance) > 90 && Math.abs(distance) > Math.abs(vertical)) {
      void act(active, distance > 0 ? "watchlist" : "dismissed");
    } else {
      resetDrag();
      if (active && !busy && !start.moved && Math.hypot(distance, vertical) <= 9)
        toggleDetails(active);
    }
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
              <div className="discover-filter" ref={filterControl} onKeyDown={(event) => {
                if (event.key !== "Escape" || !filterOpen) return;
                event.preventDefault();
                setFilterOpen(false);
                filterToggle.current?.focus();
              }}>
                <button type="button" className="filter-toggle" ref={filterToggle}
                  aria-expanded={filterOpen} aria-controls="discover-filter-fields"
                  aria-label={hasFilters ? "Search and filters, filters active" : "Search and filters"}
                  title="Search and filters" data-filter-active={(hasFilters || discoverOrder !== "recommended") || undefined}
                  onClick={() => setFilterOpen((open) => !open)}>
                  <Search size={17} aria-hidden="true" />
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
                    <label>From year<input type="text" inputMode="numeric" maxLength={4} value={yearFrom}
                      placeholder="Any" aria-invalid={invalidYears || undefined} onChange={(e) => {
                        setYearFrom(e.target.value.replace(/\D/g, "")); resetFilterPage();
                      }} /></label>
                    <label>To year<input type="text" inputMode="numeric" maxLength={4} value={yearTo}
                      placeholder="Any" aria-invalid={invalidYears || undefined} onChange={(e) => {
                        setYearTo(e.target.value.replace(/\D/g, "")); resetFilterPage();
                      }} /></label>
                    {invalidYears && <p className="filter-range-error" role="status">From year must come before or match To year.</p>}
                    <label className="rating-filter">Minimum IMDb rating<select value={minimumRating} onChange={(e) => {
                      setMinimumRating(e.target.value); resetFilterPage();
                    }}>
                      <option value="">Any rating</option>
                      {[5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((value) => (
                        <option key={value} value={value}>{value.toFixed(1)}+</option>
                      ))}
                    </select></label>
                    <label className="rating-filter">Sort by<select value={discoverOrder} onChange={(e) => {
                      const order = e.target.value;
                      setDiscoverOrder(order === "newest" || order === "imdb" ? order : "recommended");
                      setActiveId(null);
                    }}>
                      <option value="recommended">Recommended</option>
                      <option value="newest">Newest first</option>
                      <option value="imdb">Highest IMDb rating</option>
                    </select></label>
                    {(hasFilters || yearFrom || yearTo || discoverOrder !== "recommended") && <button type="button" onClick={() => {
                      setTitleFilter(""); setTypeFilter(""); setGenreFilter("");
                      setYearFrom(""); setYearTo(""); setMinimumRating("");
                      setDiscoverOrder("recommended"); resetFilterPage();
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
                  <div className="card-stage" data-handoff={Boolean(exit)} style={{ "--handoff-duration": `${handoffDuration}ms` } as CSSProperties}>
                    <span className="card-sleeve sleeve-left" aria-hidden="true"><span className="sleeve-light" /></span>
                    <span className="card-sleeve sleeve-right" aria-hidden="true"><span className="sleeve-light" /></span>
                    {[queued, active].map((card, index) => {
                      if (!card) return null;
                      const front = index === 1;
                      const expanded = front ? expandedDetails : null;
                      return (
                        <article
                          key={movieKey(card)}
                          ref={front ? cardNode : undefined}
                          inert={!front}
                          aria-hidden={!front || undefined}
                          className={`movie-card ${front ? "deck-front" : "deck-queued"} ${front && exit ? "exiting" : ""}`}
                          data-description-open={Boolean(expanded)}
                          style={{
                            "--exit-x": exit < 0 ? "calc(-100vw - 120px)" : "calc(100vw + 120px)",
                            "--exit-angle": `${exit * 14}deg`,
                          } as CSSProperties}
                          onPointerDown={(e) => {
                            if (!front || busy || !e.isPrimary || e.button !== 0) return;
                            if (e.target instanceof Element && e.target.closest("a")) return;
                            if (e.pointerType === "touch") e.preventDefault();
                            const scrollable = e.target instanceof Element && Boolean(e.target.closest(".expanded-movie-info"));
                            const pointerId = e.pointerId;
                            clearPress();
                            pointer.current = {
                              id: pointerId,
                              x: e.clientX,
                              y: e.clientY,
                              scrollable,
                              moved: false,
                              axis: null,
                            };
                            pressTimer.current = setTimeout(() => {
                              if (pointer.current?.id !== pointerId) return;
                              cancelGesture();
                              window.getSelection()?.removeAllRanges();
                              openRating(card);
                            }, 550);
                            if (!scrollable) e.currentTarget.setPointerCapture(pointerId);
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
                            if (!start.axis && Math.hypot(x, y) >= 4) start.axis = Math.abs(x) > Math.abs(y) ? "x" : "y";
                            if (!start.scrollable && start.axis === "x") moveCard(x);
                          }}
                          onPointerUp={release}
                          onTransitionEnd={(event) => {
                            if (front && exit && event.target === event.currentTarget && event.propertyName === "transform") {
                              finishHandoff.current?.();
                            }
                          }}
                          onPointerCancel={cancelGesture}
                          onLostPointerCapture={cancelGesture}
                          onPointerLeave={() => { if (pointer.current?.scrollable) cancelGesture(); }}
                          onContextMenu={(event) => event.preventDefault()}
                          onCopy={(event) => event.preventDefault()}
                          onKeyDown={(e) => {
                            if (e.key === "Escape" && expanded) {
                              e.preventDefault();
                              setDetails(null);
                              e.currentTarget.querySelector<HTMLButtonElement>(".discover-poster")?.focus();
                            }
                          }}
                        >
                          <div className="poster-wrap">
                            <button
                              type="button"
                              className="discover-poster"
                              aria-label={expanded ? "Collapse description" : `Read full description of ${card.title}`}
                              aria-expanded={Boolean(expanded)}
                              aria-controls={front ? "discover-description" : undefined}
                              title={expanded ? "Tap to collapse · Hold to rate" : "Tap for details · Hold to rate"}
                              onClick={(event) => { if (event.detail === 0) toggleDetails(card); }}
                            >
                              <Poster movie={card} framing="discovery" />
                            </button>
                          </div>
                          <div className="movie-info preview-movie-info" aria-hidden={Boolean(expanded)}>
                            <MovieFacts movie={card} />
                            <p className="synopsis">{card.synopsis}</p>
                          </div>
                          <div className="movie-info expanded-movie-info" id={front ? "discover-description" : undefined}
                            role="region" aria-label="Full description" aria-hidden={!expanded}
                            inert={!expanded} tabIndex={expanded ? 0 : -1}>
                            <MovieFacts movie={expanded ?? card} />
                            <p className="synopsis-full">
                              {expanded?.synopsis || card.synopsis ||
                                (expanded?.metadataComplete ? "No description available." : "Loading description…")}
                            </p>
                            {expanded && <>
                              {(expanded.director || Boolean(expanded.cast?.length) || Boolean(expanded.countries?.length)) && (
                                <dl className="title-credits">
                                  {expanded.director && <><dt>Director</dt><dd>{expanded.director}</dd></>}
                                  {Boolean(expanded.cast?.length) && <><dt>Cast</dt><dd>{expanded.cast?.slice(0, 5).join(", ")}</dd></>}
                                  {Boolean(expanded.countries?.length) && <><dt>Country</dt><dd>{expanded.countries?.join(", ")}</dd></>}
                                </dl>
                              )}
                              {titleContext && <div className="title-context">
                                <p className="synopsis-full">{titleContext.summary}</p>
                                <p className="context-credit"><a href={titleContext.url} target="_blank" rel="noreferrer">Wikipedia</a>
                                  {" · "}<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a></p>
                              </div>}
                            </>}
                          </div>
                          {front && drag !== 0 && (
                            <div
                              className={`swipe-indicator ${drag > 0 ? "yes" : "no"}`}
                            >
                              {drag > 0 ? "Save" : "Dismiss"}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  <div className="actions" aria-label="Movie actions">
                    <button
                      className="action pass"
                      ref={(node) => {
                        if (node) actionButtons.current.dismissed = node;
                        else delete actionButtons.current.dismissed;
                      }}
                      data-swipe-preview={drag < 0 ? "true" : undefined}
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
                      data-swipe-preview={drag > 0 ? "true" : undefined}
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
                  {!hasFilters && catalogState && (
                    <button
                      className="primary"
                      disabled={busy || deckLoading}
                      onClick={async () => {
                        setDeckLoading(true);
                        try { await refill(entries, movies, true, true); }
                        finally { setDeckLoading(false); }
                      }}
                    >
                      <RotateCcw size={16} aria-hidden="true" />
                      {deckLoading ? "Finding titles…" : "Find more titles"}
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
                        {!entries.some((e) => localTitleId(e.movieId) === movieKey(movie)) && (
                          <button
                            disabled={busy}
                            aria-label={`Save ${movie.title} to watchlist`}
                            className="collection-icon-button"
                            onClick={() => void act(movie, "watchlist")}
                          >
                            <Heart size={17} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      {!entries.some((e) => localTitleId(e.movieId) === movieKey(movie)) && (
                        <button
                          className="recommendation-discover"
                          onClick={() => {
                            void ensureTitle(movie).then((title) => mergeTitles([title])).catch(() => {});
                            setActiveId(movieKey(movie));
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
                            entries.find((e) => localTitleId(e.movieId) === movieKey(movie))
                              ?.rating ?? 0
                          }
                        />
                        <span>
                          {(
                            (entries.find((e) => localTitleId(e.movieId) === movieKey(movie))
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
                        className="collection-icon-button"
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
        className="rating-dialog"
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
              disabled={busy || rating === 0}
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
