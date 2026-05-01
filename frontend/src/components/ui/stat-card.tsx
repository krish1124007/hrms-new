import { useEffect, useState, type ReactElement } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Card } from './card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  trend?: { value: number; direction: 'up' | 'down' };
  format?: (n: number) => string;
  className?: string;
}

function CountUp({
  to,
  format,
}: {
  to: number;
  format?: (n: number) => string;
}): ReactElement {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 800;
    let raf = 0;
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - (1 - t) ** 3;
      setN(Math.round(eased * to));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{format ? format(n) : n.toLocaleString('en-IN')}</>;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  format,
  className,
}: StatCardProps): ReactElement {
  const numericValue = typeof value === 'number' ? value : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={cn('p-5', className)}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight">
              {numericValue !== null ? (
                <CountUp to={numericValue} format={format} />
              ) : (
                value
              )}
            </p>
            {trend && (
              <p
                className={cn(
                  'mt-2 flex items-center gap-1 text-xs font-medium',
                  trend.direction === 'up' ? 'text-success' : 'text-destructive',
                )}
              >
                {trend.direction === 'up' ? (
                  <ArrowUpRight className="size-3.5" />
                ) : (
                  <ArrowDownRight className="size-3.5" />
                )}
                {trend.value}% from last month
              </p>
            )}
          </div>
          {Icon && (
            <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
              <Icon className="size-5" />
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
