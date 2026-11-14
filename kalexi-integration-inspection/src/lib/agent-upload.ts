export type AgentUploadKind = "photo" | "idFront" | "idBack";

export interface AgentUploadFormat {
  contentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  extension: "jpg" | "png" | "webp" | "pdf";
}

const JPEG: AgentUploadFormat = { contentType: "image/jpeg", extension: "jpg" };
const PNG: AgentUploadFormat = { contentType: "image/png", extension: "png" };
const WEBP: AgentUploadFormat = { contentType: "image/webp", extension: "webp" };
const PDF: AgentUploadFormat = { contentType: "application/pdf", extension: "pdf" };

const MIME_FORMATS: Record<string, AgentUploadFormat> = {
  "image/jpeg": JPEG,
  "image/jpg": JPEG,
  "image/pjpeg": JPEG,
  "image/png": PNG,
  "image/webp": WEBP,
  "application/pdf": PDF,
};

const EXTENSION_FORMATS: Record<string, AgentUploadFormat> = {
  jpg: JPEG,
  jpeg: JPEG,
  jfif: JPEG,
  png: PNG,
  webp: WEBP,
  pdf: PDF,
};

export function resolveAgentUploadFormat(
  fileName: string,
  mimeType: string,
  kind: AgentUploadKind,
): AgentUploadFormat {
  const normalizedMime = mimeType.trim().toLowerCase();
  const mimeFormat = MIME_FORMATS[normalizedMime];
  const extension = fileName.split(".").pop()?.toLowerCase();
  const extensionFormat = extension ? EXTENSION_FORMATS[extension] : undefined;
  const genericMime =
    !normalizedMime ||
    normalizedMime === "application/octet-stream" ||
    normalizedMime === "binary/octet-stream";
  const format = mimeFormat ?? (genericMime ? extensionFormat : undefined);

  if (!format || (kind === "photo" && format.contentType === "application/pdf")) {
    throw new Error(
      kind === "photo"
        ? "Use a JPG, PNG or WebP image for the passport photo."
        : "Use a JPG, PNG, WebP or PDF file for the ID document.",
    );
  }
  return format;
}
