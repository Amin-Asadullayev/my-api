import { GraphQLError } from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';
import { ZodError } from 'zod';
import { listQuerySchema, idParamSchema, SORT_FIELDS } from './movies/schemas.js';
import { getMovie, listMovies } from './movies/service.js';



const typeDefs =  `
  type ProductionCompany { name: String! id: Int }
  type ProductionCountry { iso_3166_1: String! name: String! }
  type SpokenLanguage { iso_639_1: String! name: String! }

  type MovieSummary {
    id: Int!
    title: String
    tagline: String
    release_date: String
    genres: [String!]!
    director: String
    original_language: String
    runtime: Float
    status: String
    popularity: Float
    vote_average: Float
    vote_count: Int
  }

  type Movie {
    id: Int!
    title: String
    tagline: String
    release_date: String
    genres: [String!]!
    director: String
    original_language: String
    runtime: Float
    status: String
    popularity: Float
    vote_average: Float
    vote_count: Int
    original_title: String
    overview: String
    homepage: String
    budget: Int
    revenue: Int
    keywords: String
    cast: String
    crew: String
    production_companies: [ProductionCompany!]
    production_countries: [ProductionCountry!]
    spoken_languages: [SpokenLanguage!]
  }

  type PageMeta { page: Int! limit: Int! total: Int! totalPages: Int! }
  type MoviePage { data: [MovieSummary!]! meta: PageMeta! }

  enum SortField { ${SORT_FIELDS.join(' ')} }
  enum SortOrder { asc desc }

  type Query {
    "Paginated list; limit is capped at 20."
    movies(
      page: Int
      limit: Int
      q: String
      genre: String
      director: String
      language: String
      year: String
      status: String
      sort: SortField
      order: SortOrder
    ): MoviePage!
    movie(id: Int!): Movie
  }
`;

function invalidInput(err: unknown): never {
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    throw new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
  }
  throw err;
}

export const graphqlHandler = createYoga({
  graphqlEndpoint: '/graphql',
  logging: false,
  schema: createSchema({
    typeDefs,
    resolvers: {
      Query: {
        movies: async (_root, args: Record<string, unknown>) => {
          
          const defined = Object.fromEntries(Object.entries(args).filter(([, v]) => v != null));
          try {
            return (await listMovies(listQuerySchema.parse(defined))).page;
          } catch (err) {
            return invalidInput(err);
          }
        },
        movie: async (_root, args: { id: number }) => {
          try {
            return (await getMovie(idParamSchema.parse(args).id)).movie;
          } catch (err) {
            return invalidInput(err);
          }
        },
      },
    },
  }),
});
