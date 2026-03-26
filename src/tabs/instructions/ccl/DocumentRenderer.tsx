import React from 'react';

function autoSizeTextarea(element: HTMLTextAreaElement | null) {
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
}

type DocumentFieldState = {
    isMailMergeValue?: boolean;
    isAiGenerated?: boolean;
    isAiUpdated?: boolean;
    isReviewed?: boolean;
    isUnresolved?: boolean;
};

interface DocumentRendererProps {
    template: string;
    fieldValues?: Record<string, string>;
    interactiveFieldKeys?: string[];
    activeFieldKey?: string | null;
    placeholderLabels?: Record<string, string>;
    onFieldClick?: (fieldKey: string) => void;
    editableFieldKey?: string | null;
    onFieldValueChange?: (fieldKey: string, value: string) => void;
    fieldStates?: Record<string, DocumentFieldState>;
    fieldElementRefs?: React.MutableRefObject<Record<string, HTMLSpanElement | null>>;
    rootRef?: React.Ref<HTMLDivElement>;
    /** Page break data: array of { beforeSectionIdx, pageNumber }. Drives A4 page gap rendering. */
    pageBreaks?: Array<{ beforeSectionIdx: number; pageNumber: number }>;
    /** Total page count — used for "Page N / Total" labels. */
    totalPages?: number;
    /** Horizontal content padding in px — used to extend page gaps edge-to-edge. */
    contentPaddingX?: number;
    /** Vertical content padding for top/bottom of each page. */
    contentPaddingY?: { top: number; bottom: number };
}

interface RenderContext {
    fieldValues?: Record<string, string>;
    interactiveFieldKeys: Set<string>;
    activeFieldKey?: string | null;
    placeholderLabels?: Record<string, string>;
    onFieldClick?: (fieldKey: string) => void;
    editableFieldKey?: string | null;
    onFieldValueChange?: (fieldKey: string, value: string) => void;
    fieldStates?: Record<string, DocumentFieldState>;
    fieldElementRefs?: React.MutableRefObject<Record<string, HTMLSpanElement | null>>;
}

type DocumentSection = {
    id: string;
    lines: string[];
};

function isHeadingOnlySection(lines: string[]): boolean {
    const nonEmptyLines = lines.map((line) => line.trim()).filter(Boolean);
    if (nonEmptyLines.length !== 1) return false;

    const line = nonEmptyLines[0];
    if (line.length > 120) return false;
    if (/[.!?;:]$/.test(line)) return false;

    return /^(\d+(?:\.\d+)?)\s+.+$/.test(line)
        || /^[A-Z][A-Za-z0-9,&/()'\- ]+$/.test(line);
}

function buildDocumentSections(template: string): DocumentSection[] {
    const rawSections = template
        .split(/\n\s*\n/)
        .filter((sectionText) => !/^\s*or\s*$/i.test(sectionText.trim()))
        .map((sectionText, sectionIdx) => ({
            id: `section-${sectionIdx}`,
            lines: sectionText.split('\n'),
        }));

    const mergedSections: DocumentSection[] = [];

    for (let index = 0; index < rawSections.length; index += 1) {
        const currentSection = rawSections[index];
        const nextSection = rawSections[index + 1];

        if (nextSection && isHeadingOnlySection(currentSection.lines)) {
            mergedSections.push({
                id: currentSection.id,
                lines: [...currentSection.lines, '', ...nextSection.lines],
            });
            index += 1;
            continue;
        }

        mergedSections.push(currentSection);
    }

    return mergedSections;
}

function buildFieldStatePresentation(state: DocumentFieldState | undefined, isInteractive: boolean, isActive: boolean) {
    const isUnresolved = !!state?.isUnresolved;
    const isAi = !!state?.isAiGenerated || !!state?.isAiUpdated;
    const isMailMerge = !!state?.isMailMergeValue && !isAi && !isUnresolved;
    const isReviewed = !!state?.isReviewed;

    const background = isActive
        ? (isUnresolved
            ? 'rgba(214,85,65,0.10)'
            : 'rgba(214,232,255,0.78)')
        : isUnresolved
            ? 'rgba(214,85,65,0.08)'
            : isAi
                ? 'rgba(54,144,206,0.03)'
                : isMailMerge
                    ? 'rgba(135,243,243,0.06)'
                    : 'transparent';

    const borderBottom = isUnresolved
        ? `${isActive ? 2 : 1}px dashed rgba(214,85,65,0.68)`
        : isAi
            ? `${isActive ? 2 : 1}px solid rgba(54,144,206,0.38)`
            : isMailMerge
                ? `${isActive ? 2 : 1}px solid rgba(135,243,243,0.48)`
            : isInteractive
                ? `${isActive ? 2 : 1}px dashed ${isActive ? 'rgba(54,144,206,0.88)' : 'rgba(54,144,206,0.34)'}`
                : 'none';

    const boxShadow = [
        isReviewed ? 'inset 0 -2px 0 rgba(32,178,108,0.65)' : '',
        isActive ? 'inset 0 0 0 1px rgba(54,144,206,0.34)' : '',
    ].filter(Boolean).join(', ') || undefined;

    const color = isUnresolved
        ? '#8a2d23'
        : isMailMerge
            ? '#0D2F60'
        : isInteractive
            ? '#0D2F60'
            : 'inherit';

    const stateLabels = [
        isMailMerge ? 'Mail merge value' : '',
        isUnresolved ? 'Unresolved placeholder' : '',
        state?.isAiGenerated ? 'AI generated' : '',
        !state?.isAiGenerated && state?.isAiUpdated ? 'AI updated' : '',
        isReviewed ? 'Approved' : '',
    ].filter(Boolean);

    return { background, borderBottom, boxShadow, color, stateLabels };
}

function renderBracketPromptText(text: string, keyPrefix: string): React.ReactNode {
    const promptRe = /(\[[^\]]+\])/g;
    const parts = text.split(promptRe).filter(Boolean);

    return (
        <>
            {parts.map((part, index) => {
                const isPrompt = part.startsWith('[') && part.endsWith(']');
                if (!isPrompt) return <React.Fragment key={`${keyPrefix}-text-${index}`}>{part}</React.Fragment>;

                return (
                    <span
                        key={`${keyPrefix}-prompt-${index}`}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 6px',
                            margin: '1px 0',
                            background: 'rgba(255,140,0,0.10)',
                            border: '1px solid rgba(255,140,0,0.28)',
                            color: '#7c2d12',
                            fontSize: '0.92em',
                            fontWeight: 600,
                            lineHeight: 1.35,
                        }}
                        title="AI placeholder prompt"
                    >
                        {part.slice(1, -1)}
                    </span>
                );
            })}
        </>
    );
}

function renderTableCellContent(cell: string, keyPrefix: string, context: RenderContext): React.ReactNode {
    const hasTemplatePrompt = /\[[^\]]+\]/.test(cell);
    if (hasTemplatePrompt) {
        return renderBracketPromptText(cell, keyPrefix);
    }
    return renderInlineContent(cell, keyPrefix, context);
}

function renderLinkedText(text: string, keyPrefix: string): React.ReactNode {
    const linkRe = /(https?:\/\/[^\s,)]+)|(\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b)|(\b0\d{4}\s?\d{3}\s?\d{3}\b)/g;
    if (!linkRe.test(text)) return text;
    linkRe.lastIndex = 0;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let index = 0;

    while ((match = linkRe.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        const matched = match[0];
        const href = match[1] ? matched : match[2] ? `mailto:${matched}` : `tel:${matched.replace(/\s/g, '')}`;

        parts.push(
            <a
                key={`${keyPrefix}-link-${index}`}
                href={href}
                target={match[1] ? '_blank' : undefined}
                rel={match[1] ? 'noopener noreferrer' : undefined}
                style={{
                    color: '#3690CE',
                    fontWeight: 700,
                    textDecoration: 'underline',
                    textDecorationColor: '#3690CE',
                    textUnderlineOffset: '2px',
                }}
            >
                {matched}
            </a>
        );

        lastIndex = match.index + matched.length;
        index += 1;
    }

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return <>{parts}</>;
}

function renderInlineContent(text: string, keyPrefix: string, context: RenderContext): React.ReactNode {
    const placeholderRe = /\{\{([^}]+)\}\}/g;
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = placeholderRe.exec(text)) !== null) {
        const before = text.slice(lastIdx, match.index);
        if (before) parts.push(renderLinkedText(before, `${keyPrefix}-text-${match.index}`));

        const fieldKey = String(match[1] || '').trim();
        const isInteractive = context.interactiveFieldKeys.has(fieldKey) && !!context.onFieldClick;
        const rawValue = String(context.fieldValues?.[fieldKey] || '').trim().replace(/^[•*]\s*/gm, '').trim();
        const displayValue = rawValue || `{{${fieldKey}}}`;
        const label = context.placeholderLabels?.[fieldKey] || fieldKey;
        const isActive = context.activeFieldKey === fieldKey;
        const isEditable = context.editableFieldKey === fieldKey && !!context.onFieldValueChange;
        const isMultiLine = isEditable && (rawValue.includes('\n') || rawValue.length > 80);
        const fieldState = context.fieldStates?.[fieldKey];
        const fieldElementRefs = context.fieldElementRefs;
        const statePresentation = buildFieldStatePresentation(fieldState, isInteractive, isActive);
        const titleText = [label, ...statePresentation.stateLabels].join(' · ');
        const inputWidth = rawValue
            ? `${Math.max(2, Math.min(rawValue.length + 0.5, 28))}ch`
            : `${Math.max(4, Math.min(label.length, 12))}ch`;

        parts.push(
            <span
                key={`${keyPrefix}-${fieldKey}-${match.index}`}
                ref={fieldElementRefs ? (node) => {
                    fieldElementRefs.current[fieldKey] = node;
                } : undefined}
                onClick={isInteractive ? () => context.onFieldClick?.(fieldKey) : undefined}
                title={isInteractive ? `Review ${titleText}` : titleText}
                style={{
                    background: isEditable ? 'transparent' : statePresentation.background,
                    color: statePresentation.color,
                    borderBottom: isEditable ? 'none' : statePresentation.borderBottom,
                    cursor: isInteractive ? 'pointer' : 'inherit',
                    fontWeight: isInteractive || fieldState?.isReviewed || fieldState?.isAiGenerated || fieldState?.isAiUpdated || fieldState?.isMailMergeValue ? 600 : 'inherit',
                    padding: isInteractive && !isEditable ? '0 1px' : 0,
                    borderRadius: 0,
                    display: isMultiLine ? 'block' : 'inline',
                    width: isMultiLine ? '100%' : undefined,
                    maxWidth: isMultiLine ? '100%' : undefined,
                    margin: isMultiLine ? '4px 0' : undefined,
                    verticalAlign: isMultiLine ? 'middle' : undefined,
                    boxShadow: isEditable ? 'none' : statePresentation.boxShadow,
                    transition: 'background-color 180ms ease, color 180ms ease, box-shadow 220ms ease, border-bottom-color 180ms ease',
                }}
            >
                {isEditable ? (
                    isMultiLine ? (
                    <textarea
                        value={String(context.fieldValues?.[fieldKey] || '')}
                        aria-label={label}
                        placeholder={label}
                        ref={autoSizeTextarea}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => {
                            autoSizeTextarea(event.target);
                            context.onFieldValueChange?.(fieldKey, event.target.value);
                        }}
                        rows={1}
                        style={{
                            width: '100%',
                            padding: '2px 0 3px',
                            border: 'none',
                            borderBottom: `2px solid ${isActive ? 'rgba(54,144,206,0.82)' : 'rgba(54,144,206,0.36)'}`,
                            background: isActive ? 'rgba(214,232,255,0.72)' : 'rgba(214,232,255,0.28)',
                            color: '#0f172a',
                            font: 'inherit',
                            lineHeight: 1.5,
                            resize: 'none',
                            boxSizing: 'border-box',
                            overflow: 'hidden',
                            outline: 'none',
                            borderRadius: 0,
                        }}
                    />
                    ) : (
                    <input
                        type="text"
                        value={String(context.fieldValues?.[fieldKey] || '')}
                        aria-label={label}
                        placeholder={label}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => {
                            context.onFieldValueChange?.(fieldKey, event.target.value);
                        }}
                        style={{
                            width: inputWidth,
                            minWidth: '3ch',
                            maxWidth: '100%',
                            padding: '0 1px 1px',
                            border: 'none',
                            borderBottom: `2px solid ${isActive ? 'rgba(54,144,206,0.82)' : 'rgba(54,144,206,0.36)'}`,
                            background: isActive ? 'rgba(214,232,255,0.72)' : 'rgba(214,232,255,0.28)',
                            color: '#0f172a',
                            font: 'inherit',
                            lineHeight: 'inherit',
                            boxSizing: 'border-box',
                            outline: 'none',
                            borderRadius: 0,
                        }}
                    />
                    )
                ) : (
                    renderLinkedText(displayValue, `${keyPrefix}-${fieldKey}-value-${match.index}`)
                )}
            </span>
        );

        lastIdx = placeholderRe.lastIndex;
    }

    if (lastIdx < text.length) {
        parts.push(renderLinkedText(text.slice(lastIdx), `${keyPrefix}-tail`));
    }

    return <>{parts}</>;
}

function renderSectionContent(lines: string[], sectionKey: string, context: RenderContext): React.ReactNode[] {
    const elements: React.ReactNode[] = [];
    const sectionRe = /^(\d+(?:\.\d+)?)\s+(.+)$/;
    const bulletRe = /^[—–\-•*]\s*(.+)$/;
    const checkboxRe = /^☐\s*(.+)$/;
    const tableRowRe = /^.+\|.+$/;
    let idx = 0;

    while (idx < lines.length) {
        const line = lines[idx].trimEnd();
        if (!line.trim()) {
            idx++;
            continue;
        }

        const sectionMatch = line.match(sectionRe);
        if (sectionMatch) {
            const isSubsection = sectionMatch[1].includes('.');
            elements.push(
                <div
                    key={`${sectionKey}-heading-${idx}`}
                    style={{
                        fontSize: isSubsection ? 13 : 15,
                        fontWeight: 700,
                        color: '#0D2F60',
                        lineHeight: isSubsection ? 1.4 : 1.45,
                        margin: isSubsection ? '8px 0 3px' : '6px 0 4px',
                    }}
                >
                    {sectionMatch[1]} {renderInlineContent(sectionMatch[2], `${sectionKey}-heading-text-${idx}`, context)}
                </div>
            );
            idx++;
            continue;
        }

        if (bulletRe.test(line)) {
            const bullets: string[] = [];
            while (idx < lines.length && bulletRe.test(lines[idx].trimEnd())) {
                bullets.push(lines[idx].trimEnd().replace(bulletRe, '$1'));
                idx++;
            }
            elements.push(
                <ul key={`${sectionKey}-bullets-${idx}`} style={{ margin: '6px 0 10px 8px', paddingLeft: 20, listStyleType: 'disc' }}>
                    {bullets.map((bullet, bulletIdx) => (
                        <li key={bulletIdx} style={{ marginBottom: 5, lineHeight: 1.7 }}>
                            {renderInlineContent(bullet, `${sectionKey}-bullet-${bulletIdx}`, context)}
                        </li>
                    ))}
                </ul>
            );
            continue;
        }

        // Checklist pattern: header row with | followed by ☐ rows
        if (tableRowRe.test(line)) {
            // Peek ahead: if the next non-empty line starts with ☐, render as a styled checklist
            let peekIdx = idx + 1;
            while (peekIdx < lines.length && !lines[peekIdx].trim()) peekIdx++;
            const nextIsCheckbox = peekIdx < lines.length && checkboxRe.test(lines[peekIdx].trimEnd());

            if (nextIsCheckbox) {
                // Skip the header row ("Action required by you | Additional information")
                idx++;
                const items: { action: string; info: string }[] = [];
                while (idx < lines.length) {
                    const cl = lines[idx].trimEnd();
                    if (checkboxRe.test(cl)) {
                        const raw = cl.replace(/^☐\s*/, '');
                        if (raw.includes('|')) {
                            const parts = raw.split('|').map((s) => s.trim());
                            items.push({ action: parts[0] || '', info: parts.slice(1).join(' | ') });
                        } else {
                            items.push({ action: raw.trim(), info: '' });
                        }
                        idx++;
                    } else if (!cl.trim()) {
                        idx++;
                    } else {
                        break;
                    }
                }
                if (items.length > 0) {
                    elements.push(
                        <div key={`${sectionKey}-checklist-${idx}`} style={{ margin: '8px 0 12px', display: 'grid', gap: 6 }}>
                            {items.map((item, ci) => (
                                <div key={ci} style={{
                                    display: 'flex', gap: 10, alignItems: 'flex-start',
                                    padding: '10px 14px',
                                    background: '#f8fafc',
                                    borderLeft: '3px solid #3690CE',
                                    fontSize: 12, lineHeight: 1.6,
                                }}>
                                    <span style={{
                                        flexShrink: 0, marginTop: 3,
                                        width: 14, height: 14, borderRadius: 3,
                                        border: '1.5px solid #cbd5e1',
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    }} />
                                    <div style={{ flex: 1, color: '#0f172a' }}>
                                        <span style={{ fontWeight: 600 }}>
                                            {renderInlineContent(item.action, `${sectionKey}-cb-action-${ci}`, context)}
                                        </span>
                                        {item.info && (
                                            <div style={{ color: '#64748b', fontSize: 11, marginTop: 3 }}>
                                                {renderInlineContent(item.info, `${sectionKey}-cb-info-${ci}`, context)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                }
                continue;
            }

            // Regular table (no checkboxes)
            const rows: string[][] = [];
            while (idx < lines.length && tableRowRe.test(lines[idx].trimEnd())) {
                rows.push(lines[idx].trimEnd().split('|').map((cell) => cell.trim()));
                idx++;
            }
            if (rows.length > 0) {
                const [header, ...body] = rows;
                elements.push(
                    <table key={`${sectionKey}-table-${idx}`} style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, margin: '10px 0 14px 0', fontSize: 12, color: '#0f172a', border: '1px solid rgba(13,47,96,0.10)' }}>
                        <thead>
                            <tr>
                                {header.map((cell, cellIdx) => (
                                    <th key={cellIdx} style={{ textAlign: 'left', padding: '9px 12px', borderBottom: '1px solid rgba(13,47,96,0.12)', fontWeight: 700, fontSize: 10, color: '#0D2F60', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(214,232,255,0.55)' }}>
                                        {renderTableCellContent(cell, `${sectionKey}-th-${cellIdx}`, context)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        {body.length > 0 && (
                            <tbody>
                                {body.map((row, rowIdx) => (
                                    <tr key={rowIdx} style={{ background: rowIdx % 2 === 0 ? 'rgba(255,255,255,0.98)' : 'rgba(246,250,255,0.95)' }}>
                                        {row.map((cell, cellIdx) => (
                                            <td key={cellIdx} style={{ padding: '8px 12px', borderBottom: rowIdx === body.length - 1 ? 'none' : '1px solid rgba(226,232,240,0.9)', verticalAlign: 'top', color: '#0f172a', lineHeight: 1.55 }}>
                                                {renderTableCellContent(cell, `${sectionKey}-td-${rowIdx}-${cellIdx}`, context)}
                                            </td>
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

        // Standalone checkbox lines (without |)
        if (checkboxRe.test(line)) {
            const items: { action: string; info: string }[] = [];
            while (idx < lines.length && checkboxRe.test(lines[idx].trimEnd())) {
                const raw = lines[idx].trimEnd().replace(/^☐\s*/, '');
                if (raw.includes('|')) {
                    const parts = raw.split('|').map((s) => s.trim());
                    items.push({ action: parts[0] || '', info: parts.slice(1).join(' | ') });
                } else {
                    items.push({ action: raw.trim(), info: '' });
                }
                idx++;
            }
            if (items.length > 0) {
                elements.push(
                    <div key={`${sectionKey}-standalone-cb-${idx}`} style={{ margin: '8px 0 12px', display: 'grid', gap: 6 }}>
                        {items.map((item, ci) => (
                            <div key={ci} style={{
                                display: 'flex', gap: 10, alignItems: 'flex-start',
                                padding: '10px 14px',
                                background: '#f8fafc',
                                borderLeft: '3px solid #3690CE',
                                fontSize: 12, lineHeight: 1.6,
                            }}>
                                <span style={{
                                    flexShrink: 0, marginTop: 3,
                                    width: 14, height: 14, borderRadius: 3,
                                    border: '1.5px solid #cbd5e1',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                }} />
                                <div style={{ flex: 1, color: '#0f172a' }}>
                                    <span style={{ fontWeight: 600 }}>
                                        {renderInlineContent(item.action, `${sectionKey}-scb-action-${ci}`, context)}
                                    </span>
                                    {item.info && (
                                        <div style={{ color: '#64748b', fontSize: 11, marginTop: 3 }}>
                                            {renderInlineContent(item.info, `${sectionKey}-scb-info-${ci}`, context)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                );
            }
            continue;
        }

        const paragraphLines: string[] = [];
        while (idx < lines.length && lines[idx].trim() && !sectionRe.test(lines[idx].trimEnd()) && !bulletRe.test(lines[idx].trimEnd()) && !checkboxRe.test(lines[idx].trimEnd()) && !tableRowRe.test(lines[idx].trimEnd())) {
            paragraphLines.push(lines[idx].trimEnd());
            idx++;
        }
        if (paragraphLines.length > 0) {
            elements.push(
                <div key={`${sectionKey}-p-${idx}`} style={{ margin: '0 0 10px 0', lineHeight: 1.7, whiteSpace: 'pre-wrap', textAlign: 'justify', textJustify: 'inter-word' }}>
                    {renderInlineContent(paragraphLines.join('\n'), `${sectionKey}-p-${idx}`, context)}
                </div>
            );
        }
    }

    return elements;
}

export const DocumentRenderer = ({ template, fieldValues, interactiveFieldKeys = [], activeFieldKey = null, placeholderLabels, onFieldClick, editableFieldKey = null, onFieldValueChange, fieldStates, fieldElementRefs, rootRef, pageBreaks, totalPages, contentPaddingX = 52, contentPaddingY }: DocumentRendererProps) => {
    const sections = buildDocumentSections(template);
    const context: RenderContext = {
        fieldValues,
        interactiveFieldKeys: new Set(interactiveFieldKeys),
        activeFieldKey,
        placeholderLabels,
        onFieldClick,
        editableFieldKey,
        onFieldValueChange,
        fieldStates,
        fieldElementRefs,
    };

    const topLevelSectionRe = /^(\d+)\s+(.+)$/;
    const padY = contentPaddingY || { top: 48, bottom: 56 };

    /* ── Discrete A4 page cards (desktop with page break data) ── */
    if (pageBreaks) {
        // Group sections into pages
        const pages: Array<{ startIdx: number; endIdx: number; pageNumber: number }> = [];
        if (pageBreaks.length === 0) {
            // Single page
            pages.push({ startIdx: 0, endIdx: sections.length - 1, pageNumber: 1 });
        } else {
            // First page: sections before the first break
            pages.push({ startIdx: 0, endIdx: pageBreaks[0].beforeSectionIdx - 1, pageNumber: 1 });
            for (let i = 0; i < pageBreaks.length; i++) {
                const nextEnd = i + 1 < pageBreaks.length
                    ? pageBreaks[i + 1].beforeSectionIdx - 1
                    : sections.length - 1;
                pages.push({
                    startIdx: pageBreaks[i].beforeSectionIdx,
                    endIdx: nextEnd,
                    pageNumber: pageBreaks[i].pageNumber,
                });
            }
        }

        const effectiveTotalPages = totalPages || pages.length;

        return (
            <div ref={rootRef}>
                {pages.map((page, pageIdx) => (
                    <div
                        key={`page-${page.pageNumber}`}
                        data-page-number={page.pageNumber}
                        style={{
                            background: '#ffffff',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
                            padding: `${padY.top}px ${contentPaddingX}px ${padY.bottom}px`,
                            marginBottom: pageIdx < pages.length - 1 ? 24 : 0,
                            position: 'relative',
                            minHeight: 400,
                        }}
                    >
                        {sections.slice(page.startIdx, page.endIdx + 1).map((section, localIdx) => {
                            const sectionIdx = page.startIdx + localIdx;
                            const firstLine = section.lines.find((l) => l.trim());
                            const isTopLevelSection = firstLine ? topLevelSectionRe.test(firstLine.trimEnd()) : false;
                            return (
                                <React.Fragment key={section.id}>
                                    <div data-section-idx={sectionIdx} style={{ marginBottom: isTopLevelSection ? 22 : 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                        {renderSectionContent(section.lines, `section-${sectionIdx}`, context)}
                                    </div>
                                </React.Fragment>
                            );
                        })}
                        {/* Page number footer */}
                        <span style={{
                            position: 'absolute',
                            bottom: 18,
                            left: 0,
                            right: 0,
                            textAlign: 'center',
                            fontSize: 9,
                            color: '#b0b7c0',
                            fontWeight: 500,
                            letterSpacing: '0.06em',
                            fontFamily: "'Raleway', Arial, sans-serif",
                            userSelect: 'none',
                        }}>
                            Page {page.pageNumber} of {effectiveTotalPages}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    /* ── Flat rendering (mobile / no page data) ── */
    return (
        <div ref={rootRef}>
            {sections.map((section, sectionIdx) => {
                const firstLine = section.lines.find((l) => l.trim());
                const isTopLevelSection = firstLine ? topLevelSectionRe.test(firstLine.trimEnd()) : false;
                return (
                    <React.Fragment key={section.id}>
                        <div data-section-idx={sectionIdx} style={{ marginBottom: isTopLevelSection ? 22 : 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {renderSectionContent(section.lines, `section-${sectionIdx}`, context)}
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
};
