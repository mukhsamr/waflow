// See https://svelte.dev/docs/kit/types#app.d.ts
import type { MessagingEnv } from './lib/server/gateway/messaging';
// for information about these interfaces
declare global {
	namespace Cloudflare {
		interface Env extends MessagingEnv {
			ASSETS: Fetcher;
		}
	}
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
