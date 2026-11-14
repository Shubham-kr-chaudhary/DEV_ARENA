import { z } from 'zod';

const DEV_DEFAULT_SESSION_SECRET = 'devarena-local-development-secret-do-not-use-in-prod';
const PLACEHOLDER_SESSION_SECRET = 'replace-with-a-local-development-secret';

const environmentSchema = z.enum(['development', 'test', 'production']);

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const optionalUrlEnvSchema = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  })
  .refine((value) => value === undefined || isValidHttpUrl(value), {
    message: 'Must be a valid HTTP/HTTPS URL when provided',
  });

const optionalStringEnvSchema = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  });

const booleanFlagEnvSchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((val) => val === 'true');

const serverConfigSchema = z
  .object({
    NODE_ENV: environmentSchema.default('development'),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
    DATABASE_URL: z
      .string()
      .url()
      .default('postgresql://devarena:devarena@localhost:5432/devarena'),
    SESSION_SECRET: z.string().min(16).default(DEV_DEFAULT_SESSION_SECRET),
    SESSION_COOKIE_NAME: z.string().min(1).default('devarena_session'),
    SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(60 * 60 * 24 * 30)
      .default(60 * 60 * 24 * 7),
    TRUST_PROXY: booleanFlagEnvSchema,
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .default(15 * 60 * 1000),
    AUTH_REGISTER_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(5),
    AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
    AWS_REGION: z.string().min(1).default('ap-south-1'),
    SQS_QUEUE_URL: optionalUrlEnvSchema,
    SQS_DLQ_URL: optionalUrlEnvSchema,
    S3_BUCKET: optionalStringEnvSchema,
  })
  .superRefine((config, ctx) => {
    if (config.NODE_ENV === 'production') {
      if (
        config.SESSION_SECRET === DEV_DEFAULT_SESSION_SECRET ||
        config.SESSION_SECRET === PLACEHOLDER_SESSION_SECRET ||
        config.SESSION_SECRET.length < 32
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SESSION_SECRET'],
          message:
            'Production SESSION_SECRET must be at least 32 characters and must not use development placeholder values',
        });
      }
    }
  });

const workerConfigSchema = z
  .object({
    NODE_ENV: environmentSchema.default('development'),
    AWS_REGION: z.string().min(1).default('ap-south-1'),
    SQS_QUEUE_URL: optionalUrlEnvSchema,
    SQS_DLQ_URL: optionalUrlEnvSchema,
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(2),
    WORKER_POLL_WAIT_SECONDS: z.coerce.number().int().min(1).max(20).default(20),
    WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  })
  .superRefine((config, ctx) => {
    if (config.NODE_ENV === 'production' && !config.SQS_QUEUE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SQS_QUEUE_URL'],
        message: 'SQS_QUEUE_URL is required when running the judge worker in production',
      });
    }
  });

export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type WorkerConfig = z.infer<typeof workerConfigSchema>;

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return serverConfigSchema.parse(env);
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return workerConfigSchema.parse(env);
}
