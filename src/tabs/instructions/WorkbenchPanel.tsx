import React, { useMemo, useState } from 'react';
import { mergeStyles } from '@fluentui/merge-styles';
import { colours } from '../../app/styles/colours';
import OverridePills from './OverridePills';
import MatterOperations from './MatterOperations';

interface WorkbenchPanelProps {
  selectedInstruction: any;
  selectedDeal: any;
  isDarkMode: boolean;
  onDealEdit: (dealId: number, updates: { ServiceDescription?: string; Amount?: number }) => Promise<void>;
  overviewItems?: any[];
  isVisible: boolean;
  onVerifyId?: (inst: any) => void;
  onAssessRisk?: (inst: any) => void;
  onOpenMatter?: (inst: any) => void;
  onDraftCcl?: (ref: string) => void;
  nextAction?: string;
  onStatusUpdate?: () => void;
}

const WorkbenchPanel: React.FC<WorkbenchPanelProps> = ({
  selectedInstruction,
  selectedDeal,
  isDarkMode,
  onDealEdit,
  overviewItems = [],
  isVisible,
  onVerifyId,
  onAssessRisk,
  onOpenMatter,
  onDraftCcl,
  nextAction,
  onStatusUpdate
}) => {
  const [activeTab, setActiveTab] = useState('identity');
  const [pipelineData, setPipelineData] = useState('');
  const [recordType, setRecordType] = useState('instruction');
  const [isExpanded, setIsExpanded] = useState(false);
  const [bulkProcessData, setBulkProcessData] = useState('');

  const handleSystemOperation = (operation: string) => {
    console.log('System Operation:', operation);
    
    if (!selectedInstruction) {
      console.log('Please select an instruction first');
      return;
    }
    
    switch (operation) {
      case 'verify-id':
        if (onVerifyId) {
          onVerifyId(selectedInstruction);
        }
        break;
      case 'review-id':
        if (onVerifyId) {
          onVerifyId(selectedInstruction);
        }
        break;
      case 'assess-risk':
        if (onAssessRisk) {
          onAssessRisk(selectedInstruction);
        }
        break;
      case 'open-matter':
        if (onOpenMatter) {
          onOpenMatter(selectedInstruction);
        }
        break;
      case 'draft-ccl':
        if (onDraftCcl) {
          onDraftCcl(selectedInstruction.InstructionRef);
        }
        break;
      case 'sync-docs':
        console.log('Requested document sync for matter', selectedInstruction.MatterId);
        break;
      default:
        console.log('Unhandled operation:', operation);
    }
  };

  // Use the same selectedOverviewItem approach as Global Actions
  const selectedOverviewItem = useMemo(() => {
    if (!selectedInstruction) return null as any;
    return (
      overviewItems.find((item: any) => item.instruction?.InstructionRef === selectedInstruction.InstructionRef) || null
    );
  }, [selectedInstruction, overviewItems]);

  // Derive normalized Area of Work with color coding for header display
  const areaOfWorkInfo = useMemo(() => {
    if (!selectedInstruction) return { label: '', color: '#22c55e' };

    const normalize = (raw?: unknown): { label: string; color: string } => {
      const val = typeof raw === 'string' ? raw.trim() : '';
      if (!val) return { label: '', color: '#22c55e' };
      const l = val.toLowerCase();
      if (l.includes('commercial')) return { label: 'Commercial', color: colours.blue }; // Use consistent blue
      if (l.includes('construction')) return { label: 'Construction', color: '#f59e0b' }; // Amber
      if (l.includes('property')) return { label: 'Property', color: '#10b981' }; // Emerald
      if (l.includes('employment')) return { label: 'Employment', color: '#8b5cf6' }; // Violet
      return { label: val, color: '#22c55e' }; // fallback
    };

    const inst: any = selectedInstruction as any;
    const fields = [
      inst?.AreaOfWork,
      inst?.Area_of_Work,
      inst?.areaOfWork,
      inst?.PracticeArea,
      inst?.practiceArea,
      inst?.Department,
      inst?.WorkType
    ];
    
    for (const field of fields) {
      const result = normalize(field);
      if (result.label) return result;
    }

    const deal: any = (selectedDeal as any) || (selectedOverviewItem as any)?.deal;
    const dealFields = [
      deal?.AreaOfWork,
      deal?.Area_of_Work,
      deal?.areaOfWork,
      deal?.PracticeArea,
      deal?.practiceArea,
      deal?.Department,
      deal?.WorkType
    ];
    
    for (const field of dealFields) {
      const result = normalize(field);
      if (result.label) return result;
    }

    return { label: '', color: '#22c55e' };
  }, [selectedInstruction, selectedDeal, selectedOverviewItem]);

  // Check if an operation is the next action
  const isNextAction = (operationKey: string): boolean => {
    if (!nextAction) return false;
    
    const actionMap: { [key: string]: string } = {
      'verify-id': 'Verify ID',
      'assess-risk': 'Assess Risk',
      'open-matter': 'Open Matter',
      'draft-ccl': 'Draft CCL'
    };
    
    return actionMap[operationKey] === nextAction;
  };

  // Determine action status based on instruction data (using same logic as InstructionCard)
  const getActionStatus = (operationKey: string): 'complete' | 'in-progress' | 'failed' | 'pending' | 'next' => {
    if (!selectedInstruction) return 'pending';

    // ID status (Global Actions parity)
    const verifyIdStatus = (() => {
      const poidResult = selectedOverviewItem?.eid?.EIDOverallResult?.toLowerCase() ?? "";
      const eidStatus = selectedOverviewItem?.eid?.EIDStatus?.toLowerCase() ?? "";
      const poidPassed = poidResult === 'passed' || poidResult === 'approved' || poidResult === 'verified';
      const proofOfIdComplete = Boolean(selectedInstruction?.PassportNumber || selectedInstruction?.DriversLicenseNumber);

      if (!selectedOverviewItem?.eid || eidStatus === 'pending') {
        return proofOfIdComplete ? 'in-progress' : 'pending'; // 'received' -> in-progress
      } else if (poidPassed) {
        return 'complete';
      } else {
        return 'failed'; // 'review' -> failed colour
      }
    })();

    const riskStatus = (() => {
      const risk = selectedOverviewItem?.risk || selectedInstruction.RiskAssessment;
      const riskResultRaw = risk?.RiskAssessmentResult?.toString().toLowerCase() ?? '';
      if (riskResultRaw) {
        return ['low', 'low risk', 'pass', 'approved'].includes(riskResultRaw) ? 'complete' : 'failed'; // 'flagged' -> failed
      }
      const hasRiskAssessment = Boolean(risk && (risk.RiskAssessmentResult || risk.RiskScore || risk.ComplianceDate || risk.RiskAssessor));
      return hasRiskAssessment ? 'in-progress' : 'pending';
    })();

    const matterStatus = (() => {
      if (selectedInstruction.MatterId || (selectedInstruction as any)?.matters?.length > 0) return 'complete';
      return 'pending';
    })();

    const cclStatus = (() => {
      if (selectedInstruction.CCLSubmitted) return 'complete';
      return 'pending';
    })();

    switch (operationKey) {
      case 'verify-id':
        return verifyIdStatus;
      case 'assess-risk':
        return riskStatus;
      case 'open-matter':
        return matterStatus;
      case 'draft-ccl':
        return cclStatus;
      default:
        return 'pending';
    }
  };

  // Get action colour based on status
  const getActionColour = (operationKey: string): string => {
    const status = getActionStatus(operationKey);
    const isNext = isNextAction(operationKey);
    
    if (status === 'complete') return colours.green;
    if (status === 'failed') return colours.red;
    if (status === 'in-progress') return colours.orange;
    if (isNext) return colours.blue;
    return colours.greyText;
  };

  // Get operations - show instruction actions by default, system operations when specifically needed
  const getOperations = () => {
    // Always show core instruction actions in collapsed state
    return [
      {
        key: 'verify-id',
        label: 'Verify ID',
        category: 'instruction'
      },
      {
        key: 'assess-risk',
        label: 'Assess Risk',
        category: 'instruction'
      },
      {
        key: 'open-matter',
        label: 'Open Matter',
        category: 'instruction'
      },
      {
        key: 'draft-ccl',
        label: 'Draft CCL',
        category: 'instruction'
      }
    ];
  };

  const containerStyle = mergeStyles({
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: isDarkMode
      ? colours.dark.background
      : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
    borderTop: 'none',
    boxShadow: 'none',
    zIndex: 1000,
    transform: `translateY(${isVisible ? '0' : '100%'})`,
    transition: 'transform 0.3s ease',
  });

  const collapsedStyle = mergeStyles({
    padding: '8px 16px',
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    transition: 'background 0.2s ease',
    ':hover': {
      background: 'transparent',
    }
  });

  const operationChipStyle = (operationKey: string) => {
    const isNext = isNextAction(operationKey);
    const status = getActionStatus(operationKey);
    const colour = getActionColour(operationKey);
    
    return mergeStyles({
      padding: '6px 10px',
      borderRadius: 16,
      border: `1px solid ${colour}`,
      background: isNext ? colour : (isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'),
      color: isNext ? '#ffffff' : colour,
      fontSize: 10,
      fontWeight: 700,
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      textTransform: 'uppercase',
      letterSpacing: '0.025em',
      position: 'relative',
      animation: isNext ? 'pulse 2s infinite' : 'none',
      ':hover': {
        background: colours.blue,
        borderColor: colours.blue,
        color: '#ffffff',
      },
      '@keyframes pulse': {
        '0%': {
          boxShadow: `0 0 0 0 ${colour}70`,
        },
        '70%': {
          boxShadow: `0 0 0 6px ${colour}00`,
        },
        '100%': {
          boxShadow: `0 0 0 0 ${colour}00`,
        }
      }
    });
  };

  const tabStyle = (isActive: boolean) => mergeStyles({
    padding: '8px 16px',
    background: isActive ? '#3b82f6' : 'transparent',
    color: isActive ? '#ffffff' : (isDarkMode ? colours.dark.text : '#6b7280'),
    border: 'none',
    borderRadius: '4px 4px 0 0',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.025em',
    transition: 'all 0.2s ease',
    ':hover': {
      background: isActive ? '#2563eb' : (isDarkMode ? colours.dark.cardHover : '#f3f4f6'),
    }
  });

  const operationButtonStyle = mergeStyles({
    padding: '8px 12px',
    borderRadius: 8,
    border: `1px solid ${isDarkMode ? colours.dark.border : '#d1d5db'}`,
    background: isDarkMode ? '#3b82f6' : 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
    transition: 'all 0.2s ease',
    ':hover': {
      background: isDarkMode ? '#2563eb' : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
      transform: 'translateY(-1px)',
    },
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
      transform: 'none',
    }
  });

  const primaryActionStyle = (opKey: string) => {
    const isNext = isNextAction(opKey);
    return mergeStyles({
      padding: '10px 14px',
      borderRadius: 10,
      border: `1px solid ${isDarkMode ? colours.dark.border : '#d1d5db'}`,
      background: isDarkMode ? colours.dark.cardHover : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
      color: isDarkMode ? colours.dark.text : colours.blue,
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      boxShadow: isDarkMode ? '0 4px 6px rgba(0, 0, 0, 0.3)' : '0 4px 6px rgba(0, 0, 0, 0.07)',
      transition: 'all 0.2s ease',
      ':hover': {
        transform: 'translateY(-1px)',
      },
      position: 'relative',
      animation: isNext ? 'pulse 2s infinite' : 'none',
      '@keyframes pulse': {
        '0%': { boxShadow: `0 0 0 0 ${colours.blue}55` },
        '70%': { boxShadow: `0 0 0 6px ${colours.blue}00` },
        '100%': { boxShadow: `0 0 0 0 ${colours.blue}00` }
      }
    });
  };

  const inputStyle = mergeStyles({
    padding: '8px 12px',
    border: `1px solid ${isDarkMode ? colours.dark.border : '#d1d5db'}`,
    borderRadius: 4,
    fontSize: 11,
    background: isDarkMode ? colours.dark.inputBackground : '#ffffff',
    color: isDarkMode ? colours.dark.text : '#111827',
    ':focus': {
      borderColor: '#3b82f6',
      outline: 'none',
      boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)',
    }
  });

  if (!isVisible) return null;

  const operations = getOperations();

  return (
    <div className={containerStyle}>
      {!isExpanded ? (
        <div className={collapsedStyle} onClick={() => setIsExpanded(true)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: selectedInstruction ? areaOfWorkInfo.color : '#6b7280' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? colours.dark.text : '#374151', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                {selectedInstruction ? `${selectedInstruction.InstructionRef} Workbench` : 'Workbench'}
              </span>
              {areaOfWorkInfo.label && (
                <span style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: areaOfWorkInfo.color,
                  textTransform: 'uppercase',
                  background: `${areaOfWorkInfo.color}15`,
                  padding: '1px 4px',
                  borderRadius: 2,
                  border: `1px solid ${areaOfWorkInfo.color}30`
                }}>
                  {areaOfWorkInfo.label}
                </span>
              )}
              {nextAction && (
                <span style={{ 
                  fontSize: 9, 
                  color: '#22c55e', 
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  background: 'rgba(34, 197, 94, 0.1)',
                  padding: '2px 4px',
                  borderRadius: 3,
                  animation: 'pulse 2s infinite'
                }}>
                  Next: {nextAction}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {operations.map((operation) => {
                const status = getActionStatus(operation.key);
                const statusLabel = status === 'complete' ? '✓' : 
                  status === 'failed' ? '✗' : 
                  status === 'in-progress' ? '●' : 
                  isNextAction(operation.key) ? '▶' : '';
                return (
                  <button
                    key={operation.key}
                    className={operationChipStyle(operation.key)}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSystemOperation(operation.key);
                    }}
                  >
                    {statusLabel && (
                      <span style={{ fontSize: 10, fontWeight: 700 }}>{statusLabel}</span>
                    )}
                    <span>{operation.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
  <div style={{ padding: 8 }}>
          {/* Tabs header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { key: 'identity', label: 'ID' },
                { key: 'risk', label: 'Risk' },
                { key: 'payment', label: 'Pay' },
                { key: 'documents', label: 'Docs' },
                { key: 'matter', label: 'Matter' },
                { key: 'override', label: 'Override' },
                { key: 'operations', label: 'Operations' },
                { key: 'maintenance', label: 'Maintenance' },
                { key: 'compliance', label: 'Compliance' },
                { key: 'import', label: 'Import' },
              ].map((tab) => (
                <button key={tab.key} className={tabStyle(activeTab === tab.key)} onClick={() => setActiveTab(tab.key)}>
                  {tab.label}
                </button>
              ))}
            </div>
            <button className={operationButtonStyle} onClick={() => setIsExpanded(false)}>
              Close
            </button>
          </div>

          {/* Primary actions toolbar */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 10,
            flexWrap: 'wrap',
            padding: '10px 0'
          }}>
            <button
              className={primaryActionStyle('verify-id')}
              onClick={() => {
                const status = getActionStatus('verify-id');
                handleSystemOperation(status === 'failed' ? 'review-id' : 'verify-id');
              }}
            >
              Review ID
            </button>
            <button
              className={primaryActionStyle('assess-risk')}
              onClick={() => handleSystemOperation('assess-risk')}
            >
              Assess Risk
            </button>
            <button
              className={primaryActionStyle('open-matter')}
              disabled={!selectedInstruction || !selectedInstruction.ClientId || (!selectedInstruction.PassportNumber && !selectedInstruction.DriversLicenseNumber)}
              onClick={() => handleSystemOperation('open-matter')}
              title={!selectedInstruction?.ClientId ? 'Link client first' : (!selectedInstruction?.PassportNumber && !selectedInstruction?.DriversLicenseNumber ? 'ID required' : undefined) as any}
            >
              Open Matter
            </button>
            <button
              className={primaryActionStyle('sync-docs')}
              disabled={!selectedInstruction || !selectedInstruction.MatterId}
              onClick={() => handleSystemOperation('sync-docs')}
              title={!selectedInstruction?.MatterId ? 'Matter must be opened first' : undefined}
            >
              Sync Docs
            </button>
            <button
              className={primaryActionStyle('draft-ccl')}
              onClick={() => handleSystemOperation('draft-ccl')}
            >
              Draft CCL
            </button>
          </div>

          {/* Tabs content */}
          <div style={{ marginTop: 12 }}>
            {activeTab === 'identity' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {selectedInstruction ? (
                  <>
                    {/* Flattened Info Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {[
                          { label: 'Name', value: `${selectedInstruction.Title || ''} ${selectedInstruction.ClientName || selectedInstruction.FirstName || ''} ${selectedInstruction.LastName || ''}`.trim() },
                          { label: 'Email', value: selectedInstruction.ClientEmail || selectedInstruction.Email },
                          { label: 'Phone', value: selectedInstruction.PhoneNumber || selectedInstruction.MobileNumber },
                          { label: 'DOB', value: selectedInstruction.DateOfBirth },
                          { label: 'Gender', value: selectedInstruction.Gender },
                          { label: 'Nationality', value: selectedInstruction.Nationality || selectedInstruction.Country },
                          { label: 'Client Type', value: selectedInstruction.ClientType || selectedInstruction.EntityType || 'Individual' },
                          { label: 'ID Type', value: selectedInstruction.PassportNumber ? 'passport' : selectedInstruction.DriversLicenseNumber ? 'driving license' : selectedInstruction.NationalIdNumber ? 'national id' : 'Not specified' },
                          { label: 'Passport', value: selectedInstruction.PassportNumber },
                          { label: 'Driving License', value: selectedInstruction.DriversLicenseNumber }
                        ].map((field) => (
                          <div key={field.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{
                              fontSize: '10px',
                              color: colours.greyText,
                              fontWeight: 500,
                              textTransform: 'uppercase',
                              letterSpacing: '0.025em',
                              minWidth: '100px'
                            }}>
                              {field.label}:
                            </span>
                            <span style={{
                              fontSize: '11px',
                              color: field.value && field.value !== 'Not assigned' && field.value !== 'None' ? (isDarkMode ? colours.dark.text : '#111827') : colours.greyText,
                              fontWeight: field.value && field.value !== 'Not assigned' && field.value !== 'None' ? 500 : 400,
                              textAlign: 'right',
                              fontStyle: field.value && field.value !== 'Not assigned' && field.value !== 'None' ? 'normal' : 'italic'
                            }}>
                              {field.value || 'Not provided'}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {[
                          { label: 'Address', value: `${selectedInstruction.AddressLine1 || ''} ${selectedInstruction.AddressLine2 || ''}`.trim() },
                          { label: 'City', value: selectedInstruction.City },
                          { label: 'County', value: selectedInstruction.County || selectedInstruction.State },
                          { label: 'Postcode', value: selectedInstruction.Postcode || selectedInstruction.PostalCode },
                          { label: 'Country', value: selectedInstruction.Country },
                          { label: 'Company', value: selectedInstruction.ClientType === 'Individual' ? 'Not applicable' : (selectedInstruction.CompanyName || 'Not provided') },
                          { label: 'Company Number', value: selectedInstruction.ClientType === 'Individual' ? 'Not applicable' : (selectedInstruction.CompanyNumber || 'Not provided') },
                          { label: 'House Number', value: selectedInstruction.ClientType === 'Individual' ? 'Not applicable' : (selectedInstruction.CompanyAddressLine1 || 'Not provided') },
                          { label: 'Company Address', value: selectedInstruction.ClientType === 'Individual' ? 'Not applicable' : (selectedInstruction.CompanyAddressLine2 || 'Not provided') },
                          { label: 'Company Postcode', value: selectedInstruction.ClientType === 'Individual' ? 'Not applicable' : (selectedInstruction.CompanyPostcode || 'Not provided') },
                          { label: 'Company Country', value: selectedInstruction.ClientType === 'Individual' ? (selectedInstruction.Country || 'Not provided') : (selectedInstruction.CompanyCountry || 'Not provided') }
                        ].map((field) => (
                          <div key={field.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{
                              fontSize: '10px',
                              color: colours.greyText,
                              fontWeight: 500,
                              textTransform: 'uppercase',
                              letterSpacing: '0.025em',
                              minWidth: '120px'
                            }}>
                              {field.label}:
                            </span>
                            <span style={{
                              fontSize: '11px',
                              color: field.value && field.value !== 'Not applicable' && field.value !== 'Not provided' ? (isDarkMode ? colours.dark.text : '#111827') : colours.greyText,
                              fontWeight: field.value && field.value !== 'Not applicable' && field.value !== 'Not provided' ? 500 : 400,
                              textAlign: 'right',
                              fontStyle: field.value && field.value !== 'Not applicable' && field.value !== 'Not provided' ? 'normal' : 'italic'
                            }}>
                              {field.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Verification Status & Actions */}
                    <div style={{ paddingTop: 4 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '12px', alignItems: 'start' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 600, color: colours.greyText, textTransform: 'uppercase', marginBottom: '4px' }}>Identity Verification</div>
                          {[
                            { label: 'EID Status', value: selectedOverviewItem?.eid?.EIDStatus || 'Not started' },
                            { label: 'POID Result', value: selectedOverviewItem?.eid?.EIDOverallResult || 'Pending' },
                            { label: 'Consent Given', value: selectedInstruction.ConsentGiven ? 'Yes' : 'No' }
                          ].map((field) => (
                            <div key={field.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{
                                fontSize: '10px',
                                color: colours.greyText,
                                fontWeight: 500,
                                textTransform: 'uppercase',
                                letterSpacing: '0.025em'
                              }}>
                                {field.label}:
                              </span>
                              <span style={{
                                fontSize: '11px',
                                color: (() => {
                                  if (field.label === 'POID Result' && field.value === 'review') return colours.red;
                                  if (field.label === 'EID Status' && field.value === 'completed') return colours.green;
                                  return isDarkMode ? colours.dark.text : '#111827';
                                })(),
                                fontWeight: 500,
                                textAlign: 'right'
                              }}>
                                {field.value}
                              </span>
                            </div>
                          ))}
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 600, color: colours.greyText, textTransform: 'uppercase', marginBottom: '4px' }}>Matter Operations</div>
                          {[
                            { 
                              label: 'Matter Status', 
                              value: selectedInstruction.MatterId ? 'Linked & Active' : 'Not Created',
                              color: selectedInstruction.MatterId ? colours.green : colours.orange,
                              detail: selectedInstruction.MatterId ? `Matter ID: ${selectedInstruction.MatterId}` : 'Ready to open new matter'
                            },
                            { 
                              label: 'Client Linked', 
                              value: selectedInstruction.ClientId ? `Confirmed (${selectedInstruction.ClientId})` : 'Not linked',
                              color: selectedInstruction.ClientId ? colours.green : colours.red,
                              detail: selectedInstruction.ClientId ? 'Clio client record active' : 'Client linking required'
                            },
                            { 
                              label: 'Prerequisites', 
                              value: (() => {
                                const hasClient = selectedInstruction.ClientId;
                                const hasId = selectedInstruction.PassportNumber || selectedInstruction.DriversLicenseNumber;
                                const hasConsent = selectedInstruction.ConsentGiven;
                                if (hasClient && hasId && hasConsent) return 'Complete';
                                if (hasClient && hasId) return 'Consent Pending';
                                if (hasClient) return 'ID Document Needed';
                                return 'Client & ID Required';
                              })(),
                              color: (() => {
                                const hasClient = selectedInstruction.ClientId;
                                const hasId = selectedInstruction.PassportNumber || selectedInstruction.DriversLicenseNumber;
                                const hasConsent = selectedInstruction.ConsentGiven;
                                if (hasClient && hasId && hasConsent) return colours.green;
                                if (hasClient && hasId) return colours.orange;
                                return colours.red;
                              })(),
                              detail: 'Client + ID + Consent required'
                            },
                            {
                              label: 'Matter Type',
                              value: selectedInstruction.AreaOfWork || selectedInstruction.ServiceType || 'Not specified',
                              color: selectedInstruction.AreaOfWork ? (isDarkMode ? colours.dark.text : '#111827') : colours.greyText,
                              detail: selectedInstruction.WorkDescription || 'Service type to be determined'
                            },
                            {
                              label: 'Fee Estimate',
                              value: selectedInstruction.EstimatedValue ? `£${selectedInstruction.EstimatedValue}` : selectedInstruction.QuoteAmount ? `£${selectedInstruction.QuoteAmount}` : 'TBC',
                              color: selectedInstruction.EstimatedValue || selectedInstruction.QuoteAmount ? (isDarkMode ? colours.dark.text : '#111827') : colours.greyText,
                              detail: selectedInstruction.FeeStructure || 'Fee structure to be agreed'
                            },
                            {
                              label: 'Billing Setup',
                              value: selectedInstruction.BillingContact ? 'Configured' : selectedInstruction.ClientId ? 'Default Client' : 'Pending',
                              color: selectedInstruction.BillingContact || selectedInstruction.ClientId ? colours.green : colours.orange,
                              detail: selectedInstruction.BillingContact || selectedInstruction.ClientEmail || 'Billing contact required'
                            }
                          ].map((field) => (
                            <div key={field.label} style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '2px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{
                                  fontSize: '10px',
                                  color: colours.greyText,
                                  fontWeight: 500,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.025em'
                                }}>
                                  {field.label}:
                                </span>
                                <span style={{
                                  fontSize: '11px',
                                  color: field.color || (isDarkMode ? colours.dark.text : '#111827'),
                                  fontWeight: 500,
                                  textAlign: 'right'
                                }}>
                                  {field.value}
                                </span>
                              </div>
                              {field.detail && (
                                <div style={{
                                  fontSize: '9px',
                                  color: colours.greyText,
                                  fontStyle: 'italic',
                                  textAlign: 'right',
                                  marginTop: '1px'
                                }}>
                                  {field.detail}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 600, color: colours.greyText, textTransform: 'uppercase', marginBottom: '4px' }}>Risk & Compliance</div>
                          {(() => {
                            const risk = selectedOverviewItem?.risk || selectedInstruction.RiskAssessment;
                            const riskResult = risk?.RiskAssessmentResult?.toString().toLowerCase() || 'pending';
                            return [
                              { 
                                label: 'Risk Assessment', 
                                value: riskResult === 'low' ? 'Low Risk' : riskResult === 'medium' ? 'Medium Risk' : riskResult === 'high' ? 'High Risk' : 'Pending',
                                color: riskResult === 'low' ? colours.green : riskResult === 'medium' ? colours.orange : riskResult === 'high' ? colours.red : colours.greyText
                              },
                              { 
                                label: 'CCL Status', 
                                value: selectedInstruction.CCLSubmitted ? 'Submitted' : 'Pending',
                                color: selectedInstruction.CCLSubmitted ? colours.green : colours.greyText
                              },
                              { 
                                label: 'AML Check', 
                                value: selectedOverviewItem?.eid?.EIDOverallResult === 'passed' ? 'Cleared' : 'Pending',
                                color: selectedOverviewItem?.eid?.EIDOverallResult === 'passed' ? colours.green : colours.greyText
                              }
                            ];
                          })().map((field) => (
                            <div key={field.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{
                                fontSize: '10px',
                                color: colours.greyText,
                                fontWeight: 500,
                                textTransform: 'uppercase',
                                letterSpacing: '0.025em'
                              }}>
                                {field.label}:
                              </span>
                              <span style={{
                                fontSize: '11px',
                                color: field.color,
                                fontWeight: 500,
                                textAlign: 'right'
                              }}>
                                {field.value}
                              </span>
                            </div>
                          ))}
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                          <div style={{ fontSize: '10px', fontWeight: 600, color: colours.greyText, textTransform: 'uppercase', marginBottom: '2px' }}>Actions</div>
                          {selectedInstruction.MatterId && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                              <button
                                className={operationButtonStyle}
                                onClick={() => handleSystemOperation('view-matter')}
                                style={{ fontSize: '10px', padding: '6px 12px', background: colours.green }}
                              >
                                📋 View Matter
                              </button>
                              <button
                                className={operationButtonStyle}
                                onClick={() => handleSystemOperation('matter-dashboard')}
                                style={{ fontSize: '10px', padding: '6px 12px', background: colours.blue }}
                              >
                                📊 Matter Dashboard
                              </button>
                            </div>
                          )}
                          {selectedInstruction.ClientId && !selectedInstruction.MatterId && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                              <button
                                className={operationButtonStyle}
                                onClick={() => handleSystemOperation('open-matter')}
                                style={{ fontSize: '10px', padding: '6px 12px', background: colours.green }}
                                disabled={!selectedInstruction.PassportNumber && !selectedInstruction.DriversLicenseNumber}
                              >
                                🚀 Open Matter
                              </button>
                              <button
                                className={operationButtonStyle}
                                onClick={() => handleSystemOperation('preview-matter')}
                                style={{ fontSize: '10px', padding: '6px 12px', background: colours.orange }}
                              >
                                👁️ Preview Setup
                              </button>
                            </div>
                          )}
                          {!selectedInstruction.ClientId && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                              <button
                                className={operationButtonStyle}
                                onClick={() => handleSystemOperation('link-client')}
                                style={{ fontSize: '10px', padding: '6px 12px', background: colours.red }}
                              >
                                🔗 Link Client
                              </button>
                              <button
                                className={operationButtonStyle}
                                onClick={() => handleSystemOperation('create-client')}
                                style={{ fontSize: '10px', padding: '6px 12px', background: colours.blue }}
                              >
                                ➕ Create Client
                              </button>
                            </div>
                          )}
                          {selectedOverviewItem?.eid?.EIDOverallResult === 'review' && (
                            <button
                              className={operationButtonStyle}
                              onClick={() => handleSystemOperation('review-id')}
                              style={{ fontSize: '10px', padding: '6px 12px', background: colours.orange }}
                            >
                              🔍 Review ID
                            </button>
                          )}
                          {selectedInstruction.MatterId && (
                            <div style={{ 
                              display: 'flex', 
                              flexDirection: 'column', 
                              gap: '2px', 
                              alignItems: 'flex-end',
                              marginTop: '8px',
                              borderTop: `1px solid ${isDarkMode ? colours.dark.border : '#e2e8f0'}`,
                              paddingTop: '6px'
                            }}>
                              <button
                                className={operationButtonStyle}
                                onClick={() => handleSystemOperation('matter-billing')}
                                style={{ fontSize: '9px', padding: '4px 8px', background: '#8b5cf6' }}
                              >
                                💷 Billing
                              </button>
                              <button
                                className={operationButtonStyle}
                                onClick={() => handleSystemOperation('matter-documents')}
                                style={{ fontSize: '9px', padding: '4px 8px', background: '#14b8a6' }}
                              >
                                📄 Documents
                              </button>
                              <button
                                className={operationButtonStyle}
                                onClick={() => handleSystemOperation('matter-timeline')}
                                style={{ fontSize: '9px', padding: '4px 8px', background: '#6366f1' }}
                              >
                                ⏱️ Timeline
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{
                    padding: '8px 0',
                    textAlign: 'center',
                    color: colours.greyText,
                    fontSize: '12px'
                  }}>
                    Select an instruction to inspect identity data
                  </div>
                )}
              </div>
            )}

            {activeTab === 'matter' && (
              <MatterOperations
                selectedInstruction={selectedInstruction}
                selectedOverviewItem={selectedOverviewItem}
                isDarkMode={isDarkMode}
                onStatusUpdate={onStatusUpdate}
              />
            )}

            {activeTab === 'risk' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedInstruction ? (
                  <>
                    {/* Risk Score Summary */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                      gap: 6,
                      marginBottom: 6
                    }}>
                      {(() => {
                        const risk = selectedOverviewItem?.risk || selectedInstruction?.RiskAssessment;
                        const riskResult = risk?.RiskAssessmentResult?.toString().toLowerCase() || 'pending';
                        const riskScore = risk?.RiskScore || 0;
                        const riskColor = riskResult === 'low' || riskResult === 'low risk' ? colours.green : 
                                         riskResult === 'medium' || riskResult === 'medium risk' ? colours.orange : 
                                         riskResult === 'high' || riskResult === 'high risk' ? colours.red : colours.greyText;
                        
                        return [
                          { 
                            label: 'Risk Level', 
                            value: riskResult === 'pending' ? 'Not Assessed' : 
                                   riskResult === 'low' || riskResult === 'low risk' ? 'Low Risk' :
                                   riskResult === 'medium' || riskResult === 'medium risk' ? 'Medium Risk' :
                                   riskResult === 'high' || riskResult === 'high risk' ? 'High Risk' : 'Unknown',
                            color: riskColor,
                            highlight: true
                          },
                          { 
                            label: 'Score', 
                            value: riskScore > 0 ? riskScore.toString() : 'N/A',
                            color: riskScore > 0 ? (isDarkMode ? colours.dark.text : '#111827') : colours.greyText
                          },
                          { 
                            label: 'Assessor', 
                            value: risk?.RiskAssessor || 'Not assigned',
                            color: risk?.RiskAssessor ? (isDarkMode ? colours.dark.text : '#111827') : colours.greyText
                          },
                          { 
                            label: 'Date', 
                            value: risk?.ComplianceDate ? new Date(risk.ComplianceDate).toLocaleDateString('en-GB') : 'Not completed',
                            color: risk?.ComplianceDate ? (isDarkMode ? colours.dark.text : '#111827') : colours.greyText
                          }
                        ];
                      })().map((item) => (
                        <div 
                          key={item.label}
                          style={{
                            padding: '4px 6px',
                            border: item.highlight ? `1px solid ${item.color}` : `1px solid ${isDarkMode ? colours.dark.border : '#e2e8f0'}`,
                            borderRadius: 4,
                            background: item.highlight 
                              ? `${item.color}10` 
                              : (isDarkMode ? colours.dark.sectionBackground : '#f8fafc'),
                            textAlign: 'center'
                          }}
                        >
                          <div style={{ 
                            fontSize: 8, 
                            fontWeight: 600, 
                            color: colours.greyText, 
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            marginBottom: 2
                          }}>
                            {item.label}
                          </div>
                          <div style={{ 
                            fontSize: 10, 
                            fontWeight: item.highlight ? 700 : 500,
                            color: item.color,
                            lineHeight: 1.2
                          }}>
                            {item.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Risk Factors Grid */}
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 8 
                    }}>
                      {/* Risk Assessment Status */}
                      <div style={{ 
                        padding: '6px 8px',
                        border: `1px solid ${isDarkMode ? colours.dark.border : '#e2e8f0'}`,
                        borderRadius: 4,
                        background: isDarkMode ? colours.dark.sectionBackground : '#fff'
                      }}>
                        <div style={{ 
                          fontSize: 9, 
                          fontWeight: 600, 
                          color: colours.greyText, 
                          textTransform: 'uppercase',
                          marginBottom: 4
                        }}>
                          Assessment Status
                        </div>
                        {(() => {
                          const risk = selectedOverviewItem?.risk || selectedInstruction?.RiskAssessment;
                          const factors = [
                            { label: 'Client Risk Considered', value: risk?.ClientRiskFactorsConsidered },
                            { label: 'Transaction Risk Considered', value: risk?.TransactionRiskFactorsConsidered },
                            { label: 'Sanctions Risk Considered', value: risk?.FirmWideSanctionsRiskConsidered },
                            { label: 'AML Policy Considered', value: risk?.FirmWideAMLPolicyConsidered }
                          ];
                          
                          return factors.map((factor) => (
                            <div key={factor.label} style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center',
                              marginBottom: 2
                            }}>
                              <span style={{ 
                                fontSize: 9, 
                                color: colours.greyText,
                                fontWeight: 500
                              }}>
                                {factor.label}:
                              </span>
                              <span style={{ 
                                fontSize: 9,
                                fontWeight: 600,
                                color: factor.value === true ? colours.green : 
                                       factor.value === false ? colours.red : colours.greyText,
                                padding: '1px 4px',
                                borderRadius: 2,
                                background: factor.value === true ? `${colours.green}15` : 
                                           factor.value === false ? `${colours.red}15` : 'transparent'
                              }}>
                                {factor.value === true ? 'YES' : factor.value === false ? 'NO' : 'N/A'}
                              </span>
                            </div>
                          ));
                        })()}
                      </div>

                      {/* Risk Details */}
                      <div style={{ 
                        padding: '6px 8px',
                        border: `1px solid ${isDarkMode ? colours.dark.border : '#e2e8f0'}`,
                        borderRadius: 4,
                        background: isDarkMode ? colours.dark.sectionBackground : '#fff'
                      }}>
                        <div style={{ 
                          fontSize: 9, 
                          fontWeight: 600, 
                          color: colours.greyText, 
                          textTransform: 'uppercase',
                          marginBottom: 4
                        }}>
                          Risk Components
                        </div>
                        {(() => {
                          const risk = selectedOverviewItem?.risk || selectedInstruction?.RiskAssessment;
                          const components = [
                            { label: 'Client Type', value: risk?.ClientType_Value, text: risk?.ClientType },
                            { label: 'Value of Instruction', value: risk?.ValueOfInstruction_Value, text: risk?.ValueOfInstruction },
                            { label: 'Source of Funds', value: risk?.SourceOfFunds_Value, text: risk?.SourceOfFunds },
                            { label: 'Transaction Risk Level', value: null, text: risk?.TransactionRiskLevel }
                          ];
                          
                          return components.slice(0, 4).map((comp) => (
                            <div key={comp.label} style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: 2
                            }}>
                              <span style={{ 
                                fontSize: 9, 
                                color: colours.greyText,
                                fontWeight: 500
                              }}>
                                {comp.label}:
                              </span>
                              <span style={{ 
                                fontSize: 9,
                                color: comp.value ? (isDarkMode ? colours.dark.text : '#111827') : colours.greyText,
                                fontWeight: 500,
                                textAlign: 'right',
                                maxWidth: '60%',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {comp.text || (comp.value ? `Score: ${comp.value}` : 'N/A')}
                              </span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      marginTop: 4,
                      padding: '4px 0'
                    }}>
                      <div style={{ 
                        fontSize: 8, 
                        color: colours.greyText,
                        fontStyle: 'italic'
                      }}>
                        {(() => {
                          const risk = selectedOverviewItem?.risk || selectedInstruction?.RiskAssessment;
                          if (!risk || !risk.RiskAssessmentResult) {
                            return 'Risk assessment required before proceeding';
                          }
                          const expiry = risk.ComplianceExpiry ? new Date(risk.ComplianceExpiry) : null;
                          if (expiry && expiry < new Date()) {
                            return 'Risk assessment has expired - reassessment required';
                          }
                          return `Assessment valid${expiry ? ` until ${expiry.toLocaleDateString('en-GB')}` : ''}`;
                        })()}
                      </div>
                      <button 
                        className={operationButtonStyle} 
                        onClick={() => handleSystemOperation('assess-risk')}
                        style={{ 
                          fontSize: 9, 
                          padding: '4px 8px',
                          height: 'auto'
                        }}
                      >
                        {(() => {
                          const risk = selectedOverviewItem?.risk || selectedInstruction?.RiskAssessment;
                          return risk?.RiskAssessmentResult ? 'Update Risk' : 'Assess Risk';
                        })()}
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{
                    padding: '12px 0',
                    textAlign: 'center',
                    color: colours.greyText,
                    fontSize: '10px'
                  }}>
                    Select an instruction to view risk assessment details
                  </div>
                )}
              </div>
            )}

            {activeTab === 'payment' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : '#374151' }}>Payment Details</div>
                  {[
                    { label: 'Fee Estimate', value: selectedInstruction?.EstimatedValue ?? selectedInstruction?.QuoteAmount ?? 'TBC' },
                    { label: 'Fee Structure', value: selectedInstruction?.FeeStructure ?? 'Not set' },
                    { label: 'Billing Contact', value: selectedInstruction?.BillingContact ?? selectedInstruction?.ClientEmail ?? 'Not set' }
                  ].map((f) => (
                    <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: colours.greyText, textTransform: 'uppercase' }}>{f.label}</span>
                      <span style={{ fontSize: 11 }}>{String(f.value)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 8 }}>
                  <button className={operationButtonStyle} onClick={() => handleSystemOperation('matter-billing')} disabled={!selectedInstruction?.MatterId}>Open Billing</button>
                </div>
              </div>
            )}

            {activeTab === 'documents' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
                <div style={{ fontSize: 12, color: colours.greyText }}>Sync matter documents and generated letters. Requires an open matter.</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className={operationButtonStyle} onClick={() => handleSystemOperation('sync-docs')} disabled={!selectedInstruction?.MatterId} title={!selectedInstruction?.MatterId ? 'Matter must be opened first' : undefined}>Sync Docs</button>
                  <button className={operationButtonStyle} onClick={() => handleSystemOperation('matter-documents')} disabled={!selectedInstruction?.MatterId}>Open Documents</button>
                </div>
              </div>
            )}

            {activeTab === 'override' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {selectedInstruction ? (
                  <OverridePills
                    instruction={selectedInstruction}
                    selectedOverviewItem={selectedOverviewItem}
                    isDarkMode={isDarkMode}
                    onStatusUpdate={() => {
                      console.log('Status updated - refresh instruction data');
                      // Trigger parent refresh
                      if (onStatusUpdate) {
                        onStatusUpdate();
                      }
                    }}
                  />
                ) : (
                  <div style={{
                    padding: '8px 0',
                    textAlign: 'center',
                    color: colours.greyText,
                    fontSize: '12px'
                  }}>
                    Select an instruction to access override controls
                  </div>
                )}
              </div>
            )}

            {activeTab === 'operations' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                    Processing Operations
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('bulk-status-update')}>
                      Bulk Status Update
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('batch-assign')}>
                      Batch Assignment
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('mass-communication')}>
                      Mass Communication
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('workflow-trigger')}>
                      Trigger Workflows
                    </button>
                  </div>
                </div>
                
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                    Document Generation
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('batch-ccl')}>
                      Batch CCL Generation
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('bulk-reports')}>
                      Bulk Report Generation
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('template-apply')}>
                      Apply Templates
                    </button>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: isDarkMode ? colours.dark.subText : '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                    Bulk Processing Input
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
                    <textarea
                      value={bulkProcessData}
                      onChange={(e) => setBulkProcessData(e.target.value)}
                      className={inputStyle}
                      placeholder="Enter instruction references (one per line) or paste CSV data..."
                      rows={4}
                    />
                    <button 
                      className={operationButtonStyle} 
                      onClick={() => handleSystemOperation('process-bulk-input')}
                      disabled={!bulkProcessData.trim()}
                    >
                      Process
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'maintenance' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                    Data Quality
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('duplicate-detection')}>
                      Duplicate Detection
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('data-validation')}>
                      Data Validation
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('missing-data-audit')}>
                      Missing Data Audit
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('format-standardization')}>
                      Format Standardization
                    </button>
                  </div>
                </div>
                
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                    Record Management
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('merge-records')}>
                      Merge Records
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('archive-inactive')}>
                      Archive Inactive
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('restore-records')}>
                      Restore Records
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('purge-deleted')}>
                      Purge Deleted
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'compliance' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                    Compliance Auditing
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('sra-compliance-check')}>
                      SRA Compliance Check
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('aml-audit')}>
                      AML Compliance Audit
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('gdpr-review')}>
                      GDPR Data Review
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('retention-audit')}>
                      Retention Policy Audit
                    </button>
                  </div>
                </div>
                
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                    Risk Assessment
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('bulk-risk-assessment')}>
                      Bulk Risk Assessment
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('conflict-check')}>
                      Conflict Checking
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('sanctions-screening')}>
                      Sanctions Screening
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'import' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                    External Data Import
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 8, alignItems: 'end' }}>
                    <select
                      value={recordType}
                      onChange={(e) => setRecordType(e.target.value)}
                      className={inputStyle}
                    >
                      <option value="instruction">Instructions</option>
                      <option value="enquiry">Enquiries</option>
                      <option value="client">Clients</option>
                      <option value="matter">Matters</option>
                      <option value="contact">Contacts</option>
                    </select>
                    <textarea
                      value={pipelineData}
                      onChange={(e) => setPipelineData(e.target.value)}
                      className={inputStyle}
                      placeholder="Paste JSON/CSV data from external systems..."
                      rows={4}
                    />
                    <button 
                      className={operationButtonStyle} 
                      onClick={() => handleSystemOperation('import-data')}
                      disabled={!pipelineData.trim()}
                    >
                      Import
                    </button>
                  </div>
                </div>
                
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                    System Integration
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('crm-sync')}>
                      CRM Synchronization
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('accounting-export')}>
                      Accounting Export
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('document-sync')}>
                      Document Sync
                    </button>
                    <button className={operationButtonStyle} onClick={() => handleSystemOperation('calendar-integration')}>
                      Calendar Integration
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkbenchPanel;