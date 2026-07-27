/**
 * Capitalizes the first letter of a string.
 */
export const capitalize = (text: string): string => {
  if (!text) {
    return '';
  }
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

/**
 * Truncates string length with ellipsis.
 */
export const truncateString = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + '...';
};
