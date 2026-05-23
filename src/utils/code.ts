/**
 * Normalize code text returned by AI or legacy data paths before rendering or previewing.
 */
export function normalizeCode(raw: string): string {
  if (!raw) return raw;

  let code = raw;

  if (!code.includes('\n') && code.includes('\\n')) {
    code = code.replace(/\\n/g, '\n');
  }

  const regexEscapes = code.match(/\\(?=[\[\]{}()*+?^$.|])/g);
  if (regexEscapes && regexEscapes.length >= 3) {
    code = code.replace(/\\([\[\]{}()*+?^$.|])/g, '$1');
  }

  return code;
}
