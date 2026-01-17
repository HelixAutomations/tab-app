#!/usr/bin/env node
/**
 * INSTANT DATABASE LOOKUPS
 * Usage: node scripts/instant-lookup.mjs [type] [value]
 * Types: passcode, enquiry, deal, instruction, prospect, person
 */

import { config } from 'dotenv';
import sql from 'mssql';

config();

const [,, type, value] = process.argv;

if (!type || !value) {
    console.log('Usage: node scripts/instant-lookup.mjs [passcode|enquiry|deal|instruction|prospect|person] [value]');
    process.exit(1);
}

async function lookup() {
    try {
                const input = String(value);
                const like = `%${input}%`;
                let pool;
                let dbName;
                let recordset = [];
        
        switch(type) {
            case 'passcode':
                                pool = await sql.connect(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING);
                                recordset = (await pool
                                    .request()
                                    .input('passcode', sql.VarChar, input)
                                    .input('like', sql.VarChar, like)
                                    .query(`
                                        SELECT 'Deal' as Type, DealId, ProspectId, Passcode, Amount, ServiceDescription, InstructionRef
                                        FROM Deals WHERE Passcode = @passcode
                                        UNION ALL
                                        SELECT 'Instruction' as Type, InstructionRef, ProspectId, NULL, NULL, NULL, InstructionRef
                                        FROM Instructions WHERE InstructionRef LIKE @like
                                    `)).recordset;
                dbName = 'Instructions';
                break;
                
            case 'enquiry':
                                pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
                                {
                                    const enquiryId = Number.parseInt(input, 10);
                                    if (!Number.isFinite(enquiryId)) {
                                        console.log('❌ enquiry expects a numeric ID');
                                        process.exit(1);
                                    }
                                    recordset = (await pool
                                        .request()
                                        .input('id', sql.Int, enquiryId)
                                        .query(
                                            'SELECT ID, First_Name, Last_Name, Email, Phone_Number, Company, Area_of_Work, Matter_Ref FROM enquiries WHERE ID = @id'
                                        )).recordset;
                                }
                dbName = 'Core Data';
                break;
                
            case 'deal':
                                pool = await sql.connect(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING);
                                {
                                    const dealId = Number.parseInt(input, 10);
                                    if (!Number.isFinite(dealId)) {
                                        console.log('❌ deal expects a numeric DealId');
                                        process.exit(1);
                                    }
                                    recordset = (await pool
                                        .request()
                                        .input('dealId', sql.Int, dealId)
                                        .query('SELECT * FROM Deals WHERE DealId = @dealId')).recordset;
                                }
                dbName = 'Instructions';
                break;
                
            case 'instruction':
                                pool = await sql.connect(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING);
                                recordset = (await pool
                                    .request()
                                    .input('instructionRef', sql.VarChar, input)
                                    .query('SELECT * FROM Instructions WHERE InstructionRef = @instructionRef')).recordset;
                dbName = 'Instructions';
                break;

                        case 'prospect': {
                                pool = await sql.connect(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING);
                                // ProspectId is a string in Instructions DB in practice (even if numeric)
                                const pid = input;
                                const deals = (await pool
                                    .request()
                                    .input('pid', sql.VarChar, pid)
                                    .query('SELECT TOP 50 DealId, ProspectId, Passcode, Amount, ServiceDescription, InstructionRef FROM Deals WHERE ProspectId = @pid ORDER BY DealId DESC')).recordset;

                                const instructionRefs = [...new Set(
                                    deals
                                        .map((d) => (d?.InstructionRef ? String(d.InstructionRef).trim() : ''))
                                        .filter(Boolean)
                                )];

                                let instructions = [];
                                if (instructionRefs.length > 0) {
                                    const req = pool.request();
                                    const refParamNames = instructionRefs.map((_, idx) => `ref${idx}`);
                                    refParamNames.forEach((p, idx) => req.input(p, sql.VarChar, instructionRefs[idx]));
                                    const inList = refParamNames.map((p) => `@${p}`).join(',');
                                    instructions = (await req.query(
                                        `SELECT TOP 50 InstructionRef, Stage, FirstName, LastName, ClientId, MatterId, Email
                                         FROM Instructions
                                         WHERE InstructionRef IN (${inList})
                                         ORDER BY InstructionRef DESC`
                                    )).recordset;
                                }

                                dbName = 'Instructions';
                                recordset = [{ prospectId: pid, deals, instructions }];
                                break;
                        }

                        case 'person': {
                                // 1) Resolve Core Data enquiries by name/email
                                const corePool = await sql.connect(process.env.SQL_CONNECTION_STRING);
                                const enquiries = (await corePool
                                    .request()
                                    .input('like', sql.VarChar, like)
                                    .query(
                                        `SELECT TOP 25 ID, First_Name, Last_Name, Email, Phone_Number, Company, Area_of_Work, Matter_Ref
                                         FROM enquiries
                                         WHERE First_Name LIKE @like OR Last_Name LIKE @like OR Email LIKE @like
                                         ORDER BY ID DESC`
                                    )).recordset;
                                await corePool.close();

                                const enquiryIds = enquiries
                                    .map((e) => (e?.ID !== undefined ? String(e.ID) : null))
                                    .filter(Boolean);

                                // 2) Pull related deals/instructions from Instructions DB via ProspectId
                                const instrPool = await sql.connect(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING);
                                const req = instrPool.request().input('like', sql.VarChar, like);

                                let deals = [];
                                let instructions = [];

                                if (enquiryIds.length > 0) {
                                    const idsParamNames = enquiryIds.map((_, idx) => `pid${idx}`);
                                    idsParamNames.forEach((p, idx) => req.input(p, sql.VarChar, enquiryIds[idx]));
                                    const inList = idsParamNames.map((p) => `@${p}`).join(',');

                                    deals = (await req.query(`SELECT TOP 50 * FROM Deals WHERE ProspectId IN (${inList})`)).recordset;

                                    // Need a fresh request for the next query (mssql request instances are one-shot-ish for params)
                                    const req2 = instrPool.request().input('like', sql.VarChar, like);
                                    idsParamNames.forEach((p, idx) => req2.input(p, sql.VarChar, enquiryIds[idx]));
                                    instructions = (await req2.query(`SELECT TOP 50 * FROM Instructions WHERE ProspectId IN (${inList})`)).recordset;
                                } else {
                                    // Fallback: name-only search in Instructions DB (can be noisy, but helps when ProspectId linkage is missing)
                                    deals = (await req.query('SELECT TOP 25 * FROM Deals WHERE ServiceDescription LIKE @like')).recordset;
                                    instructions = (await instrPool
                                        .request()
                                        .input('like', sql.VarChar, like)
                                        .query('SELECT TOP 25 * FROM Instructions WHERE FirstName LIKE @like OR LastName LIKE @like')).recordset;
                                }

                                await instrPool.close();

                                dbName = 'Core Data + Instructions';
                                recordset = [{ enquiries, deals, instructions }];
                                break;
                        }
                
            default:
                console.log('❌ Invalid type. Use: passcode, enquiry, deal, instruction, prospect, person');
                process.exit(1);
        }
        
                console.log(`🔍 ${dbName} DB → ${type} "${input}"`);
        
                if (!recordset || recordset.length === 0) {
            console.log('❌ Not found');
        } else {
            console.log('✅ Found:');
                        recordset.forEach(record => {
                console.log(JSON.stringify(record, null, 2));
            });
        }
        
                if (pool) {
                    await pool.close();
                }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

lookup();