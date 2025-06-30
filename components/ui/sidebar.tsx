'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Menu, X, ChevronDown, ChevronRight } from 'lucide-react'

interface SidebarContextType {
  isOpen: boolean
  toggle: () => void
}

const SidebarContext = React.createContext<SidebarContextType | undefined>(undefined)

export function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(true)

  const toggle = React.useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  return (
    <SidebarContext.Provider value={{ isOpen, toggle }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function Sidebar({ 
  children, 
  className, 
  ...props 
}: React.HTMLAttributes<HTMLDivElement>) {
  const { isOpen } = useSidebar()
  
  return (
    <div
      className={cn(
        'flex h-screen flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-300',
        isOpen ? 'w-64' : 'w-16',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function SidebarHeader({ 
  children, 
  className, 
  ...props 
}: React.HTMLAttributes<HTMLDivElement>) {
  const { isOpen } = useSidebar()
  
  return (
    <div
      className={cn(
        'flex h-16 items-center border-b border-gray-200 dark:border-gray-800 px-4',
        className
      )}
      {...props}
    >
      {isOpen && children}
    </div>
  )
}

export function SidebarContent({ 
  children, 
  className, 
  ...props 
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex-1 overflow-y-auto py-4 px-3',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function SidebarFooter({ 
  children, 
  className, 
  ...props 
}: React.HTMLAttributes<HTMLDivElement>) {
  const { isOpen } = useSidebar()
  
  return (
    <div
      className={cn(
        'border-t border-gray-200 dark:border-gray-800 p-4',
        className
      )}
      {...props}
    >
      {isOpen && children}
    </div>
  )
}

export function SidebarToggle() {
  const { isOpen, toggle } = useSidebar()
  
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="absolute -right-3 top-6 z-10 h-6 w-6 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
    >
      {isOpen ? <X className="h-3 w-3" /> : <Menu className="h-3 w-3" />}
    </Button>
  )
}

export function SidebarGroup({ 
  title, 
  children, 
  className 
}: { 
  title?: string
  children: React.ReactNode
  className?: string 
}) {
  const { isOpen } = useSidebar()
  
  return (
    <div className={cn('mb-6', className)}>
      {title && isOpen && (
        <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}

export function SidebarNav({ 
  children, 
  className 
}: { 
  children: React.ReactNode
  className?: string 
}) {
  return (
    <nav className={cn('space-y-1', className)}>
      {children}
    </nav>
  )
}

export function SidebarNavItem({
  children,
  icon,
  active = false,
  onClick,
  className
}: {
  children: React.ReactNode
  icon?: React.ReactNode
  active?: boolean
  onClick?: () => void
  className?: string
}) {
  const { isOpen } = useSidebar()
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        'hover:bg-gray-100 dark:hover:bg-gray-800',
        active && 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100',
        !active && 'text-gray-600 dark:text-gray-400',
        !isOpen && 'justify-center px-2',
        className
      )}
    >
      {icon && (
        <span className={cn('flex-shrink-0', isOpen && 'mr-3')}>
          {icon}
        </span>
      )}
      {isOpen && children}
    </button>
  )
}

export function SidebarNavSubmenu({
  title,
  icon,
  children,
  defaultOpen = false,
  className
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  const { isOpen } = useSidebar()
  const [isSubmenuOpen, setIsSubmenuOpen] = React.useState(defaultOpen)
  
  const toggleSubmenu = () => {
    setIsSubmenuOpen(!isSubmenuOpen)
  }
  
  if (!isOpen) {
    return (
      <div className="relative group">
        <button
          onClick={toggleSubmenu}
          className={cn(
            'flex w-full items-center justify-center rounded-lg px-2 py-2 text-sm font-medium transition-colors',
            'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400',
            className
          )}
        >
          {icon && <span className="flex-shrink-0">{icon}</span>}
        </button>
        {/* Tooltip for collapsed sidebar */}
        <div className="absolute left-full top-0 ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
          {title}
        </div>
        {/* Submenu for collapsed sidebar */}
        {isSubmenuOpen && (
          <div className="absolute left-full top-0 ml-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 min-w-48">
            {children}
          </div>
        )}
      </div>
    )
  }
  
  return (
    <div className={className}>
      <button
        onClick={toggleSubmenu}
        className={cn(
          'flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
        )}
      >
        {icon && (
          <span className="flex-shrink-0 mr-3">
            {icon}
          </span>
        )}
        <span className="flex-1 text-left">{title}</span>
        {isSubmenuOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
      {isSubmenuOpen && (
        <div className="mt-1 ml-4 space-y-1">
          {children}
        </div>
      )}
    </div>
  )
}

export function SidebarNavSubItem({
  children,
  icon,
  active = false,
  onClick,
  className
}: {
  children: React.ReactNode
  icon?: React.ReactNode
  active?: boolean
  onClick?: () => void
  className?: string
}) {
  const { isOpen } = useSidebar()
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        'hover:bg-gray-100 dark:hover:bg-gray-800',
        active && 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100',
        !active && 'text-gray-600 dark:text-gray-400',
        !isOpen && 'px-2',
        className
      )}
    >
      {icon && (
        <span className={cn('flex-shrink-0', isOpen ? 'mr-3' : 'mr-0')}>
          {icon}
        </span>
      )}
      {isOpen && children}
    </button>
  )
}

export function SidebarNavNestedSubmenu({
  title,
  icon,
  children,
  defaultOpen = false,
  className,
  level = 1
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
  level?: number
}) {
  const { isOpen } = useSidebar()
  const [isSubmenuOpen, setIsSubmenuOpen] = React.useState(defaultOpen)
  
  const toggleSubmenu = () => {
    setIsSubmenuOpen(!isSubmenuOpen)
  }
  
  const indentLevel = level * 0.5 // 0.5rem por nível
  
  if (!isOpen) {
    return (
      <div className="relative group">
        <button
          onClick={toggleSubmenu}
          className={cn(
            'flex w-full items-center justify-center rounded-lg px-2 py-2 text-sm font-medium transition-colors',
            'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400',
            className
          )}
        >
          {icon && <span className="flex-shrink-0">{icon}</span>}
        </button>
        {/* Tooltip for collapsed sidebar */}
        <div className="absolute left-full top-0 ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
          {title}
        </div>
        {/* Submenu for collapsed sidebar */}
        {isSubmenuOpen && (
          <div className="absolute left-full top-0 ml-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 min-w-48">
            {children}
          </div>
        )}
      </div>
    )
  }
  
  return (
    <div className={className}>
      <button
        onClick={toggleSubmenu}
        className={cn(
          'flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
        )}
        style={{ paddingLeft: `${0.75 + indentLevel}rem` }}
      >
        {icon && (
          <span className="flex-shrink-0 mr-3">
            {icon}
          </span>
        )}
        <span className="flex-1 text-left">{title}</span>
        {isSubmenuOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
      {isSubmenuOpen && (
        <div className="mt-1 space-y-1" style={{ marginLeft: `${1 + indentLevel}rem` }}>
          {children}
        </div>
      )}
    </div>
  )
} 