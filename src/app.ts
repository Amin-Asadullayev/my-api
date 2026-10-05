import express, { type ErrorRequestHandler } from 'express';
import swaggerUi from 'swagger-ui-express';
import { ZodError } from 'zod';
import { authRouter } from './auth/routes.js';
import { HttpError } from './errors.js';
import { graphqlHandler } from './graphql.js';
import { moviesRouter } from './movies/routes.js';
import { openApiSpec } from './openapi.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });

  
  app.use(graphqlHandler.graphqlEndpoint, graphqlHandler);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false })); 

  app.get('/', (_req, res) => res.redirect('/docs'));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/openapi.json', (_req, res) => res.json(openApiSpec));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'Movies API' }));

  app.use(authRouter);
  app.use(moviesRouter);

  app.use((_req, _res, next) => next(new HttpError(404, 'not_found', 'Route not found')));

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'validation_error',
          message: 'Invalid request',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
    } else if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    } else if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
      
      const code = err.type === 'entity.too.large' ? 'payload_too_large' : 'bad_request';
      res.status(err.status).json({ error: { code, message: err.type === 'entity.parse.failed' ? 'Malformed JSON body' : err.message } });
    } else {
      console.error(err);
      res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong' } });
    }
  };
  app.use(onError);
  return app;
}
