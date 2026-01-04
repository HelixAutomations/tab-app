// Pitch tracking functionality for enquiries
// Fetches deal/pitch data from the instructions database to show scenario badges

export interface PitchData {
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
  displayNumber?: string;
  pitchContent?: string;
  scenarioDisplay?: string;
}

/**
 * Fetch pitch/deal tracking data for enquiries based on email addresses
 */
export async function fetchPitchTracking(enquiryEmails: string[]): Promise<PitchData[]> {
  try {
    if (!enquiryEmails || enquiryEmails.length === 0) {
      return [];
    }

    const emailsParam = enquiryEmails.join(',');
    const response = await fetch(`/api/pitch-tracking?enquiryEmails=${encodeURIComponent(emailsParam)}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data: PitchData[] = await response.json();
    // Pitch tracking data retrieved
    
    return data;
  } catch (error) {
    console.error('[PitchTracking] Error fetching data:', error);
    return [];
  }
}