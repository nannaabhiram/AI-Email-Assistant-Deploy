import type { ReactNode } from 'react'
import { Button, type ButtonProps } from './Button'
import { Tooltip } from './Tooltip'

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'leftIcon' | 'size'> {
  /** Accessible name; also shown as a tooltip. Required because the button has no text. */
  label: string
  icon: ReactNode
  size?: 'sm' | 'md'
  showTooltip?: boolean
}

export function IconButton({ label, icon, size = 'md', variant = 'ghost', showTooltip = true, ...props }: IconButtonProps) {
  const button = (
    <Button aria-label={label} variant={variant} size={size === 'sm' ? 'icon-sm' : 'icon'} {...props}>
      {props.loading ? null : icon}
    </Button>
  )
  return showTooltip ? <Tooltip content={label}>{button}</Tooltip> : button
}
