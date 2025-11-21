/**
 * ID Display Issue Analysis for Matt Talaie Enquiry
 * Analyzing why colleague claimed Matt enquiry but only sees one ID showing
 * 
 * Context: 
 * - Matt Talaie has 12 duplicate IDs (28609) in legacy database
 * - Colleague claimed the enquiry but might not see all instances
 * - Need to understand claimed/unclaimed card display logic and grouping
 */

const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const sql = require('mssql');

async function analyzeIdDisplayIssue() {
    console.log('🔍 Analyzing ID display issue for Matt Talaie enquiry...\n');

    const credential = new DefaultAzureCredential();
    const keyVaultUrl = 'https://helix-core-kv.vault.azure.net/';
    const secretClient = new SecretClient(keyVaultUrl, credential);

    try {
        // Get database credentials
        const dbServer = await secretClient.getSecret('helix-core-data-server');
        const dbName = await secretClient.getSecret('helix-core-data-database');
        const dbUser = await secretClient.getSecret('helix-core-data-username');
        const dbPassword = await secretClient.getSecret('helix-core-data-password');

        const config = {
            server: dbServer.value,
            database: dbName.value,
            user: dbUser.value,
            password: dbPassword.value,
            options: {
                encrypt: true,
                trustServerCertificate: false,
            },
        };

        console.log('🔗 Connecting to legacy database...');
        await sql.connect(config);

        // 1. Check current status of all Matt Talaie records
        console.log('\n📊 Current status of Matt Talaie records (ID 28609):');
        const mattRecords = await sql.query`
            SELECT 
                ID,
                Email,
                [First Name] as First_Name,
                [Last Name] as Last_Name,
                [Point of Contact] as Point_of_Contact,
                [Touchpoint Date] as Touchpoint_Date,
                [Area of Work] as Area_of_Work,
                [Call Taker] as Call_Taker,
                Status,
                CASE 
                    WHEN [Point of Contact] IS NULL OR [Point of Contact] = 'team@helix-law.com' THEN 'UNCLAIMED'
                    WHEN [Point of Contact] LIKE '%triage%' THEN 'TRIAGED'
                    WHEN [Point of Contact] != 'team@helix-law.com' AND [Point of Contact] IS NOT NULL THEN 'CLAIMED'
                    ELSE 'UNKNOWN'
                END as Claim_Status
            FROM enquiries 
            WHERE ID = '28609'
            ORDER BY [Touchpoint Date] DESC
        `;

        console.log(`Found ${mattRecords.recordset.length} records with ID 28609:`);
        console.log('═══════════════════════════════════════════════════════════════════════');
        
        let claimedCount = 0;
        let unclaimedCount = 0;
        let triagedCount = 0;
        const claimersList = new Set();
        
        mattRecords.recordset.forEach((record, index) => {
            console.log(`Record ${index + 1}:`);
            console.log(`  Email: ${record.Email}`);
            console.log(`  Name: ${record.First_Name} ${record.Last_Name}`);
            console.log(`  Point of Contact: ${record.Point_of_Contact}`);
            console.log(`  Touchpoint Date: ${record.Touchpoint_Date}`);
            console.log(`  Area of Work: ${record.Area_of_Work}`);
            console.log(`  Status: ${record.Status}`);
            console.log(`  Claim Status: ${record.Claim_Status}`);
            
            if (record.Claim_Status === 'CLAIMED') {
                claimedCount++;
                claimersList.add(record.Point_of_Contact);
            } else if (record.Claim_Status === 'UNCLAIMED') {
                unclaimedCount++;
            } else if (record.Claim_Status === 'TRIAGED') {
                triagedCount++;
            }
            
            console.log('  ─────────────────────────────────────────────────────────────────');
        });

        console.log('\n📈 Summary:');
        console.log(`Total records: ${mattRecords.recordset.length}`);
        console.log(`Claimed: ${claimedCount}`);
        console.log(`Unclaimed: ${unclaimedCount}`);
        console.log(`Triaged: ${triagedCount}`);
        console.log(`Unique claimers: ${Array.from(claimersList).join(', ')}`);

        // 2. Analyze grouping behavior based on enquiryGrouping.ts logic
        console.log('\n🔍 Analyzing grouping behavior:');
        
        // According to enquiryGrouping.ts, records are grouped by:
        // - normalizedEmail (primary key)
        // - normalizedName (fallback if no email)
        // - clientKey = normalizedEmail || normalizedName
        
        const groupingAnalysis = mattRecords.recordset.reduce((acc, record) => {
            const normalizedEmail = (record.Email || '').toLowerCase().trim();
            const normalizedName = `${(record.First_Name || '').toLowerCase().trim()} ${(record.Last_Name || '').toLowerCase().trim()}`.trim();
            const clientKey = normalizedEmail || normalizedName;
            
            if (!acc[clientKey]) {
                acc[clientKey] = [];
            }
            acc[clientKey].push(record);
            
            return acc;
        }, {});
        
        console.log('Grouping by client key (email or name):');
        Object.entries(groupingAnalysis).forEach(([clientKey, records]) => {
            console.log(`\nClient Key: "${clientKey}"`);
            console.log(`Record count: ${records.length}`);
            console.log('Records in group:');
            records.forEach((record, idx) => {
                console.log(`  ${idx + 1}. POC: ${record.Point_of_Contact}, Status: ${record.Claim_Status}, Date: ${record.Touchpoint_Date}`);
            });
        });

        // 3. Analyze deduplication logic from Enquiries.tsx
        console.log('\n🎯 Analyzing deduplication logic:');
        
        // According to Enquiries.tsx dedupe logic:
        // - Records are grouped by fuzzyKey which includes contact, POC (in mine-only view), and day
        // - pickBetter() prefers: Mine > Higher status rank (Claimed > Triaged > Unclaimed) > v2 > newer
        
        console.log('Deduplication would apply these rules:');
        console.log('1. Group by: contact|poc|day (in Mine view) or contact|day (in All view)');
        console.log('2. Pick better: Mine > Claimed > Triaged > Unclaimed > v2 > newer');
        
        const dedupeAnalysis = mattRecords.recordset.map(record => {
            const contact = (record.Email || '').toLowerCase().trim() || `${record.First_Name} ${record.Last_Name}`.toLowerCase().trim();
            const poc = (record.Point_of_Contact || '').toLowerCase().trim();
            const day = new Date(record.Touchpoint_Date).toISOString().split('T')[0];
            
            const statusRank = poc === '' || poc === 'team@helix-law.com' ? 0 : 
                              poc.includes('triage') ? 1 : 2;
            
            return {
                ...record,
                fuzzyKeyMine: `${contact}|${poc}|${day}`,
                fuzzyKeyAll: `${contact}|${day}`,
                statusRank,
                isV2: false, // legacy records
                timestamp: new Date(record.Touchpoint_Date).getTime()
            };
        });
        
        console.log('\nFuzzy keys for Mine view (contact|poc|day):');
        const mineGroups = dedupeAnalysis.reduce((acc, record) => {
            if (!acc[record.fuzzyKeyMine]) acc[record.fuzzyKeyMine] = [];
            acc[record.fuzzyKeyMine].push(record);
            return acc;
        }, {});
        
        Object.entries(mineGroups).forEach(([key, records]) => {
            console.log(`\nMine Group: "${key}"`);
            const sorted = records.sort((a, b) => {
                if (a.statusRank !== b.statusRank) return b.statusRank - a.statusRank;
                return b.timestamp - a.timestamp;
            });
            console.log(`  Winner: POC=${sorted[0].Point_of_Contact}, Rank=${sorted[0].statusRank}, Date=${sorted[0].Touchpoint_Date}`);
            if (records.length > 1) {
                console.log(`  Suppressed: ${records.length - 1} records`);
            }
        });
        
        console.log('\nFuzzy keys for All view (contact|day):');
        const allGroups = dedupeAnalysis.reduce((acc, record) => {
            if (!acc[record.fuzzyKeyAll]) acc[record.fuzzyKeyAll] = [];
            acc[record.fuzzyKeyAll].push(record);
            return acc;
        }, {});
        
        Object.entries(allGroups).forEach(([key, records]) => {
            console.log(`\nAll Group: "${key}"`);
            const sorted = records.sort((a, b) => {
                if (a.statusRank !== b.statusRank) return b.statusRank - a.statusRank;
                return b.timestamp - a.timestamp;
            });
            console.log(`  Winner: POC=${sorted[0].Point_of_Contact}, Rank=${sorted[0].statusRank}, Date=${sorted[0].Touchpoint_Date}`);
            if (records.length > 1) {
                console.log(`  Suppressed: ${records.length - 1} records`);
            }
        });

        // 4. Check if any records exist in new database
        console.log('\n🆕 Checking new database for Matt records...');
        
        // Connect to new database
        const newDbServer = await secretClient.getSecret('instructions-server');
        const newDbName = await secretClient.getSecret('instructions-database'); 
        const newDbUser = await secretClient.getSecret('instructions-username');
        const newDbPassword = await secretClient.getSecret('instructions-password');

        const newConfig = {
            server: newDbServer.value,
            database: newDbName.value, 
            user: newDbUser.value,
            password: newDbPassword.value,
            options: {
                encrypt: true,
                trustServerCertificate: false,
            },
        };

        await sql.close(); // Close legacy connection
        await sql.connect(newConfig);

        const newMattRecords = await sql.query`
            SELECT 
                id,
                email,
                first as first_name,
                last as last_name,
                poc as point_of_contact,
                datetime as touchpoint_date,
                aow as area_of_work,
                claim,
                stage
            FROM enquiries 
            WHERE email = 'Mat.Talaie@hotmail.com' 
               OR (first LIKE 'Mat%' AND last LIKE 'Talaie%')
        `;

        console.log(`Found ${newMattRecords.recordset.length} records in new database`);
        if (newMattRecords.recordset.length > 0) {
            newMattRecords.recordset.forEach((record, index) => {
                console.log(`New Record ${index + 1}:`);
                console.log(`  ID: ${record.id}`);
                console.log(`  Email: ${record.email}`);
                console.log(`  Name: ${record.first_name} ${record.last_name}`);
                console.log(`  POC: ${record.point_of_contact}`);
                console.log(`  Date: ${record.touchpoint_date}`);
                console.log(`  ─────────────────────────────────────────────────────────────────`);
            });
        }

        console.log('\n🎯 CONCLUSION:');
        console.log('═══════════════════════════════════════════════════════════════════════');
        
        if (claimedCount > 1) {
            console.log(`❗ ISSUE IDENTIFIED: ${claimedCount} claimed records exist for Matt Talaie`);
            console.log(`📝 In the UI, deduplication logic will show only 1 record per group`);
            console.log(`🔍 The colleague likely sees only the "winner" from deduplication`);
            console.log(`💡 Other instances are suppressed by the fuzzy matching logic`);
            
            // Find which record would win in different views
            const winnerInMine = Object.values(mineGroups).map(group => group.sort((a, b) => {
                if (a.statusRank !== b.statusRank) return b.statusRank - a.statusRank;
                return b.timestamp - a.timestamp;
            })[0]);
            
            const winnerInAll = Object.values(allGroups).map(group => group.sort((a, b) => {
                if (a.statusRank !== b.statusRank) return b.statusRank - a.statusRank;
                return b.timestamp - a.timestamp;
            })[0]);
            
            console.log(`\n🏆 In Mine view, visible record: POC=${winnerInMine[0]?.Point_of_Contact}`);
            console.log(`🏆 In All view, visible record: POC=${winnerInAll[0]?.Point_of_Contact}`);
        } else {
            console.log(`✅ No duplicate claimed records found`);
        }

    } catch (error) {
        console.error('❌ Error analyzing ID display issue:', error.message);
        throw error;
    } finally {
        try {
            await sql.close();
        } catch (closeError) {
            console.error('Error closing SQL connection:', closeError.message);
        }
    }
}

// Execute the analysis
analyzeIdDisplayIssue()
    .then(() => {
        console.log('\n✅ Analysis complete');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Analysis failed:', error.message);
        process.exit(1);
    });