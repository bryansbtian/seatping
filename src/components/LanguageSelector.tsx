import { useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLang, type Lang } from "@/lib/i18n";

const OPTIONS: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "id", label: "Bahasa Indonesia" },
];

export default function LanguageSelector() {
  const { lang, setLang, t } = useLang();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const onChange = async (next: Lang) => {
    if (next === lang || saving) {
      return;
    }
    setSaving(true);
    try {
      await setLang(next);
      toast({ title: t("settings.language.saved") });
    } catch (e: any) {
      toast({
        title: t("settings.language.saveError"),
        description: e?.message || t("common.pleaseTryAgain"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-sm space-y-1.5">
      <Label htmlFor="language">{t("settings.language.label")}</Label>
      <Select
        value={lang}
        disabled={saving}
        onValueChange={(next) => {
          if (next === "en" || next === "id") {
            void onChange(next);
          }
        }}
      >
        <SelectTrigger id="language">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
