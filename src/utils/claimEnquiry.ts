/**
 * Client-side API functions for claiming enquiries via the enquiry-processing platform.
 * This triggers the full claim flow: SQL update, ActiveCampaign sync, and Teams card update.
 */
import { useState } from 'react';
import { getProxyBaseUrl } from './getProxyBaseUrl';

interface ClaimEnquiryRequest {
    enquiryId: string;
    userEmail: string;
    /** 'new' = instructions DB (lowercase id), 'legacy' = helix-core-data (uppercase ID) */
    dataSource: 'new' | 'legacy';
}

interface ClaimOperations {
    sql?: boolean;
    activeCampaign?: boolean;
    teamsCard?: boolean;
}

interface ClaimEnquiryResponse {
    success: boolean;
    message: string;
    enquiryId: string;
    claimedBy: string;
    operations?: ClaimOperations;
    error?: string;
}

/**
 * Claims an enquiry via the enquiry-processing platform.
 * This triggers the full claim flow:
 * - SQL: Updates enquiries table (Point_of_Contact, Claim = 'Claimed', Stage = 'Follow Up')
 * - ActiveCampaign: Updates field 23 (Point of Contact)
 * - Teams: Transforms the enquiry card from Claim/Discard to Edit/Unclaim
 * 
 * @param enquiryId The ID of the enquiry to claim
 * @param userEmail The email of the user claiming the enquiry
 * @param dataSource 'new' for instructions DB, 'legacy' for helix-core-data
 * @returns Promise with the API response including which operations succeeded
 */
export async function claimEnquiry(
    enquiryId: string, 
    userEmail: string,
    dataSource: 'new' | 'legacy' = 'legacy'
): Promise<ClaimEnquiryResponse> {
    try {
        // Use the server route which calls the enquiry-processing platform
        const url = `${getProxyBaseUrl()}/api/claimEnquiry`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                enquiryId,
                userEmail,
                dataSource
            } as ClaimEnquiryRequest)
        });

        const result: ClaimEnquiryResponse = await response.json();

        if (!response.ok) {
            throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        return result;
    } catch (error) {
        console.error('Error claiming enquiry:', error);
        throw error;
    }
}

/**
 * Hook for claiming enquiries with loading and error states
 * Usage example in a React component:
 * 
 * const { claimEnquiry, isLoading, error } = useClaimEnquiry();
 * 
 * const handleClaim = async () => {
 *   try {
 *     await claimEnquiry(enquiry.ID, userEmail);
 *     // Refresh enquiries list
 *   } catch (err) {
 *     // Handle error
 *   }
 * };
 */
export function useClaimEnquiry() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleClaimEnquiry = async (
        enquiryId: string, 
        userEmail: string,
        dataSource: 'new' | 'legacy' = 'legacy'
    ) => {
        setIsLoading(true);
        setError(null);

        try {
            const result = await claimEnquiry(enquiryId, userEmail, dataSource);
            return result;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to claim enquiry';
            setError(errorMessage);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    return {
        claimEnquiry: handleClaimEnquiry,
        isLoading,
        error
    };
}

const claimEnquiryModule = { claimEnquiry, useClaimEnquiry };
export default claimEnquiryModule;
