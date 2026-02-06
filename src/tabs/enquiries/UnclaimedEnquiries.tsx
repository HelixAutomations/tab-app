import React from 'react';
import { Stack, Text } from '@fluentui/react';
import { Enquiry } from '../../app/functionality/types';
import NewUnclaimedEnquiryCard from './NewUnclaimedEnquiryCard';

interface UnclaimedEnquiriesProps {
    enquiries: Enquiry[];
    onSelect: (enquiry: Enquiry) => void;
    userEmail: string | undefined;
    onAreaChange: (enquiryId: string, newArea: string) => Promise<void> | void;
    onClaimSuccess?: () => void;
    onOptimisticClaim?: (enquiryId: string, claimerEmail: string) => void;
    getPromotionStatusSimple?: (enquiry: Enquiry) => 'pitch' | 'instruction' | null;
    inlineWorkbenchByEnquiryId?: Map<string, any>;
    teamData?: any[] | null;
    workbenchHandlers?: {
        onDocumentPreview?: (doc: any) => void;
        onOpenRiskAssessment?: (instruction: any) => void;
        onOpenMatter?: (instruction: any) => void;
        onTriggerEID?: (instructionRef: string) => void | Promise<void>;
        onOpenIdReview?: (instructionRef: string) => void;
    };
}

const UnclaimedEnquiries: React.FC<UnclaimedEnquiriesProps> = ({ enquiries, onSelect, userEmail, onAreaChange, onClaimSuccess, onOptimisticClaim, getPromotionStatusSimple, inlineWorkbenchByEnquiryId, teamData, workbenchHandlers }) => {

    if (!enquiries || enquiries.length === 0) {
        return (
            <Text
                variant="medium"
                styles={{ root: { textAlign: 'center', marginTop: 20 } }}
            >
                No unclaimed enquiries.
            </Text>
        );
    }

    return (
        <Stack
            tokens={{ childrenGap: 20 }}
            styles={{ root: { padding: '20px' } }}
        >
            {enquiries.map((enquiry, index) => (
                <NewUnclaimedEnquiryCard
                    key={`${enquiry.ID}-${index}`}
                    enquiry={enquiry}
                    onSelect={onSelect}
                    onRate={() => { /* no-op for unclaimed cards */ }}
                    isLast={index === enquiries.length - 1}
                    onAreaChange={onAreaChange}
                    userEmail={userEmail || ''}
                    onClaimSuccess={onClaimSuccess}
                    onOptimisticClaim={onOptimisticClaim}
                    promotionStatus={getPromotionStatusSimple ? getPromotionStatusSimple(enquiry) : null}
                    inlineWorkbenchItem={enquiry.ID ? inlineWorkbenchByEnquiryId?.get(String(enquiry.ID)) : undefined}
                    teamData={teamData}
                    workbenchHandlers={workbenchHandlers}
                />
            ))}
        </Stack>
    );
};

export default UnclaimedEnquiries;
