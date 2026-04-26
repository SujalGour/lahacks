import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI!;
let client: MongoClient;
let db: Db;

export async function connectDB(): Promise<Db> {
  if (db) return db;
  
  let retries = 5;
  while (retries > 0) {
    try {
      client = new MongoClient(uri);
      await client.connect();
      db = client.db('catalyst');
      console.log('Connected to MongoDB Atlas');
      return db;
    } catch (err) {
      retries--;
      console.log(`Connection failed, retries left: ${retries}`);
      if (retries === 0) throw err;
      await new Promise(res => setTimeout(res, 2000));
    }
  }
  throw new Error('Could not connect to MongoDB');
}

export function getDB(): Db {
  if (!db) throw new Error('DB not initialized. Call connectDB() first.');
  return db;
}