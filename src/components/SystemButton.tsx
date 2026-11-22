import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { systemControlClass, type ButtonTone } from './buttonStyles';

interface SystemButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  children: ReactNode;
}

export function SystemButton({ tone = 'system', className = '', ...rest }: SystemButtonProps) {
  return <button type="button" className={systemControlClass(tone, className)} {...rest} />;
}
