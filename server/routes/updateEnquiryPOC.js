const express = require('express');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const { Connection, Request: SqlRequest, TYPES } = require('tedious');

const router = express.Router();

// Update enquiry Point of Contact
router.post('/', async (req, res) => {
    // Log request with masked sensitive data
    const maskedBody = {
        ID: req.body.ID,
        Point_of_Contact: req.body.Point_of_Contact ? '***' : undefined,
        // Keep other non-sensitive fields as-is
        ...Object.fromEntries(
            Object.entries(req.body).filter(([key]) => 
                !['Point_of_Contact'].includes(key)
            )
        )
    };
    console.log('Update Enquiry POC endpoint called:', maskedBody);

    const { ID, Point_of_Contact } = req.body;

    if (!ID || !Point_of_Contact) {
        console.warn('Missing ID or Point_of_Contact in request body');
        return res.status(400).json({
            success: false,
            message: 'Missing ID or Point_of_Contact in request body'
        });
    }

    try {
        console.log('Updating enquiry POC - ID:', ID, 'New POC: ***');
        await updatePOCInSQL(ID, Point_of_Contact);
        console.log('Successfully updated enquiry Point of Contact');

        res.json({
            success: true,
            message: 'Point of Contact updated successfully',
            updatedID: ID,
            newPOC: Point_of_Contact
        });
    } catch (error) {
        console.error('Error updating enquiry Point of Contact:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating enquiry Point of Contact',
            error: error.message
        });
    }
});

// SQL update function
async function updatePOCInSQL(ID, Point_of_Contact) {
    const kvUri = "https://helix-keys.vault.azure.net/";
    const passwordSecretName = "sql-databaseserver-password";
    const sqlServer = "helix-database-server.database.windows.net";
    const sqlDatabase = "helix-core-data";

    const secretClient = new SecretClient(kvUri, new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] }));
    const passwordSecret = await secretClient.getSecret(passwordSecretName);
    const password = passwordSecret.value;

    const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};`;
    const config = parseConnectionString(connectionString);

    return new Promise((resolve, reject) => {
        const connection = new Connection(config);

        connection.on("error", (err) => {
            console.error("SQL Connection Error:", err);
            reject(new Error("An error occurred with the SQL connection."));
        });

        connection.on("connect", (err) => {
            if (err) {
                console.error("SQL Connection Error:", err);
                reject(new Error("Failed to connect to SQL database."));
                return;
            }

            const query = `
                UPDATE enquiries
                SET Point_of_Contact = @Point_of_Contact
                WHERE ID = @ID
            `;

            const sqlRequest = new SqlRequest(query, (err, rowCount) => {
                if (err) {
                    console.error("SQL Query Execution Error:", err);
                    reject(new Error("SQL query failed."));
                    connection.close();
                    return;
                }

                if (rowCount === 0) {
                    console.warn(`No enquiry found with ID: ${ID}`);
                    reject(new Error("No enquiry found with the provided ID."));
                } else {
                    console.log(`Enquiry ID ${ID} Point of Contact updated successfully to: ${Point_of_Contact}`);
                    resolve();
                }

                connection.close();
            });

            sqlRequest.addParameter('Point_of_Contact', TYPES.NVarChar, Point_of_Contact);
            sqlRequest.addParameter('ID', TYPES.NVarChar, ID);

            connection.execSql(sqlRequest);
        });

        connection.connect();
    });
}

// Helper function to parse SQL connection string
function parseConnectionString(connectionString) {
    const parts = connectionString.split(';');
    const config = {};

    parts.forEach(part => {
        const [key, value] = part.split('=');
        if (!key || !value) {
            return;
        }

        switch (key.trim()) {
            case 'Server':
                config.server = value;
                break;
            case 'Database':
                config.options = { ...config.options, database: value };
                break;
            case 'User ID':
                config.authentication = {
                    type: 'default',
                    options: { userName: value, password: '' }
                };
                break;
            case 'Password':
                if (!config.authentication) {
                    config.authentication = { type: 'default', options: { userName: '', password: '' } };
                }
                config.authentication.options.password = value;
                break;
            default:
                break;
        }
    });

    return config;
}

module.exports = router;