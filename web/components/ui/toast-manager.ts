import { Toast as ToastPrimitive } from '@base-ui/react/toast'

// Module level, so a hook or web/lib/ can raise a toast without a context (react-toasts.md).
export const toast = ToastPrimitive.createToastManager()
