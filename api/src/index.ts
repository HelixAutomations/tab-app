// src/index.ts

import { app } from "@azure/functions";

// Import all functions
// Snippet-related functions removed (changed approach):
// - approveSnippetEdit, deleteSnippetEdit, submitSnippetEdit
// - getSnippetEdits, getSnippetBlocks, getSimplifiedBlocks
import "./functions/generateReportDataset";
import "./functions/getAllMatters";
import "./functions/getAnnualLeave";
import "./functions/getAnnualLeaveAll";
import "./functions/getAttendance";
import "./functions/getComplianceData";
import "./functions/getEnquiries";
// getFutureBookings migrated to Express server route /api/future-bookings
// import "./functions/getFutureBookings";
import "./functions/getInstructionData";
import "./functions/getMatterOverview";
import "./functions/getMatters";
import "./functions/getMatterSpecificActivities";
// getOutstandingClientBalances migrated to Express server route /api/outstanding-balances
// import "./functions/getOutstandingClientBalances";
import "./functions/getPOID";
// getPOID6years migrated to Express server route /api/poid/6years
// import "./functions/getPOID6years";
import "./functions/getRecovered";
import "./functions/getRoadmap";
import "./functions/getTeamData";
// getTransactions migrated to Express server route /api/transactions
// import "./functions/getTransactions";
import "./functions/getUserData";
import "./functions/getUserProfile";
import "./functions/getWIPClio";
import "./functions/insertAnnualLeave";
import "./functions/insertAttendance";
import "./functions/insertBookSpace";
import "./functions/insertDeal";
import "./functions/insertNotableCaseInfo";
import "./functions/insertRiskAssessment";
import "./functions/insertRoadmap";
import "./functions/postFinancialTask";
import "./functions/sendEmail";
import "./functions/submitSnippetEdit";
import "./functions/updateAnnualLeave";
import "./functions/updateEnquiryRating";
import "./functions/updateTransactions";
import "./functions/updateInstructionStatus";

export default app;
