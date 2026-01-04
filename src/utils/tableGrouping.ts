import { Enquiry } from '../app/functionality/types';

export interface GroupedItem<T = any> {
  key: string;
  items: T[];
  contactName: string;
  companyName?: string;
  latestDate: string;
  latestItem: T;
}

export interface GroupedEnquiry extends GroupedItem<Enquiry> {
  clientKey: string;
  enquiries: Enquiry[];
}

export interface GroupedInstruction extends GroupedItem {
  clientKey: string;
  instructions: any[];
}

/**
 * Groups enquiries by prospect (client contact + company combination).
 * This is the existing logic extracted into a reusable function.
 */
export function groupEnquiriesByProspect(enquiries: Enquiry[]): GroupedEnquiry[] {
  const prospectGroups = new Map<string, Enquiry[]>();
  
  enquiries.forEach(enquiry => {
    // Build prospect identifier from contact name + company
    const contactName = `${enquiry.First_Name || ''} ${enquiry.Last_Name || ''}`.trim() || 'Unknown';
    const companyName = enquiry.Company || '';
    const clientKey = `${contactName}${companyName ? ` - ${companyName}` : ''}`;
    
    if (!prospectGroups.has(clientKey)) {
      prospectGroups.set(clientKey, []);
    }
    prospectGroups.get(clientKey)!.push(enquiry);
  });
  
  // Convert to GroupedEnquiry format
  return Array.from(prospectGroups.entries()).map(([clientKey, enquiries]) => {
    // Sort by date descending to get latest first
    const sortedEnquiries = enquiries.sort((a, b) => {
      const dateA = new Date(a.Touchpoint_Date || '').getTime();
      const dateB = new Date(b.Touchpoint_Date || '').getTime();
      return dateB - dateA;
    });
    
    const latestEnquiry = sortedEnquiries[0];
    const contactName = `${latestEnquiry.First_Name || ''} ${latestEnquiry.Last_Name || ''}`.trim() || 'Unknown';
    
    return {
      key: clientKey,
      clientKey,
      items: sortedEnquiries,
      enquiries: sortedEnquiries,
      contactName,
      companyName: latestEnquiry.Company,
      latestDate: latestEnquiry.Touchpoint_Date || '',
      latestItem: latestEnquiry,
    };
  });
}

/**
 * Groups instructions by client (following the same pattern as prospects).
 * Uses client name + company combination for grouping key.
 * Also normalizes names and considers email as a secondary grouping key.
 */
export function groupInstructionsByClient(instructions: any[]): GroupedInstruction[] {
  const clientGroups = new Map<string, any[]>();
  // Also track by email for fallback matching
  const emailToKey = new Map<string, string>();
  
  instructions.forEach(instruction => {
    // Use the clientName already computed in the instruction data
    const rawContactName = instruction.clientName || 'Unknown Client';
    // Normalize: trim, collapse spaces, lowercase for comparison
    const contactName = rawContactName.trim().replace(/\s+/g, ' ');
    const normalizedName = contactName.toLowerCase();
    const companyName = (instruction.companyName || '').trim();
    const normalizedCompany = companyName.toLowerCase();
    const email = (instruction.clientEmail || '').toLowerCase().trim();
    
    // Build key (normalized for matching)
    let clientKey = `${normalizedName}${normalizedCompany ? ` - ${normalizedCompany}` : ''}`;
    
    // If we've seen this email before, use the same key
    if (email && emailToKey.has(email)) {
      clientKey = emailToKey.get(email)!;
    } else if (email) {
      // Check if another instruction with same email already exists under a different name
      const existingKeyForEmail = emailToKey.get(email);
      if (!existingKeyForEmail) {
        emailToKey.set(email, clientKey);
      }
    }
    
    if (!clientGroups.has(clientKey)) {
      clientGroups.set(clientKey, []);
    }
    clientGroups.get(clientKey)!.push(instruction);
  });
  
  // Convert to GroupedInstruction format
  return Array.from(clientGroups.entries()).map(([clientKey, instructions]) => {
    // Sort by date descending to get latest first
    const sortedInstructions = instructions.sort((a, b) => {
      const dateA = new Date(a.date || '').getTime();
      const dateB = new Date(b.date || '').getTime();
      return dateB - dateA;
    });
    
    const latestInstruction = sortedInstructions[0];
    
    return {
      key: clientKey,
      clientKey,
      items: sortedInstructions,
      instructions: sortedInstructions,
      contactName: latestInstruction.clientName || 'Unknown Client',
      companyName: latestInstruction.companyName,
      latestDate: latestInstruction.date || '',
      latestItem: latestInstruction,
    };
  });
}

/**
 * Determines if an enquiry list should show grouped view.
 * Only groups if there are multiple enquiries from the same prospect.
 */
export function shouldGroupEnquiries(enquiries: Enquiry[]): boolean {
  const prospectKeys = new Set<string>();
  let hasMultipleFromSameProspect = false;
  
  enquiries.forEach(enquiry => {
    const contactName = `${enquiry.First_Name || ''} ${enquiry.Last_Name || ''}`.trim() || 'Unknown';
    const companyName = enquiry.Company || '';
    const clientKey = `${contactName}${companyName ? ` - ${companyName}` : ''}`;
    
    if (prospectKeys.has(clientKey)) {
      hasMultipleFromSameProspect = true;
    } else {
      prospectKeys.add(clientKey);
    }
  });
  
  return hasMultipleFromSameProspect;
}

/**
 * Determines if an instruction list should show grouped view.
 * Only groups if there are multiple instructions from the same client.
 */
export function shouldGroupInstructions(instructions: any[]): boolean {
  const clientKeys = new Set<string>();
  const emailToKey = new Map<string, string>();
  let hasMultipleFromSameClient = false;
  
  instructions.forEach(instruction => {
    const rawContactName = instruction.clientName || 'Unknown Client';
    const contactName = rawContactName.trim().replace(/\s+/g, ' ').toLowerCase();
    const companyName = (instruction.companyName || '').trim().toLowerCase();
    const email = (instruction.clientEmail || '').toLowerCase().trim();
    
    let clientKey = `${contactName}${companyName ? ` - ${companyName}` : ''}`;
    
    // Check if email matches existing key
    if (email && emailToKey.has(email)) {
      clientKey = emailToKey.get(email)!;
    } else if (email) {
      emailToKey.set(email, clientKey);
    }
    
    if (clientKeys.has(clientKey)) {
      hasMultipleFromSameClient = true;
    } else {
      clientKeys.add(clientKey);
    }
  });
  
  return hasMultipleFromSameClient;
}