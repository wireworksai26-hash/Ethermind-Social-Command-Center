import clsx from 'clsx';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

interface Common {
  label: string;
  icon?: ReactNode;
  variant?: 'primary' | 'ghost';
}

function Label({ label }: { label: string }) {
  return (
    <span className="kinetic-label">
      <span>{label}</span>
      <span aria-hidden="true">{label}</span>
    </span>
  );
}

export function KineticButton({
  label,
  icon,
  variant = 'ghost',
  className,
  type = 'button',
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} data-variant={variant} className={clsx('kinetic', className)} {...rest}>
      {icon}
      <Label label={label} />
    </button>
  );
}

export function KineticLink({
  label,
  icon,
  variant = 'ghost',
  className,
  ...rest
}: Common & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a data-variant={variant} className={clsx('kinetic', className)} {...rest}>
      {icon}
      <Label label={label} />
    </a>
  );
}
