import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";
import {
  createCombination,
  deleteCombination,
  fetchCombinations,
  type DiningTable,
  type TableCombination,
} from "@/lib/floorApi";
import { cn } from "@/lib/utils";

type CombinationsCardProps = {
  locationId: string;
  tables: DiningTable[];
};

const MIN_TABLES = 2;

const CombinationsCard = ({ locationId, tables }: CombinationsCardProps) => {
  const { t } = useLang();
  const { toast } = useToast();
  const [combinations, setCombinations] = useState<TableCombination[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TKey | null>(null);

  const load = useCallback(async () => {
    const loaded = await fetchCombinations(locationId);
    setCombinations(loaded);
  }, [locationId]);

  useEffect(() => {
    let cancelled = false;
    fetchCombinations(locationId)
      .then((loaded) => {
        if (!cancelled) {
          setCombinations(loaded);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  const reportFailure = useCallback(
    (err: unknown) => {
      let description = "";
      if (err instanceof Error) {
        description = err.message;
      }
      toast({ title: t("floor.toast.failed"), description, variant: "destructive" });
    },
    [t, toast],
  );

  const toggle = (tableId: string) => {
    setError(null);
    setPicked((previous) => {
      if (previous.includes(tableId)) {
        return previous.filter((id) => id !== tableId);
      }
      return [...previous, tableId];
    });
  };

  const handleCreate = async () => {
    if (picked.length < MIN_TABLES) {
      setError("floor.combos.needTwo");
      return;
    }
    setBusy(true);
    try {
      await createCombination(locationId, { tableIds: picked });
      await load();
      setPicked([]);
      toast({ title: t("floor.combos.toast.created") });
    } catch (err) {
      reportFailure(err);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (combinationId: string) => {
    setBusy(true);
    try {
      await deleteCombination(locationId, combinationId);
      await load();
      toast({ title: t("floor.combos.toast.deleted") });
    } catch (err) {
      reportFailure(err);
    } finally {
      setBusy(false);
    }
  };

  let list = <p className="text-xs text-slate-500">{t("floor.combos.empty")}</p>;
  if (combinations.length > 0) {
    list = (
      <ul className="flex flex-col gap-2" data-testid="combination-list">
        {combinations.map((combination) => (
          <li
            key={combination.id}
            data-testid={`combination-${combination.name}`}
            className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"
          >
            <span className="min-w-0 truncate text-xs font-medium text-slate-800">
              {combination.name}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-[11px] text-slate-500">
                {t("floor.combos.seats", { n: combination.capacity })}
              </span>
              <ConfirmModal
                title={t("floor.combos.delete")}
                description={t("floor.combos.hint")}
                cancelText={t("common.cancel")}
                confirmText={t("floor.combos.delete")}
                onConfirm={() => handleDelete(combination.id)}
                trigger={
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 text-red-600 hover:text-red-700"
                    aria-label={t("floor.combos.delete")}
                    disabled={busy}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                }
              />
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card className="border border-slate-200 bg-white shadow-sm">
      <CardContent className="space-y-3 p-3 md:space-y-4 md:p-5">
        <div className="space-y-1">
          <CardTitle className="text-lg text-slate-800 md:text-xl">
            {t("floor.combos.title")}
          </CardTitle>
          <p className="text-[11px] text-slate-500">{t("floor.combos.hint")}</p>
        </div>

        {list}

        <div className="flex flex-wrap gap-2" data-testid="combination-picker">
          {tables.map((table) => {
            const selected = picked.includes(table.id);
            return (
              <button
                key={table.id}
                type="button"
                disabled={busy}
                aria-pressed={selected}
                data-testid={`combination-pick-${table.name}`}
                onClick={() => toggle(table.id)}
                className={cn(
                  "rounded-xl border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                  selected && "border-indigo-600 bg-indigo-600 text-white",
                  !selected && "border-slate-200 text-slate-600 hover:bg-slate-50",
                )}
              >
                {table.name}
              </button>
            );
          })}
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-600">
            {t(error)}
          </p>
        )}

        <Button
          size="sm"
          className="h-9 w-full text-xs"
          disabled={busy}
          data-testid="combination-create"
          onClick={handleCreate}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {t("floor.combos.create")}
        </Button>
      </CardContent>
    </Card>
  );
};

export default CombinationsCard;
