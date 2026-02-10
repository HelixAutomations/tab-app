const path = require('path');
const { readFileSync, writeFileSync } = require('fs');
const createReport = require('docx-templates').default;
const JSZip = require('jszip');

// Fonts to replace with Raleway in the output .docx
const FONTS_TO_REPLACE = ['Calibri', 'Times New Roman', 'Arial', 'Cambria', 'Aptos'];

// `json` should already have any nested fields flattened so tokens like
// {{responsibleSolicitor_name}} resolve correctly.

async function generateWordFromJson(json, outPath) {
    const templatePath = path.join(process.cwd(), 'templates', 'cclTemplate.docx');
    const template = readFileSync(templatePath);
    const ctx = new Proxy({}, { get: () => () => '' });
    const buf = await createReport({
        template,
        data: json,
        cmdDelimiter: ['{{', '}}'],
        additionalJsContext: ctx
    });

    // Post-process: replace body fonts with Raleway for Helix house style
    const zip = await JSZip.loadAsync(buf);
    const xmlFiles = ['word/document.xml', 'word/styles.xml', 'word/fontTable.xml'];
    for (const fileName of xmlFiles) {
        const file = zip.file(fileName);
        if (file) {
            let xml = await file.async('string');
            for (const font of FONTS_TO_REPLACE) {
                const escaped = font.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                xml = xml.replace(new RegExp(`w:ascii="${escaped}"`, 'g'), 'w:ascii="Raleway"');
                xml = xml.replace(new RegExp(`w:hAnsi="${escaped}"`, 'g'), 'w:hAnsi="Raleway"');
                xml = xml.replace(new RegExp(`w:eastAsia="${escaped}"`, 'g'), 'w:eastAsia="Raleway"');
                // Replace font name declarations in fontTable
                xml = xml.replace(new RegExp(`w:name="${escaped}"`, 'g'), 'w:name="Raleway"');
            }
            zip.file(fileName, xml);
        }
    }
    const output = await zip.generateAsync({ type: 'nodebuffer' });
    writeFileSync(outPath, output);
}

module.exports = { generateWordFromJson };