const express = require('express');
const { getSecret } = require('../utils/getSecret');
const { PRACTICE_AREAS } = require('../utils/clioConstants');
const { loggers } = require('../utils/logger');

const router = express.Router();
const log = loggers.clio.child('Contacts');

router.post('/', async (req, res) => {
    const { formData, initials } = req.body || {};
    if (!formData || !initials) {
        return res.status(400).json({ error: 'Missing data' });
    }

    try {
        // Fetch Clio credentials
        const clientId = await getSecret(`${initials.toLowerCase()}-clio-v1-clientid`);
        const clientSecret = await getSecret(`${initials.toLowerCase()}-clio-v1-clientsecret`);
        const refreshToken = await getSecret(`${initials.toLowerCase()}-clio-v1-refreshtoken`);

        // Refresh access token
        const tokenUrl = `https://eu.app.clio.com/oauth/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=refresh_token&refresh_token=${refreshToken}`;
        const tokenResp = await fetch(tokenUrl, { method: 'POST' });
        if (!tokenResp.ok) {
            const text = await tokenResp.text();
            log.error('Token refresh failed: %s', text);
            return res.status(500).json({ error: 'Token refresh failed' });
        }
        const { access_token } = await tokenResp.json();
        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access_token}`
        };

        const clioApiBase = process.env.CLIO_API_BASE || 'https://eu.app.clio.com/api/v4';

        // fetch custom field definitions once so we can log missing fields later
        let customFields = [];
        let cfNameMap = {};
        try {
            const cfUrl = `${clioApiBase}/custom_fields.json?fields=id,etag,created_at,updated_at,name,parent_type,field_type,displayed,deleted,required,display_order`;
            const cfResp = await fetch(cfUrl, { headers });
            if (cfResp.ok) {
                const cfData = await cfResp.json();
                customFields = cfData.data || [];
                cfNameMap = customFields.reduce((map, cf) => {
                    map[cf.id] = cf.name;
                    return map;
                }, {});
            }
        } catch (err) {
            log.warn('Failed to retrieve custom field list');
        }

        const results = [];
        let clients = formData.client_information || [];
        clients = clients.filter(c =>
            c.first_name || c.first || c.last_name || c.last || (c.company_details && c.company_details.name)
        );
        const type = formData.matter_details?.client_type || 'Individual';

        // Map an individual client to Clio Person payload
        function mapPerson(client) {
            const address = client.address || {};
            const verification = client.verification || {};
            const checkResult = verification.check_result || client.check_result;
            const idType = checkResult === 'DriversLicense' ? 142570 : 142567;
            const tillerId =
                verification.check_id ||
                client.check_id ||
                client.EIDCheckId ||
                client.checkId ||
                null;
            const expiry =
                verification.check_expiry ||
                client.check_expiry ||
                client.CheckExpiry ||
                client.checkExpiry;

            const phone =
                client.best_number ||
                client.phone ||
                client.phone_number ||
                client.phoneNumber ||
                client.Phone ||
                null;

            return {
                first_name: client.first_name || client.first || '',
                last_name: client.last_name || client.last || '',
                prefix: client.prefix || null,
                date_of_birth: client.date_of_birth || null,
                email_addresses: [
                    {
                        name: 'Home',
                        address: client.email || client.Email || '',
                        default_email: true
                    }
                ],
                phone_numbers: phone
                    ? [{ name: 'Home', number: phone, default_number: true }]
                    : [],
                addresses: [
                    {
                        name: 'Home',
                        street: `${address.house_number || ''} ${address.street || ''}`.trim(),
                        city: address.city || '',
                        province: address.county || '',
                        postal_code: address.post_code || '',
                        country: address.country || ''
                    }
                ],
                company: {
                    name: client.company_details?.name || null
                },
                custom_field_values: (() => {
                    const cfs = [];
                    const ref = formData?.matter_details?.instruction_ref;
                    if (ref) {
                        cfs.push({ value: ref, custom_field: { id: 380728 } });
                    }
                    if (expiry) {
                        cfs.push({ value: expiry, custom_field: { id: 235702 } });
                    }
                    cfs.push({ value: idType, custom_field: { id: 235699 } });
                    if (tillerId) {
                        cfs.push({ value: tillerId, custom_field: { id: 286228 } });
                    }
                    return cfs;
                })()
            };
        }

        // Map a company client to Clio Company payload
        function mapCompany(company, nameOverride) {
            const phone =
                company.best_number ||
                company.company_details?.phone ||
                company.phone ||
                company.Phone ||
                null;

            const base = {
                name: nameOverride || company.company_details?.name || null,
                email_addresses: company.email
                    ? [{ name: 'Work', address: company.email || company.Email, default_email: true }]
                    : [],
                phone_numbers: phone
                    ? [{ name: 'Work', number: phone, default_number: true }]
                    : [],
                addresses: company.company_details?.address
                    ? [
                        {
                            name: 'Work',
                            street: `${company.company_details.address.house_number || ''} ${company.company_details.address.street || ''}`.trim(),
                            city: company.company_details.address.city || '',
                            province: company.company_details.address.county || '',
                            postal_code: company.company_details.address.post_code || '',
                            country: company.company_details.address.country || ''
                        }
                    ]
                    : []
            };

            const customFieldValues = [];
            const ref = formData?.matter_details?.instruction_ref;
            if (ref) {
                customFieldValues.push({ value: ref, custom_field: { id: 380728 } });
            }
            const expiry =
                company.verification?.check_expiry ||
                company.check_expiry ||
                company.CheckExpiry ||
                company.checkExpiry;
            if (expiry) {
                customFieldValues.push({ value: expiry, custom_field: { id: 235702 } });
            }
            const idType = (company.verification?.check_result || company.check_result) === 'DriversLicense' ? 142570 : 142567;
            customFieldValues.push({ value: idType, custom_field: { id: 235699 } });
            const tillerId =
                company.verification?.check_id ||
                company.check_id ||
                company.EIDCheckId ||
                company.checkId;
            if (tillerId) {
                customFieldValues.push({ value: tillerId, custom_field: { id: 286228 } });
            }
            if (company.company_details?.number) {
                customFieldValues.push({ value: company.company_details.number, custom_field: { id: 368788 } });
            }

            return {
                ...base,
                custom_field_values: customFieldValues
            };
        }

        // Create or update a contact in Clio
        function countEmpty(detail) {
            if (!detail || !detail.attributes) return 0;
            const attrs = detail.attributes;
            const baseFields = [
                'prefix',
                'first_name',
                'middle_name',
                'last_name',
                'title',
                'avatar',
                'phone_numbers',
                'email_addresses',
                'date_of_birth',
                'addresses'
            ];
            let count = 0;
            baseFields.forEach(f => {
                const val = attrs[f];
                if (
                    val === null ||
                    val === undefined ||
                    (Array.isArray(val) ? val.length === 0 : typeof val === 'object' && Object.keys(val).length === 0)
                ) {
                    count += 1;
                }
            });

            if (Array.isArray(customFields)) {
                const relevant = customFields.filter(cf => cf.parent_type === detail.type);
                relevant.forEach(cf => {
                    const exists = (attrs.custom_field_values || []).some(v => v.field_name === cf.name);
                    if (!exists) count += 1;
                });
            }
            return count;
        }

        async function createOrUpdate(contact) {
            const query = encodeURIComponent(contact.email_addresses[0]?.address || '');
            // only search People when contact.type === 'Person', or Contacts for 'Company'
            const lookupResp = await fetch(
                `https://eu.app.clio.com/api/v4/contacts?query=${query}&type=${contact.type}`,
                { headers }
            );
            if (!lookupResp.ok) throw new Error('Lookup failed');
            const lookupData = await lookupResp.json();

            let url = 'https://eu.app.clio.com/api/v4/contacts';
            let method = 'POST';
            let existingFields = [];
            let emptyFieldCount = 0;
            if (lookupData.data?.length) {
                const contactId = lookupData.data[0].id;
                url = `https://eu.app.clio.com/api/v4/contacts/${contactId}`;
                method = 'PATCH';

                // Retrieve existing custom field IDs so we can update them
                try {
                    const contactId = lookupData.data[0].id;
                    const detailUrl = `${clioApiBase}/contacts/${contactId}?fields=id,type,prefix,name,first_name,middle_name,last_name,title,company,avatar,email_addresses{name,address,default_email},phone_numbers{name,number,default_number},date_of_birth,addresses{name,street,city,province,postal_code,country},custom_field_values{id,field_name,value}`;
                    const details = await fetch(detailUrl, { headers });
                    if (details.ok) {
                        const data = await details.json();
                        existingFields = data.data?.custom_field_values || [];
                        emptyFieldCount = countEmpty(data.data);
                    }
                } catch (err) {
                    log.warn('Failed to fetch existing contact details');
                }
            }
            const { type: contactType, name, ...attributes } = contact;

            if (method === 'PATCH') {
                if (!Array.isArray(attributes.custom_field_values)) attributes.custom_field_values = [];
                attributes.custom_field_values = attributes.custom_field_values
                    .filter((cf, i, arr) =>
                        cf?.custom_field?.id &&
                        arr.findIndex(x => x.custom_field?.id === cf.custom_field?.id) === i
                    )
                    .map(cf => {
                        const name = cfNameMap[cf.custom_field.id];
                        const existing = existingFields.find(e => e.field_name === name);
                        return existing ? { ...cf, id: existing.id } : cf;
                    });

            }


            const payload = {
                data: {
                    type: contactType,
                    ...(contactType === 'Company' ? { name } : {}),
                    ...attributes
                }
            };

            const resp = await fetch(url, { method, headers, body: JSON.stringify(payload) });
            if (!resp.ok) {
                const text = await resp.text();
                log.fail('contact:sync', new Error(text), { contactType, method });
                throw new Error('Create/update failed');
            }
            const respJson = await resp.json();
            respJson.emptyFieldCount = emptyFieldCount;
            return respJson;
        }

        // Create company contact if present in any client
        const companySource = clients.find(c => c.company_details?.name);
        let companyResult = null;
        if (companySource) {
            companyResult = await createOrUpdate({
                ...mapCompany(companySource),
                type: 'Company'
            });
            results.push(companyResult);
        }

        // Create valid person contacts
        for (const c of clients) {
            const hasName = !!(c.first_name || c.last_name || c.first || c.last);
            if (!hasName) {
                continue;
            }

            const personPayload = { ...mapPerson(c), type: 'Person' };
            if (companyResult && companyResult.data?.id) {
                personPayload.company = {
                    id: companyResult.data.id,
                    name: companyResult.data.attributes?.name,
                    initials: companyResult.data.attributes?.initials,
                    type: 'Company',
                    etag: companyResult.data.attributes?.etag
                };
            }
            results.push(await createOrUpdate(personPayload));
        }

        // Only return contact upsert results. Matter creation happens in /api/clio-matters step.
        log.op('contacts:synced', { count: results.length, type });
        res.json({ ok: true, results });
    } catch (err) {
        log.fail('contacts:sync', err, { initials });
        res.status(500).json({ error: 'Failed to sync contacts' });
    }
});

module.exports = router;
