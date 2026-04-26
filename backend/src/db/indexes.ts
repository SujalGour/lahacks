import { Db } from 'mongodb';

export async function createIndexes(db: Db): Promise<void> {
  try {
    // Regular indexes
    await db.collection('phrases').createIndex({ userId: 1 });
    await db.collection('phrases').createIndex({ category: 1 });
    await db.collection('message_history').createIndex({ userId: 1 });
    await db.collection('users').createIndex({ name: 1 });

    // Vector Search indexes (Atlas Vector Search)
    await db.command({
      createSearchIndexes: 'phrases',
      indexes: [{
        name: 'phrases_vector_index',
        type: 'vectorSearch',
        definition: {
          fields: [{
            type: 'vector',
            path: 'embedding',
            numDimensions: 768,
            similarity: 'cosine'
          }]
        }
      }]
    });

    await db.command({
      createSearchIndexes: 'message_history',
      indexes: [{
        name: 'history_vector_index',
        type: 'vectorSearch',
        definition: {
          fields: [{
            type: 'vector',
            path: 'embedding',
            numDimensions: 768,
            similarity: 'cosine'
          }]
        }
      }]
    });

    console.log('All indexes created successfully');
  } catch (err: any) {
    // Ignore "already exists" errors
    if (err.codeName !== 'IndexAlreadyExists') {
      console.log('Index creation note:', err.message);
    }
  }
}