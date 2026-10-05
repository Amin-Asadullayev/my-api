import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';


const dir = mkdtempSync(join(tmpdir(), 'movies-api-test-'));
const moviesPath = join(dir, 'movies.db');
const fixture = new Database(moviesPath);
fixture.exec(`CREATE TABLE movies (
  "index" INTEGER, budget INTEGER, genres TEXT, homepage TEXT, id INTEGER, keywords TEXT, original_language TEXT,
  original_title TEXT, overview TEXT, popularity REAL, production_companies TEXT, production_countries TEXT,
  release_date TEXT, revenue INTEGER, runtime REAL, spoken_languages TEXT, status TEXT, tagline TEXT, title TEXT,
  vote_average REAL, vote_count INTEGER, "cast" TEXT, crew TEXT, director TEXT)`);
const insert = fixture.prepare(`INSERT INTO movies ("index", id, title, original_title, genres, release_date, original_language,
  director, popularity, vote_average, status, homepage, production_companies) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
for (let i = 0; i < 45; i++) {
  const genres = i % 3 === 0 ? 'Action Science Fiction' : i % 3 === 1 ? 'Drama War' : 'Comedy';
  insert.run(i, 100 + i, `Movie ${i}`, `Movie ${i}`, genres, `${1990 + (i % 10)}-05-0${1 + (i % 9)}`, i % 5 === 0 ? 'fr' : 'en',
    i % 2 ? 'Jane Doe' : 'John Roe', i, (i % 10) + 0.5, 'Released', '', '[{"name": "Acme", "id": 1}]');
}
fixture.close();

process.env.MOVIES_DB_PATH = moviesPath;
process.env.AUTH_DB_PATH = join(dir, 'auth.db');
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? '';

const { createApp } = await import('../src/app.js');
const { connectCache, closeCache } = await import('../src/cache.js');
const { closeDatabases } = await import('../db/index.js');

let server: Server;
let base: string;

before(async () => {
  connectCache();
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http:
});

after(async () => {
  server.close();
  await closeCache();
  closeDatabases();
  rmSync(dir, { recursive: true, force: true });
});

async function api(path: string, init: { method?: string; body?: unknown; token?: string; form?: boolean } = {}) {
  const headers: Record<string, string> = {};
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  let body: string | undefined;
  if (init.body !== undefined) {
    if (init.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(init.body as Record<string, string>).toString();
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
  }
  const res = await fetch(base + path, { method: init.method ?? 'GET', headers, body });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : undefined };
}

async function login(username: string, password = 'correct horse battery') {
  await api('/auth/register', { method: 'POST', body: { username, password } });
  const res = await api('/oauth/token', { method: 'POST', form: true, body: { grant_type: 'password', username, password } });
  assert.equal(res.status, 200);
  return res.body as { access_token: string; refresh_token: string; token_type: string; expires_in: number };
}

describe('reading (public)', () => {
  it('paginates with at most 20 per page', async () => {
    const p1 = await api('/movies');
    assert.equal(p1.status, 200);
    assert.equal(p1.body.data.length, 20);
    assert.deepEqual(p1.body.meta, { page: 1, limit: 20, total: 45, totalPages: 3 });
    const p3 = await api('/movies?page=3');
    assert.equal(p3.body.data.length, 5);
    assert.equal((await api('/movies?page=4')).body.data.length, 0);
    const ids = new Set([...p1.body.data, ...(await api('/movies?page=2')).body.data, ...p3.body.data].map((m: { id: number }) => m.id));
    assert.equal(ids.size, 45, 'pages must not overlap or skip');
  });

  it('caps limit at 20 and honours smaller limits', async () => {
    assert.equal((await api('/movies?limit=500')).body.meta.limit, 20);
    assert.equal((await api('/movies?limit=5')).body.data.length, 5);
  });

  it('rejects invalid query parameters', async () => {
    for (const q of ['page=0', 'page=abc', 'limit=0', 'genre=Nope', 'sort=password', 'year=99', 'order=up']) {
      const res = await api(`/movies?${q}`);
      assert.equal(res.status, 400, q);
      assert.equal(res.body.error.code, 'validation_error');
    }
  });

  it('filters by whole-word genre, title, year, language and director', async () => {
    const war = await api('/movies?genre=War&limit=20');
    assert.equal(war.body.meta.total, 15);
    assert.ok(war.body.data.every((m: { genres: string[] }) => m.genres.includes('War')));
    const sf = await api('/movies?genre=Science%20Fiction');
    assert.equal(sf.body.meta.total, 15);
    assert.deepEqual(sf.body.data[0].genres, ['Action', 'Science Fiction']);
    assert.equal((await api('/movies?q=movie%2044')).body.data[0].id, 144);
    assert.equal((await api('/movies?language=fr')).body.meta.total, 9);
    assert.equal((await api('/movies?year=1990')).body.meta.total, 5);
    assert.equal((await api('/movies?director=jane')).body.meta.total, 22);
    assert.equal((await api('/movies?q=%25')).body.meta.total, 0, '% must be treated literally');
  });

  it('sorts', async () => {
    const res = await api('/movies?sort=popularity&order=desc&limit=3');
    assert.deepEqual(res.body.data.map((m: { id: number }) => m.id), [144, 143, 142]);
  });

  it('returns the full record for one movie, 404 and 400 otherwise', async () => {
    const res = await api('/movies/100');
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'Movie 0');
    assert.equal(res.body.homepage, null, 'empty strings are exposed as null');
    assert.deepEqual(res.body.production_companies, [{ name: 'Acme', id: 1 }]);
    assert.equal((await api('/movies/9999')).status, 404);
    const bad = await api('/movies/abc');
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.details[0].path, 'id');
  });
});

describe('authentication', () => {
  it('rejects writes without a valid token', async () => {
    const calls: [string, string, unknown?][] = [
      ['POST', '/movies', { title: 'x' }],
      ['PUT', '/movies/100', { title: 'x' }],
      ['PATCH', '/movies/100', { title: 'x' }],
      ['DELETE', '/movies/100'],
    ];
    for (const [method, path, body] of calls) {
      const none = await api(path, { method, body });
      assert.equal(none.status, 401, `${method} ${path}`);
      assert.equal(none.headers.get('www-authenticate'), 'Bearer');
      assert.equal((await api(path, { method, body, token: 'garbage' })).status, 401);
    }
    assert.equal((await api('/movies/100')).body.title, 'Movie 0', 'nothing changed');
  });

  it('registers, validates and refuses duplicate usernames', async () => {
    assert.equal((await api('/auth/register', { method: 'POST', body: { username: 'bob', password: 'short' } })).status, 400);
    const ok = await api('/auth/register', { method: 'POST', body: { username: 'Bob', password: 'correct horse battery' } });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.username, 'bob');
    assert.equal(ok.body.password_hash, undefined);
    const dup = await api('/auth/register', { method: 'POST', body: { username: 'BOB', password: 'correct horse battery' } });
    assert.equal(dup.status, 409);
  });

  it('issues OAuth tokens (form and JSON) and rejects bad credentials', async () => {
    const tokens = await login('carol');
    assert.equal(tokens.token_type, 'Bearer');
    assert.equal(tokens.expires_in, 900);
    const me = await api('/auth/me', { token: tokens.access_token });
    assert.equal(me.body.username, 'carol');

    const json = await api('/oauth/token', { method: 'POST', body: { grant_type: 'password', username: 'carol', password: 'correct horse battery' } });
    assert.equal(json.status, 200);

    const wrong = await api('/oauth/token', { method: 'POST', form: true, body: { grant_type: 'password', username: 'carol', password: 'nope nope nope' } });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.error, 'invalid_grant');
    const ghost = await api('/oauth/token', { method: 'POST', form: true, body: { grant_type: 'password', username: 'nobody', password: 'x' } });
    assert.deepEqual(ghost.body, wrong.body, 'same answer for unknown user and wrong password');
    assert.equal((await api('/oauth/token', { method: 'POST', form: true, body: { grant_type: 'implicit' } })).body.error, 'unsupported_grant_type');
    assert.equal((await api('/oauth/token', { method: 'POST', form: true, body: { grant_type: 'password' } })).body.error, 'invalid_request');
  });

  it('rotates refresh tokens and supports revocation', async () => {
    const t1 = await login('dave');
    const refreshed = await api('/oauth/token', { method: 'POST', form: true, body: { grant_type: 'refresh_token', refresh_token: t1.refresh_token } });
    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.body.refresh_token, t1.refresh_token);
    assert.equal((await api('/auth/me', { token: refreshed.body.access_token })).status, 200);

    const replay = await api('/oauth/token', { method: 'POST', form: true, body: { grant_type: 'refresh_token', refresh_token: t1.refresh_token } });
    assert.equal(replay.status, 400, 'a used refresh token cannot be replayed');

    await api('/oauth/revoke', { method: 'POST', body: { token: refreshed.body.refresh_token } });
    const revoked = await api('/oauth/token', { method: 'POST', form: true, body: { grant_type: 'refresh_token', refresh_token: refreshed.body.refresh_token } });
    assert.equal(revoked.status, 400);
  });
});

describe('writing (authenticated)', () => {
  it('creates, reads, replaces, patches and deletes a movie', async () => {
    const { access_token: token } = await login('erin');

    const created = await api('/movies', {
      method: 'POST',
      token,
      body: { title: 'New Film', genres: ['Drama', 'Science Fiction'], release_date: '2024-02-29', runtime: 101.5, tagline: 'Hi', production_countries: [{ iso_3166_1: 'FR', name: 'France' }] },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.id, 145, 'id is max(id)+1');
    assert.equal(created.headers.get('location'), '/movies/145');
    assert.deepEqual(created.body.genres, ['Drama', 'Science Fiction']);

    const read = await api('/movies/145');
    assert.equal(read.body.title, 'New Film');
    assert.equal((await api('/movies?q=New%20Film')).body.meta.total, 1);
    assert.equal((await api('/movies')).body.meta.total, 46);

    const patched = await api('/movies/145', { method: 'PATCH', token, body: { runtime: 120, tagline: null } });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.runtime, 120);
    assert.equal(patched.body.tagline, null);
    assert.equal(patched.body.title, 'New Film', 'PATCH leaves other fields alone');
    assert.equal((await api('/movies/145')).body.runtime, 120, 'reads see the update');

    const put = await api('/movies/145', { method: 'PUT', token, body: { title: 'Renamed' } });
    assert.equal(put.status, 200);
    assert.equal(put.body.title, 'Renamed');
    assert.equal(put.body.runtime, null, 'PUT resets omitted fields');
    assert.deepEqual(put.body.genres, []);

    assert.equal((await api('/movies/145', { method: 'DELETE', token })).status, 204);
    assert.equal((await api('/movies/145')).status, 404);
    assert.equal((await api('/movies/145', { method: 'DELETE', token })).status, 404);
    assert.equal((await api('/movies/145', { method: 'PATCH', token, body: { title: 'x' } })).status, 404);
    assert.equal((await api('/movies')).body.meta.total, 45);
  });

  it('validates input', async () => {
    const { access_token: token } = await login('frank');
    const bad: unknown[] = [
      {},
      { title: '' },
      { title: 'x', id: 5 },
      { title: 'x', release_date: '2024-13-45' },
      { title: 'x', genres: ['Nonsense'] },
      { title: 'x', homepage: 'javascript:alert(1)' },
      { title: 'x', vote_average: 11 },
      { title: 'x', budget: -1 },
    ];
    for (const body of bad) {
      const res = await api('/movies', { method: 'POST', token, body });
      assert.equal(res.status, 400, JSON.stringify(body));
    }
    assert.equal((await api('/movies/100', { method: 'PATCH', token, body: {} })).status, 400, 'empty PATCH');
    assert.equal((await api('/movies/100', { method: 'PUT', token, body: { runtime: 1 } })).status, 400, 'PUT needs title');

    const res = await fetch(`${base}/movies`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{oops' });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: { message: string } }).error.message, 'Malformed JSON body');
  });
});

describe('GraphQL', () => {
  const gql = async (query: string) => {
    const res = await fetch(`${base}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    return (await res.json()) as { data?: any; errors?: { message: string }[] };
  };

  it('lists and fetches movies', async () => {
    const list = await gql('{ movies(limit: 2, genre: "War", sort: popularity, order: desc) { data { id title genres } meta { total totalPages } } }');
    assert.equal(list.errors, undefined);
    assert.equal(list.data.movies.data.length, 2);
    assert.equal(list.data.movies.meta.total, 15);
    const one = await gql('{ movie(id: 100) { title production_companies { name } } missing: movie(id: 99999) { title } }');
    assert.deepEqual(one.data, { movie: { title: 'Movie 0', production_companies: [{ name: 'Acme' }] }, missing: null });
  });

  it('caps page size and reports invalid input', async () => {
    assert.equal((await gql('{ movies(limit: 1000) { meta { limit } } }')).data.movies.meta.limit, 20);
    const bad = await gql('{ movies(page: 0) { meta { page } } }');
    assert.match(bad.errors![0]!.message, /page/);
  });
});

describe('documentation', () => {
  it('serves the OpenAPI spec and Swagger UI', async () => {
    const spec = await api('/openapi.json');
    assert.equal(spec.body.openapi, '3.0.3');
    for (const path of ['/movies', '/movies/{id}', '/oauth/token', '/auth/register']) assert.ok(spec.body.paths[path], path);
    assert.deepEqual(spec.body.components.schemas.MovieInput.required, ['title']);
    const ui = await fetch(`${base}/docs/`);
    assert.equal(ui.status, 200);
    assert.match(await ui.text(), /swagger-ui/i);
  });

  it('answers unknown routes with JSON 404', async () => {
    const res = await api('/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'not_found');
  });
});


describe('Redis cache', { skip: !process.env.TEST_REDIS_URL }, () => {
  it('serves repeat reads from cache and invalidates on writes', async () => {
    
    for (let i = 0; i < 40; i++) {
      if ((await api('/movies/101')).headers.get('x-cache') !== 'BYPASS') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const { access_token: token } = await login('grace');
    await api('/movies/100', { method: 'PATCH', token, body: { tagline: 'bust the cache' } }); 

    assert.equal((await api('/movies?limit=3&sort=title')).headers.get('x-cache'), 'MISS');
    assert.equal((await api('/movies?limit=3&sort=title')).headers.get('x-cache'), 'HIT');
    assert.equal((await api('/movies/102')).headers.get('x-cache'), 'MISS');
    const hit = await api('/movies/102');
    assert.equal(hit.headers.get('x-cache'), 'HIT');
    assert.equal(hit.body.title, 'Movie 2');

    await api('/movies/102', { method: 'PATCH', token, body: { title: 'Changed' } });
    const after = await api('/movies/102');
    assert.equal(after.headers.get('x-cache'), 'MISS', 'a write invalidates cached reads');
    assert.equal(after.body.title, 'Changed');
    assert.equal((await api('/movies?limit=3&sort=title')).headers.get('x-cache'), 'MISS', 'lists too');
  });
});
