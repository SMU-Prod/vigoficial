"use client";

import { forwardRef, useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (files: File[]) => void;
  accept?: string;
  maxSize?: number;
  maxFiles?: number;
  multiple?: boolean;
  disabled?: boolean;
  onError?: (error: string) => void;
}

export const FileUpload = forwardRef<HTMLDivElement, FileUploadProps>(
  (
    {
      onFileSelect,
      accept,
      maxSize = 10 * 1024 * 1024,
      maxFiles = 5,
      multiple = true,
      disabled = false,
      onError,
    },
    ref
  ) => {
    const [isDragging, setIsDragging] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<{ file: File; preview: string }[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    const isImage = (file: File) => file.type.startsWith("image/");

    const generatePreview = async (file: File) => {
      if (isImage(file)) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPreviews((prev) => [...prev, { file, preview: e.target?.result as string }]);
        };
        reader.readAsDataURL(file);
      }
    };

    const validateFiles = (filesToValidate: File[]): File[] => {
      const valid: File[] = [];

      filesToValidate.forEach((file) => {
        if (file.size > maxSize) {
          const sizeMB = (maxSize / (1024 * 1024)).toFixed(1);
          onError?.(`Arquivo "${file.name}" excede o tamanho máximo de ${sizeMB}MB`);
          return;
        }

        if (files.length + valid.length >= maxFiles) {
          onError?.(`Limite de ${maxFiles} arquivos atingido`);
          return;
        }

        valid.push(file);
      });

      return valid;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const handleFiles = (filesToProcess: File[]) => {
      const validFiles = validateFiles(filesToProcess);

      validFiles.forEach((file) => {
        generatePreview(file);
      });

      const updatedFiles = multiple ? [...files, ...validFiles] : validFiles;
      setFiles(updatedFiles);
      onFileSelect(updatedFiles);
    };

    const handleDragEnter = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragging(true);
    }, [disabled]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    }, []);

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (!disabled) {
          const droppedFiles = Array.from(e.dataTransfer.files);
          handleFiles(droppedFiles);
        }
      },
      [disabled, handleFiles]
    );

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const selectedFiles = Array.from(e.target.files);
        handleFiles(selectedFiles);
      }
    };

    const handleRemoveFile = (index: number) => {
      const updatedFiles = files.filter((_, i) => i !== index);
      const updatedPreviews = previews.filter((_, i) => i !== index);

      setFiles(updatedFiles);
      setPreviews(updatedPreviews);
      onFileSelect(updatedFiles);
    };

    return (
      <div ref={ref} className="space-y-4">
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={cn(
            "relative border-2 border-dashed rounded-lg p-8 text-center transition-colors",
            isDragging ? "border-[var(--vigi-gold)] bg-[var(--status-warning-bg)]" : "border-[var(--border-primary)] bg-[var(--bg-tertiary)]",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            onChange={handleInputChange}
            multiple={multiple}
            accept={accept}
            disabled={disabled}
            className="hidden"
            aria-label="Upload de arquivo"
          />

          <svg className="mx-auto h-12 w-12 text-[var(--text-tertiary)] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
            />
          </svg>

          <p className="text-sm font-medium text-[var(--text-primary)]">
            Arraste arquivos aqui ou{" "}
            <button
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="text-[var(--vigi-gold)] hover:text-[#B89040] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              clique para selecionar
            </button>
          </p>

          {accept && <p className="text-xs text-[var(--text-secondary)] mt-2">Formatos aceitos: {accept}</p>}

          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Tamanho máximo: {(maxSize / (1024 * 1024)).toFixed(1)}MB
            {maxFiles > 1 && ` • Limite: ${maxFiles} arquivos`}
          </p>
        </div>

        {previews.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {previews.map((item, index) => (
              <div key={index} className="relative group rounded-lg overflow-hidden border border-[var(--border-primary)] bg-[var(--bg-tertiary)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.preview} alt={item.file.name} className="w-full h-24 object-cover" />

                <button
                  onClick={() => handleRemoveFile(index)}
                  className={cn(
                    "absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100",
                    "transition-opacity"
                  )}
                  aria-label={`Remover ${item.file.name}`}
                >
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1">
                  <p className="text-xs text-white truncate">{item.file.name}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {files.length > previews.length && (
          <div className="space-y-2">
            {files
              .filter((f) => !isImage(f))
              .map((file, index) => (
                <div key={index} className="flex items-center justify-between p-3 border border-[var(--border-primary)] rounded-lg bg-[var(--bg-tertiary)]">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <svg className="w-5 h-5 text-[var(--text-tertiary)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{file.name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{(file.size / 1024).toFixed(1)}KB</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveFile(index)}
                    className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] ml-2 flex-shrink-0"
                    aria-label={`Remover ${file.name}`}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    );
  }
);

FileUpload.displayName = "FileUpload";
