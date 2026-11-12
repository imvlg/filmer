export interface Movie {
  id: string;
  mediaType: "movie" | "tv";
  title: string;
  year: number | null;
  genres: string[];
  synopsis: string;
  runtime: string;
  director: string;
  palette: [string, string, string];
  art: "hotel" | "moon" | "sea" | "city";
  imdbId?: string;
  directorIds?: string[];
  directors?: string[];
  cast?: string[];
  countries?: string[];
  languages?: string[];
  posterUrl?: string;
  metadataComplete?: boolean;
  keywords?: string[];
  publicRating?: { value: number; votes?: number; source: string } | null;
}
export interface MovieProvider {
  getCatalog(): Promise<Movie[]>;
}
export const catalog: Movie[] = [
  {
    id: "demo:grand-budapest",
    mediaType: "movie",
    title: "The Grand Budapest Hotel",
    year: 2014,
    genres: ["Adventure", "Comedy", "Drama"],
    synopsis:
      "A legendary concierge. A devoted lobby boy. A stolen painting. An extraordinary adventure unfolds at a grand European hotel between the wars.",
    runtime: "1h 39m",
    director: "Wes Anderson",
    palette: ["#c8a5a2", "#d8a095", "#6b3940"],
    art: "hotel",
  },
  {
    id: "demo:moonrise",
    mediaType: "movie",
    title: "Moonrise Kingdom",
    year: 2012,
    genres: ["Adventure", "Romance"],
    synopsis:
      "Two young pen pals run away together on a quiet New England island, sending their small community into a wonderfully tangled search.",
    runtime: "1h 34m",
    director: "Wes Anderson",
    palette: ["#d9ba6a", "#7a8763", "#454f40"],
    art: "moon",
  },
  {
    id: "demo:amelie",
    mediaType: "movie",
    title: "Amélie",
    year: 2001,
    genres: ["Romance", "Comedy"],
    synopsis:
      "A shy Parisian waitress quietly sets out to change the lives of the people around her, finding a little magic of her own along the way.",
    runtime: "2h 2m",
    director: "Jean-Pierre Jeunet",
    palette: ["#8a9b80", "#d9bc82", "#324f46"],
    art: "city",
  },
  {
    id: "demo:life-aquatic",
    mediaType: "movie",
    title: "The Life Aquatic",
    year: 2004,
    genres: ["Adventure", "Comedy"],
    synopsis:
      "An eccentric oceanographer and his unlikely crew set sail on a deeply personal expedition into uncharted waters.",
    runtime: "1h 59m",
    director: "Wes Anderson",
    palette: ["#84abad", "#e0c891", "#3e666d"],
    art: "sea",
  },
  {
    id: "demo:past-lives",
    mediaType: "movie",
    title: "Past Lives",
    year: 2023,
    genres: ["Drama", "Romance"],
    synopsis:
      "Childhood friends reunite in New York after decades apart, contemplating the choices and connections that shape a life.",
    runtime: "1h 46m",
    director: "Celine Song",
    palette: ["#b2b59b", "#d4bb9a", "#576b65"],
    art: "city",
  },
  {
    id: "demo:over-garden",
    mediaType: "tv",
    title: "Over the Garden Wall",
    year: 2014,
    genres: ["Animation", "Fantasy"],
    synopsis:
      "Two brothers wander through a mysterious woodland, meeting curious strangers as they search for a way home.",
    runtime: "Miniseries",
    director: "Patrick McHale",
    palette: ["#bf995f", "#8d7650", "#3b4b3c"],
    art: "moon",
  },
  {
    id: "demo:darjeeling",
    mediaType: "movie",
    title: "The Darjeeling Limited",
    year: 2007,
    genres: ["Adventure", "Drama"],
    synopsis:
      "Three estranged brothers travel across India by train, carrying far too much luggage and a tentative hope of reconnecting.",
    runtime: "1h 31m",
    director: "Wes Anderson",
    palette: ["#c4ab70", "#e6bb79", "#5d827e"],
    art: "sea",
  },
  {
    id: "demo:severance",
    mediaType: "tv",
    title: "Severance",
    year: 2022,
    genres: ["Drama", "Mystery", "Sci-fi"],
    synopsis:
      "Office workers whose memories are divided between work and home begin to question the true nature of their jobs.",
    runtime: "TV series",
    director: "Created by Dan Erickson",
    palette: ["#9aafb0", "#dfd9bc", "#38585c"],
    art: "city",
  },
];
export const demoProvider: MovieProvider = { getCatalog: async () => catalog };
