import { createContext, useContext } from 'react';

export interface ToastContent {
  title: string;
  lines: string[];
  tone?: 'system' | 'penalty';
}

export interface ToastApi {
  show: (toast: ToastContent) => void;
}

export const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
