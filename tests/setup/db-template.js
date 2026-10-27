// jest globalSetup: migrate the TEST_DATABASE_URL database once; per-file clones start from it.
const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
};
