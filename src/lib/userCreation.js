import User from '@/models/user.model';
import bcrypt from 'bcrypt';
// import { User } from '@/models/user.model';

export const createAdminUser = async (name, email, password) => {
  try {
    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: 'admin',  // explicitly set the role to 'admin'
    });

    await newUser.save();
    return newUser;
  } catch (error) {
    console.error('Error creating admin user:', error);
    throw error;
  }
};
