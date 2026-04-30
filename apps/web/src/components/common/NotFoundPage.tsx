import { type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Home, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFoundPage(): ReactElement {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center bg-background">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-col items-center"
      >
        {/* Animated illustration */}
        <motion.div
          className="relative mb-8"
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="flex size-28 items-center justify-center rounded-2xl bg-muted/50 ring-1 ring-border">
            <FileQuestion className="size-14 text-muted-foreground/60" />
          </div>
          {/* Decorative dots */}
          <motion.div
            className="absolute -right-3 -top-3 size-3 rounded-full bg-primary/40"
            animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.div
            className="absolute -bottom-2 -left-2 size-2 rounded-full bg-destructive/30"
            animate={{ scale: [1, 1.6, 1], opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
          />
          <motion.div
            className="absolute -right-1 bottom-1 size-1.5 rounded-full bg-chart-3/40"
            animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: 1 }}
          />
        </motion.div>

        <motion.h1
          className="mb-2 text-7xl font-extrabold tracking-tighter text-foreground"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          404
        </motion.h1>

        <motion.p
          className="mb-1 text-xl font-semibold text-foreground"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          Page not found
        </motion.p>

        <motion.p
          className="mb-8 max-w-sm text-sm text-muted-foreground"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </motion.p>

        <motion.div
          className="flex gap-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
        >
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="size-4" />
            Go Back
          </Button>
          <Button onClick={() => navigate('/dashboard')}>
            <Home className="size-4" />
            Go to Dashboard
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
