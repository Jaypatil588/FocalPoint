import { cn } from '@/lib/utils';

export function Message({ className, from, ...props }) {
  return (
    <div
      className={cn(
        'group flex w-full max-w-[85%] flex-col gap-2',
        from === 'user' ? 'is-user ml-auto justify-end' : 'is-assistant',
        className
      )}
      {...props}
    />
  );
}

export function MessageContent({ children, className, ...props }) {
  return (
    <div
      className={cn(
        'flex w-fit flex-col gap-2 overflow-hidden text-sm',
        'group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground',
        'group-[.is-assistant]:text-foreground',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Loader({ className, size = 16, ...props }) {
  return (
    <div
      className={cn('inline-flex animate-spin items-center justify-center', className)}
      {...props}
    >
      <svg height={size} viewBox="0 0 16 16" width={size} strokeLinejoin="round" style={{ color: 'currentcolor' }}>
        <title>Loading</title>
        <g clipPath="url(#clip0)">
          <path d="M8 0V4" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 16V12" opacity="0.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3.29773 1.52783L5.64887 4.7639" opacity="0.9" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12.7023 1.52783L10.3511 4.7639" opacity="0.1" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12.7023 14.472L10.3511 11.236" opacity="0.4" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3.29773 14.472L5.64887 11.236" opacity="0.6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M15.6085 5.52783L11.8043 6.7639" opacity="0.2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M0.391602 10.472L4.19583 9.23598" opacity="0.7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M15.6085 10.4722L11.8043 9.2361" opacity="0.3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M0.391602 5.52783L4.19583 6.7639" opacity="0.8" stroke="currentColor" strokeWidth="1.5" />
        </g>
        <defs>
          <clipPath id="clip0">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}
