import { and, asc, count, desc, eq, max, type SQL, sql } from 'drizzle-orm';
import { moviesDb, movies } from '../../db/index.js';
import { cachedMovies, invalidateMovies, type CacheStatus } from '../cache.js';
import { GENRES, type ListQuery, type MovieInput, type MoviePatch } from './schemas.js';

type Row = typeof movies.$inferSelect;

const emptyToNull = (s: string | null): string | null => (s === null || s === '' ? null : s);

function parseJson(s: string | null): unknown[] | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as unknown[];
  } catch {
    return null;
  }
}


function parseGenres(s: string | null): string[] {
  if (!s) return [];
  const known = new Set<string>(GENRES);
  const tokens = s.split(' ').filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const pair = `${tokens[i]} ${tokens[i + 1]}`;
    if (known.has(pair)) {
      out.push(pair);
      i++;
    } else {
      out.push(tokens[i]!);
    }
  }
  return out;
}

export function toSummary(r: Row) {
  return {
    id: r.id,
    title: r.title,
    tagline: emptyToNull(r.tagline),
    release_date: emptyToNull(r.releaseDate),
    genres: parseGenres(r.genres),
    director: emptyToNull(r.director),
    original_language: r.originalLanguage,
    runtime: r.runtime,
    status: r.status,
    popularity: r.popularity,
    vote_average: r.voteAverage,
    vote_count: r.voteCount,
  };
}

export function toMovie(r: Row) {
  return {
    ...toSummary(r),
    original_title: r.originalTitle,
    overview: emptyToNull(r.overview),
    homepage: emptyToNull(r.homepage),
    budget: r.budget,
    revenue: r.revenue,
    keywords: emptyToNull(r.keywords),
    cast: emptyToNull(r.cast),
    crew: emptyToNull(r.crew),
    production_companies: parseJson(r.productionCompanies),
    production_countries: parseJson(r.productionCountries),
    spoken_languages: parseJson(r.spokenLanguages),
  };
}
export type Movie = ReturnType<typeof toMovie>;
export type MovieSummary = ReturnType<typeof toSummary>;

export interface Page {
  data: MovieSummary[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const contains = (col: SQL | typeof movies.title, s: string) => sql`${col} LIKE ${`%${likeEscape(s)}%`} ESCAPE '\\'`;

const sortColumns = {
  id: movies.id,
  title: movies.title,
  release_date: movies.releaseDate,
  popularity: movies.popularity,
  vote_average: movies.voteAverage,
  vote_count: movies.voteCount,
  revenue: movies.revenue,
  budget: movies.budget,
  runtime: movies.runtime,
};

function queryPage(q: ListQuery): Page {
  const filters: (SQL | undefined)[] = [
    q.q ? sql`(${contains(movies.title, q.q)} OR ${contains(movies.originalTitle, q.q)})` : undefined,
    
    q.genre ? sql`' ' || ${movies.genres} || ' ' LIKE ${`% ${q.genre} %`}` : undefined,
    q.director ? contains(movies.director, q.director) : undefined,
    q.language ? eq(movies.originalLanguage, q.language) : undefined,
    q.year ? sql`substr(${movies.releaseDate}, 1, 4) = ${q.year}` : undefined,
    q.status ? eq(movies.status, q.status) : undefined,
  ];
  const where = and(...filters);

  const total = moviesDb.select({ n: count() }).from(movies).where(where).get()?.n ?? 0;
  const dir = q.order === 'desc' ? desc : asc;
  
  const rows = moviesDb
    .select()
    .from(movies)
    .where(where)
    .orderBy(dir(sortColumns[q.sort]), asc(movies.id))
    .limit(q.limit)
    .offset((q.page - 1) * q.limit)
    .all();

  return {
    data: rows.map(toSummary),
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  };
}

function queryOne(id: number): Movie | null {
  const row = moviesDb.select().from(movies).where(eq(movies.id, id)).get();
  return row ? toMovie(row) : null;
}

export async function listMovies(q: ListQuery): Promise<{ page: Page; cache: CacheStatus }> {
  const { value, status } = await cachedMovies(`list:${JSON.stringify(q)}`, () => queryPage(q));
  return { page: value, cache: status };
}

export async function getMovie(id: number): Promise<{ movie: Movie | null; cache: CacheStatus }> {
  const { value, status } = await cachedMovies(`item:${id}`, () => queryOne(id));
  return { movie: value, cache: status };
}

type Columns = Partial<typeof movies.$inferInsert>;


function toColumns(input: MoviePatch): Columns {
  const c: Columns = {};
  const has = (k: keyof MoviePatch) => input[k] !== undefined;
  if (has('title')) c.title = input.title!;
  if (has('original_title')) c.originalTitle = input.original_title!;
  if (has('overview')) c.overview = input.overview!;
  if (has('tagline')) c.tagline = input.tagline!;
  if (has('homepage')) c.homepage = input.homepage!;
  if (has('status')) c.status = input.status!;
  if (has('original_language')) c.originalLanguage = input.original_language!;
  if (has('release_date')) c.releaseDate = input.release_date!;
  if (has('runtime')) c.runtime = input.runtime!;
  if (has('budget')) c.budget = input.budget!;
  if (has('revenue')) c.revenue = input.revenue!;
  if (has('popularity')) c.popularity = input.popularity!;
  if (has('vote_average')) c.voteAverage = input.vote_average!;
  if (has('vote_count')) c.voteCount = input.vote_count!;
  if (has('genres')) c.genres = input.genres ? input.genres.join(' ') : null;
  if (has('keywords')) c.keywords = input.keywords!;
  if (has('director')) c.director = input.director!;
  if (has('cast')) c.cast = input.cast!;
  if (has('crew')) c.crew = input.crew!;
  if (has('production_companies')) c.productionCompanies = jsonOrNull(input.production_companies);
  if (has('production_countries')) c.productionCountries = jsonOrNull(input.production_countries);
  if (has('spoken_languages')) c.spokenLanguages = jsonOrNull(input.spoken_languages);
  return c;
}
const jsonOrNull = (v: unknown[] | null | undefined) => (v ? JSON.stringify(v) : null);

const NULL_COLUMNS: Columns = {
  originalTitle: null, overview: null, tagline: null, homepage: null, status: null, originalLanguage: null,
  releaseDate: null, runtime: null, budget: null, revenue: null, popularity: null, voteAverage: null,
  voteCount: null, genres: null, keywords: null, director: null, cast: null, crew: null,
  productionCompanies: null, productionCountries: null, spokenLanguages: null,
};

export async function createMovie(input: MovieInput): Promise<Movie> {
  const row = moviesDb.transaction((tx) => {
    const top = tx.select({ id: max(movies.id), index: max(movies.index) }).from(movies).get();
    return tx
      .insert(movies)
      .values({
        ...NULL_COLUMNS,
        ...toColumns(input),
        title: input.title,
        id: (top?.id ?? 0) + 1,
        index: (top?.index ?? -1) + 1,
      })
      .returning()
      .get();
  });
  await invalidateMovies();
  return toMovie(row);
}


export async function updateMovie(id: number, input: MoviePatch, replace: boolean): Promise<Movie | null> {
  const set = replace ? { ...NULL_COLUMNS, ...toColumns(input) } : toColumns(input);
  const row = moviesDb.update(movies).set(set).where(eq(movies.id, id)).returning().get();
  if (!row) return null;
  await invalidateMovies();
  return toMovie(row);
}

export async function deleteMovie(id: number): Promise<boolean> {
  const rows = moviesDb.delete(movies).where(eq(movies.id, id)).returning({ id: movies.id }).all();
  if (rows.length === 0) return false;
  await invalidateMovies();
  return true;
}
