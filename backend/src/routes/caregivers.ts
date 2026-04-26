import { Router, Request, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../db/client';
import { validate } from '../middleware/validate';
import { CaregiverSchema } from '../db/schemas';

const router = Router();

// GET /caregivers/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDB();
    const caregiver = await db.collection('caregivers').findOne({
      _id: new ObjectId(req.params['id'] as string)
    });
    if (!caregiver) { res.status(404).json({ error: 'Caregiver not found' }); return; }
    res.json(caregiver);
  } catch (err) { next(err); }
});

// GET /caregivers/user/:userId
router.get('/user/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDB();
    const caregivers = await db.collection('caregivers').find({
      userId: new ObjectId(req.params['userId'] as string)
    }).toArray();
    res.json(caregivers);
  } catch (err) { next(err); }
});

// POST /caregivers
router.post('/', validate(CaregiverSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDB();
    const result = await db.collection('caregivers').insertOne({
      ...req.body,
      userId: new ObjectId(req.body.userId)
    });
    res.status(201).json({ _id: result.insertedId, ...req.body });
  } catch (err) { next(err); }
});

// PUT /caregivers/:id
router.put('/:id', validate(CaregiverSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDB();
    await db.collection('caregivers').updateOne(
      { _id: new ObjectId(req.params['id'] as string) },
      { $set: req.body }
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /caregivers/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDB();
    await db.collection('caregivers').deleteOne({
      _id: new ObjectId(req.params['id'] as string)
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;