import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M17.5 8V7a2.5 2.5 0 0 0-2.5-2.5H6A3 3 0 0 0 3 7.5v9A3 3 0 0 0 6 19.5h12a3 3 0 0 0 3-3v-6A2.5 2.5 0 0 0 18.5 8H6" />
      <rect x="14" y="11.5" width="7" height="4" rx="2" />
      <circle cx="16.8" cy="13.5" r="0.4" />
    </Icon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 9a6 6 0 0 1 12 0c0 6.5 2.6 8.2 3 8.5H3c.4-.3 3-2 3-8.5z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Icon>
  );
}
