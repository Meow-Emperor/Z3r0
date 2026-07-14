import { Button, Toast } from "@douyinfe/semi-ui";
import { Download, Edit3, Save, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downloadContainerFiles, readContainerFile, writeContainerFile } from "../../shared/api/sandboxContainers";
import { showApiError } from "../../shared/api/feedback";
import { CONTAINER_FILE_TYPE } from "../../shared/api/generated/constants";
import type { ContainerFileInfo } from "../../shared/api/types";
import { saveBlob } from "../../shared/lib/download";

const CodeEditor = lazy(() => import("./CodeEditor").then((module) => ({ default: module.CodeEditor })));

type ViewerType = "text" | "image" | "binary";

type Props = {
  containerId: number;
  file: ContainerFileInfo;
  onClose: () => void;
};

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "json", "xml", "yaml", "yml", "toml", "ini", "cfg",
  "conf", "log", "csv", "tsv", "env", "gitignore", "dockerignore", "editorconfig",
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "pyx", "go", "rs", "java", "c",
  "cpp", "cc", "cxx", "h", "hpp", "hh", "hxx", "sh", "bash", "zsh", "fish",
  "ps1", "bat", "cmd", "sql", "html", "htm", "css",
  "scss", "less", "vue", "svelte", "graphql", "gql", "proto", "tf", "tfvars",
  "rb", "php", "swift", "kt", "scala", "lua", "r", "pl", "pm", "patch", "diff",
  "lock", "nix", "ex", "exs", "erl", "hs", "elm", "nim", "zig", "v", "wren",
  "rst", "tex", "bib", "cnf", "service", "socket", "timer", "desktop",
  "svg",
]);
const TEXT_FILE_NAMES = new Set(["Dockerfile", "Makefile"]);

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "tiff", "tif", "avif",
]);

const IMAGE_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", ico: "image/x-icon", bmp: "image/bmp",
  tiff: "image/tiff", tif: "image/tiff", avif: "image/avif",
};

function ext(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

function determineViewerType(file: ContainerFileInfo): ViewerType {
  if (file.type === CONTAINER_FILE_TYPE.DIRECTORY) return "binary";
  if (TEXT_FILE_NAMES.has(file.name)) return "text";
  const e = ext(file.name);
  if (IMAGE_EXTENSIONS.has(e)) return "image";
  if (TEXT_EXTENSIONS.has(e)) return "text";
  // heuristic: if size < 1MB and no null bytes → treat as text, else binary
  if (file.size > 1_000_000) return "binary";
  return "text";
}

export function FileViewer({ containerId, file, onClose }: Props) {
  const viewerType = useMemo(() => determineViewerType(file), [file]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const loadRequestIdRef = useRef(0);
  const saveRequestIdRef = useRef(0);
  const savingRef = useRef(false);
  const downloadingRef = useRef(false);
  const downloadRequestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    setSaving(false);
    setContent("");
    setEditContent("");
    setEditing(false);
    try {
      const params: { path: string; base64?: boolean } = { path: file.path };
      if (viewerType === "image") params.base64 = true;
      const response = await readContainerFile(containerId, params);
      if (loadRequestIdRef.current === requestId) {
        setContent(response.data?.content ?? "");
      }
    } catch (err) {
      if (loadRequestIdRef.current === requestId) {
        setError("Failed to read file");
        showApiError(err);
      }
    } finally {
      if (loadRequestIdRef.current === requestId) setLoading(false);
    }
  }, [containerId, file.path, viewerType]);

  useEffect(() => {
    void load();
    return () => {
      loadRequestIdRef.current += 1;
      saveRequestIdRef.current += 1;
      downloadRequestIdRef.current += 1;
      savingRef.current = false;
      downloadingRef.current = false;
    };
  }, [load]);

  const imageSrc = useMemo(() => {
    if (viewerType !== "image" || !content) return "";
    const mime = IMAGE_MIME[ext(file.name)] || "image/png";
    // content may include newlines from base64; strip them for data URI
    return `data:${mime};base64,${content.replace(/\s/g, "")}`;
  }, [viewerType, content, file.name]);

  const lineCount = useMemo(() => {
    if (viewerType !== "text") return 0;
    return content.split("\n").length;
  }, [viewerType, content]);

  const handleEdit = useCallback(() => {
    setEditContent(content);
    setEditing(true);
  }, [content]);

  const handleSave = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    setSaving(true);
    try {
      await writeContainerFile(containerId, { path: file.path, content: editContent });
      if (saveRequestIdRef.current !== requestId) return;
      Toast.success("File saved");
      setContent(editContent);
      setEditing(false);
    } catch (err) {
      if (saveRequestIdRef.current === requestId) showApiError(err);
    } finally {
      if (saveRequestIdRef.current === requestId) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }, [containerId, file.path, editContent]);

  const handleCancelEdit = useCallback(() => {
    setEditContent("");
    setEditing(false);
  }, []);

  const handleDownload = useCallback(async () => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    const requestId = downloadRequestIdRef.current + 1;
    downloadRequestIdRef.current = requestId;
    setDownloading(true);
    try {
      const { blob, filename } = await downloadContainerFiles(containerId, { path: [file.path] });
      if (downloadRequestIdRef.current !== requestId) return;
      saveBlob(blob, filename);
    } catch (err) {
      if (downloadRequestIdRef.current === requestId) showApiError(err);
    } finally {
      if (downloadRequestIdRef.current === requestId) {
        downloadingRef.current = false;
        setDownloading(false);
      }
    }
  }, [containerId, file.path]);

  return (
    <div className="fv-body">
      <div className="fv-toolbar">
        <span className="fv-title">{file.name}</span>
        <span className="fv-meta">
          {viewerType === "text" ? "Text" : viewerType === "image" ? "Image" : "Binary"}
          {" · "}{file.size.toLocaleString()} bytes
          {viewerType === "text" ? ` · ${lineCount} lines` : ""}
        </span>
        <span className="fv-spacer" />
        {viewerType === "text" && !editing && (
          <Button icon={<Edit3 size={14} />} theme="borderless" type="tertiary" size="small" onClick={handleEdit}>Edit</Button>
        )}
        {!editing && (
          <Button icon={<Download size={14} />} theme="borderless" type="tertiary" size="small" loading={downloading} onClick={() => void handleDownload()}>Download</Button>
        )}
        <Button icon={<X size={14} />} theme="borderless" size="small" type="tertiary" onClick={onClose}>Close</Button>
      </div>

      {loading ? (
        <div className="fv-loading">Loading...</div>
      ) : error ? (
        <div className="fv-error">{error}</div>
      ) : viewerType === "image" ? (
        <div className="fv-image-viewer">
          {imageSrc ? (
            <img src={imageSrc} alt={file.name} className="fv-image" />
          ) : (
            <div className="fv-error">Failed to render image</div>
          )}
        </div>
      ) : viewerType === "text" ? (
        editing ? (
          <div className="fv-editor">
            <div className="fv-editor-cm">
              <Suspense fallback={<div className="fv-loading">Loading editor...</div>}>
                <CodeEditor
                  value={editContent}
                  onChange={setEditContent}
                  filename={file.name}
                />
              </Suspense>
            </div>
            <div className="fv-editor-actions">
              <Button icon={<Save size={14} />} size="small" type="primary" loading={saving} onClick={() => void handleSave()}>Save</Button>
              <Button icon={<X size={14} />} size="small" type="tertiary" disabled={saving} onClick={handleCancelEdit}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="fv-preview">
            <Suspense fallback={<div className="fv-loading">Loading preview...</div>}>
              <CodeEditor
                value={content}
                readOnly
                filename={file.name}
              />
            </Suspense>
          </div>
        )
      ) : (
        <div className="fv-binary">
          <div className="fv-binary-icon" />
          <p>Binary file cannot be previewed</p>
          <span>{file.size.toLocaleString()} bytes</span>
        </div>
      )}
    </div>
  );
}
