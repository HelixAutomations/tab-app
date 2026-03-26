import React, { useState, useEffect } from 'react';
import { Modal } from '@fluentui/react/lib/Modal';
import { IconButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Spinner } from '@fluentui/react/lib/Spinner';
import { Text } from '@fluentui/react/lib/Text';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { FaTimes, FaDownload, FaExternalLinkAlt } from 'react-icons/fa';
import { colours } from '../app/styles/colours';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  document: {
    DocumentId: number;
    FileName: string;
    FileSizeBytes?: number;
    InstructionRef?: string;
  } | null;
  instructionRef: string;
  isDarkMode?: boolean;
}

const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  onDismiss,
  document,
  instructionRef,
  isDarkMode = false
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');

  // Reset state when modal opens/closes or document changes
  useEffect(() => {
    if (isOpen && document) {
      setLoading(true);
      setError(null);
      const url = `/api/documents/preview/${encodeURIComponent(instructionRef)}/${document.DocumentId}`;
      setPreviewUrl(url);
      
      // Determine file type for loading behavior
      const fileName = document.FileName || '';
      const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
      const isOfficeDoc = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(fileExt);
      
      // Office docs don't need loading time since we show immediate download UI
      if (isOfficeDoc) {
        setLoading(false);
      } else {
        // For other file types, give some loading time
        const timer = setTimeout(() => {
          setLoading(false);
        }, 1000);
        return () => clearTimeout(timer);
      }
    } else {
      setLoading(false);
      setError(null);
      setPreviewUrl('');
    }
  }, [isOpen, document, instructionRef]);

  if (!document) return null;

  // Determine file type and appropriate preview method
  const fileName = document.FileName || '';
  const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(fileExt);
  const isPdf = fileExt === 'pdf';
  const isOfficeDoc = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(fileExt);
  const isPreviewable = isImage || isPdf || isOfficeDoc;

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown size';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const handleDownload = () => {
    const downloadUrl = `${previewUrl}?download=true`;
    const link = window.document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  const modalStyles = {
    main: {
      width: '90vw',
      height: '90vh',
      maxWidth: '1200px',
      maxHeight: '800px',
      padding: 0,
      backgroundColor: isDarkMode ? colours.dark.background : '#ffffff',
      borderRadius: '8px',
      overflow: 'hidden' as const
    }
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: `1px solid ${isDarkMode ? colours.dark.border : '#e5e7eb'}`,
    backgroundColor: isDarkMode ? colours.dark.cardBackground : '#f8fafc'
  };

  const contentStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    height: 'calc(90vh - 80px)'
  };

  const previewAreaStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDarkMode ? colours.dark.background : '#ffffff',
    position: 'relative'
  };

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onDismiss}
      isBlocking={false}
      styles={modalStyles}
    >
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={headerStyle}>
          <div>
            <Text variant="large" style={{ 
              fontWeight: 600, 
              color: isDarkMode ? colours.dark.text : colours.light.text,
              marginBottom: '4px',
              display: 'block'
            }}>
              {fileName}
            </Text>
            <Text variant="small" style={{ 
              color: isDarkMode ? colours.dark.subText : '#64748b' 
            }}>
              {formatFileSize(document.FileSizeBytes)} • {fileExt.toUpperCase()}
            </Text>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {isPreviewable && (
              <IconButton
                iconProps={{ iconName: 'Download' }}
                title="Download"
                onClick={handleDownload}
                styles={{
                  root: {
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    backgroundColor: 'transparent',
                    border: `1px solid ${isDarkMode ? colours.dark.border : '#e5e7eb'}`,
                    borderRadius: '4px'
                  }
                }}
              />
            )}
            <IconButton
              iconProps={{ iconName: 'Cancel' }}
              title="Close"
              onClick={onDismiss}
              styles={{
                root: {
                  color: isDarkMode ? colours.dark.text : colours.light.text
                }
              }}
            />
          </div>
        </div>

        {/* Content Area */}
        <div style={contentStyle}>
          {loading && (
            <div style={previewAreaStyle}>
              <div style={{ textAlign: 'center' }}>
                <Spinner size={3} />
                <Text style={{ 
                  marginTop: '12px', 
                  color: isDarkMode ? colours.dark.subText : '#64748b' 
                }}>
                  Loading preview...
                </Text>
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: '20px' }}>
              <MessageBar messageBarType={MessageBarType.error}>
                {error}
              </MessageBar>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Image Preview */}
              {isImage && (
                <div style={previewAreaStyle}>
                  <img
                    src={previewUrl}
                    alt={fileName}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain'
                    }}
                    onLoad={() => setLoading(false)}
                    onError={() => {
                      setError('Failed to load image preview');
                      setLoading(false);
                    }}
                  />
                </div>
              )}

              {/* PDF Preview */}
              {isPdf && (
                <div style={previewAreaStyle}>
                  <iframe
                    src={previewUrl}
                    style={{
                      width: '100%',
                      height: '100%',
                      border: 'none'
                    }}
                    title={`Preview of ${fileName}`}
                    onLoad={() => setLoading(false)}
                    onError={() => {
                      setError('Failed to load PDF preview');
                      setLoading(false);
                    }}
                  />
                </div>
              )}

              {/* Office Document Preview */}
              {isOfficeDoc && (
                <div style={previewAreaStyle}>
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '40px',
                    color: isDarkMode ? colours.dark.text : colours.light.text
                  }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                      {fileName}
                    </div>
                    <div style={{ 
                      fontSize: '14px', 
                      marginBottom: '20px',
                      color: isDarkMode ? colours.dark.subText : '#64748b'
                    }}>
                      {formatFileSize(document.FileSizeBytes)} • {fileExt.toUpperCase()} Document
                    </div>
                    <div style={{ 
                      fontSize: '14px', 
                      marginBottom: '20px',
                      color: isDarkMode ? colours.dark.subText : '#64748b'
                    }}>
                      Office documents cannot be previewed directly in the browser.
                      <br />
                      Download the file to view it in Microsoft Office or a compatible application.
                    </div>
                    <PrimaryButton
                      text="Download File"
                      iconProps={{ iconName: 'Download' }}
                      onClick={handleDownload}
                      styles={{
                        root: {
                          backgroundColor: '#0078d4',
                          borderColor: '#0078d4'
                        }
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Non-previewable files */}
              {!isPreviewable && (
                <div style={previewAreaStyle}>
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '40px',
                    color: isDarkMode ? colours.dark.subText : '#64748b'
                  }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
                    <Text variant="large" style={{ 
                      marginBottom: '8px',
                      color: isDarkMode ? colours.dark.text : colours.light.text
                    }}>
                      Preview not available
                    </Text>
                    <Text style={{ marginBottom: '20px' }}>
                      This file type cannot be previewed in the browser.
                    </Text>
                    <button
                      onClick={handleDownload}
                      style={{
                        background: colours.blue,
                        color: '#ffffff',
                        border: 'none',
                        padding: '12px 20px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        margin: '0 auto'
                      }}
                    >
                      <FaDownload /> Download File
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default DocumentPreviewModal;