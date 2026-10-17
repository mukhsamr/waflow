import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

type Run = (args: string[], input?: string) => Promise<string>;

export async function deployApi(run: Run) {
  const secrets: unknown = JSON.parse(await run(['secret', 'list', '--format', 'json']));
  if (!Array.isArray(secrets) || !secrets.every(secret => typeof secret?.name === 'string')) {
    throw new Error('Invalid Worker secret list');
  }
  if (!secrets.some(secret => secret.name === 'SESSION_SECRET')) {
    await run(['secret', 'put', 'SESSION_SECRET'], randomBytes(32).toString('hex'));
  }
  await run(['d1', 'migrations', 'apply', 'DB', '--remote']);
  await run(['deploy']);
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, '..');
  await deployApi(async (args, input) => {
    const child = Bun.spawn([
      process.execPath, 'run', '--cwd', resolve(root, 'apps/api'), 'wrangler',
      ...args, '--config', resolve(root, 'wrangler.jsonc')
    ], { stdin: input === undefined ? 'ignore' : new Blob([input]), stdout: 'pipe', stderr: 'inherit' });
    const output = await new Response(child.stdout).text();
    if (await child.exited !== 0) throw new Error(`Wrangler ${args[0]} failed`);
    if (args[1] !== 'list') process.stdout.write(output);
    return output;
  });
}
