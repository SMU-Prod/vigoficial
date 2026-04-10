/**
 * Centralized design tokens for VIGI
 * All colors, spacing, typography, and effects defined here
 */

import { Z_INDEX } from "@/lib/config/constants";

export const designTokens = {
  // Brand Colors
  colors: {
    brand: {
      navy: "#0B1F3A",
      navyLight: "#142d52",
      gold: "#C8A75D",
      goldLight: "#E8D4A8",
    },
    // Semantic Colors
    semantic: {
      success: "#10B981",
      successLight: "#D1FAE5",
      warning: "#F59E0B",
      warningLight: "#FEF3C7",
      danger: "#EF4444",
      dangerLight: "#FEE2E2",
      info: "#3B82F6",
      infoLight: "#DBEAFE",
    },
    // Neutral Scale
    neutral: {
      50: "#F9FAFB",
      100: "#F3F4F6",
      200: "#E5E7EB",
      300: "#D1D5DB",
      400: "#9CA3AF",
      500: "#6B7280",
      600: "#4B5563",
      700: "#374151",
      800: "#1F2937",
      900: "#111827",
    },
  },

  // Spacing Scale
  spacing: {
    xs: "0.25rem",    // 4px
    sm: "0.5rem",     // 8px
    md: "1rem",       // 16px
    lg: "1.5rem",     // 24px
    xl: "2rem",       // 32px
    "2xl": "2.5rem",  // 40px
    "3xl": "3rem",    // 48px
  },

  // Border Radius Scale
  radius: {
    none: "0",
    sm: "0.25rem",     // 4px
    md: "0.375rem",    // 6px
    lg: "0.5rem",      // 8px
    xl: "0.75rem",     // 12px
    "2xl": "1rem",     // 16px
    full: "9999px",
  },

  // Font Sizes
  fontSize: {
    xs: "0.75rem",     // 12px
    sm: "0.875rem",    // 14px
    md: "1rem",        // 16px
    lg: "1.125rem",    // 18px
    xl: "1.25rem",     // 20px
    "2xl": "1.5rem",   // 24px
    "3xl": "1.875rem", // 30px
    "4xl": "2.25rem",  // 36px
  },

  // Font Weights
  fontWeight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // Shadow Scale
  shadow: {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  },

  // Transitions
  transition: {
    fast: "150ms ease-in-out",
    base: "200ms ease-in-out",
    slow: "300ms ease-in-out",
    verySlow: "500ms ease-in-out",
  },

  // Z-Index Scale
  zIndex: {
    dropdown: Z_INDEX.dropdown,
    sticky: Z_INDEX.sticky,
    fixed: Z_INDEX.fixed,
    modal: Z_INDEX.modal,
    popover: Z_INDEX.modal, // Using modal as fallback for popover
    tooltip: Z_INDEX.tooltip,
  },
} as const;

export type DesignTokens = typeof designTokens;
