"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Modal } from "./modal";
import { Button } from "./button";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
  variant?: "default" | "danger";
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
  loading = false,
  variant = "default",
}: ConfirmDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      const result = onConfirm();
      if (result instanceof Promise) {
        await result;
      }
    } finally {
      setIsLoading(false);
      onClose();
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onClose();
  };

  return (
    <Modal open={open} onClose={handleCancel} title={title} size="sm">
      <div className="space-y-6">
        <div className={cn("text-sm text-[var(--text-secondary)]", variant === "danger" && "text-[var(--status-danger)]")}>
          {message}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={handleCancel} disabled={isLoading || loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            onClick={handleConfirm}
            loading={isLoading || loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
