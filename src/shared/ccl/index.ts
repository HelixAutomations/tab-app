/**
 * Shared CCL barrel — re-exports everything both consumers need.
 */
export { DEFAULT_CCL_TEMPLATE } from './cclTemplate';
export { FIELD_DISPLAY_NAMES, FIELD_PRESETS } from './fieldMetadata';
export {
  generateTemplateContent,
  type GenerationOptions,
  type CostsChoice,
  type ChargesChoice,
  type DisbursementsChoice,
} from './templateUtils';
