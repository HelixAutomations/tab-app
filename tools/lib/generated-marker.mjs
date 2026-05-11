// Shared marker for files written by local generators.

export const GENERATED_MARKER = 'AUTO-GENERATED - do not edit.';

export function generatedMarkdownComment(regenerateCommand) {
  const commandText = regenerateCommand ? ` Regenerate with \`${regenerateCommand}\`.` : '';
  return `<!-- ${GENERATED_MARKER}${commandText} -->\n\n`;
}

export function hasGeneratedMarker(content) {
  return String(content || '').includes(GENERATED_MARKER);
}
