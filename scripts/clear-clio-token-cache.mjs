#!/usr/bin/env node
/**
 * Clear Clio access token cache in Redis
 * Run this when Clio API returns 401 but refresh token is valid
 */

import { createClient } from 'redis';
import { DefaultAzureCredential } from '@azure/identity';

async function clearClioCache() {
  const redisHost = process.env.REDIS_HOST || 'helix-cache-redis.redis.cache.windows.net';
  const redisPort = parseInt(process.env.REDIS_PORT || '6380', 10);
  
  console.log(`Connecting to Redis: ${redisHost}:${redisPort}`);
  
  const credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
  const token = await credential.getToken('https://redis.azure.com/.default');
  const username = token.token.split('.')[1]; // Extract username from JWT
  
  const client = createClient({
    socket: {
      host: redisHost,
      port: redisPort,
      tls: true,
    },
    username: username,
    password: token.token,
  });

  try {
    await client.connect();
    console.log('✅ Connected to Redis');
    
    // Clear Clio-related cache keys
    const keys = await client.keys('rpt:clio:*');
    console.log(`Found ${keys.length} Clio cache keys to clear:`, keys);
    
    if (keys.length > 0) {
      await client.del(keys);
      console.log(`✅ Cleared ${keys.length} Clio cache keys`);
    } else {
      console.log('No Clio cache keys found');
    }
    
    await client.quit();
    console.log('Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.quit();
    process.exit(1);
  }
}

clearClioCache().catch(console.error);
