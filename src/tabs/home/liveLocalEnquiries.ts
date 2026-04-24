/**
 * Local-dev fallback for enquiries data.
 *
 * Reads `src/localData/localEnquiries.json`, stamps today's date on the first
 * record, and (if an email is provided) rewrites `Point_of_Contact` on every
 * record to that email. Used when:
 *   1) The app is running in local mode (not in Teams) and wants sample data.
 *   2) The live enquiries API errors and we need a graceful fallback.
 *
 * Extracted out of `src/tabs/home/Home.tsx` on 2026-04-21 so that Home.tsx
 * exports only a React component (+ type interfaces). That restores React
 * Fast Refresh state-preservation for Home edits — previously a non-component
 * export here forced a full page reload on every save.
 *
 * Prod impact: positive. Index.tsx's error-path fallback previously
 * lazy-loaded the entire 7,000-line Home.tsx chunk just to call this helper.
 * Now the fallback pulls a ~50-line chunk instead.
 */
export function getLiveLocalEnquiries(currentUserEmail?: string) {
  try {
    // Only do this in local mode
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const localEnquiries = require('../../localData/localEnquiries.json');
    if (Array.isArray(localEnquiries) && localEnquiries.length > 0) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;
      localEnquiries[0].Touchpoint_Date = todayStr;
      localEnquiries[0].Date_Created = todayStr;
      // Set Point_of_Contact for all records to current user email in local mode
      if (currentUserEmail) {
        localEnquiries.forEach((enq: any) => {
          enq.Point_of_Contact = currentUserEmail;
        });
      }
    }
    return localEnquiries;
  } catch (e) {
    // ignore if not found
    return [];
  }
}
