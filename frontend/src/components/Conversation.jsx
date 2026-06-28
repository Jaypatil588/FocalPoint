import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { ArrowDownIcon } from 'lucide-react';
import { useCallback } from 'react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';

export function Conversation({ className, ...props }) {
  return (
    <StickToBottom
      className={cn('relative flex-1 overflow-y-auto', className)}
      initial="smooth"
      resize="smooth"
      role="log"
      {...props}
    />
  );
}

export function ConversationContent({ className, ...props }) {
  return (
    <StickToBottom.Content
      className={cn('flex flex-col gap-6 p-4', className)}
      {...props}
    />
  );
}

export function ConversationScrollButton({ className, ...props }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  const handleClick = useCallback(() => scrollToBottom(), [scrollToBottom]);

  return !isAtBottom ? (
    <Button
      className={cn('absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full', className)}
      onClick={handleClick}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      <ArrowDownIcon className="size-4" />
    </Button>
  ) : null;
}
