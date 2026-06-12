export const theme = {
  colors: {
    background: '#f6f7f3',
    surface: '#ffffff',
    surfaceMuted: '#f1f4ec',
    primary: '#4f7f38',
    primaryDark: '#315f2d',
    accent: '#c98a24',
    text: '#182018',
    mutedText: '#66715f',
    border: '#dfe6d8',
    success: '#2f7d46',
    warning: '#c98216',
    danger: '#b42318'
  },
  typography: {
    screenTitle: 'text-2xl font-semibold tracking-tight md:text-3xl',
    sectionTitle: 'text-base font-semibold tracking-tight',
    body: 'text-sm leading-6',
    caption: 'text-xs leading-5',
    button: 'text-sm font-semibold'
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '3rem'
  },
  radius: {
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    full: '999px'
  },
  shadows: {
    subtle: '0 1px 2px rgba(24, 32, 24, 0.05)',
    elevated: '0 16px 40px rgba(24, 32, 24, 0.08)'
  }
} as const;

