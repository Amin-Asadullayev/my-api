import { z } from 'zod';
import { GENRES, MAX_PAGE_SIZE, movieInputSchema, moviePatchSchema, SORT_FIELDS } from './movies/schemas.js';

const fromZod = (schema: z.ZodType) => z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' });

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const jsonBody = (schema: object) => ({ 'application/json': { schema } });
const errorResponse = (description: string) => ({ description, content: jsonBody(ref('Error')) });
const authErrors = {
  '401': { ...errorResponse('Missing, invalid or expired access token'), headers: { 'WWW-Authenticate': { schema: { type: 'string' } } } },
};
const write = [{ oauth2: [] }, { bearerAuth: [] }];
const idParam = { name: 'id', in: 'path', required: true, description: 'Movie id (TMDB id)', schema: { type: 'integer', minimum: 1 }, example: 19995 };
const query = (name: string, description: string, schema: object, example?: unknown) => ({ name, in: 'query', description, schema, ...(example !== undefined && { example }) });
const cacheHeader = {
  'X-Cache': {
    description: 'HIT: served from Redis. MISS: read from the database and cached. BYPASS: cache unavailable or disabled.',
    schema: { type: 'string', enum: ['HIT', 'MISS', 'BYPASS'] },
  },
};

const nullable = (type: string, extra: object = {}) => ({ type, nullable: true, ...extra });

const summaryProps = {
  id: { type: 'integer', example: 19995 },
  title: nullable('string', { example: 'Avatar' }),
  tagline: nullable('string', { example: 'Enter the World of Pandora.' }),
  release_date: nullable('string', { format: 'date', example: '2009-12-10' }),
  genres: { type: 'array', items: { type: 'string', enum: [...GENRES] }, example: ['Action', 'Science Fiction'] },
  director: nullable('string', { example: 'James Cameron' }),
  original_language: nullable('string', { example: 'en' }),
  runtime: nullable('number', { example: 162 }),
  status: nullable('string', { example: 'Released' }),
  popularity: nullable('number', { example: 150.44 }),
  vote_average: nullable('number', { example: 7.2 }),
  vote_count: nullable('integer', { example: 11800 }),
};

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Movies API',
    version: '1.0.0',
    description: [
      'REST API over a dataset of 4,803 movies (TMDB 5000). Reading is public; creating, updating and deleting require an access token.',
      '',
      '**Authentication (OAuth 2.0):** register with `POST /auth/register`, then get a token from `POST /oauth/token` (`password` grant) and send it as `Authorization: Bearer <access_token>`. ' +
        'Access tokens are short lived; exchange the refresh token for a new pair with the `refresh_token` grant (each refresh token works once).',
      '',
      `**Pagination:** \`GET /movies\` returns at most ${MAX_PAGE_SIZE} movies per page (\`page\`, \`limit\`).`,
      '',
      '**Caching:** reads are cached in Redis and invalidated by every write; see the `X-Cache` response header.',
      '',
      '**GraphQL:** a read-only GraphQL interface is available at `/graphql` (GraphiQL in the browser).',
    ].join('\n'),
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Movies', description: 'Public reads, authenticated writes' },
    { name: 'Auth', description: 'Users and OAuth 2.0 tokens' },
    { name: 'System' },
  ],
  paths: {
    '/health': {
      get: { tags: ['System'], summary: 'Health check', responses: { '200': { description: 'Service is up', content: jsonBody({ type: 'object', properties: { status: { type: 'string', example: 'ok' } } }) } } },
    },
    '/movies': {
      get: {
        tags: ['Movies'],
        summary: 'List movies (paginated, filterable)',
        description: 'Public. Returns summaries; fetch `/movies/{id}` for the full record.',
        parameters: [
          query('page', '1-based page number', { type: 'integer', minimum: 1, default: 1 }),
          query('limit', `Page size. Values above ${MAX_PAGE_SIZE} are capped at ${MAX_PAGE_SIZE}.`, { type: 'integer', minimum: 1, maximum: MAX_PAGE_SIZE, default: MAX_PAGE_SIZE }),
          query('q', 'Case-insensitive substring of the title or original title', { type: 'string', maxLength: 100 }, 'avatar'),
          query('genre', 'Exactly one genre', { type: 'string', enum: [...GENRES] }, 'Science Fiction'),
          query('director', 'Case-insensitive substring of the director name', { type: 'string', maxLength: 100 }, 'Cameron'),
          query('language', 'Original language (ISO 639-1)', { type: 'string', pattern: '^[a-z]{2,3}$' }, 'fr'),
          query('year', 'Release year', { type: 'string', pattern: '^\\d{4}$' }, '1999'),
          query('status', 'Release status', { type: 'string' }, 'Released'),
          query('sort', 'Sort field', { type: 'string', enum: [...SORT_FIELDS], default: 'id' }),
          query('order', 'Sort direction', { type: 'string', enum: ['asc', 'desc'], default: 'asc' }),
        ],
        responses: {
          '200': { description: 'A page of movies', headers: cacheHeader, content: jsonBody(ref('MoviePage')) },
          '400': errorResponse('Invalid query parameter'),
        },
      },
      post: {
        tags: ['Movies'],
        summary: 'Create a movie',
        description: 'The id is assigned by the server. Omitted optional fields are stored as null.',
        security: write,
        requestBody: { required: true, content: jsonBody(ref('MovieInput')) },
        responses: {
          '201': { description: 'Created', headers: { Location: { schema: { type: 'string', example: '/movies/459488' } } }, content: jsonBody(ref('Movie')) },
          '400': errorResponse('Validation error'),
          ...authErrors,
        },
      },
    },
    '/movies/{id}': {
      parameters: [idParam],
      get: {
        tags: ['Movies'],
        summary: 'Get one movie',
        description: 'Public.',
        responses: {
          '200': { description: 'The movie', headers: cacheHeader, content: jsonBody(ref('Movie')) },
          '400': errorResponse('Invalid id'),
          '404': errorResponse('No such movie'),
        },
      },
      put: {
        tags: ['Movies'],
        summary: 'Replace a movie',
        description: 'Full update: `title` is required and every omitted optional field is reset to null. Use PATCH to change only some fields.',
        security: write,
        requestBody: { required: true, content: jsonBody(ref('MovieInput')) },
        responses: { '200': { description: 'Updated', content: jsonBody(ref('Movie')) }, '400': errorResponse('Validation error'), ...authErrors, '404': errorResponse('No such movie') },
      },
      patch: {
        tags: ['Movies'],
        summary: 'Partially update a movie',
        security: write,
        requestBody: { required: true, content: jsonBody(ref('MoviePatch')) },
        responses: { '200': { description: 'Updated', content: jsonBody(ref('Movie')) }, '400': errorResponse('Validation error'), ...authErrors, '404': errorResponse('No such movie') },
      },
      delete: {
        tags: ['Movies'],
        summary: 'Delete a movie',
        security: write,
        responses: { '204': { description: 'Deleted' }, '400': errorResponse('Invalid id'), ...authErrors, '404': errorResponse('No such movie') },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create a user account',
        requestBody: { required: true, content: jsonBody(ref('Credentials')) },
        responses: {
          '201': { description: 'Registered', content: jsonBody({ type: 'object', properties: { id: { type: 'integer' }, username: { type: 'string' } } }) },
          '400': errorResponse('Validation error'),
          '409': errorResponse('Username already taken'),
        },
      },
    },
    '/oauth/token': {
      post: {
        tags: ['Auth'],
        summary: 'Get an access token (OAuth 2.0 token endpoint)',
        description: 'Grant `password`: exchange username and password. Grant `refresh_token`: exchange a refresh token for a new access and refresh token (the old refresh token stops working).',
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': { schema: ref('TokenRequest') },
            'application/json': { schema: ref('TokenRequest') },
          },
        },
        responses: {
          '200': { description: 'Tokens', content: jsonBody(ref('TokenResponse')) },
          '400': { description: 'OAuth error (invalid_request, invalid_grant, unsupported_grant_type)', content: jsonBody(ref('OAuthError')) },
        },
      },
    },
    '/oauth/revoke': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke a refresh token (log out)',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } } } } },
        responses: { '200': { description: 'Always returned, whether or not the token existed' } },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'The authenticated user',
        security: write,
        responses: { '200': { description: 'The current user', content: jsonBody({ type: 'object', properties: { id: { type: 'integer' }, username: { type: 'string' } } }) }, ...authErrors },
      },
    },
  },
  components: {
    securitySchemes: {
      oauth2: {
        type: 'oauth2',
        description: 'Log in with the username and password of a registered user.',
        flows: { password: { tokenUrl: '/oauth/token', refreshUrl: '/oauth/token', scopes: {} } },
      },
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Paste an `access_token` from /oauth/token.' },
    },
    schemas: {
      MovieSummary: { type: 'object', properties: summaryProps },
      Movie: {
        type: 'object',
        properties: {
          ...summaryProps,
          original_title: nullable('string', { example: 'Avatar' }),
          overview: nullable('string'),
          homepage: nullable('string', { example: 'http://www.avatarmovie.com/' }),
          budget: nullable('integer', { example: 237000000 }),
          revenue: nullable('integer', { example: 2787965087 }),
          keywords: nullable('string', { description: 'Space separated', example: 'culture clash future space war' }),
          cast: nullable('string', { description: 'Main cast names, space separated', example: 'Sam Worthington Zoe Saldana' }),
          crew: nullable('string', { description: 'Crew list as stored in the dataset (a Python-style list, not JSON)' }),
          production_companies: { type: 'array', nullable: true, items: { type: 'object', properties: { name: { type: 'string' }, id: { type: 'integer' } } } },
          production_countries: { type: 'array', nullable: true, items: { type: 'object', properties: { iso_3166_1: { type: 'string' }, name: { type: 'string' } } } },
          spoken_languages: { type: 'array', nullable: true, items: { type: 'object', properties: { iso_639_1: { type: 'string' }, name: { type: 'string' } } } },
        },
      },
      MoviePage: {
        type: 'object',
        properties: {
          data: { type: 'array', items: ref('MovieSummary') },
          meta: {
            type: 'object',
            properties: {
              page: { type: 'integer', example: 1 },
              limit: { type: 'integer', example: MAX_PAGE_SIZE },
              total: { type: 'integer', description: 'Movies matching the filters', example: 4803 },
              totalPages: { type: 'integer', example: 241 },
            },
          },
        },
      },
      MovieInput: fromZod(movieInputSchema),
      MoviePatch: fromZod(moviePatchSchema),
      Credentials: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 32, pattern: '^[A-Za-z0-9_.-]+$', example: 'alice' },
          password: { type: 'string', minLength: 8, maxLength: 128, format: 'password' },
        },
      },
      TokenRequest: {
        type: 'object',
        required: ['grant_type'],
        properties: {
          grant_type: { type: 'string', enum: ['password', 'refresh_token'] },
          username: { type: 'string', description: 'For grant_type=password' },
          password: { type: 'string', format: 'password', description: 'For grant_type=password' },
          refresh_token: { type: 'string', description: 'For grant_type=refresh_token' },
        },
      },
      TokenResponse: {
        type: 'object',
        properties: {
          access_token: { type: 'string', description: 'JWT to send as a Bearer token' },
          token_type: { type: 'string', example: 'Bearer' },
          expires_in: { type: 'integer', description: 'Access token lifetime in seconds', example: 900 },
          refresh_token: { type: 'string' },
        },
      },
      OAuthError: {
        type: 'object',
        properties: { error: { type: 'string', example: 'invalid_grant' }, error_description: { type: 'string' } },
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'validation_error' },
              message: { type: 'string' },
              details: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, message: { type: 'string' } } } },
            },
          },
        },
      },
    },
  },
};
