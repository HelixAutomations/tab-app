import React, { useCallback } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { FormItem } from '../../app/functionality/types';

type FormsHubCardProps = {
  accentColor: string;
  form: FormItem;
  isFavourite: boolean;
  onCopyLink: (url: string) => void;
  onOpen: (form: FormItem) => void;
  onOpenExternal: (url: string) => void;
  onToggleFavourite: (form: FormItem) => void;
};

export default function FormsHubCard({
  accentColor,
  form,
  isFavourite,
  onCopyLink,
  onOpen,
  onOpenExternal,
  onToggleFavourite,
}: FormsHubCardProps) {
  const hasExternalLink = Boolean(form.url);

  const handleOpen = useCallback(() => {
    onOpen(form);
  }, [form, onOpen]);

  const handleToggleFavourite = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggleFavourite(form);
  }, [form, onToggleFavourite]);

  const handleCopyLink = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (form.url) {
      onCopyLink(form.url);
    }
  }, [form.url, onCopyLink]);

  const handleOpenExternal = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (form.url) {
      onOpenExternal(form.url);
    }
  }, [form.url, onOpenExternal]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpen();
    }
  }, [handleOpen]);

  return (
    <div
      className="forms-hub-card helix-panel"
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      style={{ ['--forms-accent' as string]: accentColor } as React.CSSProperties}
    >
      <div className="forms-hub-card__icon">
        <Icon iconName={form.icon || 'Document'} />
      </div>
      <div>
        <div className="forms-hub-card__title">{form.title}</div>
        {form.description && <div className="forms-hub-card__description">{form.description}</div>}
        {form.requires && <div className="forms-hub-card__requires">Needs: {form.requires}</div>}
      </div>
      <div className="forms-hub-card__actions">
        <button
          className={`forms-hub-card__action ${isFavourite ? 'forms-hub-card__action--active' : ''}`}
          onClick={handleToggleFavourite}
          type="button"
          aria-label={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
        >
          <Icon iconName={isFavourite ? 'FavoriteStarFill' : 'FavoriteStar'} />
        </button>
        {hasExternalLink && (
          <>
            <button className="forms-hub-card__action" onClick={handleCopyLink} type="button" aria-label="Copy form link">
              <Icon iconName="Copy" />
            </button>
            <button className="forms-hub-card__action" onClick={handleOpenExternal} type="button" aria-label="Open in new tab">
              <Icon iconName="OpenInNewWindow" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}