import React, { useState, useRef, useCallback } from 'react';
import { FaCloudUploadAlt, FaFileAlt, FaTrashAlt, FaEye, FaSpinner, FaExclamationTriangle } from 'react-icons/fa';
import { colours } from '../app/styles/colours';

interface DocumentUploadZoneProps {
  instructionRef: string;
  isDarkMode: boolean;
  documents: any[];
  onDocumentsChanged: () => void;
  onDocumentPreview?: (doc: any) => void;
}

const BLOCKED_EXTENSIONS = new Set(['exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'js', 'vbs', 'ps1', 'sh']);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) return `File type .${ext} is not allowed`;
    if (file.size > MAX_FILE_SIZE) return `File exceeds 20 MB limit (${formatFileSize(file.size)})`;
    return null;
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/documents/${encodeURIComponent(instructionRef)}`, {
        method: 'POST',
        body: formData,
      });
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
      const res = await fetch(`/api/documents/${encodeURIComponent(instructionRef)}/${encodeURIComponent(documentId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Delete failed');
      }
      onDocumentsChanged();
    } catch (err: any) {
      setError(err.message || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }, [instructionRef, onDocumentsChanged]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [uploadFile]);

  const borderColor = isDragging
    ? (isDarkMode ? colours.accent : colours.highlight)
    : (isDarkMode ? colours.dark.border : 'rgba(160, 160, 160, 0.25)');

  const dropzoneBg = isDragging
    ? (isDarkMode ? 'rgba(135, 243, 243, 0.06)' : 'rgba(54, 144, 206, 0.04)')
    : (isDarkMode ? colours.dark.cardBackground : 'rgba(244, 244, 246, 0.5)');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'Raleway, sans-serif' }}>
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !uploading && fileInputRef.current?.click()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '20px 16px',
          borderRadius: 2,
          border: `1.5px dashed ${borderColor}`,
          background: dropzoneBg,
          cursor: uploading ? 'wait' : 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        {uploading ? (
          <>
            <FaSpinner size={18} style={{ color: isDarkMode ? colours.accent : colours.highlight, animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
              Uploading…
            </span>
          </>
        ) : (
          <>
            <FaCloudUploadAlt size={20} style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText, opacity: 0.6 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
              Drop file here or click to browse
            </span>
            <span style={{ fontSize: 10, color: isDarkMode ? 'rgba(160,160,160,0.5)' : 'rgba(107,107,107,0.5)' }}>
              Max 20 MB
            </span>
          </>
        )}
      </div>

      {/* Error toast */}
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 2,
          background: isDarkMode ? 'rgba(214, 85, 65, 0.12)' : 'rgba(214, 85, 65, 0.08)',
          border: `1px solid rgba(214, 85, 65, 0.3)`,
          fontSize: 11,
          fontWeight: 600,
          color: colours.cta,
        }}>
          <FaExclamationTriangle size={11} />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 13, padding: 0 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Document list */}
      {documents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {documents.map((doc: any) => {
            const docId = doc.DocumentId || doc.documentId || doc.id;
            const fileName = doc.FileName || doc.fileName || doc.name || 'Unknown';
            const size = doc.FileSizeBytes || doc.fileSizeBytes || doc.size;
            const isDeleting = deletingId === String(docId);

            return (
              <div
                key={docId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 2,
                  background: isDarkMode ? colours.dark.cardBackground : 'rgba(244, 244, 246, 0.4)',
                  border: `1px solid ${isDarkMode ? colours.dark.border : 'rgba(160, 160, 160, 0.15)'}`,
                  transition: 'background 0.15s',
                  opacity: isDeleting ? 0.5 : 1,
                }}
              >
                <FaFileAlt size={12} style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {fileName}
                  </div>
                  {size && (
                    <div style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                      {formatFileSize(Number(size))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {onDocumentPreview && (
                    <button
                      title="Preview"
                      onClick={() => onDocumentPreview(doc)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 26,
                        height: 26,
                        borderRadius: 2,
                        border: `1px solid ${isDarkMode ? colours.dark.border : 'rgba(160,160,160,0.2)'}`,
                        background: 'transparent',
                        color: isDarkMode ? colours.subtleGrey : colours.greyText,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <FaEye size={10} />
                    </button>
                  )}
                  <button
                    title="Delete"
                    disabled={isDeleting}
                    onClick={() => deleteDocument(String(docId))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 26,
                      height: 26,
                      borderRadius: 2,
                      border: `1px solid ${isDarkMode ? 'rgba(214, 85, 65, 0.2)' : 'rgba(214, 85, 65, 0.15)'}`,
                      background: 'transparent',
                      color: colours.cta,
                      cursor: isDeleting ? 'wait' : 'pointer',
                      transition: 'all 0.15s',
                      opacity: 0.7,
                    }}
                  >
                    {isDeleting ? <FaSpinner size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <FaTrashAlt size={10} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DocumentUploadZone;
