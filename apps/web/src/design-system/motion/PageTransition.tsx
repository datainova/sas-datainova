import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 }
};

type PageTransitionProps = {
  children: ReactNode;
  className?: string;
};

export const PageTransition = ({ children, className }: PageTransitionProps) => (
  <motion.div
    initial="initial"
    animate="animate"
    exit="exit"
    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    variants={pageVariants}
    className={className}
  >
    {children}
  </motion.div>
);
