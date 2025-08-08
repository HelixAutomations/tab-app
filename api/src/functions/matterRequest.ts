import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { Connection, Request as SqlRequest, TYPES } from 'tedious';

export async function matterRequest(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const data = await request.json() as Record<string, any>;
    context.log('Matter request data received:', data);

    const kvUri = 'https://helix-keys.vault.azure.net/';
    const passwordSecretName = 'sql-databaseserver-password';
    const sqlServer = 'helix-database-server.database.windows.net';
    const sqlDatabase = 'helix-core-data';

    try {
        const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
        const passwordSecret = await secretClient.getSecret(passwordSecretName);
        const password = passwordSecret.value || '';

        const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};Encrypt=true;TrustServerCertificate=false;`;
        const config = parseConnectionString(connectionString, context);

        await new Promise<void>((resolve, reject) => {
            const connection = new Connection(config);
            connection.on('connect', err => {
                if (err) {
                    context.error('SQL Connection Error (matterRequest):', err);
                    reject(err);
                    return;
                }

                const query = `INSERT INTO matters (
                    selected_date,
                    supervising_partner,
                    originating_solicitor,
                    client_type,
                    selected_poid_ids,
                    area_of_work,
                    practice_area,
                    description,
                    folder_structure,
                    dispute_value,
                    budget_required,
                    budget_amount,
                    budget_notify_threshold,
                    budget_notify_users,
                    source,
                    referrer_name,
                    opponent_name,
                    opponent_email,
                    opponent_solicitor_name,
                    opponent_solicitor_company,
                    opponent_solicitor_email,
                    no_conflict,
                    created_by
                ) VALUES (
                    @selected_date,@supervising_partner,@originating_solicitor,@client_type,@selected_poid_ids,@area_of_work,@practice_area,@description,@folder_structure,@dispute_value,@budget_required,@budget_amount,@budget_notify_threshold,@budget_notify_users,@source,@referrer_name,@opponent_name,@opponent_email,@opponent_solicitor_name,@opponent_solicitor_company,@opponent_solicitor_email,@no_conflict,@created_by
                );`;

                const sqlRequest = new SqlRequest(query, err => {
                    connection.close();
                    if (err) {
                        context.error('SQL Insert Error (matterRequest):', err);
                        reject(err);
                    } else {
                        resolve();
                    }
                });

                sqlRequest.addParameter('selected_date', TYPES.Date, data.selectedDate ?? null);
                sqlRequest.addParameter('supervising_partner', TYPES.NVarChar, data.supervisingPartner ?? null);
                sqlRequest.addParameter('originating_solicitor', TYPES.NVarChar, data.originatingSolicitor ?? null);
                sqlRequest.addParameter('client_type', TYPES.NVarChar, data.clientType ?? null);
                sqlRequest.addParameter('selected_poid_ids', TYPES.NVarChar, JSON.stringify(data.selectedPoidIds ?? []));
                sqlRequest.addParameter('area_of_work', TYPES.NVarChar, data.areaOfWork ?? null);
                sqlRequest.addParameter('practice_area', TYPES.NVarChar, data.practiceArea ?? null);
                sqlRequest.addParameter('description', TYPES.NVarChar, data.description ?? null);
                sqlRequest.addParameter('folder_structure', TYPES.NVarChar, data.folderStructure ?? null);
                sqlRequest.addParameter('dispute_value', TYPES.NVarChar, data.disputeValue ?? null);
                sqlRequest.addParameter('budget_required', TYPES.NVarChar, data.budgetRequired ?? null);
                sqlRequest.addParameter('budget_amount', TYPES.NVarChar, data.budgetAmount ?? null);
                sqlRequest.addParameter('budget_notify_threshold', TYPES.NVarChar, data.budgetNotifyThreshold ?? null);
                sqlRequest.addParameter('budget_notify_users', TYPES.NVarChar, JSON.stringify(data.budgetNotifyUsers ?? []));
                sqlRequest.addParameter('source', TYPES.NVarChar, data.source ?? null);
                sqlRequest.addParameter('referrer_name', TYPES.NVarChar, data.referrerName ?? null);
                sqlRequest.addParameter('opponent_name', TYPES.NVarChar, data.opponentName ?? null);
                sqlRequest.addParameter('opponent_email', TYPES.NVarChar, data.opponentEmail ?? null);
                sqlRequest.addParameter('opponent_solicitor_name', TYPES.NVarChar, data.opponentSolicitorName ?? null);
                sqlRequest.addParameter('opponent_solicitor_company', TYPES.NVarChar, data.opponentSolicitorCompany ?? null);
                sqlRequest.addParameter('opponent_solicitor_email', TYPES.NVarChar, data.opponentSolicitorEmail ?? null);
                sqlRequest.addParameter('no_conflict', TYPES.Bit, data.noConflict ?? false);
                sqlRequest.addParameter('created_by', TYPES.NVarChar, data.userInitials ?? null);

                connection.execSql(sqlRequest);
            });
            connection.connect();
        });

        return {
            status: 201,
            jsonBody: { success: true }
        };
    } catch (error) {
        context.error('Failed to insert matter request:', error);
        return {
            status: 500,
            jsonBody: { success: false, error: String(error) }
        };
    }
}

app.http('matterRequest', {
    methods: ['POST'],
    authLevel: 'function',
    handler: matterRequest
});

function parseConnectionString(connectionString: string, _context: InvocationContext): any {
    const parts = connectionString.split(';');
    const config: any = {};
    parts.forEach(part => {
        const [key, value] = part.split('=');
        if (!key || !value) return;
        switch (key.trim()) {
            case 'Server':
                config.server = value;
                break;
            case 'Database':
                config.options = { ...config.options, database: value };
                break;
            case 'User ID':
                config.authentication = { type: 'default', options: { userName: value, password: '' } };
                break;
            case 'Password':
                if (!config.authentication) {
                    config.authentication = { type: 'default', options: { userName: '', password: '' } };
                }
                config.authentication.options.password = value;
                break;
        }
    });

    config.options = {
        ...config.options,
        encrypt: true,
        trustServerCertificate: false
    };
    return config;
}
