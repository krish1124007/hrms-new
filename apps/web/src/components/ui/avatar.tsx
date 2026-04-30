import { type ReactElement } from 'react';
import { cn } from '@/lib/utils';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  online?: boolean;
  className?: string;
}

const sizeMap = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-base',
};

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Avatar({
  src,
  name,
  size = 'md',
  online,
  className,
}: AvatarProps): ReactElement {
  return (
    <div className={cn('relative inline-block', className)}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={cn(
            'rounded-full object-cover ring-2 ring-background',
            sizeMap[size],
          )}
        />
      ) : (
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-primary/10 font-semibold text-primary ring-2 ring-background',
            sizeMap[size],
          )}
        >
          {initials(name)}
        </div>
      )}
      {online && (
        <span className="absolute bottom-0 right-0 block size-2.5 rounded-full bg-success ring-2 ring-background" />
      )}
    </div>
  );
}
