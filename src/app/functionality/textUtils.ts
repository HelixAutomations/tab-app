const MAX_CHARACTERS = 150; // Adjust this based on your card width and design

export const cleanNotes = (notes: string): string => {
  if (!notes) return 'N/A';

  // Replace line breaks (\n) with spaces
  let cleaned = notes.replace(/\\n/g, ' ');

  // Remove HTML-like tags (e.g., <image.png>)
  cleaned = cleaned.replace(/<.*?>/g, '');

  // Truncate to MAX_CHARACTERS and add ellipsis if necessary
  return cleaned.length > MAX_CHARACTERS
    ? cleaned.substring(0, MAX_CHARACTERS).trim() + '...'
    : cleaned;
};
