# Movies API

A REST API (plus a read-only GraphQL interface) over a dataset of **4,803 movies** (TMDB 5000: genres, cast, director, budget, revenue, ratings, ...).

- **Public reads**, **authenticated writes** (create / update / delete)
- **OAuth 2.0 tokens**: password grant + rotating refresh tokens, JWT access tokens
- **Pagination**: at most 20 movies per page, with filtering and sorting
- **Redis cache** for reads, invalidated on every write (the API still works if Redis is down)
- **Swagger UI** at `/docs`, **GraphQL** at `/graphql`, and a **Postman collection**

Stack: Node 20, TypeScript, Express 5, SQLite (`better-sqlite3` + Drizzle ORM), Redis (`ioredis`), `jose` (JWT), `argon2`, `zod`, GraphQL Yoga.

## Documentation

| | |
|---|---|
| Swagger UI | `/docs` (spec: `/openapi.json`) |
| GraphQL (GraphiQL) | `/graphql` |
| Postman documentation | **TODO: paste the published Postman docs link here** |
| Postman collection file | [`docs/postman_collection.json`](docs/postman_collection.json) (import it into Postman, set `baseUrl`) |
| Live API | **TODO: paste the deployed URL here** |

## Run locally

```bash
npm install
cp .env.example .env        # set JWT_SECRET (openssl rand -hex 32); optional: REDIS_URL
npm run dev                 # http://localhost:3000  (redirects to /docs)
```

Redis is optional locally (`docker run -p 6379:6379 redis:7-alpine`, then set `REDIS_URL`). Without it every read is served straight from SQLite.

| Variable | Default | |
|---|---|---|
| `JWT_SECRET` | random per start (dev only) | **Required** when `NODE_ENV=production`, 32+ chars |
| `REDIS_URL` | *(caching off)* | e.g. `redis://localhost:6379` |
| `PORT` | `3000` | |
| `MOVIES_DB_PATH` | `db/movies.db` | The dataset |
| `AUTH_DB_PATH` | `db/auth.db` | Users and refresh tokens (kept apart from the dataset) |
| `CACHE_TTL_SECONDS` | `60` | `0` disables the cache |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | |
| `REFRESH_TOKEN_TTL_SECONDS` | `2592000` | 30 days |

## Using the API

Reading needs no account:

```bash
curl "http://localhost:3000/movies?genre=Science%20Fiction&sort=popularity&order=desc&limit=5"
curl  http://localhost:3000/movies/19995
```

`GET /movies` query parameters: `page`, `limit` (max 20; larger values are capped), `q` (title), `genre`, `director`, `language`, `year`, `status`, `sort` (`id|title|release_date|popularity|vote_average|vote_count|revenue|budget|runtime`), `order` (`asc|desc`). The response is `{ "data": [...], "meta": { "page", "limit", "total", "totalPages" } }` and carries an `X-Cache: HIT|MISS|BYPASS` header.

Writing needs a token:

```bash
# 1. create an account
curl -X POST localhost:3000/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"correct horse battery"}'

# 2. get tokens (OAuth 2.0 password grant)
curl -X POST localhost:3000/oauth/token \
  -d 'grant_type=password&username=alice&password=correct horse battery'
# -> { "access_token": "...", "token_type": "Bearer", "expires_in": 900, "refresh_token": "..." }

# 3. write
curl -X POST localhost:3000/movies -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' -d '{"title":"My Movie","genres":["Drama"],"release_date":"2024-05-01"}'

# 4. when the access token expires, trade the refresh token for a new pair (each refresh token works once)
curl -X POST localhost:3000/oauth/token -d "grant_type=refresh_token&refresh_token=$REFRESH_TOKEN"
```

| Method | Path | Auth | |
|---|---|---|---|
| GET | `/movies` | - | Paginated, filterable list (summaries) |
| GET | `/movies/{id}` | - | Full record |
| POST | `/movies` | Bearer | Create (id assigned by the server) |
| PUT | `/movies/{id}` | Bearer | Replace (`title` required, omitted fields reset to null) |
| PATCH | `/movies/{id}` | Bearer | Change only the given fields |
| DELETE | `/movies/{id}` | Bearer | |
| POST | `/auth/register` | - | |
| POST | `/oauth/token` | - | `password` and `refresh_token` grants |
| POST | `/oauth/revoke` | - | Revoke a refresh token (logout) |
| GET | `/auth/me` | Bearer | |
| POST | `/graphql` | - | Read-only: `movies(...)`, `movie(id)` |

Any registered user may modify the data; there are no roles.

## How the cache works

Movie reads (lists and single movies) are stored in Redis for `CACHE_TTL_SECONDS`. Cache keys contain a version number that every create/update/delete increments, so a write invalidates all cached lists and items at once. If Redis is unreachable the API falls back to SQLite and reports `X-Cache: BYPASS`.

## Data notes

- `movies.db` is used as is (table `movies`, `id` = TMDB id). The API exposes `genres` as an array and the three JSON columns as arrays of objects; `keywords`, `cast` and `crew` stay strings (`crew` is a Python-style list in the source data, not JSON). Empty strings are returned as `null`.
- Users and refresh tokens are stored in a separate `auth.db`, so `movies.db` stays a plain dataset.

## Deploy

The included `Dockerfile` produces a self-contained image (the dataset is baked in and copied to the `/data` volume on first start).

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up --build   # API on :3000 + Redis
```

On a hosting platform (Render, Railway, Fly.io, ...): deploy the Dockerfile, attach a **persistent volume at `/data`** (otherwise edits and user accounts are lost on every redeploy), add a Redis instance and set:

- `JWT_SECRET` - a long random string
- `REDIS_URL` - the Redis connection URL from your provider
- `PORT` if the platform requires a specific one

SQLite lives on a single disk, so run **one instance** of the API.

## Development

```bash
npm run typecheck
npm run build && npm start
```

```
db/            movies.db, Drizzle schemas, database setup
src/auth/      register, OAuth token endpoint, bearer-token middleware
src/movies/    validation schemas, query/write logic, routes
src/cache.ts   Redis read-through cache with version-based invalidation
src/graphql.ts, src/openapi.ts, src/app.ts, src/server.ts
```

Not included: rate limiting on the login endpoint and CORS headers; add them if the API will be called from browsers or exposed publicly at scale.
