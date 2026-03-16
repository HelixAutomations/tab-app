import React, { useState, useRef, useCallback } from 'react';
import { FaFileAlt, FaFilePdf, FaFileImage, FaFileWord, FaFileExcel, FaTrashAlt, FaEye, FaSpinner, FaExclamationTriangle, FaCloud, FaPlus } from 'react-icons/fa';
import { colours } from '../app/styles/colours';

interface DocumentUploadZoneProps {
  instructionRef: string;
  isDarkMode: boolean;
  documents: any[];
  onDocumentsChanged: () => void;
  onDocumentPreview?: (doc: any) => void;
}

const BLOCKED_EXTENSIONS = new Set(['exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'js', 'vbs', 'ps1', 'sh']);
const MAX_FILE_SIZE = 20 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileName: string, isDarkMode: boolean): React.ReactNode {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const size = 13;
  const style = { flexShrink: 0 } as React.CSSProperties;
  switch (ext) {
    case 'pdf':
      return <FaFilePdf size={size} style={{ ...style, color: colours.cta }} />;
    case 'doc': case 'docx':
      return <FaFileWord size={size} style={{ ...style, color: colours.highlight }} />;
    case 'xls': case 'xlsx': case 'csv':
      return <FaFileExcel size={size} style={{ ...style, color: colours.green }} />;
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'svg':
      return <FaFileImage size={size} style={{ ...style, color: isDarkMode ? colours.accent : colours.highlight }} />;
    default:
      return <FaFileAlt size={size} style={{ ...style, color: isDarkMode ? colours.subtleGrey : colours.greyText }} />;
  }
}

function formatRelativeTime(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return null;
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const DocumentUploadZone: React.FC<DocumentUploadZoneProps> = ({
  instructionRef,
  isDarkMode,
  documents,
  onDocumentsChanged,
  onDocumentPreview,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hoveredUpload, setHoveredUpload] = useState(false);
  const [hoveredDocId, setHoveredDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) return `File type .${ext} is not allowed`;
    if (file.size > MAX_FILE_SIZE) return `File exceeds 20 MB limit (${formatFileSize(file.size)})`;
    return null;
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) { setError(validationError); return; }
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/documents/${encodeURIComponent(instructionRef)}`, { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed (${res.status})`);
      }
      onDocumentsChanged();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [instructionRef, onDocumentsChanged, validateFile]);

  const deleteDocument = useCallback(async (documentId: string) => {
    setDeletingId(documentId);
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(instructionRef)}/${encodeURIComponent(documentId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      onDocumentsChanged();
    } catch (err: any) {
      setError(err.message || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }, [instructionRef, onDocumentsChanged]);

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f); }, [uploadFile]);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) uploadFile(f); if (fileInputRef.current) fileInputRef.current.value = ''; }, [uploadFile]);

  const uploadActive = isDragging || hoveredUpload;
  const rowBaseBackground = isDarkMode ? colours.dark.cardBackground : '#ffffff';
  const rowHoverBackground = isDarkMode ? colours.dark.cardHover : colours.light.cardHover;
  const rowBaseBorder = isDarkMode ? colours.dark.border : colours.highlightNeutral;
  const rowHoverBorder = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
  const rowBaseShadow = 'none';
  const rowHoverShadow = isDarkMode
    ? '0 2px 8px rgba(0, 0, 0, 0.2)'
    : '0 2px 8px rgba(6, 23, 51, 0.08)';

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'Raleway, sans-serif' }}
    >
      <input ref={fileInputRef} type="file" onChange={handleFileSelect} style={{ display: 'none' }} />

      {/* ── Upload card ── */}
      <div
        onClick={() => !uploading && fileInputRef.current?.click()}
        onMouseEnter={() => setHoveredUpload(true)}
        onMouseLeave={() => setHoveredUpload(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px',
          borderRadius: 0,
          border: `1px solid ${uploadActive ? rowHoverBorder : rowBaseBorder}`,
          background: isDragging
            ? (isDarkMode ? colours.dark.cardHover : 'rgba(54, 144, 206, 0.05)')
            : uploadActive
              ? rowHoverBackground
              : rowBaseBackground,
          cursor: uploading ? 'wait' : 'pointer',
          transition: 'background 0.2s ease, border-color 0.2s ease, transform 0.18s ease, box-shadow 0.18s ease',
          transform: uploadActive && !uploading ? 'translateX(4px)' : 'translateX(0)',
          boxShadow: uploadActive && !uploading
            ? rowHoverShadow
            : rowBaseShadow,
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24,
          borderRadius: 0,
          background: isDarkMode ? colours.websiteBlue : colours.grey,
          border: `1.5px solid ${uploadActive ? (isDarkMode ? colours.accent : colours.highlight) : (isDarkMode ? 'rgba(160, 160, 160, 0.26)' : colours.highlightNeutral)}`,
          transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
          color: uploadActive ? (isDarkMode ? colours.accent : colours.highlight) : (isDarkMode ? 'rgba(243, 244, 246, 0.85)' : colours.greyText),
        }}>
          {uploading
            ? <FaSpinner size={11} style={{ color: isDarkMode ? colours.accent : colours.highlight, animation: 'spin 1s linear infinite' }} />
            : <FaPlus size={9} style={{ color: 'currentColor' }} />
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.1px',
            color: uploadActive
              ? (isDarkMode ? colours.accent : colours.highlight)
              : (isDarkMode ? colours.dark.text : colours.light.text),
          }}>
            {uploading ? 'Uploading…' : isDragging ? 'Drop to upload' : 'Upload file'}
          </div>
          <div style={{
            fontSize: 10, fontWeight: 500, marginTop: 2,
            color: isDarkMode ? 'rgba(243, 244, 246, 0.5)' : colours.greyText,
          }}>
            {isDragging ? 'Release to add' : 'PDF, DOCX, image · 20 MB max'}
          </div>
        </div>
        <div style={{
          fontSize: 9,
          fontWeight: 700,
          color: isDarkMode ? colours.accent : colours.highlight,
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
          opacity: uploadActive || isDragging ? 1 : 0.75,
          flexShrink: 0,
        }}>
          {isDragging ? 'Drop' : 'Browse'}
        </div>
      </div>

      {/* ── Error toast ── */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 8px',
          borderRadius: 0,
          background: isDarkMode ? 'rgba(214, 85, 65, 0.08)' : 'rgba(214, 85, 65, 0.05)',
          border: `1px solid rgba(214, 85, 65, 0.2)`,
          fontSize: 10, fontWeight: 600, color: colours.cta,
        }}>
          <FaExclamationTriangle size={9} />
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 11, padding: 0, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* ── File count label ── */}
      {documents.length > 0 && (
        <div style={{ padding: '2px 2px 0', display: 'flex', alignItems: 'center' }}>
          <span style={{
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
            color: isDarkMode ? colours.subtleGrey : colours.greyText,
            opacity: 0.6,
          }}>
            {documents.length} file{documents.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* ── Document list — compact rows ── */}
      {documents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {documents.map((doc: any) => {
            const docId = String(doc.DocumentId || doc.documentId || doc.id);
            const fileName = doc.FileName || doc.fileName || doc.name || 'Unknown';
            const size = doc.FileSizeBytes || doc.fileSizeBytes || doc.size;
            const uploadedAt = doc.UploadedAt || doc.uploadedAt || doc.uploaded_at || null;
            const uploadedBy = doc.UploadedBy || doc.uploadedBy || doc.uploaded_by || null;
            const isDeleting = deletingId === docId;
            const isBlobOnly = doc.source === 'storage';
            const timeLabel = formatRelativeTime(uploadedAt);
            const isHovered = hoveredDocId === docId;

            // Compact metadata string: "2.3 MB · 3h ago · Luke"
            const metaParts: string[] = [];
            if (size) metaParts.push(formatFileSize(Number(size)));
            if (timeLabel) metaParts.push(timeLabel);
            if (uploadedBy) metaParts.push(uploadedBy);

            return (
              <div
                key={docId}
                onMouseEnter={() => setHoveredDocId(docId)}
                onMouseLeave={() => setHoveredDocId(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 12px',
                  borderRadius: 0,
                  background: isHovered ? rowHoverBackground : rowBaseBackground,
                  border: `1px solid ${isHovered ? rowHoverBorder : rowBaseBorder}`,
                  boxShadow: isHovered ? rowHoverShadow : rowBaseShadow,
                  transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.18s ease, opacity 0.12s, transform 0.18s ease',
                  opacity: isDeleting ? 0.35 : 1,
                  transform: isHovered && !isDeleting ? 'translateX(4px)' : 'translateX(0)',
                  position: 'relative',
                  cursor: 'default',
                  marginBottom: 4,
                }}
              >
                <div style={{
                  width: 20,
                  height: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  background: isDarkMode ? colours.websiteBlue : colours.grey,
                  border: `1.5px solid ${isHovered ? (isDarkMode ? colours.accent : colours.highlight) : (isDarkMode ? 'rgba(160, 160, 160, 0.26)' : colours.highlightNeutral)}`,
                  borderRadius: 0,
                  color: isHovered ? (isDarkMode ? colours.accent : colours.highlight) : (isDarkMode ? 'rgba(243, 244, 246, 0.85)' : colours.greyText),
                }}>
                  {getFileIcon(fileName, isDarkMode)}
                </div>
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    minWidth: 0,
                  }}>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: isHovered
                        ? (isDarkMode ? colours.accent : colours.highlight)
                        : (isDarkMode ? colours.dark.text : colours.light.text),
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      minWidth: 0,
                    }}>
                      {fileName}
                    </span>
                    {isBlobOnly && (
                      <FaCloud size={7} title="Storage" style={{
                        flexShrink: 0,
                        color: isDarkMode ? colours.accent : colours.highlight,
                        opacity: 0.65,
                      }} />
                    )}
                  </div>
                  {metaParts.length > 0 && (
                    <div style={{
                      fontSize: 10,
                      fontWeight: 500,
                      color: isDarkMode ? 'rgba(243, 244, 246, 0.5)' : colours.greyText,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      marginTop: 4,
                    }}>
                      {metaParts.join(' · ')}
                    </div>
                  )}
                </div>
                {/* Actions — visible on hover */}
                <div style={{
                  display: 'flex', gap: 2, flexShrink: 0,
                  opacity: isHovered ? 1 : 0,
                  transition: 'opacity 0.12s',
                  pointerEvents: isHovered ? 'auto' : 'none',
                }}>
                  {onDocumentPreview && (
                    <button
                      title="Preview"
                      onClick={() => onDocumentPreview(doc)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 20, height: 20, borderRadius: 0,
                        border: 'none', background: 'transparent',
                        color: isDarkMode ? colours.dark.text : colours.greyText,
                        cursor: 'pointer', padding: 0,
                      }}
                    >
                      <FaEye size={9} />
                    </button>
                  )}
                  {!isBlobOnly && (
                    <button
                      title="Delete"
                      disabled={isDeleting}
                      onClick={() => deleteDocument(docId)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 20, height: 20, borderRadius: 0,
                        border: 'none', background: 'transparent',
                        color: colours.cta, opacity: 0.5,
                        cursor: isDeleting ? 'wait' : 'pointer', padding: 0,
                      }}
                    >
                      {isDeleting ? <FaSpinner size={8} style={{ animation: 'spin 1s linear infinite' }} /> : <FaTrashAlt size={8} />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Empty state ── */}
      {documents.length === 0 && !uploading && (
        <div style={{
          textAlign: 'center', padding: '6px 0',
          fontSize: 9.5, fontWeight: 600,
          color: isDarkMode ? colours.subtleGrey : colours.greyText,
          opacity: 0.35,
        }}>
          No documents yet
        </div>
      )}
    </div>
  );
};

export default DocumentUploadZone;
