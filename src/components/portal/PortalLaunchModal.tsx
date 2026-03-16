import React from 'react';
import { createPortal } from 'react-dom';
import { FaCopy, FaExternalLinkAlt, FaTimes } from 'react-icons/fa';
import { useToast } from '../feedback/ToastProvider';
import type { PortalLaunchModel } from '../../utils/portalLaunch';
import './PortalLaunchModal.css';

interface PortalLaunchModalProps {
  isOpen: boolean;
  model: PortalLaunchModel | null;
  onClose: () => void;
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

const PortalLaunchModal: React.FC<PortalLaunchModalProps> = ({
  isOpen,
  model,
  onClose,
  secondaryAction,
}) => {
  const { showToast } = useToast();

  if (!isOpen || !model || !model.isAvailable || typeof document === 'undefined') {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(model.url);
      showToast({ type: 'success', message: 'Client link copied' });
    } catch {
      showToast({ type: 'error', message: 'Could not copy client link' });
    }
  };

  const handleOpen = () => {
    window.open(model.url, '_blank', 'noopener,noreferrer');
    showToast({ type: 'success', message: `Opening ${model.title.toLowerCase()}` });
  };

  return createPortal(
    <div className="helix-modal-backdrop" onClick={onClose}>
      <div className="helix-modal hh-portal-launch-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={model.title}>
        <div className="helix-modal__header">
          <div className="hh-portal-launch-modal__title-row">
            <div className="hh-portal-launch-modal__title-block">
              <div className="helix-section-title">Client view</div>
              <div className="hh-portal-launch-modal__hero-title">{model.title}</div>
            </div>
            <button type="button" className="hh-portal-launch-modal__close" onClick={onClose} aria-label="Close client destination modal">
              <FaTimes size={12} />
            </button>
          </div>
        </div>

        <div className="helix-modal__body">
          <div className="hh-portal-launch-modal__summary">
            <div className="hh-portal-launch-modal__hero">
              <div className="hh-portal-launch-modal__hero-top">
                <div className="hh-portal-launch-modal__hero-copy">
                  <div className="helix-chip helix-chip--accent">{model.statusLabel}</div>
                  <div className="helix-body">{model.summary}</div>
                </div>
              </div>
              {model.detail ? <div className="helix-help">{model.detail}</div> : null}
            </div>

            <div className="hh-portal-launch-modal__meta-grid">
              {model.instructionRef ? (
                <div className="hh-portal-launch-modal__meta-item">
                  <div className="helix-label">Instruction</div>
                  <div className="hh-portal-launch-modal__mono">{model.instructionRef}</div>
                </div>
              ) : null}
              {model.matterRef ? (
                <div className="hh-portal-launch-modal__meta-item">
                  <div className="helix-label">Matter</div>
                  <div className="hh-portal-launch-modal__mono">{model.matterRef}</div>
                </div>
              ) : null}
              {!model.instructionRef && model.passcode ? (
                <div className="hh-portal-launch-modal__meta-item">
                  <div className="helix-label">Code</div>
                  <div className="hh-portal-launch-modal__mono">{model.passcode}</div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="helix-modal__footer hh-portal-launch-modal__actions">
          {secondaryAction ? (
            <button type="button" className="hh-portal-launch-modal__secondary-cta" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </button>
          ) : <span />}
          <div className="hh-portal-launch-modal__actions-main">
            <button type="button" className="helix-btn-secondary" onClick={handleCopy}>
              <FaCopy size={11} />
              Copy link
            </button>
            <button type="button" className="helix-btn-primary" onClick={handleOpen}>
              <FaExternalLinkAlt size={11} />
              {model.goLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PortalLaunchModal;