import { z } from 'zod';

export const UserSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
  condition: z.string().min(1),
  preferences: z.object({
    voiceId: z.string().optional(),
    theme: z.enum(['standard', 'high-contrast', 'large-text']).optional(),
  }),
  caregiverIds: z.array(z.string()).default([]),
});

export const CaregiverSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  userId: z.string().min(1),
});

export const PhraseSchema = z.object({
  userId: z.string().min(1),
  text: z.string().min(1),
  category: z.enum(['need', 'greeting', 'emergency', 'social']),
});

export const MessageHistorySchema = z.object({
  userId: z.string().min(1),
  message: z.string().min(1),
  intent: z.string().min(1),
  routeDecision: z.string().min(1),
});

export type UserInput = z.infer<typeof UserSchema>;
export type CaregiverInput = z.infer<typeof CaregiverSchema>;
export type PhraseInput = z.infer<typeof PhraseSchema>;
export type MessageHistoryInput = z.infer<typeof MessageHistorySchema>;