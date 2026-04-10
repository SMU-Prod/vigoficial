/**
 * File validation utility with magic bytes verification
 * Ensures uploaded files are safe and match expected types
 */

export interface FileValidationOptions {
  maxSizeMB?: number;
  allowedTypes?: string[];
  allowedExtensions?: string[];
}

export interface FileValidationResult {
  valid: boolean;
  errors: string[];
}

// Common file signatures (magic bytes)
const MAGIC_BYTES: Record<string, Uint8Array> = {
  pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // %PDF
  pfx: new Uint8Array([0x30, 0x82]), // DER sequence (PFX/PKCS12)
  p12: new Uint8Array([0x30, 0x82]), // DER sequence (PKCS12)
  png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG
  jpg: new Uint8Array([0xff, 0xd8, 0xff]), // JPEG
  gif: new Uint8Array([0x47, 0x49, 0x46]), // GIF
  zip: new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // ZIP
  docx: new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // DOCX (ZIP-based)
};

// Dangerous file extensions
const DANGEROUS_EXTENSIONS = [
  "exe",
  "bat",
  "cmd",
  "com",
  "scr",
  "vbs",
  "js",
  "ps1",
  "psm1",
  "msi",
  "dll",
  "sys",
  "jar",
];

// Presets for common file types
export const CERTIFICATE_PRESET: FileValidationOptions = {
  maxSizeMB: 5,
  allowedTypes: ["application/x-pkcs12"],
  allowedExtensions: ["pfx", "p12"],
};

export const DOCUMENT_PRESET: FileValidationOptions = {
  maxSizeMB: 10,
  allowedTypes: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  allowedExtensions: ["pdf", "doc", "docx"],
};

export const IMAGE_PRESET: FileValidationOptions = {
  maxSizeMB: 5,
  allowedTypes: ["image/jpeg", "image/png", "image/gif"],
  allowedExtensions: ["jpg", "jpeg", "png", "gif"],
};

/**
 * Validate a file based on options
 * Checks size, MIME type, extension, and magic bytes
 */
export function validateFile(
  file: File | Buffer,
  options: FileValidationOptions = {}
): FileValidationResult {
  const errors: string[] = [];

  // Get filename
  const filename = file instanceof File ? file.name : "buffer";
  const extension = getFileExtension(filename).toLowerCase();

  // Check extension against dangerous list first
  if (DANGEROUS_EXTENSIONS.includes(extension)) {
    errors.push(`File extension .${extension} is not allowed (dangerous)`);
  }

  // Validate size
  const maxSizeBytes = (options.maxSizeMB || 10) * 1024 * 1024;
  const fileSize = file instanceof File ? file.size : file.length;

  if (fileSize > maxSizeBytes) {
    errors.push(
      `File size (${(fileSize / 1024 / 1024).toFixed(2)}MB) exceeds maximum (${options.maxSizeMB || 10}MB)`
    );
  }

  // Validate MIME type
  if (options.allowedTypes && options.allowedTypes.length > 0) {
    const mimeType = file instanceof File ? file.type : "";
    if (mimeType && !options.allowedTypes.includes(mimeType)) {
      errors.push(
        `MIME type ${mimeType} not allowed. Allowed: ${options.allowedTypes.join(", ")}`
      );
    }
  }

  // Validate extension
  if (options.allowedExtensions && options.allowedExtensions.length > 0) {
    const allowedExt = options.allowedExtensions.map((e) => e.toLowerCase());
    if (!allowedExt.includes(extension)) {
      errors.push(
        `File extension .${extension} not allowed. Allowed: .${allowedExt.join(", .")}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate file with magic bytes verification
 * Returns true only if file header matches expected type
 */
export async function validateFileMagicBytes(
  buffer: Buffer | Uint8Array,
  fileType: string
): Promise<boolean> {
  const magicSignature = MAGIC_BYTES[fileType.toLowerCase()];

  if (!magicSignature) {
    // No magic bytes defined for this type, skip verification
    return true;
  }

  const header = new Uint8Array(buffer.slice(0, magicSignature.length));

  // Compare byte by byte
  for (let i = 0; i < magicSignature.length; i++) {
    if (header[i] !== magicSignature[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Check if buffer contains executable signatures
 */
export function hasExecutableSignatures(buffer: Buffer | Uint8Array): boolean {
  const header = buffer.slice(0, 8);

  // PE executable signature (MZ)
  if (header[0] === 0x4d && header[1] === 0x5a) {
    return true;
  }

  // ELF executable signature
  if (
    header[0] === 0x7f &&
    header[1] === 0x45 &&
    header[2] === 0x4c &&
    header[3] === 0x46
  ) {
    return true;
  }

  // Mach-O (macOS) signature
  if (
    (header[0] === 0xfe &&
      header[1] === 0xed &&
      header[2] === 0xfa &&
      header[3] === 0xce) ||
    (header[0] === 0xfe &&
      header[1] === 0xed &&
      header[2] === 0xfa &&
      header[3] === 0xcf)
  ) {
    return true;
  }

  return false;
}

/**
 * Comprehensive file validation with all checks
 */
export async function validateFileComprehensive(
  file: File | Buffer,
  options: FileValidationOptions = {}
): Promise<FileValidationResult> {
  // Basic validation
  const basicResult = validateFile(file, options);

  if (!basicResult.valid) {
    return basicResult;
  }

  // Get buffer from File or Buffer
  let buffer: Buffer | Uint8Array;
  if (file instanceof File) {
    buffer = new Uint8Array(await file.arrayBuffer());
  } else {
    buffer = file;
  }

  // Check for executable signatures
  if (hasExecutableSignatures(buffer)) {
    return {
      valid: false,
      errors: ["File contains executable signature (potential malware)"],
    };
  }

  // Validate magic bytes if extension provided
  const extension = getFileExtension(
    file instanceof File ? file.name : "file"
  ).toLowerCase();

  if (extension && MAGIC_BYTES[extension]) {
    const hasMagic = await validateFileMagicBytes(buffer, extension);
    if (!hasMagic) {
      return {
        valid: false,
        errors: [
          `File header does not match .${extension} format (possible file type spoofing)`,
        ],
      };
    }
  }

  return {
    valid: true,
    errors: [],
  };
}

/**
 * Extract file extension from filename
 */
function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}
