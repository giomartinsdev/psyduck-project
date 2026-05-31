const GATEWAY_URL =
  process.env['GATEWAY_URL'] ??
  process.env['NEXT_PUBLIC_GATEWAY_URL'] ??
  'http://localhost:4000/graphql';

export async function gqlServerFetch<T>(
  query: string,
  variables?: Record<string, unknown>,
  revalidate = 60,
): Promise<T> {
  const res = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    next: { revalidate },
  });
  const json = (await res.json()) as { data: T };
  return json.data;
}
