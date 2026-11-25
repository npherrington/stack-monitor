import { toast } from '@/components/ui/toast-manager.ts'

// The one failure toast: what was tried as the title, the server's own words as the description.
export function toastFailure(title: string, failure: Error): void {
  toast.add({ title, description: failure.message, type: 'error' })
}
