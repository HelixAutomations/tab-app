export function isInTeams(): boolean {
  // More robust detection that avoids false positives when running inside
  // generic iframes such as the VS Code simple browser.
  try {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
    const uaLower = ua.toLowerCase();

    const hasTeamsUserAgent =
      ua.includes('Teams') ||
      ua.includes('MicrosoftTeams') ||
      ua.includes('TeamsMobile') ||
      uaLower.includes('teamsandroid') ||
      uaLower.includes('teamsios') ||
      uaLower.includes('edgteams') ||
      (uaLower.includes('electron') && uaLower.includes('teams'));

    if (hasTeamsUserAgent) {
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
    // If user agent parsing fails, assume non-Teams to prevent unnecessary SDK calls.
    return false;
  }
}
