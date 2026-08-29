import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardTitle } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useLang } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";
import type { FloorZone, ZonePatch } from "@/lib/floorApi";
import { ZONE_NAME_MAX_LENGTH } from "@/lib/floorGeometry";

type ZoneInspectorProps = {
  zone: FloorZone;
  saving: boolean;
  onSave: (patch: ZonePatch) => Promise<void>;
  onDelete: () => Promise<void>;
};

const ZoneInspector = ({ zone, saving, onSave, onDelete }: ZoneInspectorProps) => {
  const { t } = useLang();
  const [name, setName] = useState(zone.name);
  const [error, setError] = useState<TKey | null>(null);

  useEffect(() => {
    setName(zone.name);
    setError(null);
  }, [zone]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("floor.error.zoneNameRequired");
      return;
    }
    await onSave({ name: trimmed });
  };

  let saveLabel = t("floor.save");
  if (saving) {
    saveLabel = t("floor.saving");
  }

  return (
    <div className="flex min-h-full shrink-0 flex-col gap-3 md:gap-4" data-testid="zone-inspector">
      <CardTitle className="text-lg text-slate-800 md:text-xl">{t("floor.zoneSettings")}</CardTitle>

      <div className="space-y-1.5 md:space-y-2">
        <Label htmlFor="zone-name" className="text-caption">
          {t("floor.zoneName")}
        </Label>
        <Input
          id="zone-name"
          className="h-9 text-xs md:h-10 md:text-xs"
          value={name}
          maxLength={ZONE_NAME_MAX_LENGTH}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
      </div>

      <dl className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-3 py-2 text-caption text-slate-600 md:text-xs">
        <div className="min-w-0 text-left">
          <dt className="font-medium text-slate-500">{t("floor.field.position")}</dt>
          <dd className="truncate">
            {zone.x}, {zone.y}
          </dd>
        </div>
        <div className="min-w-0 text-right">
          <dt className="font-medium text-slate-500">{t("floor.field.size")}</dt>
          <dd className="truncate">
            {zone.width} &times; {zone.height}
          </dd>
        </div>
      </dl>

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {t(error)}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2 border-t border-slate-100 pt-4">
        <Button className="h-9 w-full text-xs md:h-10" disabled={saving} onClick={handleSave}>
          {saveLabel}
        </Button>

        <ConfirmModal
          title={t("floor.delete.zoneTitle")}
          description={t("floor.delete.zoneBody")}
          cancelText={t("common.cancel")}
          confirmText={t("floor.deleteZone")}
          onConfirm={onDelete}
          trigger={
            <Button
              variant="outline"
              className="h-9 w-full text-xs text-red-600 hover:text-red-700 md:h-10"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t("floor.deleteZone")}
            </Button>
          }
        />
      </div>
    </div>
  );
};

export default ZoneInspector;
