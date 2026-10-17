import { renameSync, writeFileSync } from 'node:fs';

// The official adapter owns fetch; add the same Worker's DO and background handlers after it builds.
renameSync('.svelte-kit/cloudflare/_worker.js', '.svelte-kit/cloudflare-tmp/renderer.js');
writeFileSync('.svelte-kit/cloudflare/_worker.js', [
  "import renderer from '../cloudflare-tmp/renderer.js';",
  "import { queue, scheduled } from '../../src/worker.ts';",
  "export { WaSession } from '../../src/worker.ts';",
  'export default { ...renderer, queue, scheduled };',
  ''
].join('\n'));
