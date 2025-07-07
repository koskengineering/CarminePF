import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set test database URL if not set
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./test.db';
}

// Increase test timeout for database operations
jest.setTimeout(30000);