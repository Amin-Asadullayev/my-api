import { z } from 'zod';

export const GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family',
  'Fantasy', 'Foreign', 'History', 'Horror', 'Music', 'Mystery', 'Romance', 'Science Fiction',
  'TV Movie', 'Thriller', 'War', 'Western',
] as const;

export const SORT_FIELDS = [
  'id', 'title', 'release_date', 'popularity', 'vote_average', 'vote_count', 'revenue', 'budget', 'runtime',
] as const;

export const MAX_PAGE_SIZE = 20;

const optionalText = (max: number) => z.string().trim().max(max);

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(MAX_PAGE_SIZE)
    .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
  q: z.string().trim().min(1).max(100).optional(),
  genre: z.enum(GENRES).optional(),
  director: z.string().trim().min(1).max(100).optional(),
  language: z.string().regex(/^[a-z]{2,3}$/).optional(),
  year: z.string().regex(/^\d{4}$/).optional(),
  status: z.string().trim().min(1).max(50).optional(),
  sort: z.enum(SORT_FIELDS).default('id'),
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const idParamSchema = z.object({ id: z.coerce.number().int().min(1) });

const company = z.strictObject({ name: z.string().min(1).max(200), id: z.number().int().optional() });
const country = z.strictObject({ iso_3166_1: z.string().length(2), name: z.string().min(1).max(200) });
const language = z.strictObject({ iso_639_1: z.string().min(2).max(3), name: z.string().min(1).max(200) });

const movieFields = {
  title: optionalText(300).min(1),
  original_title: optionalText(300).nullable().optional(),
  overview: optionalText(5000).nullable().optional(),
  tagline: optionalText(500).nullable().optional(),
  homepage: z.httpUrl().max(500).nullable().optional(),
  status: optionalText(50).min(1).nullable().optional(),
  original_language: z.string().regex(/^[a-z]{2,3}$/).nullable().optional(),
  release_date: z.iso.date().nullable().optional(),
  runtime: z.number().min(0).max(10_000).nullable().optional(),
  budget: z.number().int().min(0).nullable().optional(),
  revenue: z.number().int().min(0).nullable().optional(),
  popularity: z.number().min(0).nullable().optional(),
  vote_average: z.number().min(0).max(10).nullable().optional(),
  vote_count: z.number().int().min(0).nullable().optional(),
  genres: z.array(z.enum(GENRES)).max(GENRES.length).nullable().optional(),
  keywords: optionalText(2000).nullable().optional(),
  director: optionalText(200).nullable().optional(),
  cast: optionalText(5000).nullable().optional(),
  crew: optionalText(200_000).nullable().optional(),
  production_companies: z.array(company).max(100).nullable().optional(),
  production_countries: z.array(country).max(100).nullable().optional(),
  spoken_languages: z.array(language).max(100).nullable().optional(),
};

export const movieInputSchema = z.strictObject(movieFields);

export const moviePatchSchema = z.strictObject(movieFields).partial().refine((o) => Object.keys(o).length > 0, {
  message: 'Provide at least one field to update',
});
export type MovieInput = z.infer<typeof movieInputSchema>;
export type MoviePatch = z.infer<typeof moviePatchSchema>;
