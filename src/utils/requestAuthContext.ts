export interface RequestAuthContext {
  email?: string;
  initials?: string;
  entraId?: string;
  clioId?: string;
  fullName?: string;
}

const STORAGE_KEY = '__helix_request_auth_context_v1';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function normalizeAuthContext(value: any): RequestAuthContext | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const email = String(value.Email || value.email || '').trim().toLowerCase();
  const initials = String(value.Initials || value.initials || '').trim().toUpperCase();
  const entraId = String(value.EntraID || value.entraId || value['Entra ID'] || '').trim();
  const clioId = String(value.ClioID || value.clioId || value['Clio ID'] || '').trim();
  const fullName = String(value.FullName || value.fullName || value['Full Name'] || '').trim();

  if (!email && !initials && !entraId && !clioId && !fullName) {
    return null;
  }

  return {
    ...(email ? { email } : {}),
    ...(initials ? { initials } : {}),
    ...(entraId ? { entraId } : {}),
    ...(clioId ? { clioId } : {}),
    ...(fullName ? { fullName } : {}),
  };
}

function toAbsoluteUrl(urlLike: string | URL): URL | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return new URL(String(urlLike), window.location.origin);
  } catch {
    return null;
  }
}

export function readRequestAuthContext(): RequestAuthContext | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return normalizeAuthContext(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeRequestAuthContext(value: any): RequestAuthContext | null {
  const storage = getStorage();
  const normalized = normalizeAuthContext(value);

  if (!storage) {
    return normalized;
  }

  try {
    if (!normalized) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return normalized;
  }
}

export function clearRequestAuthContext(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

export function shouldAugmentApiRequest(urlLike: string | URL): boolean {
  const resolved = toAbsoluteUrl(urlLike);
  if (!resolved || typeof window === 'undefined') {
    return false;
  }

  return resolved.origin === window.location.origin && resolved.pathname.startsWith('/api/');
}

export function buildRequestAuthHeaders(existing?: HeadersInit): Headers {
  const headers = new Headers(existing || {});
  const context = readRequestAuthContext();
  if (!context) {
    return headers;
  }

  if (context.email && !headers.has('x-user-email')) {
    headers.set('x-user-email', context.email);
  }
  if (context.initials && !headers.has('x-helix-initials')) {
    headers.set('x-helix-initials', context.initials);
  }
  if (context.entraId && !headers.has('x-helix-entra-id')) {
    headers.set('x-helix-entra-id', context.entraId);
  }

  return headers;
}

export function appendRequestAuthQueryParams(urlLike: string | URL): string {
  const resolved = toAbsoluteUrl(urlLike);
  const original = typeof urlLike === 'string' ? urlLike : String(urlLike);

  if (!resolved || !shouldAugmentApiRequest(resolved)) {
    return original;
  }

  const context = readRequestAuthContext();
  if (!context) {
    return original;
  }

  if (context.email && !resolved.searchParams.has('email')) {
    resolved.searchParams.set('email', context.email);
  }
  if (context.initials && !resolved.searchParams.has('initials')) {
    resolved.searchParams.set('initials', context.initials);
  }
  if (context.entraId && !resolved.searchParams.has('entraId')) {
    resolved.searchParams.set('entraId', context.entraId);
  }

  if (typeof urlLike === 'string' && !urlLike.startsWith('http://') && !urlLike.startsWith('https://')) {
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  }

  return resolved.toString();
}