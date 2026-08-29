import { useLang } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";
import { TABLE_SHAPES, type TableShape } from "@/lib/floorGeometry";
import { cn } from "@/lib/utils";

type ShapePaletteProps = {
  disabled: boolean;
  onAdd: (shape: TableShape) => void;
};

function glyphClasses(shape: TableShape): string {
  if (shape === "ROUND") {
    return "h-6 w-6 rounded-full";
  }
  if (shape === "SQUARE") {
    return "h-6 w-6 rounded-[4px]";
  }
  return "h-5 w-8 rounded-[4px]";
}

const ShapePalette = ({ disabled, onAdd }: ShapePaletteProps) => {
  const { t } = useLang();

  return (
    <div className="flex flex-wrap gap-2 lg:flex-nowrap">
      {TABLE_SHAPES.map((shape) => {
        const label = t(`floor.shape.${shape}` as TKey);
        return (
          <button
            key={shape}
            type="button"
            disabled={disabled}
            aria-label={t("floor.addShape", { shape: label })}
            onClick={() => onAdd(shape)}
            className={cn(
              "flex min-w-[76px] flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2.5 transition-colors",
              "hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60",
              "md:min-w-[80px] md:flex-none lg:w-[76px] lg:min-w-0 lg:shrink-0",
            )}
          >
            <span className="flex h-6 items-center justify-center">
              <span className={cn("border-2 border-slate-400 bg-slate-50", glyphClasses(shape))} />
            </span>
            <span className="text-caption font-medium leading-tight text-slate-600 md:text-xs">
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default ShapePalette;
