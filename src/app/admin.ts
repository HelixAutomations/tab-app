import { UserData } from './functionality/types';

// Centralized list of admin users by initials
export const ADMIN_USERS = ['LZ', 'AC', 'KW', 'JW', 'LA', 'EA', 'WH'] as const;

// Admins who can access the Reports tab (LA is admin but no reports access)
export const REPORTS_USERS = ['LZ', 'AC', 'KW', 'JW', 'EA', 'WH'] as const;
export const EXTRA_TOP_NAV_USERS = ['LZ', 'AC', 'EA'] as const;
const REPORTS_USER_EMAILS = ['lz@helix-law.com', 'ac@helix-law.com', 'kw@helix-law.com', 'jw@helix-law.com', 'ea@helix-law.com', 'wh@helix-law.com'] as const;

// CCL operations are clipped under the ZDR/LPP containment position. They are
// available on localhost only so the built workflow remains testable without
// surfacing or firing in staging/production.
export const CCL_USERS = ['localhost'] as const;

// Dev-preview lock — features in active development visible only to LZ.
// AC was previously included; promoted features should now use isAdminUser
// (broader admin tier) rather than this dev-preview gate.
export const PRIVATE_HUB_CONTROL_USERS = ['LZ'] as const;
export const SESSION_MODE_CONTROL_USERS = ['LZ', 'AC'] as const;
export const DEMO_MODE_CONTROL_USERS = ['LZ', 'AC', 'EA'] as const;
export const ACTIVITY_TAB_USERS = ['LZ', 'AC', 'EA'] as const;
export const TASKS_TAB_USERS = ['LZ'] as const;

export function isCclOperationsAvailable(options?: { viewAsProd?: boolean }): boolean {
    if (options?.viewAsProd) return false;
    if (typeof window === 'undefined') return false;
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

export function isCclUser(_initials?: string, options?: { viewAsProd?: boolean }): boolean {
    return isCclOperationsAvailable(options);
}

export function canSeePrivateHubControls(user?: UserData | null): boolean {
    if (!user) return false;
    const initials = user.Initials?.toUpperCase().trim();
    const first = user.First?.toLowerCase().trim();
    const nickname = user.Nickname?.toLowerCase().trim();
    const email = user.Email?.toLowerCase().trim();
    return !!(
        (initials && PRIVATE_HUB_CONTROL_USERS.includes(initials as any)) ||
        first === 'luke' ||
        nickname === 'luke' ||
        email === 'lz@helix-law.com'
    );
}

export function canUseSessionModeControls(user?: UserData | null): boolean {
    if (!user) return false;
    const initials = user.Initials?.toUpperCase().trim();
    const first = user.First?.toLowerCase().trim();
    const nickname = user.Nickname?.toLowerCase().trim();
    const email = user.Email?.toLowerCase().trim();
    const allowedInitials = SESSION_MODE_CONTROL_USERS as readonly string[];
    return !!(
        (initials && allowedInitials.includes(initials)) ||
        first === 'luke' ||
        nickname === 'luke' ||
        email === 'lz@helix-law.com' ||
        first === 'alex' ||
        nickname === 'alex' ||
        email === 'ac@helix-law.com'
    );
}

export function canUseDemoModeControls(user?: UserData | null): boolean {
    if (!user) return false;
    const initials = user.Initials?.toUpperCase().trim();
    const first = user.First?.toLowerCase().trim();
    const nickname = user.Nickname?.toLowerCase().trim();
    const email = user.Email?.toLowerCase().trim();
    const allowedInitials = DEMO_MODE_CONTROL_USERS as readonly string[];
    return !!(
        (initials && allowedInitials.includes(initials)) ||
        first === 'luke' ||
        nickname === 'luke' ||
        email === 'lz@helix-law.com' ||
        first === 'alex' ||
        nickname === 'alex' ||
        email === 'ac@helix-law.com' ||
        first === 'emma' ||
        nickname === 'emma' ||
        email === 'ea@helix-law.com'
    );
}


// Helper to determine if a user has admin privileges
export function isAdminUser(user?: UserData | null): boolean {
    if (!user) return false;
    const initials = user.Initials?.toUpperCase().trim();
    const first = user.First?.toLowerCase().trim();
    const nickname = user.Nickname?.toLowerCase().trim();
    const adminNames = ['lukasz', 'luke', 'alex', 'kanchel', 'jonathan', 'laura', 'emma', 'wolfgang'];
    return !!(
        (initials && ADMIN_USERS.includes(initials as any)) ||
        (first && adminNames.includes(first)) ||
        (nickname && adminNames.includes(nickname))
    );
}

/**
 * Dev owner — the single user who sees all data by default (team-wide
 * enquiries, matters, time metrics). This is NOT the same as admin.
 * Admin = feature-access tier (many people).
 * Dev owner = data-scope override (Luke/LZ only).
 */
export function isDevOwner(user?: UserData | null): boolean {
    if (!user) {
        if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_LOG_DEV_OWNER_CHECKS === 'true') {
            console.warn('[isDevOwner] called with null/undefined user');
        }
        return false;
    }
    const initials = user.Initials?.toUpperCase().trim();
    const email = user.Email?.toLowerCase().trim();
    const result = initials === 'LZ' || email === 'lz@helix-law.com';
    if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_LOG_DEV_OWNER_CHECKS === 'true') {
        console.info(`[isDevOwner] initials=${initials} email=${email} → ${result}`);
    }
    return result;
}

/**
 * User access tier — single source of truth for progressive disclosure.
 * Agents can reference by shorthand: 'dev', 'devGroup', 'admin', 'user'.
 *
 * - dev: LZ only — god mode, data-scope override, all features
 * - devGroup: LZ only (currently identical to dev — AC was previously here
 *   but is now plain admin so AC sees the app like other admins)
 * - admin: LZ, AC, KW, JW, LA — trusted internal feature tier
 * - user: everyone else — role/AoW personalised content
 */
export type UserTier = 'dev' | 'devGroup' | 'admin' | 'user';

export function getUserTier(user?: UserData | null): UserTier {
    if (!user) return 'user';
    if (isDevOwner(user)) return 'dev';
    if (isAdminUser(user)) return 'admin';
    return 'user';
}

/** Quick check: is user in devGroup or higher (dev)? */
export function isDevGroupOrHigher(user?: UserData | null): boolean {
    const tier = getUserTier(user);
    return tier === 'dev' || tier === 'devGroup';
}

export function canSeeActivityTab(user?: UserData | null, isLocalDev = false): boolean {
    if (isLocalDev) return true;
    if (!user) return false;
    const initials = user.Initials?.toUpperCase().trim();
    const first = user.First?.toLowerCase().trim();
    const nickname = user.Nickname?.toLowerCase().trim();
    const email = user.Email?.toLowerCase().trim();
    return !!(
        (initials && ACTIVITY_TAB_USERS.includes(initials as any)) ||
        first === 'luke' ||
        nickname === 'luke' ||
        email === 'lz@helix-law.com' ||
        first === 'alex' ||
        nickname === 'alex' ||
        email === 'ac@helix-law.com' ||
        first === 'emma' ||
        nickname === 'emma' ||
        email === 'ea@helix-law.com'
    );
}

export function canSeeTasksTab(user?: UserData | null): boolean {
    if (!user) return false;
    const initials = user.Initials?.toUpperCase().trim();
    const first = user.First?.toLowerCase().trim();
    const nickname = user.Nickname?.toLowerCase().trim();
    const email = user.Email?.toLowerCase().trim();
    const allowedInitials = TASKS_TAB_USERS as readonly string[];
    return !!(
        (initials && allowedInitials.includes(initials)) ||
        first === 'luke' ||
        nickname === 'luke' ||
        email === 'lz@helix-law.com'
    );
}

// Helper to determine if a user can access the Instructions tab
export function hasInstructionsAccess(user?: UserData | null): boolean {
    // Instructions tab is now open to all users
    return !!user;
}

/**
 * Reports access — admins who can see the Reports tab.
 * LA is admin but explicitly excluded from reports.
 */
export function canAccessReports(user?: UserData | null): boolean {
    if (!user) return false;
    const initials = user.Initials?.toUpperCase().trim();
    const first = user.First?.toLowerCase().trim();
    const nickname = user.Nickname?.toLowerCase().trim();
    const email = user.Email?.toLowerCase().trim();
    const reportsNames = ['lukasz', 'luke', 'alex', 'kanchel', 'jonathan', 'emma', 'wolfgang'];
    return !!(
        (initials && REPORTS_USERS.includes(initials as any)) ||
        (email && REPORTS_USER_EMAILS.includes(email as any)) ||
        (first && reportsNames.includes(first)) ||
        (nickname && reportsNames.includes(nickname))
    );
}

/**
 * Home-only data-scope exception.
 * Grants firm-wide Home datasets to LZ, KW, and EA without widening the
 * broader non-Home data scope beyond `isDevOwner()`.
 *
 * Other admins (AC / JW / LA) can opt in per-browser via the Home firm-wide
 * toggle, which sets `helix.homeFirmWideAdmin` in localStorage. This keeps the
 * default cost profile unchanged (no extra firm-wide aggregations on every
 * load) while still letting any admin flip the master switch when they need
 * the wider view. The toggle reloads the page so all Home fetch effects re-run
 * against the new gate.
 */
export const FIRM_WIDE_HOME_USERS = ['LZ', 'KW', 'EA'] as const;
export const HOME_FIRM_WIDE_ADMIN_OPT_IN_KEY = 'helix.homeFirmWideAdmin';

function readHomeFirmWideAdminOptIn(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(HOME_FIRM_WIDE_ADMIN_OPT_IN_KEY) === '1';
    } catch {
        return false;
    }
}

export function isHomeFirmWideBuiltIn(user?: UserData | null): boolean {
    if (!user) return false;
    const initials = user.Initials?.toUpperCase().trim();
    const email = user.Email?.toLowerCase().trim();
    return !!(
        (initials && FIRM_WIDE_HOME_USERS.includes(initials as any)) ||
        email === 'lz@helix-law.com' ||
        email === 'kw@helix-law.com' ||
        email === 'ea@helix-law.com'
    );
}

export function canSeeFirmWideHomeData(user?: UserData | null): boolean {
    if (!user) return false;
    if (isHomeFirmWideBuiltIn(user)) return true;
    if (isAdminUser(user) && readHomeFirmWideAdminOptIn()) return true;
    return false;
}

// Operations user — admin or has 'operations'/'tech' in AOW
export function isOperationsUser(user?: UserData | null): boolean {
    if (!user) return false;
    if (isAdminUser(user)) return true;
    const areas = (user.AOW || '').toLowerCase();
    return areas.includes('operations') || areas.includes('tech');
}

