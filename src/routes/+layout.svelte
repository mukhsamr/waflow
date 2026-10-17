<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { Toaster } from '@nqmcreative/ui/matte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
<Toaster position="bottom-right" />
