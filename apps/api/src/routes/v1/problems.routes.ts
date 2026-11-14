import { problemListQuerySchema } from '@devarena/api-contracts';
import { Hono, type MiddlewareHandler } from 'hono';
import { getAuthenticatedStateFromContext } from '../../middleware/index.js';
import type { ProblemService } from '../../services/problem.service.js';

export interface ProblemRoutesDependencies {
  readonly problemService: ProblemService;
  readonly optionalAuthMiddleware: MiddlewareHandler;
}

function cleanEmptyQueryParams(rawQuery: Record<string, string>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawQuery)) {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      cleaned[key] = trimmed;
    }
  }
  return cleaned;
}

export function createProblemRoutes(deps: ProblemRoutesDependencies): Hono {
  const router = new Hono();

  router.get('/', deps.optionalAuthMiddleware, async (c) => {
    const rawQuery = cleanEmptyQueryParams(c.req.query());
    const parsedQuery = problemListQuerySchema.parse(rawQuery);
    const authState = getAuthenticatedStateFromContext(c);

    const response = await deps.problemService.listPublishedProblems(
      parsedQuery,
      authState?.user.id,
    );

    return c.json(response, 200);
  });

  router.get('/:slug', deps.optionalAuthMiddleware, async (c) => {
    const rawSlug = c.req.param('slug');
    const authState = getAuthenticatedStateFromContext(c);

    const response = await deps.problemService.getPublishedProblemBySlug(
      rawSlug,
      authState?.user.id,
    );

    return c.json(response, 200);
  });

  return router;
}
