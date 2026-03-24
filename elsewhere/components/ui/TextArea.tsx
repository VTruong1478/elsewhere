import { Input } from "@/components/ui/Input";

interface TextAreaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> {
  className?: string;
}

/** Same field styling as {@link Input} search fields (multiline variant). */
export function TextArea({ className = "", ...props }: TextAreaProps) {
  return <Input variant="multiline" className={className} {...props} />;
}
