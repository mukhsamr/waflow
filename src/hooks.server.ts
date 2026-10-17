import { env } from 'cloudflare:workers';
import type { Handle } from '@sveltejs/kit/hooks';
import gateway from '#lib/server/gateway/index.js';

export const handle: Handle = ({ event, resolve }) => {
  if (event.url.pathname === '/api' || event.url.pathname.startsWith('/api/')) {
    const url = new URL(event.request.url);
    url.pathname = url.pathname.slice(4) || '/';
    return gateway.fetch(new Request(url, event.request), env);
  }
  return resolve(event);
};
