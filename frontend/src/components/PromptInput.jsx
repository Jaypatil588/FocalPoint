import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { CornerDownLeftIcon, Loader2Icon, SquareIcon } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState } from 'react';

const PromptInputContext = createContext(null);

function usePromptInput() {
  return useContext(PromptInputContext);
}

export function PromptInput({ onSubmit, isLoading, className, children, ...props }) {
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);

  const handleSubmit = useCallback(() => {
    if (!value.trim() || isLoading) return;
    onSubmit?.(value.trim());
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [value, isLoading, onSubmit]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <PromptInputContext.Provider value={{ value, setValue, isLoading, handleSubmit, handleKeyDown, textareaRef }}>
      <div
        className={cn(
          'overflow-hidden rounded-sm border bg-background',
          className
        )}
        {...props}
      >
        {children}
      </div>
    </PromptInputContext.Provider>
  );
}

export function PromptInputTextarea({ className, placeholder, ...props }) {
  const { value, setValue, handleKeyDown, textareaRef, isLoading } = usePromptInput();

  const handleInput = (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
    setValue(e.target.value);
  };

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onInput={handleInput}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      disabled={isLoading}
      placeholder={placeholder}
      rows={1}
      className={cn(
        'w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed',
        'max-h-48 overflow-y-auto',
        className
      )}
      {...props}
    />
  );
}

export function PromptInputFooter({ className, children, ...props }) {
  return (
    <div
      className={cn('flex items-center justify-between gap-2 px-3 pb-3', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function PromptInputSubmit({ className, ...props }) {
  const { handleSubmit, isLoading, value } = usePromptInput();

  return (
    <Button
      size="icon-sm"
      onClick={handleSubmit}
      disabled={(!value.trim() && !isLoading)}
      className={cn('ml-auto shrink-0', className)}
      type="button"
      {...props}
    >
      {isLoading ? (
        <SquareIcon className="size-3.5 fill-current" />
      ) : (
        <CornerDownLeftIcon className="size-3.5" />
      )}
      <span className="sr-only">Send</span>
    </Button>
  );
}
