const path = require('path');
const { readFileSync, writeFileSync } = require('fs');
const {
    AlignmentType,
    BorderStyle,
    Document,
    ExternalHyperlink,
    Footer,
    HeadingLevel,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    UnderlineType,
    VerticalAlign,
    WidthType,
} = require('docx');

const HELIX = {
    websiteBlue: '000319',
    darkBlue: '061733',
    helixBlue: '0D2F60',
    highlight: '3690CE',
    grey: 'F4F4F6',
    greyText: '6B6B6B',
    cta: 'D65541',
};

const FONT_FAMILY = 'Raleway';
const BODY_SIZE = 20; // 10pt in half-points
const SMALL_SIZE = 18; // 9pt
const META_SIZE = 19; // 9.5pt
const HEADING_SIZE = 20; // 10pt bold
const BRAND_SIZE = 30; // 15pt
const BODY_LINE = 276; // ~1.15 line spacing
const BODY_AFTER = 120;
const PAGE_MARGIN = 1440;
const LINK_RE = /(https?:\/\/[^\s,)]+)|(\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b)|(\b0\d{4}\s?\d{3}\s?\d{3}\b)/g;

const FIRM_SIGNATURE_CONTACT = 'Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE  \u00B7  0345 314 2044  \u00B7  info@helix-law.com  \u00B7  www.helix-law.com';
const FIRM_REGULATORY_PARAGRAPH = 'Helix Law Limited is a limited liability company registered in England and Wales. Registration Number 07845461. A list of Directors is available for inspection at the Registered Office: Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE. Authorised and regulated by the Solicitors Regulation Authority. Helix\u00AE and Helix Law\u00AE are registered trademarks (UK00003984532 and UK00003984535).';

const TEMPLATE_FIELDS = [
    'insert_clients_name', 'client_address', 'client_email', 'letter_date',
    'matter_number', 'matter', 'insert_heading_eg_matter_description',
    'name_of_person_handling_matter', 'status', 'name_of_handler', 'handler',
    'email', 'fee_earner_email', 'fee_earner_phone', 'fee_earner_postal_address',
    'name', 'names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries',
    'insert_current_position_and_scope_of_retainer', 'next_steps',
    'realistic_timescale', 'next_stage', 'may_will', 'figure',
    'handler_hourly_rate', 'charges_estimate_paragraph', 'disbursements_paragraph',
    'costs_other_party_paragraph', 'figure_or_range', 'estimate',
    'in_total_including_vat_or_for_the_next_steps_in_your_matter',
    'give_examples_of_what_your_estimate_includes_eg_accountants_report_and_court_fees',
    'and_or_intervals_eg_every_three_months',
    'we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible',
    'identify_the_other_party_eg_your_opponents', 'simple_disbursements_estimate',
    'explain_the_nature_of_your_arrangement_with_any_introducer_for_link_to_sample_wording_see_drafting_note_referral_and_fee_sharing_arrangement',
    'instructions_link', 'contact_details_for_marketing_opt_out',
    'state_amount', 'insert_consequence',
    'insert_next_step_you_would_like_client_to_take', 'state_why_this_step_is_important',
    'describe_first_document_or_information_you_need_from_your_client',
    'describe_second_document_or_information_you_need_from_your_client',
    'describe_third_document_or_information_you_need_from_your_client',
    'link_to_preference_centre',
];

let cachedCanonicalTemplate = null;

function normalizeTemplateValue(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value.replace(/\r\n/g, '\n').trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
        return value
            .map((entry) => (entry == null ? '' : String(entry).trim()))
            .filter(Boolean)
            .join(', ');
    }
    return '';
}

function getCanonicalTemplate() {
    if (cachedCanonicalTemplate) return cachedCanonicalTemplate;

    const sourcePath = path.join(process.cwd(), 'src', 'tabs', 'instructions', 'templates', 'cclTemplate.ts');
    const source = readFileSync(sourcePath, 'utf8');
    const match = source.match(/export const DEFAULT_CCL_TEMPLATE = `([\s\S]*?)`;\s*$/);
    if (!match) {
        throw new Error('Unable to load canonical CCL template text');
    }

    cachedCanonicalTemplate = match[1].replace(/\r\n/g, '\n');
    return cachedCanonicalTemplate;
}

function buildTemplateData(json) {
    const data = {};
    for (const key of TEMPLATE_FIELDS) data[key] = '';
    for (const key of Object.keys(data)) {
        data[key] = normalizeTemplateValue(json?.[key]);
    }

    if (!data.state_amount && data.figure) data.state_amount = data.figure;
    if (!data.figure && data.state_amount) data.figure = data.state_amount;

    return data;
}

function extractPlaceholders(templateText) {
    return [...new Set(
        [...templateText.matchAll(/\{\{([^}]+)\}\}/g)]
            .map((match) => String(match[1] || '').trim())
            .filter(Boolean)
    )];
}

function resolveTemplateText(templateText, data) {
    return templateText
        .replace(/\{\{([^}]+)\}\}/g, (_, key) => normalizeTemplateValue(data[key]))
        .replace(/<<\s*Matter\.Number\s*>>/g, data.matter_number || '')
        .replace(/<<[^>]+>>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function bodyRun(text, options = {}) {
    return new TextRun({
        text,
        font: FONT_FAMILY,
        size: options.size || BODY_SIZE,
        bold: !!options.bold,
        color: options.color || HELIX.darkBlue,
        italics: !!options.italics,
        allCaps: !!options.allCaps,
    });
}

function buildInlineChildren(text, options = {}) {
    const value = String(text || '');
    if (!LINK_RE.test(value)) return [bodyRun(value, options)];
    LINK_RE.lastIndex = 0;

    const children = [];
    let lastIndex = 0;
    let match;

    while ((match = LINK_RE.exec(value)) !== null) {
        if (match.index > lastIndex) {
            children.push(bodyRun(value.slice(lastIndex, match.index), options));
        }

        const matched = match[0];
        const link = match[1] ? matched : match[2] ? `mailto:${matched}` : `tel:${matched.replace(/\s/g, '')}`;
        children.push(
            new ExternalHyperlink({
                link,
                children: [
                    new TextRun({
                        text: matched,
                        font: FONT_FAMILY,
                        size: options.size || BODY_SIZE,
                        bold: true,
                        color: HELIX.highlight,
                        underline: { type: UnderlineType.SINGLE, color: HELIX.highlight },
                        italics: !!options.italics,
                    }),
                ],
            })
        );

        lastIndex = match.index + matched.length;
    }

    if (lastIndex < value.length) {
        children.push(bodyRun(value.slice(lastIndex), options));
    }

    return children;
}

function paragraph(text, options = {}) {
    return new Paragraph({
        children: buildInlineChildren(text, options),
        alignment: options.alignment || AlignmentType.JUSTIFIED,
        heading: options.heading,
        spacing: options.spacing || {
            line: BODY_LINE,
            after: options.after != null ? options.after : BODY_AFTER,
            before: options.before != null ? options.before : 0,
        },
        border: options.border,
        indent: options.indent,
    });
}

function buildAddressLines(value) {
    const normalized = normalizeTemplateValue(value);
    if (!normalized) return [];
    if (normalized.includes('\n')) {
        return normalized.split('\n').map((line) => line.trim()).filter(Boolean);
    }
    return normalized.split(',').map((line) => line.trim()).filter(Boolean);
}

function buildHeaderChildren(data) {
    const clientName = data.insert_clients_name || 'Sir / Madam';
    const matterHeading = data.insert_heading_eg_matter_description || 'Client Care Letter';
    const clientAddressLines = buildAddressLines(data.client_address);
    const brandContactLines = [
        '01273 761990',
        'helix-law.com',
        'Second Floor, Britannia House',
        '21 Station Street, Brighton',
        'BN1 4DE',
    ];
    const matterMetaLines = [
        `Our Reference ${data.matter_number || ''}`.trim(),
        data.fee_earner_email ? `Email ${data.fee_earner_email}` : '',
        data.letter_date ? `Date ${data.letter_date}` : '',
    ].filter(Boolean);

    const children = [
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            width: { size: 58, type: WidthType.PERCENTAGE },
                            borders: {
                                top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                                right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                                bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                                left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                            },
                            children: [
                                new Paragraph({
                                    children: [bodyRun('HELIX LAW', { size: BRAND_SIZE, bold: true, color: HELIX.darkBlue, allCaps: true })],
                                    spacing: { after: 80 },
                                }),
                            ],
                        }),
                        new TableCell({
                            width: { size: 42, type: WidthType.PERCENTAGE },
                            borders: {
                                top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                                right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                                bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                                left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                            },
                            children: brandContactLines.map((line, index) => paragraph(line, {
                                alignment: AlignmentType.RIGHT,
                                size: index === 0 ? META_SIZE : SMALL_SIZE,
                                bold: index === 0,
                                color: index === 0 ? HELIX.helixBlue : HELIX.greyText,
                                after: index === brandContactLines.length - 1 ? 0 : 30,
                            })),
                        }),
                    ],
                }),
            ],
        }),
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            width: { size: 58, type: WidthType.PERCENTAGE },
                            borders: {
                                top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                                right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                                bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                                left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                            },
                            children: [clientName, ...clientAddressLines].filter(Boolean).map((line, index) => paragraph(line, {
                                alignment: AlignmentType.LEFT,
                                size: META_SIZE,
                                bold: index === 0,
                                after: index === clientAddressLines.length ? 30 : 20,
                            })),
                        }),
                        new TableCell({
                            width: { size: 42, type: WidthType.PERCENTAGE },
                            borders: {
                                top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                                right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                                bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                                left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                            },
                            children: matterMetaLines.map((line, index) => paragraph(line, {
                                alignment: AlignmentType.RIGHT,
                                size: META_SIZE,
                                after: index === matterMetaLines.length - 1 ? 0 : 40,
                            })),
                        }),
                    ],
                }),
            ],
        }),
    ];

    if (data.client_email) {
        children.push(paragraph(`BY EMAIL ONLY - ${data.client_email}`, { alignment: AlignmentType.LEFT, size: META_SIZE, after: 140 }));
    }

    children.push(
        paragraph(`Dear ${clientName}`, {
            alignment: AlignmentType.LEFT,
            bold: true,
            after: 120,
        }),
        paragraph(matterHeading, {
            alignment: AlignmentType.LEFT,
            bold: true,
            color: HELIX.helixBlue,
            after: 180,
        }),
    );

    return children;
}

function buildBulletParagraph(text) {
    const cleaned = text.replace(/^[—o]\s*/, '').replace(/^☐\s*/, '').trim();
    return new Paragraph({
        children: buildInlineChildren(cleaned),
        bullet: { level: 0 },
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: BODY_LINE, after: 80 },
    });
}

function buildSectionHeading(text) {
    return new Paragraph({
        children: [bodyRun(text, { bold: true, color: HELIX.helixBlue, size: HEADING_SIZE })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 220, after: 90 },
        border: {
            bottom: {
                color: HELIX.highlight,
                style: BorderStyle.SINGLE,
                size: 4,
                space: 4,
            },
        },
    });
}

function buildActionTable(rows) {
    const headerCell = (text) => new TableCell({
        shading: { fill: HELIX.helixBlue, type: ShadingType.CLEAR, color: 'FFFFFF' },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        children: [
            new Paragraph({
                children: [bodyRun(text, { bold: true, color: 'FFFFFF' })],
                alignment: AlignmentType.LEFT,
                spacing: { after: 0, before: 0, line: BODY_LINE },
            }),
        ],
    });

    const bodyCell = (text) => {
        const lines = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
        const paragraphs = [];

        if (lines.length === 0) {
            paragraphs.push(new Paragraph({ children: [bodyRun(' ')], spacing: { after: 0, before: 0, line: BODY_LINE } }));
        } else {
            const [firstLine, ...rest] = lines;
            paragraphs.push(new Paragraph({
                children: buildInlineChildren(firstLine),
                alignment: AlignmentType.JUSTIFIED,
                spacing: { after: rest.length > 0 ? 40 : 0, before: 0, line: BODY_LINE },
            }));

            rest.forEach((line) => {
                const cleaned = line.replace(/^[•*—–\-]\s*/, '').trim();
                if (!cleaned) return;
                paragraphs.push(new Paragraph({
                    children: buildInlineChildren(cleaned),
                    bullet: { level: 0 },
                    alignment: AlignmentType.JUSTIFIED,
                    indent: { left: 360, hanging: 180 },
                    spacing: { after: 40, before: 0, line: BODY_LINE },
                }));
            });
        }

        return new TableCell({
            verticalAlign: VerticalAlign.TOP,
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            children: paragraphs,
        });
    };

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: HELIX.highlight },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: HELIX.highlight },
            left: { style: BorderStyle.SINGLE, size: 2, color: HELIX.greyText },
            right: { style: BorderStyle.SINGLE, size: 2, color: HELIX.greyText },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: HELIX.grey },
            insideVertical: { style: BorderStyle.SINGLE, size: 2, color: HELIX.grey },
        },
        rows: [
            new TableRow({
                tableHeader: true,
                children: [
                    headerCell('Action required by you'),
                    headerCell('Additional information'),
                ],
            }),
            ...rows.map((row) => new TableRow({
                children: [
                    bodyCell(`☐ ${row.action}`),
                    bodyCell(row.info),
                ],
            })),
        ],
    });
}

function buildBodyChildren(bodyText) {
    const lines = bodyText.split('\n');
    const children = [];

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (!line) continue;

        if (line === 'Action required by you | Additional information') {
            const rows = [];
            index += 1;
            while (index < lines.length) {
                const rowLine = lines[index].trim();
                if (!rowLine) {
                    index += 1;
                    continue;
                }
                if (!rowLine.startsWith('☐') || !rowLine.includes('|')) {
                    index -= 1;
                    break;
                }
                const [left, ...rest] = rowLine.split('|');
                const additionalLines = [];
                if (left.includes('Provide the following documents')) {
                    let nextIndex = index + 1;
                    while (nextIndex < lines.length) {
                        const nextLine = lines[nextIndex].trim();
                        if (!nextLine) break;
                        if (nextLine.startsWith('☐') || /^\d+(?:\.\d+)?\s+/.test(nextLine) || nextLine.includes('|')) break;
                        additionalLines.push(nextLine.replace(/^[•*—–\-]\s*/, '').trim());
                        nextIndex += 1;
                    }
                    if (additionalLines.length > 0) {
                        index = nextIndex - 1;
                    }
                }
                rows.push({
                    action: [left.replace(/^☐\s*/, '').trim(), ...additionalLines.map((line) => `• ${line}`)].filter(Boolean).join('\n'),
                    info: rest.join('|').trim(),
                });
                index += 1;
            }
            if (rows.length > 0) {
                children.push(buildActionTable(rows));
            }
            continue;
        }

        if (/^\d+(?:\.\d+)?\s+/.test(line)) {
            children.push(buildSectionHeading(line));
            continue;
        }

        if (/^[—o]\s+/.test(line) || line.startsWith('☐ ')) {
            children.push(buildBulletParagraph(line));
            continue;
        }

        children.push(paragraph(line));
    }

    return children;
}

function buildDocument(data) {
    const templateText = getCanonicalTemplate();
    const unresolvedPlaceholders = extractPlaceholders(templateText)
        .filter((key) => !String(data[key] || '').trim());
    const resolvedText = resolveTemplateText(templateText, data);
    const bodyStart = resolvedText.indexOf('Thank you for your instructions');
    const bodyText = bodyStart >= 0 ? resolvedText.slice(bodyStart).trim() : resolvedText;

    const doc = new Document({
        creator: 'Helix Hub',
        title: `Client Care Letter ${data.matter_number || ''}`.trim(),
        description: 'Helix Law Client Care Letter',
        styles: {
            default: {
                document: {
                    run: {
                        font: FONT_FAMILY,
                        size: BODY_SIZE,
                        color: HELIX.darkBlue,
                    },
                    paragraph: {
                        spacing: {
                            line: BODY_LINE,
                            after: BODY_AFTER,
                        },
                    },
                },
            },
        },
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: PAGE_MARGIN,
                        right: PAGE_MARGIN,
                        bottom: PAGE_MARGIN,
                        left: PAGE_MARGIN,
                    },
                },
                titlePage: true,
            },
            footers: {
                first: new Footer({
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 0, after: 80, line: 240 },
                            border: {
                                top: { style: BorderStyle.SINGLE, size: 4, color: 'D5DBE3', space: 6 },
                            },
                            children: [
                                new TextRun({ text: FIRM_SIGNATURE_CONTACT, font: FONT_FAMILY, size: 15, color: HELIX.greyText }),
                            ],
                        }),
                        new Paragraph({
                            alignment: AlignmentType.JUSTIFIED,
                            spacing: { before: 0, after: 0, line: 220 },
                            children: [
                                new TextRun({ text: FIRM_REGULATORY_PARAGRAPH, font: FONT_FAMILY, size: 13, color: HELIX.greyText, italics: true }),
                            ],
                        }),
                    ],
                }),
            },
            children: [
                ...buildHeaderChildren(data),
                ...buildBodyChildren(bodyText),
            ],
        }],
    });

    return { doc, unresolvedPlaceholders };
}

async function generateWordFromJson(json, outPath) {
    const data = buildTemplateData(json);
    const { doc, unresolvedPlaceholders } = buildDocument(data);
    const buffer = await Packer.toBuffer(doc);
    writeFileSync(outPath, buffer);

    return {
        unresolvedPlaceholders,
        unresolvedCount: unresolvedPlaceholders.length,
    };
}

module.exports = { generateWordFromJson };
