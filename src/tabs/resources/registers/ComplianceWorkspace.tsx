import React, { useCallback, useMemo, useState } from 'react';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Icon } from '@fluentui/react/lib/Icon';
import { Text } from '@fluentui/react/lib/Text';
import { colours } from '../../../app/styles/colours';
import { isAdminUser } from '../../../app/admin';
import type { TeamData, UserData } from '../../../app/functionality/types';
import RegistersWorkspace from './RegistersWorkspace';

type ComplianceView = 'landing' | 'undertakings' | 'complaints';

interface ComplianceWorkspaceProps {
  userData?: UserData[] | null;
  teamData?: TeamData[] | null;
  isDarkMode: boolean;
  onRequestForm: (formTitle: string) => void;
}

interface WorkflowCard {
  title: string;
  description: string;
  icon: string;
  tone: string;
  view: Extract<ComplianceView, 'undertakings' | 'complaints'>;
  primaryLabel: string;
  secondaryLabel?: string;
  secondaryAction?: () => void;
}

const ComplianceWorkspace: React.FC<ComplianceWorkspaceProps> = ({ userData, teamData, isDarkMode, onRequestForm }) => {
  const [view, setView] = useState<ComplianceView>('landing');
  const currentUser = userData?.[0] || null;
  const isAdmin = isAdminUser(currentUser);

  const surface = isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground;
  const cardSurface = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
  const border = isDarkMode ? colours.dark.border : colours.light.border;
  const strongBorder = isDarkMode ? colours.dark.borderColor : colours.light.border;
  const titleText = isDarkMode ? colours.dark.text : colours.light.text;
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';

  const workflowCards = useMemo<WorkflowCard[]>(() => {
    const cards: WorkflowCard[] = [
      {
        title: 'Undertakings',
        description: 'Due dates, discharge, and status.',
        icon: 'Permissions',
        tone: colours.orange,
        view: 'undertakings',
        primaryLabel: 'Open dashboard',
        secondaryLabel: 'New undertaking',
        secondaryAction: () => onRequestForm('New Undertaking'),
      },
    ];

    cards.push({
      title: 'Complaints',
      description: isAdmin ? 'Intake, investigation, and outcome.' : 'Admin-managed intake and oversight.',
      icon: 'Feedback',
      tone: colours.cta,
      view: 'complaints',
      primaryLabel: 'Open oversight',
      secondaryLabel: isAdmin ? 'New complaint' : undefined,
      secondaryAction: isAdmin ? () => onRequestForm('New Complaint') : undefined,
    });

    return cards;
  }, [isAdmin, onRequestForm]);

  const selectedCard = workflowCards.find((card) => card.view === view);

  const renderLanding = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{
        padding: '18px 20px',
        border: `1px solid ${strongBorder}`,
        background: surface,
        display: 'grid',
        gap: 6,
      }}>
        <Text style={{ fontSize: 20, fontWeight: 700, color: titleText, fontFamily: 'Raleway, sans-serif' }}>
          Compliance
        </Text>
        <Text style={{ fontSize: 13, color: bodyText, fontFamily: 'Raleway, sans-serif', lineHeight: 1.5 }}>
          Choose a workspace.
        </Text>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {workflowCards.map((card) => (
          <div
            key={card.title}
            style={{
              border: `1px solid ${border}`,
              borderLeft: `3px solid ${card.tone}`,
              background: cardSurface,
              padding: '18px 18px 16px',
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon iconName={card.icon} style={{ color: card.tone, fontSize: 18 }} />
                  <Text style={{ fontSize: 16, fontWeight: 700, color: titleText, fontFamily: 'Raleway, sans-serif' }}>
                    {card.title}
                  </Text>
                </div>
              </div>
            </div>
            <Text style={{ fontSize: 13, color: bodyText, fontFamily: 'Raleway, sans-serif', lineHeight: 1.55 }}>
              {card.description}
            </Text>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <PrimaryButton
                text={card.primaryLabel}
                onClick={() => setView(card.view)}
                styles={{
                  root: { borderRadius: 0, background: card.tone, borderColor: card.tone },
                  rootHovered: { background: card.tone, borderColor: card.tone, opacity: 0.92 },
                  rootPressed: { background: card.tone, borderColor: card.tone, opacity: 0.84 },
                }}
              />
              {card.secondaryAction && card.secondaryLabel && (
                <DefaultButton
                  text={card.secondaryLabel}
                  onClick={card.secondaryAction}
                  styles={{ root: { borderRadius: 0 } }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderDetail = () => {
    if (!selectedCard) {
      return renderLanding();
    }

    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '14px 16px',
          border: `1px solid ${border}`,
          background: cardSurface,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <DefaultButton
              text="Back"
              iconProps={{ iconName: 'ChromeBack' }}
              onClick={() => setView('landing')}
              styles={{ root: { borderRadius: 0 } }}
            />
            <div style={{ display: 'grid', gap: 2 }}>
              <Text style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase', color: selectedCard.tone }}>
                Compliance workflow
              </Text>
              <Text style={{ fontSize: 17, fontWeight: 700, color: titleText, fontFamily: 'Raleway, sans-serif' }}>
                {selectedCard.title}
              </Text>
            </div>
          </div>
          {selectedCard.secondaryAction && selectedCard.secondaryLabel && (
            <PrimaryButton
              text={selectedCard.secondaryLabel}
              onClick={selectedCard.secondaryAction}
              styles={{
                root: { borderRadius: 0, background: selectedCard.tone, borderColor: selectedCard.tone },
                rootHovered: { background: selectedCard.tone, borderColor: selectedCard.tone, opacity: 0.92 },
                rootPressed: { background: selectedCard.tone, borderColor: selectedCard.tone, opacity: 0.84 },
              }}
            />
          )}
        </div>

        <RegistersWorkspace
          userData={userData}
          teamData={teamData}
          isDarkMode={isDarkMode}
          initialTab={selectedCard.view}
          lockedTab={selectedCard.view}
          onRequestForm={selectedCard.secondaryAction ? onRequestForm : undefined}
        />
      </div>
    );
  };

  return renderDetail();
};

export default ComplianceWorkspace;