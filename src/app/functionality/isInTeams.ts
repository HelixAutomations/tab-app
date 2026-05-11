const TEAMS_HOST_SUFFIXES = [
  'teams.microsoft.com',
  'teams.live.com',
  'teams.office.com',
  'skype.com',
];

function hostLooksLikeTeams(hostname: string): boolean {
  const normalized = String(hostname || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return TEAMS_HOST_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
  );
}

function getTeamsBrandHints(): string[] {
  const brands = (typeof navigator !== 'undefined' && (navigator as Navigator & {
    userAgentData?: { brands?: Array<{ brand?: string }> };
  }).userAgentData?.brands)
    || [];

  return brands
    .map((entry) => String(entry?.brand || '').toLowerCase())
    .filter(Boolean);
}

function hasTeamsUserAgent(): boolean {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
  const uaLower = ua.toLowerCase();
  const brandHints = getTeamsBrandHints();

  return (
    ua.includes('Teams') ||
    ua.includes('MicrosoftTeams') ||
    ua.includes('TeamsMobile') ||
    uaLower.includes('teamsandroid') ||
    uaLower.includes('teamsios') ||
    uaLower.includes('edgteams') ||
    (uaLower.includes('electron') && uaLower.includes('teams')) ||
    brandHints.some((brand) => brand.includes('teams'))
  );
}

function isEmbeddedContext(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function referrerLooksLikeTeams(): boolean {
  if (typeof document === 'undefined' || !document.referrer) {
    return false;
  }

  try {
    return hostLooksLikeTeams(new URL(document.referrer).hostname);
  } catch {
    return false;
  }
}

function ancestorOriginLooksLikeTeams(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const ancestorOrigins = (window.location as Location & {
    ancestorOrigins?: ArrayLike<string>;
  }).ancestorOrigins;

  if (!ancestorOrigins || ancestorOrigins.length === 0) {
    return false;
  }

  return Array.from(ancestorOrigins).some((origin) => {
    try {
      return hostLooksLikeTeams(new URL(origin).hostname);
    } catch {
      return false;
    }
  });
}

function hasTeamsEmbedSignals(): boolean {
  // Avoid false positives from generic iframes such as the VS Code simple
  // browser. Only trust frame-based detection when the parent/referrer also
  // looks like Teams.
  return isEmbeddedContext() && (referrerLooksLikeTeams() || ancestorOriginLooksLikeTeams());
}

export function isInTeams(): boolean {
  try {
    if (hasTeamsUserAgent() || hasTeamsEmbedSignals()) {
      return true;
    }

    // Query param escape hatch for diagnostics/testing (e.g. ?inTeams=1)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('inTeams') === '1') {
        return true;
      }
    }

    return false;
  } catch {
    // If environment detection fails, assume non-Teams to prevent unnecessary SDK calls.
    return false;
  }
}
