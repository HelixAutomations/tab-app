// Unified enrichment functionality for enquiries
// Combines Teams and pitch data fetching into a single efficient API call

export interface EnquiryEnrichmentData {
  enquiryId: string;
  teamsData?: {
    Id: number;
    ActivityId: string;
    ChannelId: string;
    TeamId: string;
    EnquiryId: string;
    LeadName: string;
    Email: string;
    Phone: string;
    CardType: string;
    MessageTimestamp: string;
    TeamsMessageId: string;
    CreatedAtMs: number;
    Stage: string;
    Status: string;
    ClaimedBy: string;
    ClaimedAt: string;
    CreatedAt: string;
    UpdatedAt: string;
    teamsLink: string;
  };
  pitchData?: {
    dealId: number;
    email: string;
    serviceDescription?: string;
    amount?: number;
    status?: string;
    areaOfWork?: string;
    pitchedBy?: string;
    pitchedDate?: string;
    pitchedTime?: string;
    closeDate?: string;
    closeTime?: string;
    instructionRef?: string;
    pitchContent?: string;
    scenarioId?: string;
    scenarioDisplay?: string;
  };
}

export interface EnquiryEnrichmentResponse {
  enquiryData: EnquiryEnrichmentData[];
  pitchByEmail: { [email: string]: EnquiryEnrichmentData['pitchData'] };
}

/**
 * Fetch unified enrichment data for enquiries (Teams + pitch data in one call)
 */
export async function fetchEnquiryEnrichment(
  enquiryIds: string[], 
  enquiryEmails: string[]
): Promise<EnquiryEnrichmentResponse> {
  try {
    const params = new URLSearchParams();
    
    if (enquiryIds.length > 0) {
      params.append('enquiryIds', enquiryIds.join(','));
    }
    
    if (enquiryEmails.length > 0) {
      params.append('enquiryEmails', enquiryEmails.join(','));
    }

    if (params.toString() === '') {
      return { enquiryData: [], pitchByEmail: {} };
    }

    const url = `/api/enquiry-enrichment?${params.toString()}`;

    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Enrichment] API error: ${response.status} - ${errorText}`);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const data: EnquiryEnrichmentResponse = await response.json();
    
    return data;
  } catch (error) {
    console.error('[Enrichment] Error fetching data:', error);
    // Return empty data instead of throwing to prevent infinite loading
    return { enquiryData: [], pitchByEmail: {} };
  }
}