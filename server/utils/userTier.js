const ADMIN_INITIALS = new Set(['LZ', 'AC', 'KW', 'JW', 'LA', 'EA']);
const ADMIN_EMAILS = new Set([
  'lz@helix-law.com',
  'ac@helix-law.com',
  'kw@helix-law.com',
  'jw@helix-law.com',
  'la@helix-law.com',
  'ea@helix-law.com',
]);
const ADMIN_NAMES = new Set(['lukasz', 'luke', 'alex', 'kanchel', 'jonathan', 'laura', 'emma']);

// Access resolver — Phase Access.1. Loaded lazily so unit tests that don't
// touch tier resolution don't require the SQL stub. The resolver has its own
// emergency fallback for when SQL is unreachable, so requiring it here is
// always safe.
let _accessModule = null;
function getAccess() {
  if (_accessModule) return _accessModule;
  try {
    _accessModule = require('./access');
  } catch (_err) {
    _accessModule = null;
  }
  return _accessModule;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function lower(value) {
  return clean(value).toLowerCase();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function firstToken(value) {
  return lower(value).split(/\s+/).filter(Boolean)[0] || '';
}

function allowDevFallback() {
  return process.env.NODE_ENV !== 'production';
}

function readDevFallback(req, key) {
  if (!allowDevFallback()) return '';
  return clean(req.query?.[key] || req.body?.[key]);
}

function getRequestUser(req) {
  const user = req.user || {};
  const initials = upper(
    user.initials
    || user.Initials
    || readDevFallback(req, 'initials')
    || req.headers?.['x-helix-initials'],
  );
  const email = lower(
    user.email
    || user.Email
    || readDevFallback(req, 'email')
    || req.headers?.['x-user-email'],
  );
  const fullName = clean(user.fullName || user.FullName || user['Full Name'] || readDevFallback(req, 'name'));
  const first = lower(user.first || user.First || firstToken(fullName));
  const nickname = lower(user.nickname || user.Nickname);
  const entraId = clean(user.entraId || user.EntraId || user['Entra ID'] || req.headers?.['x-helix-entra-id']);

  return { initials, email, fullName, first, nickname, entraId };
}

function isAnonymousLocalDev(req) {
  if (!allowDevFallback()) return false;
  const user = getRequestUser(req);
  return !user.initials && !user.email && !user.entraId;
}

function isDevOwner(req) {
  const user = getRequestUser(req);
  return user.initials === 'LZ' || user.email === 'lz@helix-law.com';
}

function isDevGroup(req) {
  // Post-Access.1: the devGroup bucket is reserved for future preview pilots
  // and is currently empty. AC was previously here but is now plain admin.
  // Kept for back-compat with code paths that still call isDevGroup directly.
  return isDevOwner(req);
}

function isDevGroupOrHigher(req) {
  return isAnonymousLocalDev(req) || isDevGroup(req);
}

function isAdmin(req) {
  const user = getRequestUser(req);
  return isAnonymousLocalDev(req)
    || ADMIN_INITIALS.has(user.initials)
    || ADMIN_EMAILS.has(user.email)
    || ADMIN_NAMES.has(user.first)
    || ADMIN_NAMES.has(user.nickname);
}

function getUserTier(req) {
  // Phase Access.1: prefer the data-driven resolver. If the cache has been
  // warmed (boot warmup or a prior request) we get the live answer here.
  // Otherwise we fall back to the constant-based heuristic below — which
  // matches the table's seeded defaults, so behaviour is the same on first
  // request after boot.
  const access = getAccess();
  if (access && typeof access.resolveTierSync === 'function') {
    const user = getRequestUser(req);
    const resolved = access.resolveTierSync(user);
    if (resolved === 'dev' || resolved === 'admin') {
      return resolved;
    }
    // resolveTierSync returns 'user' both for true users AND when the cache
    // is empty, so fall through to constants in that case rather than
    // demoting an admin during a cold-cache request.
  }

  if (isDevOwner(req)) return 'dev';
  if (isDevGroup(req)) return 'devGroup';
  if (isAdmin(req)) return 'admin';
  return 'user';
}

module.exports = {
  getRequestUser,
  getUserTier,
  isAdmin,
  isDevGroup,
  isDevGroupOrHigher,
  isDevOwner,
};