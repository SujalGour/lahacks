import 'dotenv/config';
import express from 'express';
import { connectDB } from './db/client';
import { createIndexes } from './db/indexes';
import { errorHandler } from './middleware/error-handler';
import usersRouter from './routes/users';
import caregiversRouter from './routes/caregivers';
import phrasesRouter from './routes/phrases';
import historyRouter from './routes/history';
import smsRouter from './routes/sms';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Routes
app.use('/users', usersRouter);
app.use('/caregivers', caregiversRouter);
app.use('/phrases', phrasesRouter);
app.use('/history', historyRouter);
app.use('/sms', smsRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Error handler
app.use(errorHandler);

async function start() {
  const db = await connectDB();
  await createIndexes(db);
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch(console.error);