/**
 * Safely normalizes PostgreSQL connection strings whose password may contain
 * unencoded reserved characters such as `@`, `#`, or `?`.
 * Never logs or exposes credentials.
 */
export function normalizePostgresUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  const schemeEnd = trimmed.indexOf('://');
  if (schemeEnd === -1) return trimmed;

  const scheme = trimmed.slice(0, schemeEnd);
  const rest = trimmed.slice(schemeEnd + 3);

  const match = rest.match(/^([\s\S]*)@([a-zA-Z0-9._-]+|\[[0-9a-fA-F:]+\])(:\d+)?(\/.*|\?.*)?$/);
  if (!match) return trimmed;

  const userInfo = match[1];
  const hostPort = `${match[2]}${match[3] || ''}`;
  let pathAndQuery = match[4] || '';

  // Strip non-PostgreSQL pooler flags (e.g. Prisma's ?pgbouncer=true) that postgres.js forwards as startup params
  if (pathAndQuery.includes('?')) {
    const qIdx = pathAndQuery.indexOf('?');
    const dbPath = pathAndQuery.slice(0, qIdx);
    const params = new URLSearchParams(pathAndQuery.slice(qIdx + 1));
    params.delete('pgbouncer');
    params.delete('connection_limit');
    const cleanQuery = params.toString();
    pathAndQuery = cleanQuery ? `${dbPath}?${cleanQuery}` : dbPath;
  }

  const colonIdx = userInfo.indexOf(':');
  if (colonIdx === -1) return `${scheme}://${encodeURIComponent(userInfo)}@${hostPort}${pathAndQuery}`;

  const username = userInfo.slice(0, colonIdx);
  const rawPassword = userInfo.slice(colonIdx + 1);

  let decodedUsername: string;
  try {
    decodedUsername = decodeURIComponent(username);
  } catch {
    decodedUsername = username;
  }

  let decodedPassword: string;
  try {
    decodedPassword = decodeURIComponent(rawPassword);
  } catch {
    decodedPassword = rawPassword;
  }

  return `${scheme}://${encodeURIComponent(decodedUsername)}:${encodeURIComponent(decodedPassword)}@${hostPort}${pathAndQuery}`;
}

export function isLocalDatabaseHost(connectionString: string): boolean {
  try {
    const normalized = normalizePostgresUrl(connectionString);
    const parsed = new URL(normalized);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1'
    );
  } catch {
    return false;
  }
}
