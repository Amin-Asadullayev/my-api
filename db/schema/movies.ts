import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';



export const movies = sqliteTable('movies', {
  index: integer('index'),
  budget: integer('budget'),
  genres: text('genres'), 
  homepage: text('homepage'),
  id: integer('id').notNull(),
  keywords: text('keywords'), 
  originalLanguage: text('original_language'),
  originalTitle: text('original_title'),
  overview: text('overview'),
  popularity: real('popularity'),
  productionCompanies: text('production_companies'), 
  productionCountries: text('production_countries'), 
  releaseDate: text('release_date'), 
  revenue: integer('revenue'),
  runtime: real('runtime'),
  spokenLanguages: text('spoken_languages'), 
  status: text('status'),
  tagline: text('tagline'),
  title: text('title'),
  voteAverage: real('vote_average'),
  voteCount: integer('vote_count'),
  cast: text('cast'), 
  crew: text('crew'), 
  director: text('director'),
});
