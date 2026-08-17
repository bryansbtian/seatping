import * as React from "react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Loader2, AlertTriangle, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface ConfirmModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  title: string;
  description: string;
  helperText?: string;
  cancelText?: string;
  confirmText?: string;
  loadingText?: string;
  onConfirm: () => Promise<void> | void;
  successMessage?: string;
  errorMessage?: string;
  variant?: "destructive" | "default";
  icon?: "trash" | "warning" | null;
}

export function ConfirmModal({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  helperText,
  cancelText = "Cancel",
  confirmText = "Confirm",
  loadingText = "Processing...",
  onConfirm,
  successMessage,
  errorMessage = "An error occurred. Please try again.",
  variant = "destructive",
  icon = "trash",
}: ConfirmModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const { toast } = useToast();

  const isControlled = open !== undefined;
  let actualOpen: boolean | undefined;
  if (isControlled) {
    actualOpen = open;
  } else {
    actualOpen = isOpen;
  }
  let setActualOpen: (next: boolean) => void;
  if (isControlled) {
    setActualOpen = onOpenChange || (() => {});
  } else {
    setActualOpen = setIsOpen;
  }

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (loading) {
      return;
    }
    
    setLoading(true);
    try {
      await onConfirm();
      if (successMessage) {
        toast({ title: successMessage });
      }
      setActualOpen(false);
    } catch (error: any) {
      toast({
        title: errorMessage,
        description: error?.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  let confirmLabel: string;
  if (loading) {
    confirmLabel = loadingText;
  } else {
    confirmLabel = confirmText;
  }

  return (
    <AlertDialog open={actualOpen} onOpenChange={setActualOpen}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            {icon === "trash" && <Trash2 className="h-5 w-5 text-red-600" />}
            {icon === "warning" && <AlertTriangle className="h-5 w-5 text-amber-500" />}
            <AlertDialogTitle className="text-slate-900">{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-2 text-slate-500">
            {description}
            {helperText && (
              <span className="block mt-2 text-sm text-slate-400">
                {helperText}
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel disabled={loading}>{cancelText}</AlertDialogCancel>
          <Button
            variant={variant}
            onClick={handleConfirm}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
