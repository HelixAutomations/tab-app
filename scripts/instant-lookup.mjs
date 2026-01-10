#!/usr/bin/env node
/**
 * INSTANT DATABASE LOOKUPS
 * Usage: node scripts/instant-lookup.mjs [type] [value]
 * Types: passcode, enquiry, deal, instruction
 */

import { config } from 'dotenv';
import sql from 'mssql';

config();

const [,, type, value] = process.argv;

if (!type || !value) {
    console.log('Usage: node scripts/instant-lookup.mjs [passcode|enquiry|deal|instruction] [value]');
    process.exit(1);
}

async function lookup() {
    try {
        let pool, query, dbName;
        
        switch(type) {
            case 'passcode':
                pool = await sql.connect(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING);
                query = `
                    SELECT 'Deal' as Type, DealId, ProspectId, Passcode, Amount, ServiceDescription, InstructionRef 
                    FROM Deals WHERE Passcode = '${value}'
                    UNION ALL
                    SELECT 'Instruction' as Type, InstructionRef, ProspectId, NULL, NULL, NULL, InstructionRef
                    FROM Instructions WHERE InstructionRef LIKE '%${value}%'
                `;
                dbName = 'Instructions';
                break;
                
            case 'enquiry':
                pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
                query = `SELECT ID, First_Name, Last_Name, Email, Phone_Number, Company, Area_of_Work, Matter_Ref FROM enquiries WHERE ID = ${value}`;
                dbName = 'Core Data';
                break;
                
            case 'deal':
                pool = await sql.connect(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING);
                query = `SELECT * FROM Deals WHERE DealId = ${value}`;
                dbName = 'Instructions';
                break;
                
            case 'instruction':
                pool = await sql.connect(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING);
                query = `SELECT * FROM Instructions WHERE InstructionRef = '${value}'`;
                dbName = 'Instructions';
                break;
                
            default:
                console.log('❌ Invalid type. Use: passcode, enquiry, deal, instruction');
                process.exit(1);
        }
        
        console.log(`🔍 ${dbName} DB → ${type} "${value}"`);
        const result = await pool.request().query(query);
        
        if (result.recordset.length === 0) {
            console.log('❌ Not found');
        } else {
            console.log('✅ Found:');
            result.recordset.forEach(record => {
                console.log(JSON.stringify(record, null, 2));
            });
        }
        
        await pool.close();
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

lookup();