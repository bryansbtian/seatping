// LanguageSelector.tsx
// Operator UI language picker for /business/settings. Persists to the backend
// via the i18n context (optimistic update + revert on failure) and confirms with
// a toast. The label itself is localized ("Language" / "Bahasa") per the chosen
// language. Language option names are intentionally NOT translated (a language is
// always shown in its own name).
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { ChevronDown } from "lucide-react";
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
    if (next === lang || saving) return;
    setSaving(true);
    try {
      await setLang(next);
      toast({ title: t("settings.language.saved") });
    } catch (e: any) {
      // setLang already reverted the UI; just surface the failure.
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
      <Label htmlFor="language" className="text-sm md:text-base">
        {t("settings.language.label")}
      </Label>
      <div className="relative">
        <select
          id="language"
          value={lang}
          disabled={saving}
          onChange={(e) => onChange(e.target.value as Lang)}
          className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
      </div>
      <p className="text-xs text-gray-500">{t("settings.language.desc")}</p>
    </div>
  );
}
