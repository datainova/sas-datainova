import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

type SectionRevealProps = {
  children: ReactNode;
  delay?: number;
  className?: string;
};

export const SectionReveal = ({ children, delay = 0, className }: SectionRevealProps) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.2 }}
    transition={{ duration: 0.32, delay, ease: [0.16, 1, 0.3, 1] }}
    className={className}
  >
    {children}
  </motion.div>
);
