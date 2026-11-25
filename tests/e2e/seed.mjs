// Seeds ONLY the local throwaway DB: one admin user. Refuses any non-local URI.
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { MONGO, ADMIN } from './env.mjs';
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(MONGO)) throw new Error('seed refuses non-local MongoDB');
await mongoose.connect(MONGO, { serverSelectionTimeoutMS: 5000 });
const users = mongoose.connection.db.collection('users');
await users.deleteMany({ email: ADMIN.email });
await users.insertOne({ name: 'E2E Admin', email: ADMIN.email, password: await bcrypt.hash(ADMIN.password, 10), role: 'admin', createdAt: new Date() });
await mongoose.connection.db.collection('writings').deleteMany({});
await mongoose.disconnect();
console.log('seeded');
