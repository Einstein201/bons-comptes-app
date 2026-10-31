import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'md' | 'lg';

type StyleProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
};

function buttonClassName({ variant = 'primary', size = 'md', className }: StyleProps) {
  return [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  Omit<StyleProps, 'className'>;

export function Button({
  type = 'button',
  variant,
  size,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, className })}
      {...props}
    />
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & Omit<StyleProps, 'className'>;

export function ButtonLink({
  variant = 'secondary',
  size,
  className,
  ...props
}: ButtonLinkProps) {
  return <Link className={buttonClassName({ variant, size, className })} {...props} />;
}
