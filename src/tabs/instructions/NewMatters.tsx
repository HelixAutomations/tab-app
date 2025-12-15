import React, { useState, useEffect, useRef, useMemo } from 'react';
// invisible change 2.2
import { Stack } from '@fluentui/react';
import { POID, TeamData, UserData } from '../../app/functionality/types';
import StepHeader from './StepHeader';
import ClientDetails from './ClientDetails';
import ClientHub from './ClientHub';
import '../../app/styles/NewMatters.css';
import {
    practiceAreasByArea,
    getGroupColor,
    stepTitles,
    StepKey,
} from './MatterOpening/config';




    // ...existing code...
//



// Components for individual steps
import ClientInfoStep from './MatterOpening/ClientInfoStep';
import PoidSelectionStep from './MatterOpening/PoidSelectionStep';
import AreaOfWorkStep from './MatterOpening/AreaOfWorkStep';
import PracticeAreaStep from './MatterOpening/PracticeAreaStep';
import DescriptionStep from './MatterOpening/DescriptionStep';
import FolderStructureStep from './MatterOpening/FolderStructureStep';
import DisputeValueStep from './MatterOpening/DisputeValueStep';
import SourceStep from './MatterOpening/SourceStep';
import OpponentDetailsStep from './MatterOpening/OpponentDetailsStep';

import ReviewStep from './MatterOpening/ReviewStep';
import { CompletionProvider } from './MatterOpening/CompletionContext';
import idVerifications from '../../localData/localIdVerifications.json';

interface NewMattersProps {
    poidData?: POID[];
    setPoidData: React.Dispatch<React.SetStateAction<POID[]>>;
    teamData?: TeamData[] | null;
    userInitials: string;
    userData?: UserData[] | null;
    instructionRef?: string;
    clientId?: string;
    feeEarner?: string;
    stage?: string;
    matterRef?: string;
    hideClientSections?: boolean;
    /** Sets the initial client type when launching the workflow */
    initialClientType?: string;
    instructionPhone?: string;
}

const NewMatters: React.FC<NewMattersProps> = ({
    poidData,
    setPoidData,
    teamData,
    userInitials,
    userData,
    instructionRef = '',
    clientId = '',
    feeEarner,
    stage = 'New Matter',
    matterRef,
    hideClientSections = false,
    initialClientType = '',
    instructionPhone,
}) => {
    const [openStep, setOpenStep] = useState<number>(0); // invisible change

    const defaultPoidData: POID[] = useMemo(
        () =>
        (poidData && poidData.length > 0
            ? poidData
            : (idVerifications as any[]).map((v) => ({
                poid_id: String(v.InternalId),
                first: v.FirstName,
                last: v.LastName,
                email: v.Email,
                best_number: (v as any).Phone || '',
                nationality: v.Nationality,
                nationality_iso: v.NationalityAlpha2,
                date_of_birth: v.DOB,
                passport_number: v.PassportNumber,
                drivers_license_number: v.DriversLicenseNumber,
                house_building_number: v.HouseNumber,
                street: v.Street,
                city: v.City,
                county: v.County,
                post_code: v.Postcode,
                country: v.Country,
                country_code: v.CountryCode,
                company_name: v.company_name || v.CompanyName,
                company_number: v.company_number || v.CompanyNumber,
                company_house_building_number: v.company_house_building_number || v.CompanyHouseNumber,
                company_street: v.company_street || v.CompanyStreet,
                company_city: v.company_city || v.CompanyCity,
                company_county: v.company_county || v.CompanyCounty,
                company_post_code: v.company_post_code || v.CompanyPostcode,
                company_country: v.company_country || v.CompanyCountry,
                company_country_code: v.company_country_code || v.CompanyCountryCode,
                // Electronic ID verification fields
                stage: v.stage,
                check_result: v.EIDOverallResult,
                pep_sanctions_result: v.PEPAndSanctionsCheckResult,
                address_verification_result: v.AddressVerificationResult,
                check_expiry: v.CheckExpiry,
                poc: v.poc,
                prefix: v.prefix,
                type: v.type,
                client_id: v.ClientId,
                matter_id: v.MatterId,
            }))) as POID[],
        []
    );
    // Filter out any invalid POID entries that might be causing issues
    const validPoidData = useMemo(() => {
        return defaultPoidData.filter(poid => 
            // Ensure each POID has at least first and last name populated
            poid && poid.first && poid.last && 
            // Make sure it's not just a number
            isNaN(Number(poid.first)) && isNaN(Number(poid.last))
        );
    }, [defaultPoidData]);
    
    // Force use of only validated local POID data
    const effectivePoidData: POID[] = validPoidData;

    const idExpiry = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toLocaleDateString('en-GB');
    }, []);

    // Client info
    const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
    const [supervisingPartner, setSupervisingPartner] = useState('');
    const [originatingSolicitor, setOriginatingSolicitor] = useState('');
    const [fundsReceived, setFundsReceived] = useState('');
    const [isDateCalloutOpen, setIsDateCalloutOpen] = useState(false);
    const dateButtonRef = useRef<HTMLDivElement | null>(null);

    const teamMemberOptions = useMemo(() => {
        if (!teamData) return [];
        const options = teamData
            .filter((member: any) => 
                member.status && member.status.toLowerCase() === 'active'
            )
            .map((member: any) =>
                member['Full Name'] || `${member.First || ''} ${member.Last || ''}`.trim(),
            )
            .filter(Boolean);
        return options;
    }, [teamData]);

    // Create combined options for both partner and solicitor dropdowns
    const partnerAndSolicitorOptions = useMemo(() => {
        if (!teamData) return [];
        return teamData
            .filter((member: any) => 
                member.status && member.status.toLowerCase() === 'active' &&
                ['Partner', 'Associate Solicitor', 'Solicitor'].includes(member.Role)
            )
            .map((member: any) =>
                member['Full Name'] || `${member.First || ''} ${member.Last || ''}`.trim(),
            )
            .filter(Boolean);
    }, [teamData]);

    const defaultTeamMember = useMemo(() => {
        if (!teamData) return '';
        const found = teamData.find((member: any) =>
            (member.Initials || '').toLowerCase() === userInitials.toLowerCase()
        );
        if (found) {
            return (
                found['Full Name'] ||
                `${found.First || ''} ${found.Last || ''}`.trim()
                );
            }
        return '';
    }, [teamData, userInitials]);

    // Update partner options from team data
    const supervisingPartnerOptions = useMemo(() => {
        if (!teamData) return [];
        return teamData
            .filter((member: any) => 
                member.status && member.status.toLowerCase() === 'active' &&
                member.Role === 'Partner')
            .map((member: any) =>
                member['Full Name'] || `${member.First || ''} ${member.Last || ''}`.trim(),
            )
            .filter(Boolean);
    }, [teamData]);

    const originatingSolicitorOptions = useMemo(() => {
        if (!teamData) return [];
        return teamData
            .filter((member: any) =>
                member.status && member.status.toLowerCase() === 'active' &&
                ['Partner', 'Associate Solicitor', 'Solicitor'].includes(member.Role)
            )
            .map((member: any) =>
                member['Full Name'] || `${member.First || ''} ${member.Last || ''}`.trim(),
            )
            .filter(Boolean);
    }, [teamData]);

    const [teamMember, setTeamMember] = useState(defaultTeamMember);
    useEffect(() => setTeamMember(defaultTeamMember), [defaultTeamMember]);

    // Workflow
    const [clientType, setClientType] = useState(initialClientType);
    const [pendingClientType, setPendingClientType] = useState(initialClientType);
    const [clientAsOnFile, setClientAsOnFile] = useState('');

    useEffect(() => {
        setClientType(initialClientType);
        setPendingClientType(initialClientType);
    }, [initialClientType]);
    const [selectedPoidIds, setSelectedPoidIds] = useState<string[]>([]);
    const [areaOfWork, setAreaOfWork] = useState('');
    const [practiceArea, setPracticeArea] = useState('');

    const [description, setDescription] = useState('');
    const [folderStructure, setFolderStructure] = useState('');
    const [disputeValue, setDisputeValue] = useState('');
    // Preselect "Search" as the default value for the source field
    const [source, setSource] = useState('search');
    const [referrerName, setReferrerName] = useState('');

    const [opponentName, setOpponentName] = useState('');
    const [opponentEmail, setOpponentEmail] = useState('');
    const [opponentSolicitorName, setOpponentSolicitorName] = useState('');
    const [opponentSolicitorCompany, setOpponentSolicitorCompany] = useState('');
    const [opponentSolicitorEmail, setOpponentSolicitorEmail] = useState('');
    const [noConflict, setNoConflict] = useState(false);

    // Opponent fields
    const [opponentTitle, setOpponentTitle] = useState('');
    const [opponentFirst, setOpponentFirst] = useState('');
    const [opponentLast, setOpponentLast] = useState('');
    const [opponentPhone, setOpponentPhone] = useState('');
    const [opponentHouseNumber, setOpponentHouseNumber] = useState('');
    const [opponentStreet, setOpponentStreet] = useState('');
    const [opponentCity, setOpponentCity] = useState('');
    const [opponentCounty, setOpponentCounty] = useState('');
    const [opponentPostcode, setOpponentPostcode] = useState('');
    const [opponentCountry, setOpponentCountry] = useState('');
    const [opponentHasCompany, setOpponentHasCompany] = useState(false);
    const [opponentCompanyName, setOpponentCompanyName] = useState('');
    const [opponentCompanyNumber, setOpponentCompanyNumber] = useState('');
    // Solicitor fields
    const [solicitorTitle, setSolicitorTitle] = useState('');
    const [solicitorFirst, setSolicitorFirst] = useState('');
    const [solicitorLast, setSolicitorLast] = useState('');
    const [solicitorPhone, setSolicitorPhone] = useState('');
    const [solicitorHouseNumber, setSolicitorHouseNumber] = useState('');
    const [solicitorStreet, setSolicitorStreet] = useState('');
    const [solicitorCity, setSolicitorCity] = useState('');
    const [solicitorCounty, setSolicitorCounty] = useState('');
    const [solicitorPostcode, setSolicitorPostcode] = useState('');
    const [solicitorCountry, setSolicitorCountry] = useState('');
    const [solicitorCompanyNumber, setSolicitorCompanyNumber] = useState('');

    const [visiblePoidCount, setVisiblePoidCount] = useState(12);
    const [poidSearchTerm, setPoidSearchTerm] = useState('');
    const poidGridRef = useRef<HTMLDivElement | null>(null);
    const [activePoid, setActivePoid] = useState<POID | null>(null);

    const stepsOrder: StepKey[] = useMemo(() => {
        const order: StepKey[] = ['clientInfo'];
        if (!instructionRef) {
            order.push('poidSelection');
        }
        order.push(
            'areaOfWork',
            'practiceArea',
            'description',
            'disputeValue',
            'source',
            'folderStructure',
            'opponentDetails',
            'review'
        );
        return order;
    }, [instructionRef]);

    const filteredPoidData = effectivePoidData.filter((poid) => {
        const term = poidSearchTerm.toLowerCase();
        return (
            poid.poid_id.toLowerCase().includes(term) ||
            (poid.first && poid.first.toLowerCase().includes(term)) ||
            (poid.last && poid.last.toLowerCase().includes(term))
        );
    });

    useEffect(() => {
        const poidIndex = stepsOrder.indexOf('poidSelection');
        if (poidIndex === -1 || openStep !== poidIndex) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisiblePoidCount((prev) => Math.min(prev + 12, filteredPoidData.length));
                }
            },
            { rootMargin: '200px' }
        );
        if (poidGridRef.current) observer.observe(poidGridRef.current);
        return () => observer.disconnect();
    }, [openStep, filteredPoidData, stepsOrder]);

    const handlePoidClick = (poid: POID) => {
        if (selectedPoidIds.includes(poid.poid_id)) {
            setSelectedPoidIds((prev) => prev.filter((id) => id !== poid.poid_id));
            if (activePoid && activePoid.poid_id === poid.poid_id) {
                const remaining = effectivePoidData.find((p) => selectedPoidIds.includes(p.poid_id) && p.poid_id !== poid.poid_id);
                setActivePoid(remaining || null);
            }
        } else {
            setSelectedPoidIds((prev) => [...prev, poid.poid_id]);
            setActivePoid(poid);
        }
    };

    const isStepComplete = (step: StepKey): boolean => {
        switch (step) {
            case 'clientInfo':
                return !!(selectedDate && supervisingPartner && originatingSolicitor);
            case 'poidSelection':
                return selectedPoidIds.length > 0;
            case 'areaOfWork':
                return !!areaOfWork;
            case 'practiceArea':
                return !!practiceArea;
            case 'description':
                return !!description;
            case 'folderStructure':
                return !!folderStructure;
            case 'disputeValue':
                return !!disputeValue;
            case 'source':
                return !!source && (source !== 'referral' || !!referrerName);
            case 'opponentDetails':
                return Boolean(
                    opponentName &&
                    opponentEmail &&
                    opponentSolicitorName &&
                    opponentSolicitorCompany &&
                    opponentSolicitorEmail &&
                    noConflict
                );
            case 'review':
                return false;
            default:
                return false;
        }
    };

    const stepProgressSteps = useMemo(
        () =>
            stepsOrder.map((key) => ({
                key,
                label: stepTitles[key],
                title: stepTitles[key],
            })),
        [stepsOrder]
    );

    // Nickname for requesting user (must be after all hooks/variables are defined)
    const requestingUserNickname = React.useMemo(() => {
        if (!teamData || !userInitials) return '';
        const found = teamData.find((member: any) => {
            const initials = (member.Initials || member['Initials'] || '').toLowerCase();
            return initials === userInitials.toLowerCase();
        });
        if (found) {
            const nickname = found.Nickname || found['Nickname'] || found.First || found['First'] || found['Full Name'] || '';
            return nickname;
        }
        return '';
    }, [teamData, userInitials]);

    // Clio ID for requesting user
    const requestingUserClioId = React.useMemo(() => {
        if (!teamData || !userInitials) return '';
        const found = teamData.find((member: any) => {
            const initials = (member.Initials || member['Initials'] || '').toLowerCase();
            return initials === userInitials.toLowerCase();
        });
        if (found) {
            return found['Clio ID'] || '';
        }
        return '';
    }, [teamData, userInitials]);

    const stepDetails = React.useMemo(() => ({
        clientInfo: (
            <div>
                <div>Date: {selectedDate ? selectedDate.toLocaleDateString() : '-'}</div>
                <div>Supervising: {supervisingPartner || '-'}</div>
                <div>Originating: {originatingSolicitor || '-'}</div>
                <div>Funds: {fundsReceived || '-'}</div>
            </div>
        ),
        poidSelection: <div>IDs: {selectedPoidIds.join(', ') || '-'}</div>,
        areaOfWork: <div>{areaOfWork || '-'}</div>,
        practiceArea: <div>{practiceArea || '-'}</div>,
        description: <div>{description || '-'}</div>,
        folderStructure: <div>{folderStructure || '-'}</div>,
        disputeValue: <div>{disputeValue || '-'}</div>,
        source: (
            <div>
                {source || '-'}
                {source === 'referral' && referrerName ? ` - ${referrerName}` : ''}
            </div>
        ),
        opponentDetails: (
            <div>
                <div>Opponent: {opponentName || '-'}</div>
                <div>Solicitor: {opponentSolicitorName || '-'}</div>
            </div>
        ),
        review: null,
    }), [
        selectedDate,
        supervisingPartner,
        originatingSolicitor,
        fundsReceived,
        selectedPoidIds,
        areaOfWork,
        practiceArea,
        description,
        folderStructure,
        disputeValue,
        source,
        referrerName,
        opponentName,
        opponentSolicitorName,
    ]);

    const renderStepContent = (step: StepKey) => {
        switch (step) {
            case 'clientInfo':
                return (
                    <ClientInfoStep
                        selectedDate={selectedDate}
                        setSelectedDate={setSelectedDate}
                        teamMember={teamMember}
                        setTeamMember={setTeamMember}
                        teamMemberOptions={teamMemberOptions}
                        supervisingPartner={supervisingPartner}
                        setSupervisingPartner={setSupervisingPartner}
                        originatingSolicitor={originatingSolicitor}
                        setOriginatingSolicitor={setOriginatingSolicitor}
                        isDateCalloutOpen={isDateCalloutOpen}
                        setIsDateCalloutOpen={setIsDateCalloutOpen}
                        dateButtonRef={dateButtonRef}
                        partnerOptions={supervisingPartnerOptions}
                        solicitorOptions={partnerAndSolicitorOptions}
                        requestingUser={requestingUserNickname}
                        requestingUserClioId={requestingUserClioId}
                        onContinue={() =>
                            setOpenStep(
                                stepsOrder.indexOf('clientInfo') + 1
                            )
                        }
                    />
                );
            case 'poidSelection':
                return (
                    <PoidSelectionStep
                        poidData={effectivePoidData}
                        teamData={teamData}
                        filteredPoidData={filteredPoidData}
                        visiblePoidCount={visiblePoidCount}
                        selectedPoidIds={selectedPoidIds}
                        poidSearchTerm={poidSearchTerm}
                        setPoidSearchTerm={setPoidSearchTerm}
                        poidGridRef={poidGridRef}
                        handlePoidClick={handlePoidClick}
                        pendingClientType={pendingClientType}
                        setPendingClientType={setPendingClientType}
                        clientAsOnFile={clientAsOnFile}
                        setClientAsOnFile={setClientAsOnFile}
                        // fundsReceived and setFundsReceived removed
                        onConfirm={() =>
                            setOpenStep(stepsOrder.indexOf('poidSelection') + 1)
                        }
                    />
                );
            case 'areaOfWork':
                return (
                    <AreaOfWorkStep
                        areaOfWork={areaOfWork}
                        setAreaOfWork={setAreaOfWork}
                        onContinue={() =>
                            setOpenStep(stepsOrder.indexOf('areaOfWork') + 1)
                        }
                        getGroupColor={getGroupColor}
                    />
                );
            case 'practiceArea':
                return (
                    <PracticeAreaStep
                        options={areaOfWork && practiceAreasByArea[areaOfWork] ? practiceAreasByArea[areaOfWork] : ['Please select an Area of Work']}
                        practiceArea={practiceArea}
                        setPracticeArea={setPracticeArea}
                        areaOfWork={areaOfWork}
                        onContinue={() =>
                            setOpenStep(stepsOrder.indexOf('practiceArea') + 1)
                        }
                    />
                );
            case 'description':
                return (
                    <DescriptionStep
                        description={description}
                        setDescription={setDescription}
                        matterRefPreview={(() => {
                            // Prefer a selected POID; fallback to an active one; lastly any available POID
                            const selected = selectedPoidIds[0];
                            const poid = (selected
                                ? effectivePoidData.find(p => p.poid_id === selected)
                                : (activePoid || effectivePoidData[0])) as POID | undefined;
                            if (!poid) {
                                const type = pendingClientType || 'Individual';
                                let base = '';
                                if (type === 'Multiple Individuals') {
                                    base = (clientAsOnFile || '').toUpperCase();
                                    const digits = Math.floor(10000 + Math.random() * 90000);
                                    return (base.slice(0, 5).padEnd(5, 'X') || 'HLXXX') + digits + '-0001';
                                }
                                base = (clientAsOnFile || '').toUpperCase();
                                if (!base) base = 'HLX';
                                return base.slice(0, 5).padEnd(5, 'X') + '-0001';
                            }
                            const type = pendingClientType || (poid.company_name ? 'Company' : 'Individual');
                            let base = '';
                            if (type === 'Individual') {
                                base = (poid.last || poid.first || clientAsOnFile || '').toUpperCase();
                            } else if (type === 'Company') {
                                base = (poid.company_name || clientAsOnFile || poid.last || '').toUpperCase();
                            } else if (type === 'Multiple Individuals') {
                                base = (clientAsOnFile || poid.last || poid.first || '').toUpperCase();
                                const digits = Math.floor(10000 + Math.random() * 90000);
                                return base.slice(0, 5).padEnd(5, 'X') + digits + '-0001';
                            }
                            if (!base) base = 'HLX';
                            return base.slice(0, 5).padEnd(5, 'X') + '-0001';
                        })()}
                        onContinue={() =>
                            setOpenStep(stepsOrder.indexOf('description') + 1)
                        }
                    />
                );
            case 'folderStructure':
                return (
                    <FolderStructureStep
                        folderStructure={folderStructure}
                        setFolderStructure={setFolderStructure}
                        onContinue={() =>
                            setOpenStep(stepsOrder.indexOf('folderStructure') + 1)
                        }
                        folderOptions={['Default / Commercial', 'Adjudication', 'Residential Possession', 'Employment']}
                    />
                );
            // DisputeValueStep is now part of OpponentDetailsStep
            case 'source':
                return (
                    <SourceStep
                        source={source}
                        setSource={setSource}
                        referrerName={referrerName}
                        setReferrerName={setReferrerName}
                        onContinue={() =>
                            setOpenStep(stepsOrder.indexOf('source') + 1)
                        }
                    />
                );
            case 'opponentDetails':
                return (
                    <OpponentDetailsStep
                        opponentName={opponentName}
                        setOpponentName={setOpponentName}
                        opponentEmail={opponentEmail}
                        setOpponentEmail={setOpponentEmail}
                        opponentSolicitorName={opponentSolicitorName}
                        setOpponentSolicitorName={setOpponentSolicitorName}
                        opponentSolicitorCompany={opponentSolicitorCompany}
                        setOpponentSolicitorCompany={setOpponentSolicitorCompany}
                        opponentSolicitorEmail={opponentSolicitorEmail}
                        setOpponentSolicitorEmail={setOpponentSolicitorEmail}
                        noConflict={noConflict}
                        setNoConflict={setNoConflict}
                        disputeValue={disputeValue}
                        setDisputeValue={setDisputeValue}
                        opponentTitle={opponentTitle}
                        setOpponentTitle={setOpponentTitle}
                        opponentFirst={opponentFirst}
                        setOpponentFirst={setOpponentFirst}
                        opponentLast={opponentLast}
                        setOpponentLast={setOpponentLast}
                        opponentPhone={opponentPhone}
                        setOpponentPhone={setOpponentPhone}
                        opponentHouseNumber={opponentHouseNumber}
                        setOpponentHouseNumber={setOpponentHouseNumber}
                        opponentStreet={opponentStreet}
                        setOpponentStreet={setOpponentStreet}
                        opponentCity={opponentCity}
                        setOpponentCity={setOpponentCity}
                        opponentCounty={opponentCounty}
                        setOpponentCounty={setOpponentCounty}
                        opponentPostcode={opponentPostcode}
                        setOpponentPostcode={setOpponentPostcode}
                        opponentCountry={opponentCountry}
                        setOpponentCountry={setOpponentCountry}
                        opponentHasCompany={opponentHasCompany}
                        setOpponentHasCompany={setOpponentHasCompany}
                        opponentCompanyName={opponentCompanyName}
                        setOpponentCompanyName={setOpponentCompanyName}
                        opponentCompanyNumber={opponentCompanyNumber}
                        setOpponentCompanyNumber={setOpponentCompanyNumber}
                        solicitorTitle={solicitorTitle}
                        setSolicitorTitle={setSolicitorTitle}
                        solicitorFirst={solicitorFirst}
                        setSolicitorFirst={setSolicitorFirst}
                        solicitorLast={solicitorLast}
                        setSolicitorLast={setSolicitorLast}
                        solicitorPhone={solicitorPhone}
                        setSolicitorPhone={setSolicitorPhone}
                        solicitorHouseNumber={solicitorHouseNumber}
                        setSolicitorHouseNumber={setSolicitorHouseNumber}
                        solicitorStreet={solicitorStreet}
                        setSolicitorStreet={setSolicitorStreet}
                        solicitorCity={solicitorCity}
                        setSolicitorCity={setSolicitorCity}
                        solicitorCounty={solicitorCounty}
                        setSolicitorCounty={setSolicitorCounty}
                        solicitorPostcode={solicitorPostcode}
                        setSolicitorPostcode={setSolicitorPostcode}
                        solicitorCountry={solicitorCountry}
                        setSolicitorCountry={setSolicitorCountry}
                        solicitorCompanyNumber={solicitorCompanyNumber}
                        setSolicitorCompanyNumber={setSolicitorCompanyNumber}
                    />
                );
            case 'review':
                return (
                    <ReviewStep
                        clientInformation={effectivePoidData.filter(p => selectedPoidIds.includes(p.poid_id))}
                        selectedDate={selectedDate}
                        supervisingPartner={supervisingPartner}
                        originatingSolicitor={originatingSolicitor}
                        // fundsReceived removed
                        clientType={clientType}
                        selectedPoidIds={selectedPoidIds}
                        areaOfWork={areaOfWork}
                        practiceArea={practiceArea}
                        description={description}
                        folderStructure={folderStructure}
                        disputeValue={disputeValue}
                        source={source}
                        referrerName={referrerName}
                        opponentName={opponentName}
                        opponentEmail={opponentEmail}
                        opponentSolicitorName={opponentSolicitorName}
                        opponentSolicitorCompany={opponentSolicitorCompany}
                        opponentSolicitorEmail={opponentSolicitorEmail}
                        opponentHouseNumber={opponentHouseNumber}
                        opponentStreet={opponentStreet}
                        opponentCity={opponentCity}
                        opponentCounty={opponentCounty}
                        opponentPostcode={opponentPostcode}
                        opponentCountry={opponentCountry}
                        solicitorHouseNumber={solicitorHouseNumber}
                        solicitorStreet={solicitorStreet}
                        solicitorCity={solicitorCity}
                        solicitorCounty={solicitorCounty}
                        solicitorPostcode={solicitorPostcode}
                        solicitorCountry={solicitorCountry}
                        noConflict={noConflict}
                        userInitials={userInitials}
                        userData={userData}
                        clientAsOnFile={clientAsOnFile}
                        phone={instructionPhone ?? ''}
                        onBuild={() => { }}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <CompletionProvider>
        <Stack className="workflow-container">
            {!hideClientSections && (
                <>
                    <ClientDetails stage={stage} instructionRef={instructionRef} />
                    <ClientHub
                        instructionRef={instructionRef}
                        clientId={clientId}
                        feeEarner={feeEarner}
                        idExpiry={idExpiry}
                        idVerified={false}
                        matterRef={matterRef}
                    />
                </>
            )}
            <div className="workflow-main">
                <div className="steps-column">
                    {stepsOrder.map((stepKey, idx) => (
                        <div key={stepKey} className={`step-section${openStep === idx ? ' active' : ''}`}>
                            <StepHeader
                                step={idx + 1}
                                title={stepTitles[stepKey]}
                                complete={isStepComplete(stepKey)}
                                open={openStep === idx}
                                onToggle={() => setOpenStep(openStep === idx ? -1 : idx)}
                            />
                            <div className="step-content">
                                {openStep === idx && renderStepContent(stepKey)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </Stack>
        </CompletionProvider>
    );
};

export default NewMatters;
