import { useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { Input } from './Input'

export interface ConfirmationDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  /** When set, the user must type this exact text before confirming. */
  requireText?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmationDialog({
  open, title, description, children, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive = false,
  loading = false, requireText, onConfirm, onCancel,
}: ConfirmationDialogProps) {
  const [typed, setTyped] = useState('')
  const blocked = Boolean(requireText) && typed !== requireText
  const close = () => {
    setTyped('')
    onCancel()
  }
  return (
    <Dialog
      open={open}
      onClose={close}
      role="alertdialog"
      size="sm"
      title={title}
      description={description}
      dismissible={!loading}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={loading}>{cancelLabel}</Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} disabled={blocked}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {requireText && (
        <Input
          className="mt-2"
          label={<>Type <span className="font-mono">{requireText}</span> to confirm</>}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
        />
      )}
    </Dialog>
  )
}
