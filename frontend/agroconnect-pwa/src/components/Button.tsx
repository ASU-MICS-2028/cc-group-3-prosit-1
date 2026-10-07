import type { ButtonHTMLAttributes } from 'react'

type Variant = 'main' | 'secondary' | 'text'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `main` is the lime button: use it once per screen. */
  variant?: Variant
}

export function Button({ variant = 'secondary', type = 'button', className, ...rest }: ButtonProps) {
  const classes = ['btn', `btn-${variant}`, className].filter(Boolean).join(' ')
  return <button type={type} className={classes} {...rest} />
}
