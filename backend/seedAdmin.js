// seedAdmin.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tpgaming-world';

const createAdmin = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB...');

    // SET YOUR DESIRED ADMIN CREDENTIALS HERE
    const adminUsername = 'admin_tpgaming'; 
    const adminPassword = 'AdminSecretPassword123!'; 
    const adminMobile = '9999999999';

    // Check if admin already exists
    const existingAdmin = await User.findOne({ username: adminUsername });
    if (existingAdmin) {
      console.log('Admin user already exists!');
      process.exit(0);
    }

    // Hash admin password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);

    const admin = new User({
      mobileNumber: adminMobile,
      username: adminUsername,
      password: hashedPassword,
      balance: 0,
      role: 'admin',
      isAdmin: true
    });

    await admin.save();
    console.log('----------------------------------------------------');
    console.log('✅ Admin Account Created Successfully!');
    console.log(`Username: ${adminUsername}`);
    console.log(`Password: ${adminPassword}`);
    console.log('----------------------------------------------------');

    process.exit(0);
  } catch (err) {
    console.error('Error creating admin:', err.message);
    process.exit(1);
  }
};

createAdmin();