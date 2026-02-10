import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Icon } from '@fluentui/react';
import { colours } from '../../../app/styles/colours';
import type { NormalizedMatter } from '../../../app/functionality/types';

interface PreviewSection {
  id: string;
  number: string;
  title: string;
  isSubsection: boolean;
  elements: React.ReactNode[];
}

export interface PreviewStepProps {
  content: string;
  matter: NormalizedMatter;
  fields: Record<string, string>;
  updateField?: (key: string, value: string) => void;
  isDarkMode: boolean;
  onBack: () => void;
  onClose?: () => void;
}

const PreviewStep: React.FC<PreviewStepProps> = ({ content, matter, fields, updateField, isDarkMode, onBack, onClose }) => {
  const text = isDarkMode ? '#f1f5f9' : '#1e293b';
  const textMuted = isDarkMode ? '#94a3b8' : '#64748b';
  const cardBorder = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(148, 163, 184, 0.15)';
  const accentBlue = colours.highlight;

  // Count only placeholders that have corresponding questionnaire fields (user-fillable)
  const allPlaceholders = content.match(/\{\{([^}]+)\}\}/g) || [];
  const fieldKeys = new Set(Object.keys(fields));
  const remainingPlaceholders = allPlaceholders.filter(p => {
    const key = p.slice(2, -2);
    return fieldKeys.has(key) && !(fields[key] || '').trim();
  }).length;

  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [viewMode, setViewMode] = useState<'review' | 'document'>('review');

  // Boilerplate sections collapse by default — user-relevant sections stay expanded
  const BOILERPLATE = useMemo(() => new Set(['5', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17']), []);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set(['5', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17']));
  const toggleSection = useCallback((id: string) => {
    setCollapsedSections(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);
  const expandAll = useCallback(() => setCollapsedSections(new Set()), []);
  const collapseBoilerplate = useCallback(() => setCollapsedSections(new Set(['5', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17'])), []);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollToSection = useCallback((id: string) => {
    const el = sectionRefs.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCollapsedSections(prev => { const n = new Set(prev); n.delete(id); return n; }); // expand if collapsed
  }, []);

  const generateDocx = useCallback(async (): Promise<string | null> => {
    const matterId = matter.matterId || matter.displayNumber;
    if (!matterId) {
      setStatus({ type: 'error', message: 'No matter ID available' });
      return null;
    }
    const resp = await fetch('/api/ccl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matterId, draftJson: fields }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Server error' }));
      throw new Error(err.error || 'Failed to generate');
    }
    const data = await resp.json();
    return data.url || null;
  }, [matter, fields]);

  const handleDownload = useCallback(async () => {
    setGenerating(true);
    setStatus(null);
    try {
      const url = await generateDocx();
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `CCL-${matter.displayNumber || 'draft'}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setStatus({ type: 'success', message: 'Document downloaded' });
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Download failed' });
    } finally {
      setGenerating(false);
    }
  }, [generateDocx, matter.displayNumber]);

  const handleSend = useCallback(async () => {
    setSending(true);
    setStatus(null);
    try {
      const url = await generateDocx();
      if (url) {
        // Stamp CCL date on the matter via /api/ccl-date
        const matterId = matter.matterId || matter.displayNumber;
        fetch('/api/ccl-date', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matterId, date: new Date().toISOString().split('T')[0] }),
        }).catch(() => {}); // fire-and-forget

        // Open mailto with attachment reference
        const clientEmail = matter.clientEmail || '';
        const subject = encodeURIComponent(`Client Care Letter — ${matter.displayNumber || ''}`);
        const body = encodeURIComponent(
          `Dear ${matter.clientName || 'Client'},\n\nPlease find attached your Client Care Letter for your review.\n\nKind regards,\n${fields.name_of_person_handling_matter || 'Helix Law'}`
        );
        window.open(`mailto:${clientEmail}?subject=${subject}&body=${body}`, '_blank');
        setStatus({ type: 'success', message: 'CCL generated — compose your email and attach the downloaded document' });
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Send failed' });
    } finally {
      setSending(false);
    }
  }, [generateDocx, matter, fields.name_of_person_handling_matter]);

  const HELIX_LOGO = 'https://helix-law.co.uk/wp-content/uploads/2025/01/Asset-2@72x.png';
  const HELIX_ADDRESS = 'Helix Law Ltd. Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE';
  const HELIX_PHONE = '0345 314 2044';
  const HELIX_WEB = 'helix-law.com';
  const headingColor = isDarkMode ? '#94a3b8' : '#0D2F60';
  const tableBorder = isDarkMode ? 'rgba(54,144,206,0.15)' : '#e2e8f0';

  const cleanedContent = content.replace(/\{\{[^}]+\}\}/g, '').replace(/\n{3,}/g, '\n\n');

  /** Parse plain text into grouped sections for collapsible rendering */
  const parsedSections = useMemo((): PreviewSection[] => {
    const lines = cleanedContent.split('\n');
    const sections: PreviewSection[] = [];
    let current: PreviewSection = { id: 'intro', number: '', title: '', elements: [], isSubsection: false };
    let key = 0;
    let i = 0;

    // Patterns
    const sectionRe = /^(\d+(?:\.\d+)?)\s+(.+)$/;
    const bulletRe = /^[—–-]\s*(.+)$/;
    const checkboxRe = /^☐\s*(.+)$/;
    const tableRowRe = /^.+\|.+$/;

    while (i < lines.length) {
      const line = lines[i].trimEnd();

      // Skip empty lines
      if (!line.trim()) { i++; continue; }

      // Section heading (e.g. "1 Contact details" or "4.1 Our charges")
      const sectionMatch = line.match(sectionRe);
      if (sectionMatch) {
        // Finalise current section
        if (current.elements.length > 0 || current.id === 'intro') {
          sections.push(current);
        }
        const [, num, title] = sectionMatch;
        const isSubsection = num.includes('.');
        current = { id: num, number: num, title, elements: [], isSubsection };
        i++;
        continue;
      }

      // Bullet group (—, –, or -) — collect across blank-line gaps
      if (bulletRe.test(line)) {
        const bullets: string[] = [];
        while (i < lines.length) {
          const bl = lines[i].trimEnd();
          if (bulletRe.test(bl)) {
            const m = bl.match(bulletRe);
            if (m) bullets.push(m[1]);
            i++;
          } else if (!bl.trim()) {
            // Blank line — peek ahead for more bullets
            let peek = i + 1;
            while (peek < lines.length && !lines[peek].trim()) peek++;
            if (peek < lines.length && bulletRe.test(lines[peek].trimEnd())) {
              i = peek; // skip blanks, continue collecting
            } else {
              break;
            }
          } else {
            break;
          }
        }
        current.elements.push(
          <ul key={key++} style={{
            margin: '6px 0 10px 8px',
            paddingLeft: 20,
            listStyleType: 'none',
          }}>
            {bullets.map((b, bi) => (
              <li key={bi} style={{
                position: 'relative',
                paddingLeft: 16,
                marginBottom: 5,
                lineHeight: 1.7,
              }}>
                <span style={{
                  position: 'absolute', left: 0, top: '0.55em',
                  width: 5, height: 5, borderRadius: '50%',
                  background: accentBlue, display: 'inline-block',
                }} />
                {b}
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // Checkbox items (☐) — collect across blank-line gaps
      if (checkboxRe.test(line)) {
        const items: { action: string; info: string }[] = [];
        while (i < lines.length) {
          const cl = lines[i].trimEnd();
          if (checkboxRe.test(cl)) {
            const raw = cl.replace(/^☐\s*/, '');
            const parts = raw.split('|').map(s => s.trim()).filter(Boolean);
            items.push({ action: parts[0] || '', info: parts[1] || '' });
            i++;
          } else if (!cl.trim()) {
            let peek = i + 1;
            while (peek < lines.length && !lines[peek].trim()) peek++;
            if (peek < lines.length && checkboxRe.test(lines[peek].trimEnd())) {
              i = peek;
            } else {
              break;
            }
          } else {
            break;
          }
        }
        current.elements.push(
          <div key={key++} style={{ margin: '8px 0 12px 0' }}>
            {items.map((item, ci) => (
              <div key={ci} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '10px 14px',
                marginBottom: 6,
                background: isDarkMode ? 'rgba(54,144,206,0.06)' : '#f8fafc',
                borderRadius: 4,
                borderLeft: `3px solid ${accentBlue}`,
                fontSize: 12, lineHeight: 1.6,
              }}>
                <span style={{
                  flexShrink: 0, marginTop: 3,
                  width: 14, height: 14, borderRadius: 3,
                  border: `1.5px solid ${isDarkMode ? '#475569' : '#cbd5e1'}`,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }} />
                <div style={{ flex: 1, color: text }}>
                  <span style={{ fontWeight: 600 }}>{item.action}</span>
                  {item.info && (
                    <div style={{ color: textMuted, fontSize: 11, marginTop: 3 }}>{item.info}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
        continue;
      }

      // Table rows — detect checklist-header pattern (header row + ☐ rows)
      if (tableRowRe.test(line)) {
        // Peek ahead: if next non-empty line is a checkbox, render as action checklist
        let peekIdx = i + 1;
        while (peekIdx < lines.length && !lines[peekIdx].trim()) peekIdx++;
        if (peekIdx < lines.length && checkboxRe.test(lines[peekIdx].trimEnd())) {
          const headers = line.split('|').map(s => s.trim());
          i++; // skip header line
          const items: { action: string; info: string }[] = [];
          while (i < lines.length) {
            const cl = lines[i].trimEnd();
            if (checkboxRe.test(cl)) {
              const raw = cl.replace(/^☐\s*/, '');
              const parts = raw.split('|').map(s => s.trim()).filter(Boolean);
              items.push({ action: parts[0] || '', info: parts[1] || '' });
              i++;
            } else if (!cl.trim()) {
              let pk = i + 1;
              while (pk < lines.length && !lines[pk].trim()) pk++;
              if (pk < lines.length && checkboxRe.test(lines[pk].trimEnd())) { i = pk; } else { break; }
            } else { break; }
          }
          current.elements.push(
            <table key={key++} style={{
              width: '100%', borderCollapse: 'collapse',
              margin: '10px 0 14px', fontSize: 12, color: text,
            }}>
              <thead>
                <tr>
                  <th style={{ width: 24 }} />
                  {headers.map((h, hi) => (
                    <th key={hi} style={{
                      textAlign: 'left', padding: '6px 12px',
                      borderBottom: `2px solid ${headingColor}`,
                      fontWeight: 700, fontSize: 11,
                      color: headingColor, textTransform: 'uppercase' as const,
                      letterSpacing: '0.03em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, ci) => (
                  <tr key={ci}>
                    <td style={{
                      padding: '10px 4px 10px 12px', verticalAlign: 'top',
                      borderBottom: `1px solid ${tableBorder}`,
                    }}>
                      <span style={{
                        display: 'inline-block', width: 14, height: 14, borderRadius: 3,
                        border: `1.5px solid ${isDarkMode ? '#475569' : '#cbd5e1'}`,
                      }} />
                    </td>
                    <td style={{
                      padding: '10px 12px', verticalAlign: 'top',
                      borderBottom: `1px solid ${tableBorder}`,
                      fontWeight: 600, color: text,
                    }}>{item.action}</td>
                    {item.info ? (
                      <td style={{
                        padding: '10px 12px', verticalAlign: 'top',
                        borderBottom: `1px solid ${tableBorder}`,
                        color: textMuted, fontSize: 11,
                      }}>{item.info}</td>
                    ) : <td style={{ borderBottom: `1px solid ${tableBorder}` }} />}
                  </tr>
                ))}
              </tbody>
            </table>
          );
          continue;
        }

        // Regular table (no ☐ rows following)
        const rows: string[][] = [];
        while (i < lines.length && tableRowRe.test(lines[i].trimEnd()) && !checkboxRe.test(lines[i].trimEnd())) {
          rows.push(lines[i].trimEnd().split('|').map(s => s.trim()));
          i++;
        }
        if (rows.length > 0) {
          const [header, ...body] = rows;
          current.elements.push(
            <table key={key++} style={{
              width: '100%', borderCollapse: 'collapse',
              margin: '8px 0 12px 0', fontSize: 12, color: text,
            }}>
              <thead>
                <tr>
                  {header.map((cell, ci) => (
                    <th key={ci} style={{
                      textAlign: 'left', padding: '8px 12px',
                      borderBottom: `2px solid ${headingColor}`,
                      fontWeight: 700, fontSize: 11,
                      color: headingColor, textTransform: 'uppercase' as const,
                      letterSpacing: '0.03em',
                    }}>{cell}</th>
                  ))}
                </tr>
              </thead>
              {body.length > 0 && (
                <tbody>
                  {body.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{
                          padding: '6px 12px',
                          borderBottom: `1px solid ${tableBorder}`,
                          verticalAlign: 'top', color: text,
                        }}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          );
          continue;
        }
      }

      // Regular paragraph — collect consecutive non-empty, non-special lines
      const paraLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !sectionRe.test(lines[i].trimEnd()) &&
        !bulletRe.test(lines[i].trimEnd()) &&
        !checkboxRe.test(lines[i].trimEnd()) &&
        !tableRowRe.test(lines[i].trimEnd())
      ) {
        paraLines.push(lines[i].trimEnd());
        i++;
      }
      if (paraLines.length > 0) {
        const paraText = paraLines.join('\n');
        // Check if it's the "Dear..." greeting
        const isGreeting = paraText.startsWith('Dear ');
        // Check if it's "Kind regards" / closing
        const isClosing = /^(Kind regards|Yours sincerely|Yours faithfully|Please contact me)/i.test(paraText);
        current.elements.push(
          <p key={key++} style={{
            margin: '0 0 10px 0',
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
            ...(isGreeting ? { fontWeight: 600, marginBottom: 14 } : {}),
            ...(isClosing ? { marginTop: 18 } : {}),
          }}>
            {paraText}
          </p>
        );
      }
    }
    // Finalise last section
    if (current.elements.length > 0) sections.push(current);
    return sections;
  }, [cleanedContent, isDarkMode, headingColor, tableBorder, textMuted, accentBlue]);

  const handlePrintPdf = useCallback(() => {
    const printWindow = window.open('', '_blank', 'width=800,height=1000');
    if (!printWindow) {
      setStatus({ type: 'error', message: 'Pop-up blocked — allow pop-ups and try again' });
      return;
    }

    // Parse content into structured HTML for PDF
    const lines = cleanedContent.split('\n');
    let htmlBody = '';
    let idx = 0;
    const sectionRe = /^(\d+(?:\.\d+)?)\s+(.+)$/;
    const bulletRe = /^[—–-]\s*(.+)$/;
    const checkboxRe = /^☐\s*(.+)$/;
    const tableRowRe = /^.+\|.+$/;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    while (idx < lines.length) {
      const line = lines[idx].trimEnd();
      if (!line.trim()) { idx++; continue; }

      const sm = line.match(sectionRe);
      if (sm) {
        const isSub = sm[1].includes('.');
        htmlBody += `<h${isSub ? '3' : '2'} class="${isSub ? 'sub' : 'sec'}">${esc(sm[1])}&ensp;${esc(sm[2])}</h${isSub ? '3' : '2'}>`;
        idx++; continue;
      }

      if (bulletRe.test(line)) {
        htmlBody += '<ul>';
        while (idx < lines.length) {
          const bl = lines[idx].trimEnd();
          if (bulletRe.test(bl)) {
            const m = bl.match(bulletRe);
            if (m) htmlBody += `<li>${esc(m[1])}</li>`;
            idx++;
          } else if (!bl.trim()) {
            let peek = idx + 1;
            while (peek < lines.length && !lines[peek].trim()) peek++;
            if (peek < lines.length && bulletRe.test(lines[peek].trimEnd())) {
              idx = peek;
            } else { break; }
          } else { break; }
        }
        htmlBody += '</ul>';
        continue;
      }

      if (checkboxRe.test(line)) {
        htmlBody += '<table class="checklist"><tbody>';
        while (idx < lines.length) {
          const cl = lines[idx].trimEnd();
          if (checkboxRe.test(cl)) {
            const raw = cl.replace(/^☐\s*/, '');
            const parts = raw.split('|').map((s: string) => s.trim());
            htmlBody += `<tr><td class="cb"></td><td><strong>${esc(parts[0])}</strong>${parts[1] ? `<br><span class="muted">${esc(parts[1])}</span>` : ''}</td></tr>`;
            idx++;
          } else if (!cl.trim()) {
            let peek = idx + 1;
            while (peek < lines.length && !lines[peek].trim()) peek++;
            if (peek < lines.length && checkboxRe.test(lines[peek].trimEnd())) { idx = peek; } else { break; }
          } else { break; }
        }
        htmlBody += '</tbody></table>';
        continue;
      }

      if (tableRowRe.test(line)) {
        // Peek ahead: if next non-empty line is a checkbox, render as action checklist
        let peekIdx = idx + 1;
        while (peekIdx < lines.length && !lines[peekIdx].trim()) peekIdx++;
        if (peekIdx < lines.length && checkboxRe.test(lines[peekIdx].trimEnd())) {
          const headers = line.split('|').map((s: string) => s.trim());
          idx++; // skip header
          htmlBody += '<table class="checklist"><thead><tr><th class="cb"></th>';
          headers.forEach(h => { htmlBody += `<th>${esc(h)}</th>`; });
          htmlBody += '</tr></thead><tbody>';
          while (idx < lines.length) {
            const cl = lines[idx].trimEnd();
            if (checkboxRe.test(cl)) {
              const raw = cl.replace(/^☐\s*/, '');
              const parts = raw.split('|').map((s: string) => s.trim());
              htmlBody += `<tr><td class="cb"></td><td><strong>${esc(parts[0])}</strong></td>${parts[1] ? `<td class="muted">${esc(parts[1])}</td>` : '<td></td>'}</tr>`;
              idx++;
            } else if (!cl.trim()) {
              let pk = idx + 1;
              while (pk < lines.length && !lines[pk].trim()) pk++;
              if (pk < lines.length && checkboxRe.test(lines[pk].trimEnd())) { idx = pk; } else { break; }
            } else { break; }
          }
          htmlBody += '</tbody></table>';
          continue;
        }

        // Regular table
        const rows: string[][] = [];
        while (idx < lines.length && tableRowRe.test(lines[idx].trimEnd()) && !checkboxRe.test(lines[idx].trimEnd())) {
          rows.push(lines[idx].trimEnd().split('|').map((s: string) => s.trim()));
          idx++;
        }
        if (rows.length > 0) {
          const [header, ...body] = rows;
          htmlBody += '<table class="data"><thead><tr>';
          header.forEach(c => { htmlBody += `<th>${esc(c)}</th>`; });
          htmlBody += '</tr></thead>';
          if (body.length) {
            htmlBody += '<tbody>';
            body.forEach(r => { htmlBody += '<tr>'; r.forEach(c => { htmlBody += `<td>${esc(c)}</td>`; }); htmlBody += '</tr>'; });
            htmlBody += '</tbody>';
          }
          htmlBody += '</table>';
        }
        continue;
      }

      // Paragraph
      const pLines: string[] = [];
      while (idx < lines.length && lines[idx].trim() && !sectionRe.test(lines[idx].trimEnd()) && !bulletRe.test(lines[idx].trimEnd()) && !checkboxRe.test(lines[idx].trimEnd()) && !tableRowRe.test(lines[idx].trimEnd())) {
        pLines.push(lines[idx].trimEnd());
        idx++;
      }
      if (pLines.length) {
        const pt = esc(pLines.join('\n'));
        const cls = pt.startsWith('Dear ') ? ' class="greeting"' : (/^(Please contact me|Kind regards|Yours)/i.test(pt) ? ' class="closing"' : '');
        htmlBody += `<p${cls}>${pt.replace(/\n/g, '<br>')}</p>`;
      }
    }

    printWindow.document.write(`<!DOCTYPE html><html><head><title>CCL — ${matter.displayNumber || 'Draft'}</title>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { margin: 20mm 22mm 24mm 22mm; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Raleway', Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.65; color: #061733; padding: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20pt; padding-bottom: 14pt; border-bottom: 1.5pt solid #0D2F60; }
  .header .logo img { width: 180px; height: auto; }
  .header .logo .addr { font-size: 7.5pt; color: #64748b; line-height: 1.5; margin-top: 6pt; }
  .header .details { text-align: right; font-size: 8.5pt; color: #64748b; line-height: 1.5; }
  .header .details .ref { font-size: 9pt; font-weight: 700; color: #0D2F60; margin-bottom: 4pt; }
  h2.sec { font-size: 11pt; font-weight: 700; color: #0D2F60; margin: 14pt 0 4pt; }
  h3.sub { font-size: 10pt; font-weight: 700; color: #0D2F60; margin: 10pt 0 3pt; padding-left: 14pt; }
  p { margin: 0 0 8pt; line-height: 1.65; padding-left: 14pt; }
  p.greeting { font-weight: 600; margin-bottom: 12pt; padding-left: 0; }
  p.closing { margin-top: 14pt; padding-left: 0; }
  ul { margin: 4pt 0 8pt 14pt; padding-left: 18pt; list-style: none; }
  ul li { position: relative; padding-left: 14pt; margin-bottom: 4pt; line-height: 1.7; }
  ul li::before { content: ''; position: absolute; left: 0; top: 0.55em; width: 4pt; height: 4pt; border-radius: 50%; background: #3690CE; }
  table.data { width: calc(100% - 14pt); margin-left: 14pt; border-collapse: collapse; margin-top: 6pt; margin-bottom: 10pt; font-size: 9.5pt; }
  table.data th { text-align: left; padding: 6pt 10pt; border-bottom: 1.5pt solid #0D2F60; font-weight: 700; font-size: 9pt; color: #0D2F60; text-transform: uppercase; letter-spacing: 0.03em; }
  table.data td { padding: 5pt 10pt; border-bottom: 0.5pt solid #e2e8f0; vertical-align: top; }
  table.checklist { width: calc(100% - 14pt); margin-left: 14pt; border-collapse: collapse; margin-top: 6pt; margin-bottom: 10pt; font-size: 10pt; }
  table.checklist th { text-align: left; padding: 8pt 10pt; border-bottom: 1.5pt solid #0D2F60; font-weight: 700; font-size: 9pt; color: #0D2F60; text-transform: uppercase; letter-spacing: 0.03em; }
  table.checklist th.cb { width: 22pt; }
  table.checklist td { padding: 8pt 10pt; border-bottom: 0.5pt solid #e2e8f0; vertical-align: top; }
  table.checklist td.cb { width: 22pt; vertical-align: top; padding-top: 10pt; }
  table.checklist td.cb::after { content: ''; display: inline-block; width: 10pt; height: 10pt; border: 1.2pt solid #94a3b8; border-radius: 2pt; }
  table.checklist .muted { font-size: 9pt; color: #64748b; }
  .footer { margin-top: 20pt; padding-top: 10pt; border-top: 0.5pt solid #e2e8f0; font-size: 7pt; color: #94a3b8; text-align: center; line-height: 1.5; }
  .recipient { margin-bottom: 16pt; font-size: 10pt; line-height: 1.6; }
  .recipient .name { font-weight: 600; margin-bottom: 1pt; }
  .recipient .re { color: #64748b; font-size: 9pt; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="header">
  <div class="logo">
    <img src="${HELIX_LOGO}" alt="Helix Law" />
    <div class="addr">Second Floor, Britannia House<br>21 Station Street, Brighton, BN1 4DE<br>0345 314 2044 · helix-law.com</div>
  </div>
  <div class="details">
    <div class="ref">${matter.displayNumber || ''}</div>
    Client Care Letter<br>${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
  </div>
</div>
<div class="recipient">
  <div class="name">${esc(String(fields.insert_clients_name || matter.clientName || ''))}</div>
  ${(fields.insert_heading_eg_matter_description || matter.description) ? `<div class="re">Re: ${esc(String(fields.insert_heading_eg_matter_description || matter.description || ''))}</div>` : ''}
</div>
${htmlBody}
<div class="footer">Helix Law Ltd is authorised and regulated by the Solicitors Regulation Authority (SRA No. 669720)<br>Registered in England &amp; Wales No. 10346944</div>
</body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 600);
  }, [cleanedContent, matter.displayNumber, matter.clientName, matter.description, fields]);

  // ─── Sidebar state ───
  const [sidebarTab, setSidebarTab] = useState<'sections' | 'fields' | 'presets'>('sections');

  // Key fields that users most commonly tweak at preview time
  const QUICK_FIELDS: { key: string; label: string; type: 'text' | 'textarea' }[] = useMemo(() => [
    { key: 'insert_clients_name', label: 'Client Name', type: 'text' },
    { key: 'insert_heading_eg_matter_description', label: 'Letter Heading', type: 'text' },
    { key: 'name_of_person_handling_matter', label: 'Handler', type: 'text' },
    { key: 'status', label: 'Handler Status', type: 'text' },
    { key: 'handler_hourly_rate', label: 'Hourly Rate (£)', type: 'text' },
    { key: 'figure', label: 'Payment on Account (£)', type: 'text' },
    { key: 'charges_estimate_paragraph', label: 'Charges Estimate', type: 'textarea' },
    { key: 'insert_current_position_and_scope_of_retainer', label: 'Scope of Work', type: 'textarea' },
    { key: 'next_steps', label: 'Next Steps', type: 'textarea' },
    { key: 'realistic_timescale', label: 'Timescale', type: 'text' },
    { key: 'identify_the_other_party_eg_your_opponents', label: 'Opposing Party', type: 'text' },
    { key: 'disbursements_paragraph', label: 'Disbursements', type: 'textarea' },
    { key: 'costs_other_party_paragraph', label: 'Costs (Other Party)', type: 'textarea' },
  ], []);

  // Clause presets — pre-written clause variants users can swap in
  const CLAUSE_PRESETS = useMemo(() => [
    {
      id: 'costs_no_estimate',
      section: '4',
      label: 'No overall estimate possible',
      description: 'Use when matter scope is too uncertain to estimate total costs.',
      fieldKey: 'we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible',
      value: 'the matter is at an early stage, and the scope of work depends on factors outside our control, including the conduct of the other party.',
    },
    {
      id: 'costs_no_opponent_costs',
      section: '4',
      label: 'No opponent cost risk',
      description: 'Non-contentious matter — no risk of paying other side\'s costs.',
      fieldKey: 'costs_other_party_paragraph',
      value: 'We do not expect that you will have to pay another party\'s costs. This only tends to arise in litigation and is therefore not relevant to your matter.',
    },
    {
      id: 'costs_opponent_risk',
      section: '4',
      label: 'Opponent cost risk warning',
      description: 'Litigation — client may have to pay other party\'s costs.',
      fieldKey: 'costs_other_party_paragraph',
      value: 'There is a risk that you may be ordered to pay {opponent}\'s legal costs if you are unsuccessful. We will advise you on costs risks throughout your matter.',
    },
    {
      id: 'billing_monthly',
      section: '4',
      label: 'Monthly billing',
      description: 'Bill monthly instead of the default interval.',
      fieldKey: 'and_or_intervals_eg_every_three_months',
      value: 'every month',
    },
    {
      id: 'billing_quarterly',
      section: '4',
      label: 'Quarterly billing',
      description: 'Bill every three months.',
      fieldKey: 'and_or_intervals_eg_every_three_months',
      value: 'every three months',
    },
    {
      id: 'billing_stages',
      section: '4',
      label: 'Billing at stages',
      description: 'Bill at completion of each stage of work.',
      fieldKey: 'and_or_intervals_eg_every_three_months',
      value: 'at the completion of each stage of your matter',
    },
    {
      id: 'timescale_complex',
      section: '3',
      label: 'Complex matter timescale',
      description: 'Use for matters expected to take 6+ months.',
      fieldKey: 'realistic_timescale',
      value: '6-12 months, depending on the complexity and the other party\'s engagement',
    },
    {
      id: 'timescale_quick',
      section: '3',
      label: 'Quick turnaround',
      description: 'Straightforward matter — 2-4 weeks.',
      fieldKey: 'realistic_timescale',
      value: '2-4 weeks',
    },
  ], []);

  const applyPreset = useCallback((fieldKey: string, value: string) => {
    if (updateField) {
      let finalValue = value;
      if (finalValue.includes('{opponent}')) {
        finalValue = finalValue.replace('{opponent}', fields.identify_the_other_party_eg_your_opponents || 'the other party');
      }
      updateField(fieldKey, finalValue);
    }
  }, [updateField, fields]);

  // Sidebar section styling helper
  const sidebarSectionStyle = {
    padding: '10px 14px',
    borderBottom: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.08)' : '#f1f5f9'}`,
  };
  const sidebarLabelStyle = {
    fontSize: 9, fontWeight: 700 as const, color: textMuted,
    textTransform: 'uppercase' as const, letterSpacing: '0.06em',
    marginBottom: 8, display: 'block' as const,
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        background: remainingPlaceholders > 0
          ? (isDarkMode ? 'rgba(214,85,65,0.08)' : 'rgba(214,85,65,0.05)')
          : (isDarkMode ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.05)'),
        border: `1px solid ${remainingPlaceholders > 0
          ? (isDarkMode ? 'rgba(214,85,65,0.2)' : 'rgba(214,85,65,0.15)')
          : (isDarkMode ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.15)')}`,
        borderRadius: 2,
      }}>
        <Icon
          iconName={remainingPlaceholders > 0 ? 'Warning' : 'CheckMark'}
          styles={{
            root: {
              fontSize: 12,
              color: remainingPlaceholders > 0
                ? (isDarkMode ? '#f0a090' : colours.cta)
                : (isDarkMode ? '#4ade80' : '#16a34a'),
            },
          }}
        />
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: remainingPlaceholders > 0
            ? (isDarkMode ? '#f0a090' : colours.cta)
            : (isDarkMode ? '#4ade80' : '#16a34a'),
        }}>
          {remainingPlaceholders > 0
            ? `${remainingPlaceholders} placeholder${remainingPlaceholders > 1 ? 's' : ''} still need completing`
            : 'All fields completed — ready for review'}
        </span>
        <div style={{ flex: 1 }} />
        {/* Actions moved to status bar for cleaner layout */}
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 2,
            background: 'transparent', border: `1px solid ${cardBorder}`,
            color: textMuted, fontSize: 10, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.12s ease',
          }}
        >
          <Icon iconName="ChevronLeft" styles={{ root: { fontSize: 8 } }} />
          Editor
        </button>
        <button type="button" onClick={handlePrintPdf} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 2,
          background: 'transparent', border: `1px solid ${cardBorder}`,
          color: text, fontSize: 10, fontWeight: 600,
          cursor: 'pointer', transition: 'all 0.12s ease',
        }}>
          <Icon iconName="PDF" styles={{ root: { fontSize: 10 } }} />
          PDF
        </button>
        <button type="button" onClick={handleDownload} disabled={generating} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 2,
          background: 'transparent', border: `1px solid ${cardBorder}`,
          color: text, fontSize: 10, fontWeight: 600,
          cursor: generating ? 'wait' : 'pointer',
          opacity: generating ? 0.6 : 1, transition: 'all 0.12s ease',
        }}>
          <Icon iconName={generating ? 'ProgressRingDots' : 'Download'} styles={{ root: { fontSize: 10 } }} />
          .docx
        </button>
        <button type="button" onClick={handleSend} disabled={sending || remainingPlaceholders > 0}
          title={remainingPlaceholders > 0 ? 'Complete all placeholders before sending' : 'Generate and email'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 14px', borderRadius: 2,
            background: remainingPlaceholders > 0 ? (isDarkMode ? 'rgba(148,163,184,0.2)' : '#e2e8f0') : accentBlue,
            color: remainingPlaceholders > 0 ? textMuted : '#fff',
            border: 'none', fontSize: 10, fontWeight: 700,
            textTransform: 'uppercase' as const, letterSpacing: '0.04em',
            cursor: sending || remainingPlaceholders > 0 ? 'not-allowed' : 'pointer',
            opacity: sending ? 0.6 : 1, transition: 'all 0.12s ease',
          }}
        >
          <Icon iconName={sending ? 'ProgressRingDots' : 'Send'} styles={{ root: { fontSize: 10 } }} />
          Send
        </button>
      </div>

      {/* Main layout — A4 paper (left) + sidebar (right) */}
      <div style={{ flex: 1, display: 'flex', gap: 0, overflow: 'hidden', minHeight: 0 }}>

        {/* ═══ A4 Paper ═══ */}
        <div style={{
          flex: 1, overflow: 'auto',
          background: isDarkMode ? '#1e293b' : '#e2e8f0',
          borderRadius: '2px 0 0 2px',
          padding: '24px 20px 24px 24px',
          display: 'flex', justifyContent: 'center',
        }}>
          <div style={{
            width: 794,
            minHeight: 1123,
            flexShrink: 0,
            background: isDarkMode ? '#0f172a' : '#ffffff',
            boxShadow: isDarkMode
              ? '0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(54,144,206,0.15)'
              : '0 2px 16px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
            padding: '56px 64px 48px 64px',
            fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
            fontSize: 13, lineHeight: 1.7,
            color: isDarkMode ? '#e2e8f0' : '#061733',
            position: 'relative' as const,
          }}>
            {/* Letterhead */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              marginBottom: 28, paddingBottom: 16,
              borderBottom: `1.5px solid ${isDarkMode ? 'rgba(13,47,96,0.5)' : '#0D2F60'}`,
            }}>
              <div>
                <img src={HELIX_LOGO} alt="Helix Law" style={{ width: 170, height: 'auto', display: 'block' }} />
                <div style={{ fontSize: 8.5, color: textMuted, lineHeight: 1.5, marginTop: 8 }}>
                  Second Floor, Britannia House<br />21 Station Street, Brighton, BN1 4DE<br />0345 314 2044 · helix-law.com
                </div>
              </div>
              <div style={{ textAlign: 'right' as const, fontSize: 10.5, lineHeight: 1.5, color: textMuted }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? '#94a3b8' : '#0D2F60', marginBottom: 2 }}>
                  {matter.displayNumber}
                </div>
                <div>Client Care Letter</div>
                <div>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              </div>
            </div>

            {/* Recipient block */}
            <div style={{ marginBottom: 24, fontSize: 12.5, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                {fields.insert_clients_name || matter.clientName || ''}
              </div>
              {(fields.insert_heading_eg_matter_description || matter.description) && (
                <div style={{ color: textMuted, fontSize: 11 }}>
                  Re: {fields.insert_heading_eg_matter_description || matter.description || ''}
                </div>
              )}
            </div>

            {/* Letter body */}
            {viewMode === 'review' ? (
            <div>
              {parsedSections.map(section => {
                if (section.id === 'intro') return <div key="intro">{section.elements}</div>;
                const isCollapsed = collapsedSections.has(section.number);
                return (
                  <div key={section.id} ref={el => { sectionRefs.current[section.number] = el; }} style={{ marginBottom: isCollapsed ? 2 : 8 }}>
                    <div onClick={() => toggleSection(section.number)} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: isCollapsed ? '5px 0' : '0',
                      marginTop: section.isSubsection ? 8 : 16,
                      marginBottom: isCollapsed ? 0 : 4,
                      cursor: 'pointer', userSelect: 'none' as const, transition: 'all 0.12s ease',
                    }}
                      onMouseEnter={e => { (e.currentTarget.querySelector('.chev') as HTMLElement)?.style && ((e.currentTarget.querySelector('.chev') as HTMLElement).style.opacity = '1'); }}
                      onMouseLeave={e => { (e.currentTarget.querySelector('.chev') as HTMLElement)?.style && ((e.currentTarget.querySelector('.chev') as HTMLElement).style.opacity = '0.5'); }}
                    >
                      <Icon className="chev" iconName={isCollapsed ? 'ChevronRight' : 'ChevronDown'} styles={{ root: { fontSize: 9, color: textMuted, opacity: 0.5, transition: 'all 0.12s ease', flexShrink: 0 } }} />
                      <span style={{
                        fontSize: section.isSubsection ? 13 : 14, fontWeight: 700,
                        color: isCollapsed ? textMuted : headingColor, letterSpacing: '0.01em', flex: 1,
                      }}>
                        {section.number}&ensp;{section.title}
                      </span>
                      {isCollapsed && <span style={{ fontSize: 9, color: isDarkMode ? '#475569' : '#94a3b8', fontWeight: 500, fontStyle: 'italic' }}>Standard clause</span>}
                    </div>
                    {!isCollapsed && <div style={{ paddingLeft: section.isSubsection ? 28 : 20, marginTop: 2 }}>{section.elements}</div>}
                  </div>
                );
              })}
            </div>
            ) : (
            <div>
              {parsedSections.map(section => {
                if (section.id === 'intro') return <div key="intro">{section.elements}</div>;
                return (
                  <div key={section.id} style={{ marginBottom: 4 }}>
                    <div style={{ marginTop: section.isSubsection ? 8 : 16, marginBottom: 4 }}>
                      <span style={{ fontSize: section.isSubsection ? 13 : 14, fontWeight: 700, color: headingColor, letterSpacing: '0.01em' }}>
                        {section.number}&ensp;{section.title}
                      </span>
                    </div>
                    <div style={{ paddingLeft: section.isSubsection ? 28 : 20, marginTop: 2 }}>{section.elements}</div>
                  </div>
                );
              })}
            </div>
            )}

            {/* Footer */}
            <div style={{
              marginTop: 28, paddingTop: 14,
              borderTop: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.15)' : '#e2e8f0'}`,
              fontSize: 8, color: isDarkMode ? '#475569' : '#94a3b8',
              textAlign: 'center' as const, lineHeight: 1.5,
            }}>
              <div>Helix Law Ltd is authorised and regulated by the Solicitors Regulation Authority (SRA No. 669720)</div>
              <div>Registered in England & Wales No. 10346944</div>
            </div>
          </div>{/* end A4 paper */}
        </div>{/* end paper scroll area */}

        {/* ═══ Sidebar ═══ */}
        <div style={{
          width: 320, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          background: isDarkMode ? '#0f172a' : '#ffffff',
          borderLeft: `1px solid ${cardBorder}`,
          borderRadius: '0 2px 2px 0',
          overflow: 'hidden',
        }}>
          {/* Sidebar tabs */}
          <div style={{
            display: 'flex', borderBottom: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.08)' : '#f1f5f9'}`,
          }}>
            {([
              { id: 'sections' as const, icon: 'BulletedList2', label: 'Sections' },
              { id: 'fields' as const, icon: 'Edit', label: 'Quick Edit' },
              { id: 'presets' as const, icon: 'Library', label: 'Presets' },
            ]).map(tab => (
              <button key={tab.id} type="button" onClick={() => setSidebarTab(tab.id)} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                padding: '8px 4px', fontSize: 9, fontWeight: 700,
                border: 'none', borderBottom: sidebarTab === tab.id ? `2px solid ${accentBlue}` : '2px solid transparent',
                background: 'transparent',
                color: sidebarTab === tab.id ? accentBlue : textMuted,
                cursor: 'pointer', transition: 'all 0.12s ease',
                textTransform: 'uppercase' as const, letterSpacing: '0.05em',
              }}>
                <Icon iconName={tab.icon} styles={{ root: { fontSize: 11 } }} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sidebar content */}
          <div style={{ flex: 1, overflow: 'auto' }}>

            {/* ── Sections tab ── */}
            {sidebarTab === 'sections' && (
              <div>
                {/* View mode toggle */}
                <div style={{ ...sidebarSectionStyle }}>
                  <span style={sidebarLabelStyle}>View Mode</span>
                  <div style={{ display: 'flex', borderRadius: 2, overflow: 'hidden', border: `1px solid ${cardBorder}` }}>
                    <button type="button" onClick={() => setViewMode('review')} style={{
                      flex: 1, padding: '5px 0', fontSize: 10, fontWeight: 600,
                      border: 'none', cursor: 'pointer',
                      background: viewMode === 'review' ? accentBlue : 'transparent',
                      color: viewMode === 'review' ? '#fff' : textMuted,
                    }}>Review</button>
                    <button type="button" onClick={() => setViewMode('document')} style={{
                      flex: 1, padding: '5px 0', fontSize: 10, fontWeight: 600,
                      border: 'none', borderLeft: `1px solid ${cardBorder}`, cursor: 'pointer',
                      background: viewMode === 'document' ? accentBlue : 'transparent',
                      color: viewMode === 'document' ? '#fff' : textMuted,
                    }}>Document</button>
                  </div>
                </div>

                {/* Expand/collapse controls */}
                {viewMode === 'review' && (
                  <div style={{ ...sidebarSectionStyle, display: 'flex', gap: 6 }}>
                    <button type="button" onClick={expandAll} style={{
                      flex: 1, padding: '4px 0', borderRadius: 2, fontSize: 9, fontWeight: 600,
                      border: `1px solid ${cardBorder}`, background: 'transparent',
                      color: textMuted, cursor: 'pointer', textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                    }}>Expand All</button>
                    <button type="button" onClick={collapseBoilerplate} style={{
                      flex: 1, padding: '4px 0', borderRadius: 2, fontSize: 9, fontWeight: 600,
                      border: `1px solid ${cardBorder}`, background: 'transparent',
                      color: textMuted, cursor: 'pointer', textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                    }}>Key Only</button>
                  </div>
                )}

                {/* Section list */}
                <div style={{ ...sidebarSectionStyle, padding: '6px 14px 14px' }}>
                  <span style={sidebarLabelStyle}>Clauses</span>
                  {parsedSections.filter(s => s.number && !s.isSubsection).map(s => {
                    const isCollapsed = collapsedSections.has(s.number);
                    const isBoilerplate = BOILERPLATE.has(s.number);
                    return (
                      <button key={s.id} type="button" onClick={() => scrollToSection(s.number)} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        width: '100%', textAlign: 'left' as const,
                        padding: '6px 8px', borderRadius: 2, marginBottom: 2,
                        border: 'none', cursor: 'pointer', transition: 'all 0.1s ease',
                        background: !isCollapsed
                          ? (isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.04)')
                          : 'transparent',
                        color: text,
                      }}>
                        <span style={{
                          width: 22, height: 22, borderRadius: 2,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, flexShrink: 0,
                          background: !isCollapsed ? accentBlue : (isDarkMode ? 'rgba(148,163,184,0.1)' : '#f1f5f9'),
                          color: !isCollapsed ? '#fff' : textMuted,
                        }}>
                          {s.number}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 500, flex: 1,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                          color: isCollapsed ? textMuted : text,
                          opacity: isBoilerplate && isCollapsed ? 0.6 : 1,
                        }}>
                          {s.title}
                        </span>
                        {viewMode === 'review' && (
                          <Icon iconName={isCollapsed ? 'ChevronRight' : 'ChevronDown'} styles={{ root: { fontSize: 8, color: textMuted, opacity: 0.5 } }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Quick Edit tab ── */}
            {sidebarTab === 'fields' && (
              <div style={{ padding: '10px 14px' }}>
                <span style={sidebarLabelStyle}>Quick Edit Fields</span>
                <div style={{ fontSize: 10, color: textMuted, marginBottom: 12, lineHeight: 1.4 }}>
                  Edit key values without going back to the questionnaire. Changes update the letter in real time.
                </div>
                {QUICK_FIELDS.map(f => (
                  <div key={f.key} style={{ marginBottom: 10 }}>
                    <label style={{
                      display: 'block', fontSize: 10, fontWeight: 600, color: text,
                      marginBottom: 3,
                    }}>{f.label}</label>
                    {f.type === 'textarea' ? (
                      <textarea
                        value={fields[f.key] || ''}
                        onChange={e => updateField?.(f.key, e.target.value)}
                        rows={3}
                        style={{
                          width: '100%', resize: 'vertical',
                          padding: '6px 8px', borderRadius: 2, fontSize: 11, lineHeight: 1.5,
                          border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.25)' : 'rgba(148,163,184,0.3)'}`,
                          background: isDarkMode ? 'rgba(15,23,42,0.8)' : '#f8fafc',
                          color: text, fontFamily: 'inherit',
                          outline: 'none', transition: 'border-color 0.12s ease',
                        }}
                        onFocus={e => { e.target.style.borderColor = accentBlue; }}
                        onBlur={e => { e.target.style.borderColor = isDarkMode ? 'rgba(54,144,206,0.25)' : 'rgba(148,163,184,0.3)'; }}
                      />
                    ) : (
                      <input
                        type="text"
                        value={fields[f.key] || ''}
                        onChange={e => updateField?.(f.key, e.target.value)}
                        style={{
                          width: '100%', padding: '5px 8px', borderRadius: 2, fontSize: 11,
                          border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.25)' : 'rgba(148,163,184,0.3)'}`,
                          background: isDarkMode ? 'rgba(15,23,42,0.8)' : '#f8fafc',
                          color: text, fontFamily: 'inherit',
                          outline: 'none', transition: 'border-color 0.12s ease',
                        }}
                        onFocus={e => { e.target.style.borderColor = accentBlue; }}
                        onBlur={e => { e.target.style.borderColor = isDarkMode ? 'rgba(54,144,206,0.25)' : 'rgba(148,163,184,0.3)'; }}
                      />
                    )}
                    {(fields[f.key] || '').trim() && (
                      <div style={{ fontSize: 9, color: isDarkMode ? '#475569' : '#cbd5e1', marginTop: 2 }}>
                        {(fields[f.key] || '').length} chars
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Presets tab ── */}
            {sidebarTab === 'presets' && (
              <div style={{ padding: '10px 14px' }}>
                <span style={sidebarLabelStyle}>Clause Presets</span>
                <div style={{ fontSize: 10, color: textMuted, marginBottom: 12, lineHeight: 1.4 }}>
                  One-click clause variants. Click to apply — the relevant section updates instantly.
                </div>
                {(['3', '4'] as const).map(sectionNum => {
                  const sectionPresets = CLAUSE_PRESETS.filter(p => p.section === sectionNum);
                  const sectionTitle = parsedSections.find(s => s.number === sectionNum)?.title || `Section ${sectionNum}`;
                  return (
                    <div key={sectionNum} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: headingColor, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          width: 18, height: 18, borderRadius: 2, fontSize: 9, fontWeight: 700,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          background: isDarkMode ? 'rgba(148,163,184,0.1)' : '#f1f5f9', color: textMuted,
                        }}>{sectionNum}</span>
                        {sectionTitle}
                      </div>
                      {sectionPresets.map(preset => {
                        const isActive = (fields[preset.fieldKey] || '').trim() === preset.value.replace('{opponent}', fields.identify_the_other_party_eg_your_opponents || 'the other party');
                        return (
                          <button key={preset.id} type="button" onClick={() => applyPreset(preset.fieldKey, preset.value)} style={{
                            display: 'block', width: '100%', textAlign: 'left' as const,
                            padding: '8px 10px', borderRadius: 3, marginBottom: 4,
                            border: `1px solid ${isActive ? accentBlue : (isDarkMode ? 'rgba(148,163,184,0.1)' : '#f1f5f9')}`,
                            background: isActive
                              ? (isDarkMode ? 'rgba(54,144,206,0.1)' : 'rgba(54,144,206,0.05)')
                              : 'transparent',
                            cursor: 'pointer', transition: 'all 0.12s ease',
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: isActive ? accentBlue : text, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {isActive && <Icon iconName="CheckMark" styles={{ root: { fontSize: 10, color: accentBlue } }} />}
                              {preset.label}
                            </div>
                            <div style={{ fontSize: 9.5, color: textMuted, lineHeight: 1.4 }}>{preset.description}</div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>{/* end sidebar content scroll */}
        </div>{/* end sidebar */}
      </div>{/* end main layout */}

      {/* Status feedback */}
      {status && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px',
          background: status.type === 'success'
            ? (isDarkMode ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.05)')
            : (isDarkMode ? 'rgba(214,85,65,0.08)' : 'rgba(214,85,65,0.05)'),
          border: `1px solid ${status.type === 'success'
            ? (isDarkMode ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.15)')
            : (isDarkMode ? 'rgba(214,85,65,0.2)' : 'rgba(214,85,65,0.15)')}`,
          borderRadius: 2,
          fontSize: 11, fontWeight: 600,
          color: status.type === 'success'
            ? (isDarkMode ? '#4ade80' : '#16a34a')
            : (isDarkMode ? '#f0a090' : colours.cta),
        }}>
          <Icon iconName={status.type === 'success' ? 'CheckMark' : 'ErrorBadge'} styles={{ root: { fontSize: 12 } }} />
          {status.message}
        </div>
      )}
    </div>
  );
};

export default PreviewStep;
