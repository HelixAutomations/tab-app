const axios = require('axios');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

const keyVaultName = process.env.KEY_VAULT_NAME || 'helixlaw-instructions';
const vaultUrl = `https://${keyVaultName}.vault.azure.net`;
const credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
const secretClient = new SecretClient(vaultUrl, credential);

let cachedClientId;
let cachedClientSecret;
let cachedToken;
let tokenExpiry = 0;

async function getCredentials() {
    if (!cachedClientId || !cachedClientSecret) {
        const [id, secret] = await Promise.all([
            secretClient.getSecret('tiller-clientid'),
            secretClient.getSecret('tiller-clientsecret'),
        ]);
        cachedClientId = id.value;
        cachedClientSecret = secret.value;
    }
    return { clientId: cachedClientId, clientSecret: cachedClientSecret };
}

async function refreshToken() {
    const { clientId, clientSecret } = await getCredentials();
    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'VerificationsAPI',
        client_id: clientId,
        client_secret: clientSecret,
    }).toString();

    // Requesting Tiller token

    try {
        const res = await axios.post(
            'https://verify-auth.tiller-verify.com/connect/token',
            body,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json',
                },
            }
        );

        cachedToken = res.data.access_token;
        tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
        return cachedToken;
    } catch (err) {
        if (err.response) {
            console.error('[Tiller] Token status:', err.response.status);
            console.error('[Tiller] Token error data:', JSON.stringify(err.response.data));
        } else {
            console.error('[Tiller] Token request error:', err.message);
        }
        throw err;
    }
}

async function getToken() {
    if (cachedToken && Date.now() < tokenExpiry) {
        return cachedToken;
    }
    return refreshToken();
}

async function submitVerification(instructionData) {
    const token = await getToken();
    const payload = buildTillerPayload(instructionData);
    // Tiller payload prepared
    
    try {
        const res = await axios.post(
            'https://verify-api.tiller-verify.com/api/v1/verifications',
            payload,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );
    // Tiller response received
        return res.data;
    } catch (err) {
        if (err.response) {
            console.error('[Tiller] Status:', err.response.status);
            console.error('[Tiller] Error data:', JSON.stringify(err.response.data, null, 2));
            if (err.response.data?.ValidationErrors) {
                console.error('[Tiller] Validation Errors:', JSON.stringify(err.response.data.ValidationErrors, null, 2));
            }
        } else {
            console.error('[Tiller] Request error:', err.message);
        }
        console.error(
            '[Tiller] Failed payload for',
            instructionData.instructionRef || instructionData.InstructionRef
        );
        throw err;
    }
}

// Reference data for building Tiller payload
const titles = [
    { id: 1, name: 'Mr', code: 'Mr' },
    { id: 2, name: 'Mrs', code: 'Mrs' },
    { id: 3, name: 'Miss', code: 'Miss' },
    { id: 4, name: 'Ms', code: 'Ms' },
    { id: 5, name: 'Dr', code: 'Dr' }
];

const genders = [
    { id: 1, name: 'Male', code: 'M' },
    { id: 2, name: 'Female', code: 'F' }
];

function findIdByName(list, name) {
    if (!name) return undefined;
    const lower = String(name).toLowerCase();
    const entry = list.find(i => i.name.toLowerCase() === lower || i.code === name);
    return entry ? entry.id : undefined;
}

function buildTillerPayload(data) {
    const get = (...keys) => {
        for (const k of keys) {
            if (data[k] != null && data[k] !== '') return data[k];
        }
        return undefined;
    };

    // Format date to ISO string if needed
    const formatDate = (dateValue) => {
        if (!dateValue) return undefined;
        
        try {
            const date = new Date(dateValue);
            if (isNaN(date.getTime())) {
                console.warn('Invalid date format:', dateValue);
                return undefined;
            }
            return date.toISOString().split('T')[0]; // YYYY-MM-DD format
        } catch (error) {
            console.warn('Date parsing error:', error.message, 'for value:', dateValue);
            return undefined;
        }
    };

    // Format phone number to remove spaces/dashes and ensure it starts with country code
    const formatPhone = (phone) => {
        if (!phone) return undefined;
        
        let cleaned = phone.replace(/[\s\-\(\)]/g, '');
        
        // Add UK country code if missing
        if (cleaned.startsWith('0')) {
            cleaned = '+44' + cleaned.substring(1);
        } else if (!cleaned.startsWith('+')) {
            cleaned = '+44' + cleaned;
        }
        
        return cleaned;
    };

    // Ensure country code is 2-letter ISO format
    const formatCountryCode = (country) => {
        if (!country) return 'GB'; // Default to GB
        
        const countryMappings = {
            'United Kingdom': 'GB',
            'UK': 'GB',
            'England': 'GB',
            'Scotland': 'GB',
            'Wales': 'GB',
            'Northern Ireland': 'GB',
            'United States': 'US',
            'USA': 'US',
            'Canada': 'CA'
        };
        
        return countryMappings[country] || (country.length === 2 ? country.toUpperCase() : 'GB');
    };

    const profile = {
        titleId: findIdByName(titles, get('title', 'Title')),
        genderTypeId: findIdByName(genders, get('gender', 'Gender')),
        firstName: get('firstName', 'FirstName'),
        lastName: get('lastName', 'LastName'),
        dateOfBirth: formatDate(get('dob', 'DOB')),
        mobileNumber: formatPhone(get('phone', 'Phone')),
        email: get('email', 'Email'),
        cardTypes: [],
        currentAddress: {
            structured: {
                buildingNumber: get('houseNumber', 'HouseNumber'),
                roadStreet: get('street', 'Street'),
                townCity: get('city', 'City'),
                stateProvinceName: get('county', 'County'),
                postZipCode: get('postcode', 'Postcode'),
                countryCode: formatCountryCode(get('countryCode', 'CountryCode') || get('country', 'Country'))
            }
        }
    };

    const passport = get('passportNumber', 'PassportNumber');
    if (passport) {
        profile.cardTypes.push({ cardTypeId: 1, cardNumber: passport });
    }
    const drivers = get('driversLicenseNumber', 'DriversLicenseNumber');
    if (drivers) {
        profile.cardTypes.push({ cardTypeId: 4, cardNumber: drivers });
    }

    // Built profile data

    return {
        externalReferenceId: '18207',
        runAsync: 'True',
        mock: 'False', // Disable mock mode for production
        checks: [
            { checkTypeId: 1, maximumSources: 3, CheckMethod: 1, matchesRequired: 1 },
            { checkTypeId: 2 }
        ],
        profile
    };
}

module.exports = { submitVerification, buildTillerPayload };
