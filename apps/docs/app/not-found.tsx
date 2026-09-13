import Link from 'next/link';

export default function NotFound() {
	return (
		<main className="m-auto p-8 text-center">
			<h1 className="text-2xl font-semibold">Page not found</h1>
			<Link className="mt-4 inline-block underline" href="/docs">
				Go to the documentation
			</Link>
		</main>
	);
}
