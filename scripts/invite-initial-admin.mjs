import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolveRedirectArgument } from './cli-arguments.mjs';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

const redirectTo = resolveRedirectArgument(process.argv.slice(2));
if (!redirectTo) {
  throw new Error(
    'Pass the deployed setup URL, for example: pnpm admin:invite-initial -- https://example.vercel.app/?setup=1',
  );
}

const redirectUrl = new URL(redirectTo);
if (!['http:', 'https:'].includes(redirectUrl.protocol)) {
  throw new Error('The redirect URL must use http or https.');
}

const { SUPABASE_URL, SUPABASE_SECRET_KEY, INITIAL_SUPERADMIN_EMAIL } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !INITIAL_SUPERADMIN_EMAIL) {
  throw new Error(
    'SUPABASE_URL, SUPABASE_SECRET_KEY, and INITIAL_SUPERADMIN_EMAIL are required in .env.local.',
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { error } = await supabase.auth.admin.inviteUserByEmail(INITIAL_SUPERADMIN_EMAIL, {
  redirectTo: redirectUrl.toString(),
});

if (error) {
  throw error;
}

console.log(`Invitation sent to ${INITIAL_SUPERADMIN_EMAIL}.`);
