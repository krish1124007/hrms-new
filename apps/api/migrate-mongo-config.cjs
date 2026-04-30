// migrate-mongo configuration.
// Usage:
//   npx migrate-mongo create <name>    - scaffold a new migration
//   npx migrate-mongo up               - apply pending migrations
//   npx migrate-mongo down             - rollback the last migration
//   npx migrate-mongo status           - list applied / pending migrations
// eslint-disable-next-line no-undef
const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  mongodb: {
    url: process.env.MONGODB_URI || 'mongodb://localhost:27017/opencore',
    databaseName: undefined,
    options: {
      connectTimeoutMS: 10000,
    },
  },
  migrationsDir: 'migrations',
  changelogCollectionName: 'changelog',
  lockCollectionName: 'changelog_lock',
  lockTtl: 0,
  migrationFileExtension: '.cjs',
  useFileHash: false,
  moduleSystem: 'commonjs',
};
