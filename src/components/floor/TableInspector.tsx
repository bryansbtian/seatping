import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  BanIcon,
  Delete02Icon,
  RotateClockwiseIcon,
  Rotate02Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardTitle } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useLang } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";
import type { DiningTable, TablePatch } from "@/lib/floorApi";
import {
  ROTATION_STEP,
  TABLE_SHAPES,
  TABLE_NAME_MAX_LENGTH,
  isInvalid,
  stepRotation,
  toNumberOrBlank,
  validateCapacity,
  type TableShape,
} from "@/lib/floorGeometry";

type TableInspectorProps = {
  table: DiningTable;
  saving: boolean;
  onSave: (patch: TablePatch) => Promise<void>;
  onDelete: () => Promise<void>;
  onToggleBlocked: (blocked: boolean) => Promise<void>;
};

type FormState = {
  name: string;
  capacity: number | "";
  minimumPartySize: number | "";
  shape: TableShape;
  rotation: number;
};

function toFormState(table: DiningTable): FormState {
  return {
    name: table.name,
    capacity: table.capacity,
    minimumPartySize: table.minimumPartySize,
    shape: table.shape,
    rotation: table.rotation,
  };
}

const TableInspector = ({
  table,
  saving,
  onSave,
  onDelete,
  onToggleBlocked,
}: TableInspectorProps) => {
  const { t } = useLang();
  const [form, setForm] = useState<FormState>(() => toFormState(table));
  const [error, setError] = useState<TKey | null>(null);

  useEffect(() => {
    setForm(toFormState(table));
    setError(null);
  }, [table]);

  const update = (patch: Partial<FormState>) => {
    setForm((previous) => ({ ...previous, ...patch }));
    setError(null);
  };

  const handleSave = async () => {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setError("floor.error.nameRequired");
      return;
    }

    const capacityCheck = validateCapacity(form.capacity, form.minimumPartySize);
    if (isInvalid(capacityCheck)) {
      setError(`floor.error.${capacityCheck.reason}` as TKey);
      return;
    }

    let minimumPartySize = 1;
    if (form.minimumPartySize !== "") {
      minimumPartySize = form.minimumPartySize;
    }

    await onSave({
      name: trimmedName,
      capacity: form.capacity as number,
      minimumPartySize,
      shape: form.shape,
      rotation: form.rotation,
    });
  };

  let saveLabel = t("floor.save");
  if (saving) {
    saveLabel = t("floor.saving");
  }

  let blockAction = (
    <Button
      variant="outline"
      className="h-9 w-full text-xs md:h-10"
      disabled={saving}
      onClick={() => onToggleBlocked(true)}
    >
      <HugeiconsIcon icon={BanIcon} className="mr-2 h-4 w-4" />
      {t("floor.block")}
    </Button>
  );
  if (table.isBlocked) {
    blockAction = (
      <Button
        variant="outline"
        className="h-9 w-full text-xs md:h-10"
        disabled={saving}
        onClick={() => onToggleBlocked(false)}
      >
        <HugeiconsIcon icon={BanIcon} className="mr-2 h-4 w-4" />
        {t("floor.unblock")}
      </Button>
    );
  }

  return (
    <div className="flex min-h-full shrink-0 flex-col gap-3 md:gap-4" data-testid="table-inspector">
      <div className="flex items-center justify-between">
        <CardTitle className="text-slate-800">{t("floor.inspector.title")}</CardTitle>
        {table.isBlocked && (
          <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
            {t("floor.blockedBadge")}
          </span>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-3">
        <div className="space-y-1.5 md:space-y-2">
          <Label htmlFor="table-name" className="text-caption">
            {t("floor.field.name")}
          </Label>
          <Input
            id="table-name"
            className="h-9 text-xs md:h-10 md:text-xs"
            value={form.name}
            maxLength={TABLE_NAME_MAX_LENGTH}
            onChange={(event) => update({ name: event.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5 md:space-y-2">
            <Label htmlFor="table-capacity" className="whitespace-nowrap text-caption">
              {t("floor.field.capacity")}
            </Label>
            <Input
              id="table-capacity"
              className="h-9 text-xs md:h-10 md:text-xs"
              type="number"
              min={1}
              max={40}
              value={form.capacity}
              onChange={(event) => update({ capacity: toNumberOrBlank(event.target.value) })}
            />
          </div>
          <div className="space-y-1.5 md:space-y-2">
            <Label htmlFor="table-minimum" className="whitespace-nowrap text-caption">
              {t("floor.field.minimumPartySize")}
            </Label>
            <Input
              id="table-minimum"
              className="h-9 text-xs md:h-10 md:text-xs"
              type="number"
              min={1}
              max={40}
              value={form.minimumPartySize}
              onChange={(event) =>
                update({ minimumPartySize: toNumberOrBlank(event.target.value) })
              }
            />
          </div>
        </div>

        <div className="space-y-1.5 md:space-y-2">
          <Label htmlFor="table-shape" className="text-caption">
            {t("floor.field.shape")}
          </Label>
          <div className="relative">
            <select
              id="table-shape"
              value={form.shape}
              onChange={(event) => update({ shape: event.target.value as TableShape })}
              className="h-9 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 pr-10 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 md:h-10"
            >
              {TABLE_SHAPES.map((shape) => (
                <option key={shape} value={shape}>
                  {t(`floor.shape.${shape}` as TKey)}
                </option>
              ))}
            </select>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
            />
          </div>
        </div>

        <div className="space-y-1.5 md:space-y-2">
          <Label className="text-caption">{t("floor.field.rotation")}</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 md:h-10 md:w-10"
              aria-label={t("floor.rotateLeft")}
              onClick={() => update({ rotation: stepRotation(form.rotation, -ROTATION_STEP) })}
            >
              <HugeiconsIcon icon={RotateClockwiseIcon} className="h-4 w-4" />
            </Button>
            <span className="min-w-[2.5rem] shrink-0 text-center text-sm text-slate-700">
              {form.rotation}&deg;
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 md:h-10 md:w-10"
              aria-label={t("floor.rotateRight")}
              onClick={() => update({ rotation: stepRotation(form.rotation, ROTATION_STEP) })}
            >
              <HugeiconsIcon icon={Rotate02Icon} className="h-4 w-4" />
            </Button>

            <dl className="ml-1 flex min-w-0 flex-1 items-center justify-between gap-4 rounded-xl bg-slate-50 px-3 py-2 text-caption text-slate-600 md:text-xs">
              <div className="min-w-0 text-left">
                <dt className="font-medium text-slate-500">{t("floor.field.position")}</dt>
                <dd className="truncate">
                  {table.x}, {table.y}
                </dd>
              </div>
              <div className="min-w-0 text-right">
                <dt className="font-medium text-slate-500">{t("floor.field.size")}</dt>
                <dd className="truncate">
                  {table.width} &times; {table.height}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {t(error)}
        </p>
      )}

      <div className="mt-auto flex shrink-0 flex-col gap-3 border-t border-slate-100 pt-4">
        <div className="flex flex-col gap-2">
          <Button className="h-9 w-full text-xs md:h-10" disabled={saving} onClick={handleSave}>
            {saveLabel}
          </Button>

          {blockAction}

          <ConfirmModal
            title={t("floor.delete.title")}
            description={t("floor.delete.body")}
            cancelText={t("common.cancel")}
            confirmText={t("floor.delete.confirm")}
            onConfirm={onDelete}
            trigger={
              <Button
                variant="outline"
                className="h-9 w-full text-xs text-red-600 hover:text-red-700 md:h-10"
              >
                <HugeiconsIcon icon={Delete02Icon} className="mr-2 h-4 w-4" />
                {t("floor.delete")}
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
};

export default TableInspector;
