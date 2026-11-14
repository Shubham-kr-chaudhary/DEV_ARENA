import {
  adminProblemListQuerySchema,
  createProblemRequestSchema,
  replaceProblemTestCasesRequestSchema,
  updateProblemRequestSchema,
} from '@devarena/api-contracts';
import { Hono, type Context } from 'hono';
import { ApiHttpError } from '../../errors/http-error.js';
import { requireAuthenticatedStateFromContext } from '../../middleware/index.js';
import type { ProblemService } from '../../services/problem.service.js';

export interface AdminProblemRoutesDependencies {
  readonly problemService: ProblemService;
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

async function parseJsonRequestBody(c: Context): Promise<unknown> {
  const contentType = c.req.header('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new ApiHttpError(400, 'VALIDATION_ERROR', 'Content-Type must be application/json.');
  }

  try {
    return await c.req.json();
  } catch {
    throw new ApiHttpError(400, 'VALIDATION_ERROR', 'Malformed JSON request body.');
  }
}

export function createAdminProblemRoutes(deps: AdminProblemRoutesDependencies): Hono {
  const router = new Hono();

  router.get('/', async (c) => {
    const authState = requireAuthenticatedStateFromContext(c);
    const rawQuery = cleanEmptyQueryParams(c.req.query());
    const parsedQuery = adminProblemListQuerySchema.parse(rawQuery);

    const response = await deps.problemService.listAdminProblems(authState.actor, parsedQuery);
    return c.json(response, 200);
  });

  router.post('/', async (c) => {
    const authState = requireAuthenticatedStateFromContext(c);
    const rawBody = await parseJsonRequestBody(c);
    const parsedInput = createProblemRequestSchema.parse(rawBody);

    const response = await deps.problemService.createProblem(authState.actor, parsedInput);
    return c.json(response, 201);
  });

  router.get('/:id', async (c) => {
    const authState = requireAuthenticatedStateFromContext(c);
    const problemId = c.req.param('id');

    const response = await deps.problemService.getAdminProblemById(authState.actor, problemId);
    return c.json(response, 200);
  });

  router.patch('/:id', async (c) => {
    const authState = requireAuthenticatedStateFromContext(c);
    const problemId = c.req.param('id');
    const rawBody = await parseJsonRequestBody(c);
    const parsedInput = updateProblemRequestSchema.parse(rawBody);

    const response = await deps.problemService.updateProblem(
      authState.actor,
      problemId,
      parsedInput,
    );
    return c.json(response, 200);
  });

  async function replaceTestCasesForProblem(c: Context, problemId: string) {
    const authState = requireAuthenticatedStateFromContext(c);
    const rawBody = await parseJsonRequestBody(c);
    const parsedInput = replaceProblemTestCasesRequestSchema.parse(rawBody);

    const response = await deps.problemService.replaceProblemTestCases(
      authState.actor,
      problemId,
      parsedInput,
    );
    return c.json(response, 200);
  }

  router.post('/:id/test-cases', async (c) => replaceTestCasesForProblem(c, c.req.param('id')));
  router.put('/:id/test-cases', async (c) => replaceTestCasesForProblem(c, c.req.param('id')));

  router.post('/:id/publish', async (c) => {
    const authState = requireAuthenticatedStateFromContext(c);
    const problemId = c.req.param('id');

    const response = await deps.problemService.transitionProblemStatus(
      authState.actor,
      problemId,
      'PUBLISHED',
    );
    return c.json(response, 200);
  });

  router.post('/:id/unpublish', async (c) => {
    const authState = requireAuthenticatedStateFromContext(c);
    const problemId = c.req.param('id');

    const response = await deps.problemService.transitionProblemStatus(
      authState.actor,
      problemId,
      'DRAFT',
    );
    return c.json(response, 200);
  });

  router.post('/:id/archive', async (c) => {
    const authState = requireAuthenticatedStateFromContext(c);
    const problemId = c.req.param('id');

    const response = await deps.problemService.transitionProblemStatus(
      authState.actor,
      problemId,
      'ARCHIVED',
    );
    return c.json(response, 200);
  });

  return router;
}
