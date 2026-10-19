import { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Download01Icon,
  Edit02Icon,
  Refresh01Icon,
  Search01Icon,
  UsersRoundIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { FilterButton } from "@/components/ui/collection-controls";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { SelectFilter } from "@/components/restaurant-discovery/RestaurantFilters";
import ListSkeleton from "@/components/ListSkeleton";
import BusinessEmptyState from "@/components/BusinessEmptyState";
import { useToast } from "@/hooks/use-toast";
import { invalidateRestaurantConfiguration } from "@/lib/queryClient";
import { formatEnteredPhone } from "@shared/phone";

type AccountRow = {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  trial: boolean;
  maxLocations: number;
  baseCredits: number;
  locationCount: number;
};

type Account = Omit<AccountRow, "id" | "locationCount"> & {
  trialDurationDays: number;
  creditsStartedAt: string | null;
  locations: { address: string; displayName?: string | null; credits: number }[];
};

type AccountDraft = Omit<
  Account,
  "trialDurationDays" | "maxLocations" | "baseCredits" | "locations"
> & {
  trialDurationDays: number | "";
  maxLocations: number | "";
  baseCredits: number | "";
  locations: { address: string; displayName?: string | null; credits: number | "" }[];
};

export default function CustomerManagementAdmin({
  search,
  onSearchChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [access, setAccess] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const exportController = useRef<AbortController | null>(null);
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    const value = search.trim();
    if (value === query) {
      return;
    }
    const timer = setTimeout(() => {
      setQuery(value);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, query]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(page === 1);
      setLoadingMore(page > 1);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(page), access, sort });
        if (query) {
          params.set("search", query);
        }
        const response = await fetch(`/admin/customer?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Unable to load business accounts. Please try again.");
        }
        const data = await response.json();
        if (controller.signal.aborted) {
          return;
        }
        const accounts = data.customers as AccountRow[];
        setRows((previous) => {
          if (page === 1) {
            return accounts;
          }
          const combined = new Map(previous.map((account) => [account.id, account]));
          for (const account of accounts) {
            combined.set(account.id, account);
          }
          return Array.from(combined.values());
        });
        setTotal(data.total);
        if (accounts.length === 0 && page > 1) {
          setTotal(0);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("Unable to load business accounts. Please try again.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    };
    void load();
    return () => controller.abort();
  }, [query, access, sort, page, revision]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || loading || loadingMore || error || rows.length >= total) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          setLoadingMore(true);
          setPage((value) => value + 1);
        }
      },
      { root: target.closest("main"), rootMargin: "160px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loading, loadingMore, error, rows.length, total]);

  useEffect(() => () => exportController.current?.abort(), []);

  const exportAccounts = async () => {
    if (rows.length === 0 || loading || exporting) {
      return;
    }
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    try {
      const accounts = new Map<string, AccountRow>();
      let exportPage = 1;
      let exportTotal = 1;
      while (accounts.size < exportTotal) {
        const params = new URLSearchParams({ page: String(exportPage), access, sort });
        if (query) {
          params.set("search", query);
        }
        const response = await fetch(`/admin/customer?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Unable to export business accounts. Please try again.");
        }
        const data = await response.json();
        if (controller.signal.aborted) {
          return;
        }
        const batch = data.customers as AccountRow[];
        if (batch.length === 0) {
          break;
        }
        for (const account of batch) {
          accounts.set(account.id, account);
        }
        exportTotal = data.total;
        exportPage += 1;
        if ((exportPage - 1) * data.pageSize >= exportTotal) {
          break;
        }
      }
      const csv = Papa.unparse(
        Array.from(accounts.values()).map((account) => {
          let accessLabel = "Paid";
          if (account.trial) {
            accessLabel = "Trial";
          }
          return {
            Business: account.name,
            Username: account.username,
            Email: account.email,
            Phone: formatEnteredPhone(account.phone),
            Access: accessLabel,
            Locations: account.locationCount,
            "Max Locations": account.maxLocations,
            "Base Credits": account.baseCredits,
          };
        }),
        { escapeFormulae: true },
      );
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `business-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      if (!controller.signal.aborted) {
        toast({
          title: "Export Failed",
          description: "Unable to export business accounts. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setExporting(false);
      }
    }
  };
  let refreshIconClass = "size-4";
  if (loading) {
    refreshIconClass += " animate-spin";
  }

  let content;
  if (loading) {
    content = <ListSkeleton fill label="Loading Business Accounts" />;
  } else if (error && (page === 1 || rows.length === 0)) {
    content = (
      <BusinessEmptyState icon={UsersRoundIcon} title="Unable To Load Accounts" body={error}>
        <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>
          Try Again
        </Button>
      </BusinessEmptyState>
    );
  } else if (rows.length === 0) {
    let body = "Business accounts will appear here once they register.";
    if (query || access !== "all") {
      body =
        "No accounts match your search or access filter. Try another search or clear the filters.";
    }
    content = <BusinessEmptyState icon={UsersRoundIcon} title="No Accounts Found" body={body} />;
  } else {
    content = (
      <div
        role="region"
        aria-label="Business Accounts Table"
        tabIndex={0}
        className="min-w-0 grow shrink-0 overflow-x-auto [contain:layout_paint] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <table className="w-full min-w-[52rem] border-collapse text-body">
          <caption className="sr-only">
            Business accounts, contact information, access, locations, and credits
          </caption>
          <thead className="border-b border-border text-left text-label text-ink-subtle">
            <tr className="h-row">
              {["Business", "Contact", "Access", "Locations", "Base Credits"].map((label) => {
                let headerClass = "px-4 font-medium";
                if (["Access", "Locations", "Base Credits"].includes(label)) {
                  headerClass += " text-center";
                }
                return (
                  <th key={label} scope="col" className={headerClass}>
                    {label}
                  </th>
                );
              })}
              <th scope="col" className="bg-white px-4 text-right font-medium md:sticky md:right-0">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((account) => {
              let accessLabel = "Paid";
              let accessTone: "info" | "neutral" = "neutral";
              if (account.trial) {
                accessLabel = "Trial";
                accessTone = "info";
              }
              return (
                <tr
                  key={account.id}
                  className="group h-row-lg transition-colors duration-150 hover:bg-slate-50"
                >
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    <div className="text-body font-medium text-ink">{account.name}</div>
                    <div className="mt-0.5 text-caption text-ink-subtle">@{account.username}</div>
                  </th>
                  <td className="px-4 py-2">
                    <div className="text-ink">{account.email}</div>
                    <div className="mt-0.5 whitespace-nowrap text-caption text-ink-subtle">
                      {formatEnteredPhone(account.phone) || "-"}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <Badge variant={accessTone}>{accessLabel}</Badge>
                  </td>
                  <td className="px-4 py-2 text-center tabular-nums">
                    {account.locationCount}{" "}
                    <span className="text-ink-subtle">/ {account.maxLocations}</span>
                  </td>
                  <td className="px-4 py-2 text-center tabular-nums">
                    {account.baseCredits.toLocaleString()}
                  </td>
                  <td className="bg-white px-4 py-2 text-right group-hover:bg-slate-50 md:sticky md:right-0">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Edit ${account.username}`}
                      onClick={() => setEditing(account.username)}
                    >
                      <HugeiconsIcon icon={Edit02Icon} className="size-4" />
                      Edit
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      <Card
        data-testid="admin-content-card"
        className="flex min-w-0 grow shrink-0 flex-col overflow-hidden"
      >
        <CardContent className="flex min-w-0 grow shrink-0 flex-col p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 md:p-4">
            <div className="flex shrink-0 items-center gap-1">
              <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                <SheetTrigger asChild>
                  <FilterButton aria-label="Filter">
                    Filter{access !== "all" && <Badge variant="neutral">1</Badge>}
                  </FilterButton>
                </SheetTrigger>
                <SheetContent
                  side="bottom"
                  hideClose
                  className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 data-[state=open]:duration-200 data-[state=closed]:duration-150 motion-reduce:animate-none md:bottom-auto md:left-1/2 md:top-1/2 md:w-[28rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
                >
                  <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
                    <SheetTitle>Filter</SheetTitle>
                    <SheetClose asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="control-lg"
                        aria-label="Close Filter"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                      </Button>
                    </SheetClose>
                  </div>
                  <SheetDescription className="sr-only">
                    Filter business accounts by access.
                  </SheetDescription>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
                    <fieldset className="min-w-0">
                      <legend className="mb-3 text-label text-ink">Access</legend>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: "all", label: "All Access" },
                          { value: "trial", label: "Trial" },
                          { value: "paid", label: "Paid" },
                        ].map(({ value, label }) => {
                          let variant: "default" | "outline" = "outline";
                          if (access === value) {
                            variant = "default";
                          }
                          return (
                            <Button
                              key={value}
                              variant={variant}
                              aria-pressed={access === value}
                              onClick={() => {
                                setAccess(value);
                                setPage(1);
                              }}
                            >
                              {label}
                            </Button>
                          );
                        })}
                      </div>
                    </fieldset>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 border-t border-border bg-background p-4">
                    <Button
                      variant="outline"
                      size="lg"
                      className="px-4"
                      disabled={access === "all"}
                      onClick={() => {
                        setAccess("all");
                        setPage(1);
                      }}
                    >
                      Clear Filters
                    </Button>
                    <SheetClose asChild>
                      <Button size="lg" className="min-w-0 flex-1 px-4">
                        Show Accounts
                      </Button>
                    </SheetClose>
                  </div>
                </SheetContent>
              </Sheet>
              <SelectFilter
                label="Sort By"
                kind="sort"
                size="sm"
                current={sort}
                clearable={false}
                options={[
                  { value: "newest", label: "Newest First" },
                  { value: "oldest", label: "Oldest First" },
                  { value: "name", label: "Business Name" },
                ]}
                onChange={(value) => {
                  if (value) {
                    setSort(value);
                    setPage(1);
                  }
                }}
              />
            </div>
            <div className="relative order-last w-full min-w-0 md:order-none md:w-auto md:flex-1">
              <HugeiconsIcon
                icon={Search01Icon}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
              />
              <Input
                aria-label="Search Business Accounts"
                placeholder="Search By Business, Username, Email, Or Phone"
                maxLength={200}
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                className="pl-9"
              />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-label="Export"
                title="Export Matching Accounts"
                disabled={loading || exporting || rows.length === 0}
                onClick={exportAccounts}
              >
                <HugeiconsIcon icon={Download01Icon} className="size-4" />
                <span className="hidden sm:inline">
                  {exporting && "Exporting"}
                  {!exporting && "Export"}
                </span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label="Refresh"
                disabled={loading}
                onClick={() => {
                  setPage(1);
                  setRevision((value) => value + 1);
                }}
              >
                <HugeiconsIcon icon={Refresh01Icon} className={refreshIconClass} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>
          {content}
          {!loading && rows.length > 0 && (
            <div ref={loadMoreRef}>
              {loadingMore && <ListSkeleton rows={1} label="Loading More Accounts" />}
              {error && page > 1 && (
                <div role="alert" className="flex flex-wrap items-center justify-center gap-3 p-4">
                  <p className="text-body text-ink-subtle">{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRevision((value) => value + 1)}
                  >
                    Try Again
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      {editing && (
        <CustomerEditor
          username={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setPage(1);
            setRevision((value) => value + 1);
          }}
        />
      )}
    </>
  );
}

function CustomerEditor({
  username,
  onClose,
  onSaved,
}: {
  username: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [original, setOriginal] = useState<Account | null>(null);
  const [draft, setDraft] = useState<AccountDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const response = await fetch(`/admin/customer/${encodeURIComponent(username)}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Unable to load account");
        }
        const data: { customer: Account } = await response.json();
        if (!controller.signal.aborted) {
          setOriginal(data.customer);
          setDraft({
            ...data.customer,
            locations: data.customer.locations.map((location) => ({ ...location })),
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => controller.abort();
  }, [username, attempt]);

  const save = async () => {
    if (!draft || !original) {
      return;
    }
    if (
      draft.trialDurationDays === "" ||
      draft.maxLocations === "" ||
      draft.baseCredits === "" ||
      draft.locations.some((location) => location.credits === "")
    ) {
      setConfirm(false);
      toast({
        title: "Error",
        description:
          "Trial duration, max locations, base credits, and location credits cannot be blank",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/admin/customer/${encodeURIComponent(username)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          username: draft.username,
          email: draft.email,
          phone: draft.phone,
          trial: draft.trial,
          trialDurationDays: draft.trialDurationDays,
          maxLocations: draft.maxLocations,
          baseCredits: draft.baseCredits,
          locations: draft.locations.map((location) => ({
            address: location.address,
            credits: Number(location.credits),
          })),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to update customer");
      }
      void invalidateRestaurantConfiguration();
      toast({ title: "Success", description: "Customer updated successfully" });
      onSaved();
    } catch (failure) {
      let message = "Network error occurred";
      if (failure instanceof Error) {
        message = failure.message;
      }
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
      setConfirm(false);
    }
  };

  const updateNumber = (key: "trialDurationDays" | "maxLocations" | "baseCredits", raw: string) => {
    if (!draft) {
      return;
    }
    if (raw === "") {
      setDraft({ ...draft, [key]: "" });
      return;
    }
    const value = Number.parseInt(raw, 10);
    if (Number.isFinite(value) && value >= 0) {
      setDraft({ ...draft, [key]: value });
    }
  };

  let saveLabel = "Save Changes";
  if (saving) {
    saveLabel = "Saving...";
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
          <DialogDescription>
            Update the account, access, locations, and credits for {username}.
          </DialogDescription>
        </DialogHeader>
        {loading && <ListSkeleton label="Loading Account Details" />}
        {!loading && error && (
          <div role="alert" className="space-y-3 text-body text-ink-subtle">
            <p>Unable to load this account. Please try again.</p>
            <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
              Try Again
            </Button>
          </div>
        )}
        {!loading && !error && draft && original && (
          <>
            <fieldset disabled={saving} className="min-w-0 space-y-6">
              <section className="space-y-3">
                <h3 className="text-title text-ink">Account Information</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      { key: "name", label: "Name", type: "text" },
                      { key: "username", label: "Username", type: "text" },
                      { key: "email", label: "Email", type: "email" },
                      { key: "phone", label: "Phone", type: "tel" },
                    ] as const
                  ).map(({ key, label, type }) => (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={`customer-${key}`}>{label}</Label>
                      <Input
                        id={`customer-${key}`}
                        type={type}
                        value={draft[key]}
                        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                      />
                    </div>
                  ))}
                </div>
              </section>
              <section className="space-y-3 border-t border-border pt-5">
                <h3 className="text-title text-ink">Trial & Access</h3>
                <div className="flex items-center gap-3">
                  <Switch
                    id="customer-trial"
                    checked={draft.trial}
                    onCheckedChange={(value) => setDraft({ ...draft, trial: value })}
                  />
                  <Label htmlFor="customer-trial">Trial Access</Label>
                </div>
                <p className="text-caption text-ink-subtle">
                  Turn Trial off to activate paid access. Credits start then and refill monthly.
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  {(
                    [
                      { key: "trialDurationDays", label: "Trial Duration (Days)" },
                      { key: "maxLocations", label: "Max Locations" },
                      { key: "baseCredits", label: "Base Credits" },
                    ] as const
                  ).map(({ key, label }) => (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={`customer-${key}`}>{label}</Label>
                      <Input
                        id={`customer-${key}`}
                        type="number"
                        min={0}
                        value={draft[key]}
                        onChange={(event) => updateNumber(key, event.target.value)}
                      />
                    </div>
                  ))}
                </div>
                {original.creditsStartedAt && (
                  <p className="text-caption text-ink-subtle">
                    Credits Cycle Started:{" "}
                    {new Date(original.creditsStartedAt).toLocaleDateString("en-US")}
                  </p>
                )}
              </section>
              <section className="space-y-3 border-t border-border pt-5">
                <h3 className="text-title text-ink">Locations</h3>
                {draft.locations.length === 0 && (
                  <p className="text-body text-ink-subtle">
                    This business has not added any locations yet.
                  </p>
                )}
                {draft.locations.map((location, index) => (
                  <div
                    key={index}
                    className="space-y-3 rounded-xl border border-border bg-slate-50 p-4"
                  >
                    <h4 className="text-label text-ink">
                      {location.displayName || `Location ${index + 1}`}
                    </h4>
                    <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                      <div className="space-y-2">
                        <Label htmlFor={`customer-address-${index}`}>Address</Label>
                        <Input
                          id={`customer-address-${index}`}
                          value={location.address}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              locations: draft.locations.map((value, position) => {
                                if (position === index) {
                                  return { ...value, address: event.target.value };
                                }
                                return value;
                              }),
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`customer-credits-${index}`}>Credits</Label>
                        <Input
                          id={`customer-credits-${index}`}
                          type="number"
                          min={0}
                          value={location.credits}
                          onChange={(event) => {
                            let value: number | "" = "";
                            if (event.target.value !== "") {
                              value = Number.parseInt(event.target.value, 10);
                              if (!Number.isFinite(value) || value < 0) {
                                return;
                              }
                            }
                            setDraft({
                              ...draft,
                              locations: draft.locations.map((entry, position) => {
                                if (position === index) {
                                  return { ...entry, credits: value };
                                }
                                return entry;
                              }),
                            });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            </fieldset>
            <DialogFooter>
              <Button variant="outline" disabled={saving} onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={saving} onClick={() => setConfirm(true)}>
                {saveLabel}
              </Button>
            </DialogFooter>
            <AlertDialog
              open={confirm}
              onOpenChange={(open) => {
                if (!saving) {
                  setConfirm(open);
                }
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm Changes</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3 text-body text-ink-subtle">
                      <p>Apply the account, location, and credit changes to {username}?</p>
                      <p>
                        Name: {draft.name}
                        <br />
                        Username: {draft.username}
                        <br />
                        Email: {draft.email}
                        <br />
                        Phone: {formatEnteredPhone(draft.phone)}
                        <br />
                        Trial Duration: {draft.trialDurationDays} Days
                        <br />
                        Max Locations: {draft.maxLocations}
                        <br />
                        Base Credits: {draft.baseCredits}
                      </p>
                      {draft.trial !== original.trial && (
                        <p>
                          Changing trial access resets the credit cycle. Turning Trial off starts
                          the monthly credit cycle.
                        </p>
                      )}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={saving}
                    onClick={(event) => {
                      event.preventDefault();
                      void save();
                    }}
                  >
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
