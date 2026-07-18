// `wrangler types` (env.d.ts, gitignored) only types vars/secrets it can see
// in a local .env/.dev.vars file at generation time — CI has neither, since
// BRAVE_API_KEY is a secret. Declare it here instead so the Env type doesn't
// depend on what happens to exist on the machine running `pnpm run types`.
interface Env {
  BRAVE_API_KEY: string;
}
