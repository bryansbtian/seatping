import { useEffect, useLayoutEffect, useRef, type ChangeEvent, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { formatNationalPhone, formatPhoneInput, phonePlaceholder } from "@shared/phone";

type PhoneNumberInputProps = Omit<ComponentProps<typeof Input>, "onChange" | "type" | "value"> & {
  countryCode?: string | null;
  value: string;
  onValueChange: (value: string) => void;
};

export function PhoneNumberInput({
  countryCode,
  value,
  onValueChange,
  placeholder,
  ...rest
}: PhoneNumberInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const caretRef = useRef<number | null>(null);
  const previousRef = useRef(value);

  useLayoutEffect(() => {
    previousRef.current = value;
    const caret = caretRef.current;
    caretRef.current = null;
    if (caret === null || !inputRef.current) {
      return;
    }
    inputRef.current.setSelectionRange(caret, caret);
  }, [value]);

  useEffect(() => {
    const reformatted = formatNationalPhone(countryCode, value);
    if (reformatted !== value) {
      onValueChange(reformatted);
    }
  }, [countryCode, value, onValueChange]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    const next = formatPhoneInput({
      countryCode,
      raw,
      caret: event.target.selectionStart ?? raw.length,
      previous: previousRef.current,
    });
    caretRef.current = next.caret;
    onValueChange(next.value);
  };

  let resolvedPlaceholder = placeholder;
  if (resolvedPlaceholder === undefined) {
    resolvedPlaceholder = phonePlaceholder(countryCode);
  }

  return (
    <Input
      {...rest}
      ref={inputRef}
      type="tel"
      inputMode="tel"
      value={value}
      placeholder={resolvedPlaceholder}
      onChange={handleChange}
    />
  );
}

export default PhoneNumberInput;
