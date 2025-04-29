const { Pool } = require('pg');

const pool = new Pool({
  user: 'moodle',
  host: '34.131.237.100', // Replace with actual server IP or hostname
  database: 'moodle',
  password: 'moodle',
  port: 5432,
});

const getAllTables = async () => {
  try {
    const result = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    console.log(result.rows);
    return result.rows;
  } catch (error) {
    console.error('Error fetching tables:', error);
    throw error;
  }
};

// Execute the function and handle the Promise properly
getAllTables()
  .then(tables => console.log('Tables retrieved successfully'))
  .catch(err => console.error('Failed to retrieve tables'));


// Function to get all user data by email
const getAllUserDataByEmail = async (email) => {
    try {
      // Query to get all columns for a user by email
      // Note: Replace 'mdl_user' with the actual Moodle users table name if different
      const result = await pool.query(
        'SELECT * FROM mdl_user WHERE email = $1', 
        [email]
      );
  
      if (result.rows.length === 0) {
        console.log('No user found with that email');
        return null;
      }
  
      // If multiple users found, log all of them
      if (result.rows.length > 1) {
        console.log(`Warning: Multiple users found with email ${email}`);
      }
  
      // Return all matching user records
      return result.rows;
    } catch (error) {
      console.error('Error fetching user data:', error);
      throw error;
    }
  };
  
  // Function to get specific user columns
  const getUserSpecificColumns = async (email) => {
    try {
      // Select specific columns you might be interested in
      const result = await pool.query(
        `SELECT 
          id, 
          username, 
          email, 
          firstname, 
          lastname, 
          department, 
          institution, 
          suspended, 
          deleted 
        FROM mdl_user 
        WHERE email = $1`, 
        [email]
      );
  
      if (result.rows.length === 0) {
        console.log('No user found with that email');
        return null;
      }
  
      return result.rows;
    } catch (error) {
      console.error('Error fetching specific user columns:', error);
      throw error;
    }
  };
  
  // Example usage
  const main = async () => {
    try {
      // Get all user data
      const allUserData = await getAllUserDataByEmail('ajith.123@gmail.com');
      if (allUserData) {
        console.log('All User Data:', allUserData);
      }
  
      // Get specific columns
      const specificUserData = await getUserSpecificColumns('ajith.123@gmail.com');
      if (specificUserData) {
        console.log('Specific User Columns:', specificUserData);
      }
    } catch (error) {
      console.error('Error in main function:', error);
    } finally {
      // Important: Close the pool when done to release resources
      await pool.end();
    }
  };
  
  // Run the main function
  main();