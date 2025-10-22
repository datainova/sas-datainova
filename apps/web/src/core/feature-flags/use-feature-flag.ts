import { useFeatureFlagsContext } from './feature-flags-context';

export const useFeatureFlag = (flag: string) => {
  const { isEnabled } = useFeatureFlagsContext();
  return isEnabled(flag);
};
