import type { ReactNode, SVGProps } from "react";

/** Small stroke icons (24px grid) so the UI has no icon-font or image dependency. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const SparklesIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
  </Icon>
);
export const ArrowRightIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);
export const SendIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 12l14-7-5 14-2.5-5.5L5 12z" />
  </Icon>
);
export const CheckIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);
export const FactoryIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 20V9l6 3V9l6 3V5h3a3 3 0 013 3v12H3z" />
    <path d="M8 20v-3M13 20v-3M18 20v-3" />
  </Icon>
);
export const OrbitIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="2.5" />
    <ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(-30 12 12)" />
  </Icon>
);
export const LeafIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15" />
    <path d="M5 19c3-5 6-8 10-10" />
  </Icon>
);
export const ShieldIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
    <path d="M9 12l2.2 2.2L15 10" />
  </Icon>
);
export const CogIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
  </Icon>
);
export const BrainIcon = (p: P) => (
  <Icon {...p}>
    <path d="M9 4a3 3 0 00-3 3 3 3 0 00-2 5 3 3 0 002 5 3 3 0 003 3V4z" />
    <path d="M15 4a3 3 0 013 3 3 3 0 012 5 3 3 0 01-2 5 3 3 0 01-3 3V4z" />
  </Icon>
);
export const FilterIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 5h16l-6 7v6l-4 2v-8L4 5z" />
  </Icon>
);
export const CalendarIcon = (p: P) => (
  <Icon {...p}>
    <rect x="4" y="5" width="16" height="15" rx="3" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </Icon>
);
export const InfoIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Icon>
);
export const AlertIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 4l9 16H3L12 4z" />
    <path d="M12 10v4M12 17h.01" />
  </Icon>
);
export const LayersIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5" />
  </Icon>
);
export const ChevronIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);
export const GithubIcon = (p: P) => (
  <Icon {...p}>
    <path d="M9 19c-4 1.2-4-2-6-2.5m12 4.5v-3.2a2.8 2.8 0 00-.8-2.2c2.6-.3 5.3-1.3 5.3-5.8a4.5 4.5 0 00-1.2-3.1 4.2 4.2 0 00-.1-3.1s-1-.3-3.2 1.2a11 11 0 00-5.8 0C6.9 3.2 5.9 3.5 5.9 3.5a4.2 4.2 0 00-.1 3.1A4.5 4.5 0 004.6 9.7c0 4.5 2.7 5.5 5.3 5.8a2.8 2.8 0 00-.8 2.2V21" />
  </Icon>
);
export const FileIcon = (p: P) => (
  <Icon {...p}>
    <path d="M7 3h7l5 5v13H7V3z" />
    <path d="M14 3v5h5M10 13h6M10 17h6" />
  </Icon>
);
export const SlidesIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4M7 12l3-3 2.5 2.5L16 8" />
  </Icon>
);
export const MailIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M3.5 7.5L12 13l8.5-5.5" />
  </Icon>
);
export const DownloadIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
  </Icon>
);
export const CloseIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
export const LockIcon = (p: P) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 118 0v3" />
  </Icon>
);
export const QuestionIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1-1.5 2M12 17h.01" />
  </Icon>
);
