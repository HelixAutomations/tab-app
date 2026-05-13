import React, { useEffect, useMemo, useState } from 'react';
import { getApiBase } from '../../utils/getApiUrl';

interface EmailSignatureProps {
  bodyHtml: string;
  userData: any;
  experimentalLayout?: boolean; // Deprecated: kept for compatibility but ignored.
  isDarkMode?: boolean;
  /**
   * Left/right padding inside the white "paper" surface that wraps the canonical
   * signature HTML. Callers should pass the same horizontal padding their body
   * editor uses so the first line of the signature visually aligns with the
   * first character of the body text above it.
   */
  paperPaddingX?: number;
}

// Cache resolved signatures across mounts so the editor peek and the inline
// preview don't both fetch the same HTML on every render.
const sigCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function deriveInitialsAndEmail(userData: any): { initials: string; email: string } {
  const row = userData?.[0] || {};
  const explicitInitials = String(row.Initials || row.initials || '').trim().toUpperCase();
  const fullName: string = row.FullName || row['Full Name'] || '';
  const fallbackInitials = fullName
    ? fullName.split(' ').filter(Boolean).map((n: string) => n[0]).join('').toUpperCase()
    : '';
  const initials = explicitInitials || fallbackInitials;
  const email = String(row.Email || row.email || (initials ? `${initials.toLowerCase()}@helix-law.com` : '')).trim();
  return { initials, email };
}

async function fetchSignature(initials: string, email: string): Promise<string | null> {
  const key = `${initials}|${email}`.toLowerCase();
  if (sigCache.has(key)) return sigCache.get(key) || null;
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const base = getApiBase();
      const url = `${base}/api/email-signature?initials=${encodeURIComponent(initials)}&email=${encodeURIComponent(email)}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return null;
      const html = await res.text();
      if (!html || !html.trim()) return null;
      sigCache.set(key, html);
      return html;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

// Strip the canonical signature's inline white `background-color: rgb(255,255,255)`
// (and the white `#ffffff` variant) from any wrapper tables/cells so the dark
// preview shows the signature contents directly against the dark canvas
// instead of inside a full-width white slab. Only the preview render path is
// affected; the send-path HTML (loadPersonalSignatureHtml) is never mutated.
function stripWhiteBackgrounds(html: string): string {
  return html
    .replace(/background-color\s*:\s*rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)\s*;?/gi, '')
    .replace(/background-color\s*:\s*#fff(?:fff)?\s*;?/gi, '')
    .replace(/background\s*:\s*#fff(?:fff)?\s*;?/gi, '');
}

// Bump the signature's body-text font-size (10pt in the canonical HTML) up
// to 14px so it matches the pitch body editor above. Smaller print used by
// the firm quotes, Legal500 caption and the disclaimer (9pt / 8.5pt / 8pt)
// is intentionally left at its original size so it still reads as small print.
function normalisePreviewFontSize(html: string): string {
  return html.replace(/font-size\s*:\s*10pt/gi, 'font-size:14px');
}

// Dark-mode preview only: recolour the small-print blocks. The canonical HTML
// uses rgb(176,0,0) for the cyber-crime disclaimer and rgb(0,0,0) for the
// italic registration block; on a navy canvas the dark red reads as mud and
// black text is near-invisible. Remap to the brand CTA red and a high-contrast
// off-white so both remain readable. Send path is untouched.
function recolourDarkSmallPrint(html: string): string {
  return html
    .replace(/color\s*:\s*rgb\(\s*176\s*,\s*0\s*,\s*0\s*\)/gi, 'color:#D65541')
    .replace(/color\s*:\s*rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/gi, 'color:#f3f4f6');
}

// Preview only: shrink the legal/cyber-crime/registration small print one notch
// further so it reads as background fine print rather than competing with the
// body. Canonical sizes are 9pt (disclaimer heading), 8.5pt (cyber crime
// paragraph), and 8pt (registration italics). Send path untouched.
function shrinkPreviewSmallPrint(html: string): string {
  return html
    .replace(/font-size\s*:\s*9pt/gi, 'font-size:8px')
    .replace(/font-size\s*:\s*8\.5pt/gi, 'font-size:8px')
    .replace(/font-size\s*:\s*8pt/gi, 'font-size:7.5px');
}

const EmailSignature: React.FC<EmailSignatureProps> = ({ bodyHtml, userData, isDarkMode, paperPaddingX = 12 }) => {
  const { initials, email } = useMemo(() => deriveInitialsAndEmail(userData), [userData]);
  const cacheKey = `${initials}|${email}`.toLowerCase();
  const [sigHtml, setSigHtml] = useState<string | null>(() => sigCache.get(cacheKey) || null);

  useEffect(() => {
    let cancelled = false;
    if (!initials && !email) return;
    if (sigCache.has(cacheKey)) {
      setSigHtml(sigCache.get(cacheKey) || null);
      return;
    }
    fetchSignature(initials, email).then((html) => {
      if (!cancelled) setSigHtml(html);
    });
    return () => { cancelled = true; };
  }, [cacheKey, initials, email]);

  const body = String(bodyHtml || '');
  // Light mode: render the signature on a white paper surface so the hardcoded
  // black text (the signature HTML targets recipient inboxes) stays legible and
  // aligns with the body editor's white surface above it.
  // Dark mode: skip the outer white wrapper. The signature's internal table
  // already paints its own white cells where the text + brand assets live, so
  // it reads as a contained card on the dark canvas instead of a jarring white
  // slab spanning the whole strip.
  if (sigHtml) {
    let previewSig = normalisePreviewFontSize(sigHtml);
    previewSig = shrinkPreviewSmallPrint(previewSig);
    if (isDarkMode) {
      previewSig = stripWhiteBackgrounds(previewSig);
      previewSig = recolourDarkSmallPrint(previewSig);
    }
    const combined = `${body}${body ? '<br />' : ''}${previewSig}`;
    return (
      <div
        // `signature-preview-card` exempts this subtree from the parent
        // `.email-preview.dark-mode div:not([class*="signature"])` color
        // override so the canonical inline colours (red disclaimer, blue
        // links, brand navy contact lines) survive in dark mode.
        className="signature-preview-card"
        style={{
          padding: 0,
          background: 'transparent',
        }}
      >
        <div
          dangerouslySetInnerHTML={{ __html: body }}
        />
        {body && <br />}
        <div
          // Dimmed signature subtree: a low opacity wrapper makes the
          // signature read as appended chrome rather than competing with the
          // body. Send-path output is unchanged.
          style={{ opacity: 0.6 }}
          dangerouslySetInnerHTML={{ __html: previewSig }}
        />
      </div>
    );
  }
  return <div dangerouslySetInnerHTML={{ __html: body }} />;
};

export default EmailSignature;
