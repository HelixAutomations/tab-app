-- Insert data for Deals table
DELETE FROM dbo.Deals;
INSERT INTO dbo.Deals
    (DealId, InstructionRef, ProspectId, Passcode, ServiceDescription, Amount, AreaOfWork, PitchedBy, PitchedDate, PitchedTime, PitchValidUntil, Status, IsMultiClient, LeadClientId, LeadClientEmail, CloseDate, CloseTime)
VALUES
    (20001, 'HLX-20001', 20001, 'P1', 'test item', 1.00, 'testing', 'AB', '2025-01-01', '09:00:00', '2025-12-31', 'pitched', 0, 1, 'test@example.com', NULL, NULL),
    (20002, 'HLX-20002-11223', 20002, '11223', 'test item', 1.00, 'testing', 'AB', '2025-01-01', '09:00:00', '2025-12-31', 'pitched', 1, 20002, 'test@example.com', NULL, NULL),
    (20003, 'HLX-20003-12345', 20003, '12345', 'test item', 1.00, 'testing', 'AB', '2025-01-01', '09:00:00', '2025-12-31', 'closed', 0, 20003, 'test@example.com', '2025-02-01', '10:00:00'),
    (20004, 'HLX-20004-23456', 20004, '23456', 'test item', 1.00, 'testing', 'AB', '2025-01-01', '09:00:00', '2025-12-31', 'closed', 0, 4, 'test@example.com', '2025-02-01', '10:00:00'),
    (20005, 'HLX-20005-34567', 20005, '34567', 'test item', 1.00, 'testing', 'AB', '2025-01-01', '09:00:00', '2025-12-31', 'closed', 0, 5, 'test@example.com', '2025-02-01', '10:00:00'),
    (20006, 'HLX-20006-45678', 20006, '45678', 'test item', 1.00, 'testing', 'AB', '2025-01-01', '09:00:00', '2025-12-31', 'closed', 0, 6, 'test@example.com', '2025-02-01', '10:00:00');

-- Insert data for DealJointClients table
DELETE FROM dbo.DealJointClients;
INSERT INTO dbo.DealJointClients
    (DealJointClientId, DealId, ClientEmail, HasSubmitted, SubmissionDateTime)
VALUES
    (30, 6, '001@helix-law.com', 0, NULL),
    (31, 6, '002@helix-law.com', 0, NULL);

-- Insert data for Instructions table
DELETE FROM dbo.Instructions;
INSERT INTO dbo.Instructions
    (
    InstructionRef, Stage, ClientType, HelixContact, ConsentGiven, InternalStatus, SubmissionDate, SubmissionTime, LastUpdated, ClientId, RelatedClientId, MatterId, Title, FirstName, LastName, Nationality, NationalityAlpha2, DOB, Gender, Phone, Email, PassportNumber, DriversLicenseNumber, IdType, HouseNumber, Street, City, County, Postcode, Country, CountryCode, CompanyName, CompanyNumber, CompanyHouseNumber, CompanyStreet, CompanyCity, CompanyCounty, CompanyPostcode, CompanyCountry, CompanyCountryCode, Notes, PaymentMethod, PaymentResult, PaymentAmount, PaymentProduct, AliasId, OrderId, SHASign, PaymentTimestamp)
VALUES
    ('HLX-20001', 'initialised', 'Individual', 'AB', 1, 'poid', '2025-01-01', '12:00:00', '2025-01-01T12:00:00', NULL, NULL, NULL, 'Mx', 'TestA', 'User', 'United Kingdom', 'GB', '1990-01-01', 'Other', '0000000000', 'test@example.com', NULL, NULL, 'passport', '1', 'Test Street', 'Test City', 'Test County', 'TE5 7ST', 'United Kingdom', 'GB', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'card', NULL, 0.00, 'test item', NULL, NULL, NULL, NULL),
    ('HLX-20002-11223', 'poid', 'Individual', 'AB', 1, 'poid', '2025-01-01', '12:05:00', '2025-01-01T12:05:00', NULL, NULL, NULL, 'Mx', 'Sylvia', 'Hughes', 'United Kingdom', 'GB', '1990-01-01', 'Other', '0000000000', 'test@example.com', 'AA1234567', NULL, 'passport', '1', 'Test Street', 'Test City', 'Test County', 'TE5 7ST', 'United Kingdom', 'GB', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'card', NULL, 0.00, 'test item', NULL, NULL, NULL, NULL),
    ('HLX-20003-12345', 'completed', 'Individual', 'AB', 1, 'paid', '2025-01-01', '12:10:00', '2025-01-01T12:10:00', NULL, NULL, NULL, 'Mx', 'Shyam', 'Sai', 'United Kingdom', 'GB', '1990-01-01', 'Other', '0000000000', 'test@example.com', 'BB1234567', NULL, 'passport', '1', 'Test Street', 'Test City', 'Test County', 'TE5 7ST', 'United Kingdom', 'GB', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'card', 'successful', 1.00, 'test item', NULL, NULL, NULL, NULL),
    ('HLX-20004-23456', 'completed', 'Individual', 'AB', 1, 'paid', '2025-01-01', '12:15:00', '2025-01-01T12:15:00', NULL, NULL, NULL, 'Mx', 'Naveed', 'Khan', 'United Kingdom', 'GB', '1990-01-01', 'Other', '0000000000', 'test@example.com', 'CC1234567', NULL, 'passport', '1', 'Test Street', 'Test City', 'Test County', 'TE5 7ST', 'United Kingdom', 'GB', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'card', 'successful', 1.00, 'test item', NULL, NULL, NULL, NULL),
    ('HLX-20005-34567', 'completed', 'Individual', 'AB', 1, 'paid', '2025-01-01', '12:20:00', '2025-01-01T12:20:00', NULL, NULL, NULL, 'Mx', 'Dana', 'Miller', 'United Kingdom', 'GB', '1990-01-01', 'Other', '0000000000', 'test@example.com', 'DD1234567', NULL, 'passport', '1', 'Test Street', 'Test City', 'Test County', 'TE5 7ST', 'United Kingdom', 'GB', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'card', 'failed', 1.00, 'test item', NULL, NULL, NULL, NULL),
    ('HLX-20006-45678', 'completed', 'Individual', 'AB', 1, 'paid', '2025-01-01', '12:25:00', '2025-01-01T12:25:00', NULL, NULL, NULL, 'Mx', 'Michael', 'Chen', 'United Kingdom', 'GB', '1990-01-01', 'Other', '0000000000', 'test@example.com', 'EE1234567', NULL, 'passport', '1', 'Test Street', 'Test City', 'Test County', 'TE5 7ST', 'United Kingdom', 'GB', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'card', 'successful', 1.00, 'test item', NULL, NULL, NULL, NULL);

-- Insert data for Documents table
DELETE FROM dbo.Documents;
INSERT INTO dbo.Documents
    (DocumentId, InstructionRef, DocumentType, FileName, BlobUrl, FileSizeBytes, UploadedBy, UploadedAt, Notes)
VALUES
    (4, 'HLX-20003-12345', NULL, 'doc.pdf', 'https://example.com/doc4.pdf', 123456, NULL, '2025-01-02T10:00:00', NULL),
    (2, 'HLX-20006-45678', NULL, 'doc.pdf', 'https://example.com/doc2.pdf', 234567, NULL, '2025-01-02T11:00:00', NULL);

-- Insert data for IDVerifications table
DELETE FROM dbo.IDVerifications;
SET IDENTITY_INSERT dbo.IDVerifications ON;
INSERT INTO dbo.IDVerifications
    (InternalId, InstructionRef, MatterId, DealJointClientId, ClientId, ProspectId,
    ClientEmail, IsLeadClient, AdditionalIDDate, AdditionalIDTime, EIDCheckId,
    EIDProvider, EIDStatus, EIDScore, EIDRawResponse, EIDCheckedDate, EIDCheckedTime,
    CheckExpiry, EIDOverallResult, PEPAndSanctionsCheckResult, AddressVerificationResult)
VALUES
    (1, 'HLX-20003-12345', NULL, NULL, NULL, 20003, 'shyamsai@yahoo.com', 0, NULL, NULL,
        '593d308b-293f-498d-91a7-3b20a3182f51', 'tiller', 'completed', NULL, '...see docs...',
        '2025-06-25', '11:50:27.9910000', '2025-12-25', 'Review', 'Passed', 'Review'),
    (2, 'HLX-20002-11223', NULL, NULL, NULL, 20002, 'sylvia.hughes@helixlaw.com', 1, '2025-06-12',
        '09:25:43.1234567', 'a1b2c3d4-e5f6-7890-abcd-111111111111', 'tiller', 'completed',
        NULL, NULL, '2025-06-12', '09:25:43.1234567', '2025-12-12', 'Passed', 'Passed', 'Passed'),
    (3, 'HLX-20004-23456', NULL, NULL, NULL, 20004, 'naveed.khan@helixlaw.com', 0, NULL, NULL,
        'b2c3d4e5-f6a1-8901-bcde-222222222222', 'tiller', 'completed', NULL, NULL, '2025-06-18',
        '11:15:29', '2025-12-18', 'Review', 'Passed', 'Review'),
    (4, 'HLX-20005-34567', NULL, NULL, NULL, 20005, 'dana.miller@helixlaw.com', 1, '2025-05-30',
        '14:10:10.0101010', 'c3d4e5f6-a1b2-9012-cdef-333333333333', 'tiller', 'completed',
        NULL, NULL, '2025-05-30', '14:10:10.0101010', '2025-11-30', 'Passed', 'Passed', 'Passed'),
    (5, 'HLX-20006-45678', NULL, NULL, NULL, 20006, 'michael.chen@helixlaw.com', 0, NULL, NULL,
        'd4e5f6a1-b2c3-0123-def0-444444444444', 'tiller', 'completed', NULL, NULL, '2025-06-22',
        '16:45:00', '2025-12-22', 'Review', 'Passed', 'Review');
SET IDENTITY_INSERT dbo.IDVerifications OFF;

-- Insert data for RiskAssessment table
DELETE FROM dbo.RiskAssessment;
INSERT INTO dbo.RiskAssessment
    (MatterId, InstructionRef, RiskAssessor, ComplianceDate, ComplianceExpiry,
    ClientType, ClientType_Value, DestinationOfFunds, DestinationOfFunds_Value,
    FundsType, FundsType_Value, HowWasClientIntroduced, HowWasClientIntroduced_Value,
    Limitation, Limitation_Value, SourceOfFunds, SourceOfFunds_Value, ValueOfInstruction,
    ValueOfInstruction_Value, RiskAssessmentResult, RiskScore, RiskScoreIncrementBy,
    TransactionRiskLevel, ClientRiskFactorsConsidered, TransactionRiskFactorsConsidered,
    FirmWideAMLPolicyConsidered, FirmWideSanctionsRiskConsidered)
VALUES
    ('HLX-20003-12345', 'HLX-20003-12345', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Low', NULL, NULL, NULL, 0, 0, 0, 0),
    ('HLX-20006-45678', 'HLX-20006-45678', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Low', NULL, NULL, NULL, 0, 0, 0, 0);
