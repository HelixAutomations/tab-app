// COMMENTED OUT - REDUNDANT FUNCTION
// This function is redundant as documents are already handled by:
// - Express route: /api/documents/:instructionRef 
// - Unified endpoint: /api/instructions (includes documents)

/*
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request, TYPES } from 'tedious';

// Parses a SQL connection string into configuration for the 'tedious' library.
function parseConnectionString(connectionString: string, context: InvocationContext): any {
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
            default:
                break;
        }
    });
    config.options.encrypt = true;
    config.options.enableArithAbort = true;
    context.log("Parsed SQL configuration:", config);
    return config;
}

export async function getInstructionDocuments(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log('Processing getInstructionDocuments request');

  try {
    // Get instruction reference from query params
    const instructionRef = request.query.get('instructionRef');
    
    if (!instructionRef) {
      return {
        status: 400,
        body: JSON.stringify({ error: 'instructionRef query parameter is required' })
      };
    }

    // Get SQL password from Key Vault
    const kvUri = "https://helix-keys.vault.azure.net/";
    const passwordSecretName = "sql-databaseserver-password";
    const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
    
    let password: string | undefined;
    try {
        context.log(`Retrieving SQL password secret: ${passwordSecretName} from Key Vault at ${kvUri}`);
        const passwordSecret = await secretClient.getSecret(passwordSecretName);
        password = passwordSecret.value;
        if (!password) {
            context.error(`Password not found in Key Vault secret: ${passwordSecretName}`);
            return {
                status: 500,
                body: JSON.stringify({ error: "Database password not found" })
            };
        }
        context.log("SQL password retrieved successfully.");
    } catch (error) {
        context.error("Error fetching SQL password from Key Vault:", error);
        return {
            status: 500,
            body: JSON.stringify({ error: "Failed to retrieve database credentials" })
        };
    }

    // Build connection string and parse it
    const sqlServer = "instructions.database.windows.net";
    const sqlDatabase = "instructions";
    const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};`;
    const config = parseConnectionString(connectionString, context);

    const connection = new Connection(config);
    
    const documents = await new Promise<any[]>((resolve, reject) => {
      const results: any[] = [];
      
      connection.on('connect', (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        const query = `
          SELECT 
            DocumentId,
            InstructionRef,
            DocumentType,
            FileName,
            BlobUrl,
            FileSizeBytes,
            UploadedBy,
            UploadedAt,
            Notes
          FROM dbo.Documents 
          WHERE InstructionRef = @instructionRef
          ORDER BY UploadedAt DESC
        `;
        
        const dbRequest = new Request(query, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(results);
          }
          connection.close();
        });
        
        dbRequest.addParameter('instructionRef', TYPES.NVarChar, instructionRef);
        
        dbRequest.on('row', (columns) => {
          const row: any = {};
          columns.forEach((column) => {
            row[column.metadata.colName] = column.value;
          });
          results.push(row);
        });
        
        connection.execSql(dbRequest);
      });
      
      connection.on('error', (err) => {
        reject(err);
      });
    });

    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(documents)
    };

  } catch (error: any) {
    context.error('Error in getInstructionDocuments:', error);
    return {
      status: 500,
      body: JSON.stringify({ 
        error: 'Failed to fetch instruction documents',
        details: error.message 
      })
    };
  }
}

app.http('getInstructionDocuments', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: getInstructionDocuments,
});
*/