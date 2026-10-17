import { redirect } from '@sveltejs/kit';
import { currentUser } from '#lib/server/api.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies }) => {
	const user = await currentUser(cookies.get('wg_session'));
	if (!user) redirect(303, '/login');
	return { user };
};
