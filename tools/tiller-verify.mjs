#!/usr/bin/env node
/**
 * TILLER VERIFICATION — one-off
 *
 * Usage:
 *   node tools/tiller-verify.mjs --profile <path.json>
 *   node tools/tiller-verify.mjs --first Steven --last Savale --dob 26/05/1963 \
 *     --email scsavale@yahoo.com --phone +447714755587 \
 *     --house 19 --street "Mary Datchelor House Building" \
 *     --city London --county London --postcode "SE5 8FB" --country GB \
 *     --ref 18207
 *
 * Flags:
 *   --dry-run     Build the payload, print it (DOB redacted) and exit. No API call.
 *   --plan        Print intent only, then exit.
 *   --title       Mr|Mrs|Miss|Ms|Dr (default Mr)
 *   --gender      Male|Female (default Male)
 *   --ref         externalReferenceId (default 'oneoff-<epoch>')
 *
 * Reads Key Vault secrets `tiller-clientid` / `tiller-clientsecret` from
 * helixlaw-instructions (same as server/utils/tillerApi.js).
 * Does NOT write to the IDVerifications table.
 */

import { config } from 'dotenv';
import { createRequire } from 'module';
import fs from 'fs';

config();

const require = createRequire(import.meta.url);
const { SecretClient } = require('@azure/keyvault-secrets');
const { DefaultAzureCredential } = require('@azure/identity');

const VAULT_URL = `https://${process.env.KEY_VAULT_NAME || 'helixlaw-instructions'}.vault.azure.net`;
const TOKEN_URL = 'https://verify-auth.tiller-verify.com/connect/token';
const VERIFY_URL = 'https://verify-api.tiller-verify.com/api/v1/verifications';

function parseArgs(argv) {
    const out = { flags: {}, bool: {} };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith('--')) continue;
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) {
            out.bool[key] = true;
        } else {
            out.flags[key] = next;
            i++;
        }
    }
    return out;
}

const TITLES = { Mr: 1, Mrs: 2, Miss: 3, Ms: 4, Dr: 5 };
const GENDERS = { Male: 1, Female: 2, M: 1, F: 2 };

function normaliseDob(raw) {
    if (!raw) throw new Error('DOB missing (--dob)');
    const s = String(raw).trim();
    // DD/MM/YYYY or D/M/YYYY (also accept '-' separator)
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
        const [, d, m, y] = dmy;
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    // YYYY-MM-DD
    const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) return s;
    // Fallback: ISO datetime
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    throw new Error(`Unparseable DOB: "${raw}". Use DD/MM/YYYY or YYYY-MM-DD.`);
}

function normalisePhone(raw) {
    if (!raw) return undefined;
    let c = String(raw).replace(/[\s\-()]/g, '');
    if (c.startsWith('0')) c = '+44' + c.slice(1);
    else if (!c.startsWith('+')) c = '+44' + c;
    return c;
}

function buildPayload(p, ref) {
    return {
        externalReferenceId: String(ref),
        runAsync: 'True',
        mock: 'False',
        checks: [
            { checkTypeId: 1, maximumSources: 3, CheckMethod: 1, matchesRequired: 1 },
            { checkTypeId: 2 },
        ],
        profile: {
            titleId: TITLES[p.title || 'Mr'] || 1,
            genderTypeId: GENDERS[p.gender || 'Male'] || 1,
            firstName: p.firstName,
            lastName: p.lastName,
            dateOfBirth: p.dateOfBirth,
            mobileNumber: p.mobileNumber,
            email: p.email,
            cardTypes: [],
            currentAddress: {
                structured: {
                    buildingNumber: p.address.buildingNumber,
                    roadStreet: p.address.roadStreet,
                    townCity: p.address.townCity,
                    stateProvinceName: p.address.stateProvinceName,
                    postZipCode: p.address.postZipCode,
                    countryCode: (p.address.countryCode || 'GB').toUpperCase(),
                },
            },
        },
    };
}

function redactPayload(payload) {
    const clone = JSON.parse(JSON.stringify(payload));
    const pr = clone.profile;
    pr.dateOfBirth = pr.dateOfBirth ? '****-**-**' : undefined;
    pr.mobileNumber = pr.mobileNumber ? '+44******' + String(pr.mobileNumber).slice(-3) : undefined;
    pr.email = pr.email ? pr.email.replace(/(^.).*(@.*$)/, '$1***$2') : undefined;
    return clone;
}

async function getToken(clientId, clientSecret) {
    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'VerificationsAPI',
        client_id: clientId,
        client_secret: clientSecret,
    });
    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: body.toString(),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Token request failed: ${res.status} ${text}`);
    }
    const j = await res.json();
    return j.access_token;
}

async function main() {
    const { flags, bool } = parseArgs(process.argv);

    let profile;
    if (flags.profile) {
        const body = JSON.parse(fs.readFileSync(flags.profile, 'utf8'));
        profile = body.profile || body;
    } else {
        profile = {
            title: flags.title || 'Mr',
            gender: flags.gender || 'Male',
            firstName: flags.first,
            lastName: flags.last,
            dateOfBirth: normaliseDob(flags.dob),
            mobileNumber: normalisePhone(flags.phone),
            email: flags.email,
            address: {
                buildingNumber: flags.house,
                roadStreet: flags.street,
                townCity: flags.city,
                stateProvinceName: flags.county || flags.city,
                postZipCode: flags.postcode,
                countryCode: flags.country || 'GB',
            },
        };
    }

    // Required-field sanity
    const required = ['firstName', 'lastName', 'dateOfBirth', 'email'];
    for (const k of required) {
        if (!profile[k]) throw new Error(`Missing required profile field: ${k}`);
    }
    for (const k of ['buildingNumber', 'roadStreet', 'townCity', 'postZipCode']) {
        if (!profile.address?.[k]) throw new Error(`Missing required address field: ${k}`);
    }

    const ref = flags.ref || `oneoff-${Date.now()}`;
    const payload = buildPayload(profile, ref);

    if (bool.plan) {
        console.log('[plan] Would POST to', VERIFY_URL);
        console.log('[plan] externalReferenceId =', ref);
        console.log('[plan] subject =', profile.firstName, profile.lastName);
        return;
    }

    if (bool['dry-run']) {
        console.log('[dry-run] Payload (PII redacted):');
        console.log(JSON.stringify(redactPayload(payload), null, 2));
        return;
    }

    // Live call
    const credential = new DefaultAzureCredential();
    const sc = new SecretClient(VAULT_URL, credential);
    const [idS, secS] = await Promise.all([
        sc.getSecret('tiller-clientid'),
        sc.getSecret('tiller-clientsecret'),
    ]);

    const token = await getToken(idS.value, secS.value);

    const res = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    console.log(`[tiller] HTTP ${res.status}`);
    if (!res.ok) {
        console.error('[tiller] Error response:');
        console.error(JSON.stringify(json, null, 2));
        process.exitCode = 1;
        return;
    }

    const correlationId = json.correlationId || json.CorrelationId || json.id;
    console.log('[tiller] correlationId:', correlationId || '(not returned)');
    console.log('[tiller] externalReferenceId:', ref);
    console.log('[tiller] full response:');
    console.log(JSON.stringify(json, null, 2));
}

main().catch((err) => {
    console.error('[tiller-verify] FAILED:', err.message);
    process.exit(1);
});
