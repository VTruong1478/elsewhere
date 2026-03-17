interface TextAreaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> {
  className?: string;
}

export function TextArea({ className = "", ...props }: TextAreaProps) {
  return (
    <textarea
      className={`
        w-full rounded-radius-sm border border-surface-alt bg-surface
        px-12 py-12 text-body-m text-text
        placeholder:text-text-tertiary
        focus:outline-none focus:ring-2 focus:ring-accent
        ${className}
      `.trim()}
      {...props}
    />
  );
}

