import { useState } from "react";
import { format, isToday, isTomorrow } from "date-fns";
import { Calendar01Icon } from "@hugeicons/core-free-icons";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FieldTrigger } from "@/components/TimeSelect";
import { localDateStr } from "@/lib/localDate";
import { usePublicLanguage } from "@/lib/publicLanguage";

export function DateField({
  value,
  onChange,
  todayStr,
  maxDateStr,
  className,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  todayStr: string;
  maxDateStr: string;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const { t, dateLocale, shortDateFormat } = usePublicLanguage();
  const [open, setOpen] = useState(false);

  let selected: Date | undefined;
  if (value) {
    selected = new Date(`${value}T00:00:00`);
  } else {
    selected = undefined;
  }

  const start = new Date(`${todayStr}T00:00:00`);
  const end = new Date(`${maxDateStr}T00:00:00`);

  let label: string;
  if (selected && !Number.isNaN(selected.getTime())) {
    if (isToday(selected)) {
      label = t("Today");
    } else if (isTomorrow(selected)) {
      label = t("Tomorrow");
    } else {
      label = format(selected, shortDateFormat, { locale: dateLocale });
    }
  } else {
    label = placeholder || t("Pick A Date");
  }

  let triggerLabel = `${t("Date")}: ${label}`;
  if (ariaLabel) {
    triggerLabel = `${ariaLabel}: ${label}`;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FieldTrigger icon={Calendar01Icon} aria-label={triggerLabel} className={className}>
          {label}
        </FieldTrigger>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (d) {
              onChange(localDateStr(d));
            }
            setOpen(false);
          }}
          disabled={{ before: start, after: end }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export default DateField;
