import React from 'react';
import { NormalizedMatter, Transaction } from '../../app/functionality/types';

interface MatterOverviewProps {
  matter: NormalizedMatter;
  overviewData?: any;
  outstandingData?: any;
  complianceData?: any;
  matterSpecificActivitiesData?: any;
  onEdit?: () => void;
  transactions?: Transaction[];
}

const MatterOverview: React.FC<MatterOverviewProps> = ({
  matter,
  overviewData,
  outstandingData,
  complianceData,
  matterSpecificActivitiesData,
  onEdit,
  transactions,
}) => {
  // TODO: Component temporarily disabled during migration to NormalizedMatter
  // This component needs to be updated to use the normalized property names:
  // - matter.Rating -> matter.rating
  // - matter.UniqueID -> removed (use matterId)
  // - matter.DisplayNumber -> matter.displayNumber
  // - matter.OriginatingSolicitor -> matter.originatingSolicitor
  // - matter.ResponsibleSolicitor -> matter.responsibleSolicitor
  // - matter.SupervisingPartner -> matter.supervisingPartner
  // - matter.PracticeArea -> matter.practiceArea
  // - matter.Description -> matter.description
  // - matter.Opponent -> matter.opponent
  // - matter.OpenDate -> matter.openDate
  // - matter.CCL_date -> matter.cclDate
  
  return (
    <div style={{ 
      padding: '40px', 
      textAlign: 'center',
      backgroundColor: '#f8f9fa',
      borderRadius: '8px',
      border: '2px dashed #dee2e6'
    }}>
      <h2 style={{ color: '#6c757d', marginBottom: '20px' }}>Matter Overview</h2>
      <p style={{ color: '#868e96', marginBottom: '15px', fontSize: '14px' }}>
        Component temporarily disabled during migration to normalized data structure.
      </p>
      
      <div style={{ 
        backgroundColor: 'white', 
        padding: '20px', 
        borderRadius: '6px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        maxWidth: '400px',
        margin: '0 auto'
      }}>
        <h3 style={{ marginTop: '0', color: '#495057' }}>Current Matter Details:</h3>
        <div style={{ textAlign: 'left' }}>
          <p><strong>Matter ID:</strong> {matter?.matterId || 'Unknown'}</p>
          <p><strong>Display Number:</strong> {matter?.displayNumber || 'Unknown'}</p>
          <p><strong>Client:</strong> {matter?.clientName || 'Unknown'}</p>
          <p><strong>Status:</strong> {matter?.status || 'Unknown'}</p>
          <p><strong>Practice Area:</strong> {matter?.practiceArea || 'Unknown'}</p>
          <p><strong>Responsible:</strong> {matter?.responsibleSolicitor || 'Unknown'}</p>
          <p><strong>Originating:</strong> {matter?.originatingSolicitor || 'Unknown'}</p>
        </div>
      </div>
      
      <p style={{ 
        color: '#6c757d', 
        marginTop: '20px', 
        fontSize: '12px',
        fontStyle: 'italic' 
      }}>
        This component will be restored once all property names are updated to use camelCase.
      </p>
    </div>
  );
};

export default MatterOverview;
