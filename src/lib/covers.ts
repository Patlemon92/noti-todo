import type { CSSProperties } from 'react';
import type { CoverColor, CoverPattern, NoteCover, PastelColor } from './types';

/** Selectable cover fills, in shelf order. Kraft first — the default. */
export const COVER_COLORS: CoverColor[] = [
  'kraft',
  'peach',
  'butter',
  'mint',
  'lavender',
  'sky',
  'rose',
  'coral',
  'ink',
];

export const COVER_PATTERNS: { id: CoverPattern; label: string }[] = [
  { id: 'blank', label: 'blank' },
  { id: 'dotted', label: 'dots' },
  { id: 'lined', label: 'lines' },
  { id: 'grid', label: 'grid' },
];

export interface CoverStyle {
  /** cover face fill */
  fill: string;
  /** ink used for furniture (binding, elastic) + footer text */
  ink: string;
  /** softer footer text on the cover */
  inkSoft: string;
}

const STYLES: Record<CoverColor, CoverStyle> = {
  kraft: { fill: '#c8a06a', ink: '#2a2520', inkSoft: '#5c4a33' },
  peach: { fill: '#fde0d4', ink: '#2a2520', inkSoft: '#8a6a5a' },
  butter: { fill: '#fbebbc', ink: '#2a2520', inkSoft: '#8a7a4a' },
  mint: { fill: '#d9ecdc', ink: '#2a2520', inkSoft: '#5a7a60' },
  lavender: { fill: '#e4dcf2', ink: '#2a2520', inkSoft: '#6a5a8a' },
  sky: { fill: '#d9e7ef', ink: '#2a2520', inkSoft: '#5a7080' },
  rose: { fill: '#f5d6d6', ink: '#2a2520', inkSoft: '#8a5a5a' },
  coral: { fill: '#e88562', ink: '#fff8f0', inkSoft: '#fbe3d8' },
  ink: { fill: '#2a2520', ink: '#f3ebd9', inkSoft: '#b8ae9d' },
};

export function coverStyle(cover?: NoteCover | null): CoverStyle {
  return STYLES[cover?.color ?? 'kraft'] ?? STYLES.kraft;
}

const RIBBON_HEX: Record<PastelColor, string> = {
  peach: '#e88562',
  butter: '#e8c75f',
  mint: '#7fb389',
  lavender: '#a896d4',
  sky: '#8db4c8',
  rose: '#d48a8a',
};

export function ribbonHex(c: PastelColor): string {
  return RIBBON_HEX[c] ?? RIBBON_HEX.peach;
}

/** Ribbon picker options ('none' first). */
export const RIBBON_COLORS: PastelColor[] = [
  'peach',
  'butter',
  'mint',
  'lavender',
  'sky',
  'rose',
];

/**
 * Deterministic cover color from a note id, so a shelf of notebooks that have
 * never had a cover set still looks varied instead of a wall of identical kraft.
 */
export function autoCoverColor(id: string): CoverColor {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const pool: CoverColor[] = ['kraft', 'peach', 'butter', 'mint', 'lavender', 'sky', 'rose'];
  return pool[h % pool.length];
}

/** The cover a note shows — its saved cover, or a stable auto one. */
export function resolveCover(cover: NoteCover | undefined, id: string): NoteCover {
  return cover ?? { color: autoCoverColor(id) };
}

/** Subtle paper-pattern overlay drawn on top of the cover fill. */
export function coverPatternStyle(
  pattern: CoverPattern | undefined,
  ink: string,
): CSSProperties {
  switch (pattern) {
    case 'dotted':
      return {
        backgroundImage: `radial-gradient(circle at 1px 1px, ${ink} 1px, transparent 0)`,
        backgroundSize: '12px 12px',
        opacity: 0.12,
      };
    case 'lined':
      return {
        backgroundImage: `repeating-linear-gradient(0deg, transparent 0 15px, ${ink} 15px 16px)`,
        opacity: 0.1,
      };
    case 'grid':
      return {
        backgroundImage: `repeating-linear-gradient(0deg, transparent 0 13px, ${ink} 13px 14px), repeating-linear-gradient(90deg, transparent 0 13px, ${ink} 13px 14px)`,
        opacity: 0.09,
      };
    default:
      return { display: 'none' };
  }
}
