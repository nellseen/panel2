/**
 * NodePanel Design System Tokens
 * Aesthetic: Premium Black Modern Developer Console
 */

export const designTokens = {
  colors: {
    canvas: '#08090B',
    surface1: '#0E1014',
    surface2: '#14171D',
    surface3: '#1B1F27',
    borderSubtle: '#1F242D',
    borderDefault: '#2B313D',
    borderStrong: '#3A4252',
    textPrimary: '#F3F5F8',
    textSecondary: '#A2AAB8',
    textMuted: '#697386',
    accent: {
      DEFAULT: '#10B981',
      hover: '#34D399',
      muted: 'rgba(16, 185, 129, 0.12)',
      border: 'rgba(16, 185, 129, 0.32)',
    },
    status: {
      success: '#10B981',
      warning: '#F59E0B',
      danger: '#EF4444',
      info: '#38BDF8',
      neutral: '#8A94A6',
    },
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.5rem',
    '2xl': '2rem',
  },
  radii: {
    sm: '0.375rem', // 6px
    md: '0.5rem',   // 8px
    lg: '0.75rem',  // 12px
    xl: '1rem',     // 16px
  },
  typography: {
    fontSans: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontMono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  shadows: {
    panel: '0 1px 2px 0 rgba(0, 0, 0, 0.5)',
    overlay: '0 20px 45px -10px rgba(0, 0, 0, 0.78)',
  },
  zIndex: {
    header: 30,
    drawer: 40,
    dropdown: 50,
    modal: 60,
    toast: 70,
    tooltip: 80,
  },
  motion: {
    fast: '140ms cubic-bezier(0.16, 1, 0.3, 1)',
    normal: '180ms cubic-bezier(0.16, 1, 0.3, 1)',
  },
} as const;

export const focusRingClasses =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090B]';
