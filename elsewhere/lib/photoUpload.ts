const JPEG_MIMES = new Set(["image/jpeg", "image/jpg"]);
const PNG_MIMES = new Set(["image/png"]);
const HEIC_HEIF_MIMES = new Set(["image/heic", "image/heif"]);
const HEIC_HEIF_EXTS = [".heic", ".heif"];

export const PHOTO_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const PHOTO_FILE_ACCEPT = "image/jpeg,image/png,.heic,.heif";
const TARGET_UPLOAD_SIZE_BYTES = Math.floor(9.5 * 1024 * 1024); // keep margin below 10MB bucket cap
const MAX_IMAGE_DIMENSION_PX = 2400;

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

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image for compression."));
    };
    img.src = url;
  });
}

function fitWithinBounds(width: number, height: number, max: number): {
  width: number;
  height: number;
} {
  if (width <= max && height <= max) {
    return { width, height };
  }
  const scale = Math.min(max / width, max / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function drawCompressedJpeg(
  file: File,
  quality: number,
  maxDimension: number,
): Promise<File> {
  const img = await loadImageFromFile(file);
  const fitted = fitWithinBounds(img.naturalWidth, img.naturalHeight, maxDimension);
  const canvas = document.createElement("canvas");
  canvas.width = fitted.width;
  canvas.height = fitted.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Image compression is unavailable in this browser.");
  }
  ctx.drawImage(img, 0, 0, fitted.width, fitted.height);
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (value) => {
        if (!value) {
          reject(new Error("Could not encode image."));
          return;
        }
        resolve(value);
      },
      "image/jpeg",
      quality,
    );
  });
  return new File([blob], replaceExt(file.name, "jpg"), {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}

async function compressToUploadBudget(file: File): Promise<File> {
  if (file.size <= TARGET_UPLOAD_SIZE_BYTES) {
    return file;
  }
  const attempts: Array<{ quality: number; maxDimension: number }> = [
    { quality: 0.9, maxDimension: MAX_IMAGE_DIMENSION_PX },
    { quality: 0.82, maxDimension: 2200 },
    { quality: 0.74, maxDimension: 2000 },
    { quality: 0.66, maxDimension: 1800 },
  ];

  let best: File | null = null;
  for (const attempt of attempts) {
    const compressed = await drawCompressedJpeg(
      file,
      attempt.quality,
      attempt.maxDimension,
    );
    if (!best || compressed.size < best.size) {
      best = compressed;
    }
    if (compressed.size <= TARGET_UPLOAD_SIZE_BYTES) {
      return compressed;
    }
  }
  return best ?? file;
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
    return compressToUploadBudget(file);
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

  const converted = new File([convertedBlob], replaceExt(file.name, "jpg"), {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
  return compressToUploadBudget(converted);
}
