import { mergeStyles } from '@fluentui/react/lib/Styling';
import { colours } from '../../app/styles/colours';

export const cardStyles = {
    root: {
        padding: 20,
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        backgroundColor: colours.light.sectionBackground,
    },
};

// A reusable surface class for report cards and sections within the
// Reporting area. Each consumer can extend this via mergeStyles if
// additional styling is required.
export const reportCardClass = mergeStyles(cardStyles.root);
export const sectionClass = mergeStyles(cardStyles.root);
