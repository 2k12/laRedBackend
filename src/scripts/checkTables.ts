import pool from "../config/db";

const check = async () => {
  try {
    const res = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
    console.log(
      "Current Tables:",
      res.rows.map((r) => r.table_name).join(", "),
    );
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
    process.exit();
  }
};

check();
