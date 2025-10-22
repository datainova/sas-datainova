import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  type ReactNode,
  useCallback
} from 'react';

type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export type ToastMessage = {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  autoClose?: number;
};

type ToastState = ToastMessage[];

type ToastAction =
  | { type: 'ADD'; payload: ToastMessage }
  | { type: 'REMOVE'; payload: { id: string } }
  | { type: 'CLEAR' };

const ToastContext = createContext<{
  toasts: ToastState;
  showToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
}>({
  toasts: [],
  showToast: () => undefined,
  dismissToast: () => undefined
});

const toastReducer = (state: ToastState, action: ToastAction): ToastState => {
  switch (action.type) {
    case 'ADD':
      return [...state, action.payload];
    case 'REMOVE':
      return state.filter((toast) => toast.id !== action.payload.id);
    case 'CLEAR':
      return [];
    default:
      return state;
  }
};

type ToastProviderProps = {
  children: ReactNode;
};

export const ToastProvider = ({ children }: ToastProviderProps) => {
  const [state, dispatch] = useReducer(toastReducer, []);

  const showToast = useCallback(
    (toast: Omit<ToastMessage, 'id'>) => {
      const id = window.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
      const payload: ToastMessage = { id, autoClose: 5000, variant: 'info', ...toast };
      dispatch({ type: 'ADD', payload });
      if (payload.autoClose) {
        setTimeout(() => {
          dispatch({ type: 'REMOVE', payload: { id } });
        }, payload.autoClose);
      }
    },
    [dispatch]
  );

  const dismissToast = useCallback(
    (id: string) => {
      dispatch({ type: 'REMOVE', payload: { id } });
    },
    [dispatch]
  );

  const value = useMemo(
    () => ({
      toasts: state,
      showToast,
      dismissToast
    }),
    [state, showToast, dismissToast]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};

export const useToastContext = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToastContext must be used within ToastProvider');
  }
  return context;
};
