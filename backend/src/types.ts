import { ObjectId } from 'mongodb';

export interface User {
  _id?: ObjectId;
  name: string;
  age: number;
  condition: string;
  preferences: {
    voiceId?: string;
    theme?: 'standard' | 'high-contrast' | 'large-text';
  };
  caregiverIds: ObjectId[];
  createdAt: Date;
}

export interface Caregiver {
  _id?: ObjectId;
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  userId: ObjectId;
}

export interface Phrase {
  _id?: ObjectId;
  userId: ObjectId;
  text: string;
  category: 'need' | 'greeting' | 'emergency' | 'social';
  embedding: number[];
  usageCount: number;
  createdAt: Date;
}

export interface MessageHistory {
  _id?: ObjectId;
  userId: ObjectId;
  message: string;
  intent: string;
  routeDecision: string;
  embedding: number[];
  createdAt: Date;
}