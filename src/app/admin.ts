import { UserData } from './functionality/types';

// Centralized list of admin users by initials
export const ADMIN_USERS = ['LZ', 'AC', 'KW', 'JW', 'LA'] as const;

// Users who can see CCL features (early access while feature is in beta)
export const CCL_USERS = ['LZ', 'AC'] as const;

export const PRIVATE_HUB_CONTROL_USERS = ['LZ', 'AC'] as const;

export function isCclUser(initials?: string): boolean {
    if (!initials) return false;
    return CCL_USERS.includes(initials.toUpperCase().trim() as any);
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
        first === 'alex' ||
        nickname === 'luke' ||
        nickname === 'alex' ||
        email === 'lz@helix-law.com' ||
        email === 'ac@helix-law.com'
    );
}


// Helper to determine if a user has admin privileges
export function isAdminUser(user?: UserData | null): boolean {
    if (!user) return false;
    const initials = user.Initials?.toUpperCase().trim();
    const first = user.First?.toLowerCase().trim();
    const nickname = user.Nickname?.toLowerCase().trim();
    const adminNames = ['lukasz', 'luke', 'alex', 'kanchel', 'jonathan', 'laura'];
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
 * - devGroup: LZ + AC — feature preview, supervision access
 * - admin: LZ, AC, KW, JW, LA — trusted internal feature tier
 * - user: everyone else — role/AoW personalised content
 */
export type UserTier = 'dev' | 'devGroup' | 'admin' | 'user';

export function getUserTier(user?: UserData | null): UserTier {
    if (!user) return 'user';
    if (isDevOwner(user)) return 'dev';
    const initials = user.Initials?.toUpperCase().trim();
    const first = user.First?.toLowerCase().trim();
    if (
        initials === 'AC' ||
        first === 'alex' ||
        user.Nickname?.toLowerCase().trim() === 'alex' ||
        user.Email?.toLowerCase().trim() === 'ac@helix-law.com'
    ) return 'devGroup';
    if (isAdminUser(user)) return 'admin';
    return 'user';
}

/** Quick check: is user in devGroup or higher (dev)? */
export function isDevGroupOrHigher(user?: UserData | null): boolean {
    const tier = getUserTier(user);
    return tier === 'dev' || tier === 'devGroup';
}

// Helper to determine if a user can access the Instructions tab
export function hasInstructionsAccess(user?: UserData | null): boolean {
    // Instructions tab is now open to all users
    return !!user;
}

// Helper to determine if a user is a power user (admin or has 'operations'/'tech' in AOW)
export function isPowerUser(user?: UserData | null): boolean {
    if (!user) return false;
    if (isAdminUser(user)) return true;
    const areas = (user.AOW || '').toLowerCase();
    return areas.includes('operations') || areas.includes('tech');
}

