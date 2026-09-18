import { z } from 'zod';

const environmentSchema = z.enum(['development', 'test', 'production']);

const serverConfigSchema = z.object({
  NODE_ENV: environmentSchema.default('development'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return serverConfigSchema.parse(env);
}
