const clioApiBase =
    process.env.CLIO_API_BASE || 'https://eu.app.clio.com/api/v4';

async function getCustomFieldNameMap(headers) {
    try {
        const resp = await fetch(
            `${clioApiBase}/custom_fields.json?fields=id,name`,
            { headers }
        );
        if (resp.ok) {
            const data = await resp.json();
            return (data.data || []).reduce((map, cf) => {
                map[cf.id] = cf.name;
                return map;
            }, {});
        }
    } catch (err) {
        console.warn('Failed to fetch custom field map', err);
    }
    return {};
}

/**
 * Create or update a Clio contact.
 * @param {Object} contact - Contact attributes including type.
 * @param {Object} headers - Authorization headers for Clio API.
 * @returns {Promise<Object>} API response JSON.
 */
async function createOrUpdate(contact, headers) {
    const query = encodeURIComponent(contact.email_addresses?.[0]?.address || '');
    const type = contact.type || 'Person';

    let url = `${clioApiBase}/contacts`;
    let method = 'POST';
    let existingFields = [];
    let cfNameMap = {};

    if (query) {
        const lookup = await fetch(
            `${clioApiBase}/contacts?query=${query}&type=${type}`,
            { headers }
        );
        if (lookup.ok) {
            const data = await lookup.json();
            if (data.data?.length) {
                const contactId = data.data[0].id;
                url = `${clioApiBase}/contacts/${contactId}`;
                method = 'PATCH';

                try {
                    const detailUrl = `${clioApiBase}/contacts/${contactId}?fields=custom_field_values{id,field_name,value}`;
                    const details = await fetch(detailUrl, { headers });
                    if (details.ok) {
                        const info = await details.json();
                        existingFields = info.data?.custom_field_values || [];
                    }
                } catch (err) {
                    console.warn('Failed to fetch existing contact details', err);
                }

                cfNameMap = await getCustomFieldNameMap(headers);
            }
        }
    }

    const { type: contactType, ...attributes } = contact;

    if (method === 'PATCH') {
        if (!Array.isArray(attributes.custom_field_values)) {
            attributes.custom_field_values = [];
        }
        attributes.custom_field_values = attributes.custom_field_values
            .filter(
                (cf, idx, arr) =>
                    cf?.custom_field?.id &&
                    arr.findIndex(x => x.custom_field?.id === cf.custom_field?.id) === idx
            )
            .map(cf => {
                const name = cfNameMap[cf.custom_field.id];
                const existing = existingFields.find(e => e.field_name === name);
                return existing ? { ...cf, id: existing.id } : cf;
            });
    }

    const payload = { data: { type: contactType, ...attributes } };
    // SECURITY: Do not log payload - contains PII (names, emails, phone numbers, addresses)

    const resp = await fetch(url, { method, headers, body: JSON.stringify(payload) });
    if (!resp.ok) {
        const text = await resp.text();
        console.error('Clio contact create/update failed:', text);
        throw new Error('Create/update failed');
    }
    const json = await resp.json();
    console.log('Received from Clio:', JSON.stringify(json, null, 2));
    return json;
}

module.exports = createOrUpdate;
