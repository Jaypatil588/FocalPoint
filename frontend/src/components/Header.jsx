import { Eye } from 'lucide-react';

export function Header() {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center rounded-md bg-primary p-1.5">
            <Eye className="size-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-none">FocalPoint</h1>
            <p className="text-xs text-muted-foreground leading-none mt-0.5">
              Gaze-Driven Response Optimization
            </p>
          </div>
        </div>
        <span className="rounded-sm border px-2 py-0.5 text-xs text-muted-foreground font-mono">
          AIEWF 2026
        </span>
      </div>
    </header>
  );
}
