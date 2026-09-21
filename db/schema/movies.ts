import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Mirrors the existing `movies` table in movies.db (imported from the TMDB 5000 CSV).
// `id` is the TMDB id and is unique in the data; `index` is a legacy CSV row number.
export const movies = sqliteTable('movies', {
  index: integer('index'),
  budget: integer('budget'),
  genres: text('genres'), // space separated, e.g. "Action Science Fiction"
  homepage: text('homepage'),
  id: integer('id').notNull(),
  keywords: text('keywords'), // space separated
  originalLanguage: text('original_language'),
  originalTitle: text('original_title'),
  overview: text('overview'),
  popularity: real('popularity'),
  productionCompanies: text('production_companies'), // JSON
  productionCountries: text('production_countries'), // JSON
  releaseDate: text('release_date'), // YYYY-MM-DD
  revenue: integer('revenue'),
  runtime: real('runtime'),
  spokenLanguages: text('spoken_languages'), // JSON
  status: text('status'),
  tagline: text('tagline'),
  title: text('title'),
  voteAverage: real('vote_average'),
  voteCount: integer('vote_count'),
  cast: text('cast'), // space separated names
  crew: text('crew'), // Python-repr list (not JSON), kept opaque
  director: text('director'),
});
