const path = require('path');
const { inflateRawSync } = require('zlib');
const { trackEvent, trackException, trackMetric } = require('./appInsights');

const DOCX_QA_REQUIRED_PARTS = [
    '[Content_Types].xml',
    '_rels/.rels',
    'docProps/core.xml',
    'word/document.xml',
    'word/_rels/document.xml.rels',
];

const DOCX_INTERNAL_LEAKAGE_PATTERNS = [
    { code: 'ai_trace_id', pattern: /\b(aiTraceId|ai_trace_id)\b/i },
    { code: 'prompt_version', pattern: /\b(promptVersion|prompt_version)\b/i },
    { code: 'system_prompt', pattern: /\b(systemPrompt|system prompt|developer prompt|user prompt)\b/i },
    { code: 'compile_trace', pattern: /\b(compileTrace|contextPackage|context_package)\b/i },
    { code: 'template_source', pattern: /\b(DEFAULT_CCL_TEMPLATE|TEMPLATE_FIELDS)\b/i },
    { code: 'provenance_payload', pattern: /\b(_provenance|provenanceJson|sourceBundle)\b/i },
];

function findEndOfCentralDirectory(buffer) {
    const minOffset = Math.max(0, buffer.length - 65557);
    for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
        if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
    }
    throw new Error('DOCX end of central directory not found');
}

function readZipEntryData(buffer, entry) {
    if (buffer.readUInt32LE(entry.localHeaderOffset) !== 0x04034b50) {
        throw new Error(`Invalid local header for ${entry.name}`);
    }
    const fileNameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
    const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
    const dataStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
    const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

    if (entry.method === 0) return compressed;
    if (entry.method === 8) return inflateRawSync(compressed);
    throw new Error(`Unsupported compression method ${entry.method} for ${entry.name}`);
}

function readDocxXmlEntries(buffer) {
    const endOffset = findEndOfCentralDirectory(buffer);
    const entryCount = buffer.readUInt16LE(endOffset + 10);
    let offset = buffer.readUInt32LE(endOffset + 16);
    const entries = new Map();

    for (let index = 0; index < entryCount; index += 1) {
        if (buffer.readUInt32LE(offset) !== 0x02014b50) {
            throw new Error(`Invalid central directory entry ${index}`);
        }

        const flags = buffer.readUInt16LE(offset + 8);
        const method = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const fileNameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localHeaderOffset = buffer.readUInt32LE(offset + 42);
        const name = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength).replace(/\\/g, '/');

        if ((flags & 0x1) === 0x1) {
            throw new Error(`Encrypted DOCX part is not supported: ${name}`);
        }

        if (name.endsWith('.xml') || name.endsWith('.rels')) {
            const data = readZipEntryData(buffer, { name, method, compressedSize, localHeaderOffset });
            entries.set(name, data.toString('utf8'));
        }

        offset += 46 + fileNameLength + extraLength + commentLength;
    }

    return entries;
}

function qaIssue(code, message, part = null, count = null) {
    return { code, message, part, count };
}

function countMatches(text, pattern) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    return (String(text || '').match(new RegExp(pattern.source, flags)) || []).length;
}

function inspectGeneratedDocx(buffer, unresolvedPlaceholders = []) {
    const start = Date.now();
    const errors = [];
    const warnings = [];
    let entries = new Map();

    try {
        entries = readDocxXmlEntries(buffer);
    } catch (error) {
        errors.push(qaIssue('zip_read_failed', error.message));
    }

    const missingParts = DOCX_QA_REQUIRED_PARTS.filter((part) => !entries.has(part));
    for (const part of missingParts) {
        errors.push(qaIssue('required_part_missing', `Missing required DOCX part: ${part}`, part));
    }

    const documentXml = entries.get('word/document.xml') || '';
    const coreXml = entries.get('docProps/core.xml') || '';
    const packageXml = [...entries.entries()]
        .filter(([name]) => name.startsWith('word/') || name.startsWith('docProps/'))
        .map(([, value]) => value)
        .join('\n');

    if (!documentXml.trim()) {
        errors.push(qaIssue('document_xml_empty', 'DOCX document.xml is empty or unreadable', 'word/document.xml'));
    }

    const unresolvedTokenCount = countMatches(packageXml, /\{\{[^}]+\}\}|&lt;&lt;[^&]+&gt;&gt;|<<[^>]+>>/g);
    if (unresolvedTokenCount > 0) {
        errors.push(qaIssue('unresolved_tokens_in_package', 'Generated DOCX still contains unresolved template tokens', null, unresolvedTokenCount));
    }

    for (const { code, pattern } of DOCX_INTERNAL_LEAKAGE_PATTERNS) {
        const matchCount = countMatches(packageXml, pattern);
        if (matchCount > 0) {
            errors.push(qaIssue(`internal_${code}`, 'Generated DOCX contains internal production metadata text', null, matchCount));
        }
    }

    const commentParts = [...entries.keys()].filter((name) => /^word\/comments/i.test(name));
    const commentMarkupCount = countMatches(packageXml, /<w:comment(?:\s|RangeStart|RangeEnd|Reference)\b/g);
    if (commentMarkupCount > 0) {
        errors.push(qaIssue('comments_present', 'Generated DOCX contains Word comments', commentParts[0] || 'word/document.xml', commentMarkupCount));
    }

    const trackedChangeCount = countMatches(packageXml, /<w:(?:ins|del|moveFrom|moveTo)\b/g);
    if (trackedChangeCount > 0) {
        errors.push(qaIssue('tracked_changes_present', 'Generated DOCX contains tracked-change markup', 'word/document.xml', trackedChangeCount));
    }

    const hiddenTextCount = countMatches(packageXml, /<w:(?:vanish|webHidden)\b/g);
    if (hiddenTextCount > 0) {
        errors.push(qaIssue('hidden_text_present', 'Generated DOCX contains hidden text markup', 'word/document.xml', hiddenTextCount));
    }

    if (!/<dc:title>[^<]*Client Care Letter/i.test(coreXml)) {
        errors.push(qaIssue('core_title_missing', 'DOCX core metadata is missing the Client Care Letter title', 'docProps/core.xml'));
    }
    if (!/<dc:creator>[^<]*Helix Hub/i.test(coreXml)) {
        errors.push(qaIssue('core_creator_missing', 'DOCX core metadata is missing the Helix Hub creator', 'docProps/core.xml'));
    }
    if (!/<dc:subject>[^<]*Client Care Letter/i.test(coreXml)) {
        warnings.push(qaIssue('core_subject_missing', 'DOCX core metadata is missing the Client Care Letter subject', 'docProps/core.xml'));
    }
    if (!/<cp:keywords>[^<]*legal services/i.test(coreXml)) {
        warnings.push(qaIssue('core_keywords_missing', 'DOCX core metadata is missing expected legal-services keywords', 'docProps/core.xml'));
    }

    if (unresolvedPlaceholders.length > 0) {
        warnings.push(qaIssue('missing_template_values', 'Template had empty source values that resolved to blanks', null, unresolvedPlaceholders.length));
    }

    return {
        ok: errors.length === 0,
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
        partCount: entries.size,
        requiredPartCount: DOCX_QA_REQUIRED_PARTS.length,
        errors,
        warnings,
        errorCount: errors.length,
        warningCount: warnings.length,
        checks: {
            requiredPartsMissing: missingParts.length,
            unresolvedTokenCount,
            commentPartCount: commentParts.length,
            trackedChangeCount,
            hiddenTextCount,
        },
    };
}

function trackDocumentQa(documentQa, outPath) {
    const props = {
        outputId: path.basename(outPath || '', '.docx'),
        ok: String(documentQa.ok),
        durationMs: String(documentQa.durationMs),
        errorCount: String(documentQa.errorCount),
        warningCount: String(documentQa.warningCount),
        requiredPartsMissing: String(documentQa.checks.requiredPartsMissing),
        unresolvedTokenCount: String(documentQa.checks.unresolvedTokenCount),
        trackedChangeCount: String(documentQa.checks.trackedChangeCount),
        hiddenTextCount: String(documentQa.checks.hiddenTextCount),
    };

    trackEvent(documentQa.ok ? 'CCL.DocumentQa.Completed' : 'CCL.DocumentQa.Failed', props);
    trackMetric('CCL.DocumentQa.Duration', documentQa.durationMs, { outputId: props.outputId });
}

function createDocumentQaError(documentQa) {
    const issueCodes = documentQa.errors.map((issue) => issue.code).join(', ') || 'unknown';
    const error = new Error(`CCL DOCX QA failed: ${issueCodes}`);
    error.code = 'CCL_DOCUMENT_QA_FAILED';
    error.documentQa = documentQa;
    return error;
}

function runCclDocumentQa(buffer, unresolvedPlaceholders, outPath) {
    const documentQa = inspectGeneratedDocx(buffer, unresolvedPlaceholders);
    trackDocumentQa(documentQa, outPath);

    if (!documentQa.ok) {
        const qaError = createDocumentQaError(documentQa);
        trackException(qaError, {
            operation: 'CCL.DocumentQa',
            phase: 'postGeneration',
            outputId: path.basename(outPath || '', '.docx'),
        });
        throw qaError;
    }

    return documentQa;
}

module.exports = {
    runCclDocumentQa,
};
