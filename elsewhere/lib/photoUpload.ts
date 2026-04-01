const JPEG_MIMES = new Set(["image/jpeg", "image/jpg"]);
const PNG_MIMES = new Set(["image/png"]);
const HEIC_HEIF_MIMES = new Set(["image/heic", "image/heif"]);
const HEIC_HEIF_EXTS = [".heic", ".heif"];

export const PHOTO_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const PHOTO_FILE_ACCEPT = "image/jpeg,image/png,.heic,.heif";

function lowerExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function isHeicHeif(file: File): boolean {
  const ext = lowerExt(file.name);
  return HEIC_HEIF_MIMES.has(file.type.toLowerCase()) || HEIC_HEIF_EXTS.includes(ext);
}

function isJpegOrPng(file: File): boolean {
  const mime = file.type.toLowerCase();
  const ext = lowerExt(file.name);
  return (
    JPEG_MIMES.has(mime) ||
    PNG_MIMES.has(mime) ||
    ext === ".jpg" ||
    ext === ".jpeg" ||
    ext === ".png"
  );
}

function replaceExt(name: string, nextExt: string): string {
  const i = name.lastIndexOf(".");
  if (i === -1) return `${name}.${nextExt}`;
  return `${name.slice(0, i)}.${nextExt}`;
}

/**
 * Runtime validation is required because file picker filters can be bypassed
 * (drag/drop, MIME spoofing, or platform quirks). Never trust `accept` alone.
 */
export function validateSelectedPhotoFileType(file: File): {
  ok: boolean;
  requiresHeicConversion: boolean;
} {
  if (isJpegOrPng(file)) {
    return { ok: true, requiresHeicConversion: false };
  }
  if (isHeicHeif(file)) {
    return { ok: true, requiresHeicConversion: true };
  }
  return { ok: false, requiresHeicConversion: false };
}

/**
 * iPhone cameras frequently produce HEIC/HEIF which browsers/storage pipelines
 * don't consistently handle. Convert to JPEG client-side so uploaded files are
 * web-safe and compatible across clients.
 */
export async function normalizePhotoForUpload(file: File): Promise<File> {
  const typeCheck = validateSelectedPhotoFileType(file);
  if (!typeCheck.ok) {
    throw new Error("Unsupported file type. Use JPEG, PNG, or HEIC/HEIF.");
  }

  if (!typeCheck.requiresHeicConversion) {
    return file;
  }

  let convertedBlob: Blob;
  try {
    const heic2anyModule = await import("heic2any");
    const heic2any = heic2anyModule.default as unknown as (args: {
      blob: Blob;
      toType: string;
      quality?: number;
    }) => Promise<Blob | Blob[]>;

    const sourceBlob = new Blob([await file.arrayBuffer()], {
      type: file.type || "image/heic",
    });
    const result = await heic2any({
      blob: sourceBlob,
      toType: "image/jpeg",
      quality: 0.9,
    });
    convertedBlob = Array.isArray(result) ? result[0] : result;
  } catch {
    throw new Error("Could not convert HEIC/HEIF photo. Please try a JPEG or PNG.");
  }

  return new File([convertedBlob], replaceExt(file.name, "jpg"), {
    type: "image/jpeg",
  });
}
