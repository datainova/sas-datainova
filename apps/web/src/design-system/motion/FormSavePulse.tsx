import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

type FormSavePulseProps = {
  active: boolean;
  children: ReactNode;
};

export const FormSavePulse = ({ active, children }: FormSavePulseProps) => (
  <motion.div
    animate={active ? { boxShadow: '0 0 0 0 rgba(75,102,255,0.45)' } : { boxShadow: '0 0 0 0 rgba(75,102,255,0)' }}
    transition={
      active
        ? { duration: 1.4, repeat: Infinity, ease: [0.16, 1, 0.3, 1] }
        : { duration: 0.2, ease: 'linear' }
    }
    className="rounded-full"
  >
    {children}
  </motion.div>
);
