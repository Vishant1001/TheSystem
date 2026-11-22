import { Link, type LinkProps } from 'react-router';
import { systemControlClass, type ButtonTone } from './buttonStyles';

interface SystemLinkProps extends LinkProps {
  tone?: ButtonTone;
}

export function SystemLink({ tone = 'system', className = '', ...rest }: SystemLinkProps) {
  return <Link className={systemControlClass(tone, className)} {...rest} />;
}
