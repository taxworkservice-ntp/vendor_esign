import { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-card bg-white border border-card-border', className)}>{children}</div>
}
export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5 sm:p-6', className)}>{children}</div>
}
