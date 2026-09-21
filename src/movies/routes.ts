import { Router, type Response } from 'express';
import { requireAuth } from '../auth/middleware.js';
import type { CacheStatus } from '../cache.js';
import { notFound } from '../errors.js';
import { idParamSchema, listQuerySchema, movieInputSchema, moviePatchSchema } from './schemas.js';
import { createMovie, deleteMovie, getMovie, listMovies, updateMovie } from './service.js';

export const moviesRouter = Router();

const withCache = (res: Response, status: CacheStatus) => res.set('X-Cache', status);

// Reads are public.
moviesRouter.get('/movies', async (req, res) => {
  const { page, cache } = await listMovies(listQuerySchema.parse(req.query));
  withCache(res, cache).json(page);
});

moviesRouter.get('/movies/:id', async (req, res) => {
  const { movie, cache } = await getMovie(idParamSchema.parse(req.params).id);
  if (!movie) throw notFound('Movie');
  withCache(res, cache).json(movie);
});

// Writes need a valid access token.
moviesRouter.post('/movies', requireAuth, async (req, res) => {
  const movie = await createMovie(movieInputSchema.parse(req.body));
  res.status(201).location(`/movies/${movie.id}`).json(movie);
});

moviesRouter.put('/movies/:id', requireAuth, async (req, res) => {
  const movie = await updateMovie(idParamSchema.parse(req.params).id, movieInputSchema.parse(req.body), true);
  if (!movie) throw notFound('Movie');
  res.json(movie);
});

moviesRouter.patch('/movies/:id', requireAuth, async (req, res) => {
  const movie = await updateMovie(idParamSchema.parse(req.params).id, moviePatchSchema.parse(req.body), false);
  if (!movie) throw notFound('Movie');
  res.json(movie);
});

moviesRouter.delete('/movies/:id', requireAuth, async (req, res) => {
  if (!(await deleteMovie(idParamSchema.parse(req.params).id))) throw notFound('Movie');
  res.status(204).end();
});
