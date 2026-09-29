import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function parseHSL(hslStr: string): [number, number, number] {
  const parts = hslStr.trim().replace(/%/g, '').split(' ').filter(Boolean);
  if (parts.length !== 3) throw new Error(`Invalid HSL: ${hslStr}`);
  return [parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2])];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function extractTokens(cssContent: string, blockName: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  
  let blockStart = -1;
  if (blockName === ':root') {
    blockStart = cssContent.indexOf(':root {');
  } else {
    blockStart = cssContent.indexOf('.dark {');
  }
  
  if (blockStart === -1) return tokens;
  
  const blockEnd = cssContent.indexOf('}', blockStart);
  const blockContent = cssContent.substring(blockStart, blockEnd);
  
  const lines = blockContent.split('\n');
  for (const line of lines) {
    const match = line.match(/--([\w-]+):\s*([^;]+);/);
    if (match) {
      tokens[match[1]] = match[2].trim();
    }
  }
  
  return tokens;
}

describe('Theme Color Tokens Contrast', () => {
  it('should meet WCAG AA contrast requirements in light and dark mode', () => {
    const cssPath = path.resolve(__dirname, '../app/globals.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    
    const lightTokens = extractTokens(cssContent, ':root');
    const darkTokens = extractTokens(cssContent, '.dark');
    
    const tokenPairsToCheck = [
      { bg: 'background', fg: 'foreground', isLargeText: false },
      { bg: 'card', fg: 'card-foreground', isLargeText: false },
      { bg: 'popover', fg: 'popover-foreground', isLargeText: false },
      { bg: 'primary', fg: 'primary-foreground', isLargeText: false },
      { bg: 'secondary', fg: 'secondary-foreground', isLargeText: false },
      { bg: 'muted', fg: 'muted-foreground', isLargeText: false },
      { bg: 'accent', fg: 'accent-foreground', isLargeText: false },
      { bg: 'destructive', fg: 'destructive-foreground', isLargeText: false },
    ];
    
    const failures: string[] = [];
    
    const checkPairs = (tokens: Record<string, string>, theme: string) => {
      for (const pair of tokenPairsToCheck) {
        const bgHsl = tokens[pair.bg];
        const fgHsl = tokens[pair.fg];
        
        if (!bgHsl || !fgHsl) continue;
        
        const [bgH, bgS, bgL] = parseHSL(bgHsl);
        const [fgH, fgS, fgL] = parseHSL(fgHsl);
        
        const bgRgb = hslToRgb(bgH, bgS, bgL);
        const fgRgb = hslToRgb(fgH, fgS, fgL);
        
        const bgLuminance = getLuminance(bgRgb[0], bgRgb[1], bgRgb[2]);
        const fgLuminance = getLuminance(fgRgb[0], fgRgb[1], fgRgb[2]);
        
        const ratio = getContrastRatio(bgLuminance, fgLuminance);
        const requiredRatio = pair.isLargeText ? 3.0 : 4.5;
        
        if (ratio < requiredRatio) {
          failures.push(`[${theme}] Pair ${pair.bg} / ${pair.fg} failed WCAG AA. Ratio: ${ratio.toFixed(2)}:1 (Required: ${requiredRatio}:1). Colors: ${bgHsl} / ${fgHsl}`);
        }
      }
    };
    
    checkPairs(lightTokens, 'Light Theme');
    checkPairs(darkTokens, 'Dark Theme');
    
    if (failures.length > 0) {
      throw new Error(`\nContrast test failed for the following token pairs:\n${failures.join('\n')}\n`);
    }
  });
});
