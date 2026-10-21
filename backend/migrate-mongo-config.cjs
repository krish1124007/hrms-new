// migrate-mongo configuration. migrate-mongo looks for `migrate-mongo-config.js`
// by default, so every command passes `-f migrate-mongo-config.cjs` (the npm
// scripts do). Run from backend/:
//   npm run migrate:create -- <name>   - scaffold a new migration
//   npm run migrate:up                 - apply pending migrations
//   npm run migrate:down               - rollback the last migration
//   npm run migrate:status             - list applied / pending migrations
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
