import { z } from 'zod';

const serverEnvironmentSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
  POSTGRES_URL: z.string().min(1),
  INITIAL_SUPERADMIN_EMAIL: z.email(),
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().positive().max(24).default(8),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

let cachedEnvironment: ServerEnvironment | undefined;

export function getServerEnvironment(): ServerEnvironment {
  if (!cachedEnvironment) {
    cachedEnvironment = serverEnvironmentSchema.parse(process.env);
  }
  return cachedEnvironment;
}
