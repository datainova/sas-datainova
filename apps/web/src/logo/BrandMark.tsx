import clsx from 'clsx';
import type { ImgHTMLAttributes } from 'react';
import { useTheme } from '../core/theme/theme-provider';
import blackMark from './black_icon_transparent_background.png';
import whiteMark from './white_icon_transparent_background.png';

type BrandMarkVariant = 'auto' | 'light' | 'dark';

type BrandMarkProps = ImgHTMLAttributes<HTMLImageElement> & {
  variant?: BrandMarkVariant;
};

export const BrandMark = ({ variant = 'auto', className, ...props }: BrandMarkProps) => {
  const { theme } = useTheme();
  const resolvedVariant = variant === 'auto' ? theme : variant;
  const src = resolvedVariant === 'dark' ? whiteMark : blackMark;

  return (
    <img
      src={src}
      alt="Marca DataInova"
      className={clsx('h-8 w-auto select-none', className)}
      draggable={false}
      {...props}
    />
  );
};
