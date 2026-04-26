import { getDB } from '../db/client';
import { ObjectId } from 'mongodb';

export async function findSimilarPhrases(
  userId: string,
  embedding: number[],
  limit: number = 5
): Promise<any[]> {
  const db = getDB();
  
  const results = await db.collection('phrases').aggregate([
    {
      $vectorSearch: {
        index: 'phrases_vector_index',
        path: 'embedding',
        queryVector: embedding,
        numCandidates: 50,
        limit,
        filter: { userId: new ObjectId(userId) }
      }
    },
    {
      $project: {
        text: 1,
        category: 1,
        usageCount: 1,
        score: { $meta: 'vectorSearchScore' }
      }
    }
  ]).toArray();

  return results;
}