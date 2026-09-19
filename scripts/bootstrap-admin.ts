import { db } from '../src/server/db';
import { hashPassword } from '../src/server/auth';
const username = process.argv[2];
if (!username || !/^[a-zA-Z0-9._-]{3,80}$/.test(username)) throw new Error('Usage: npm run admin:bootstrap -- username (password from stdin or ZENJEV_ADMIN_PASSWORD)');
let password = process.env.ZENJEV_ADMIN_PASSWORD;
if (!password) { const chunks: Buffer[] = []; for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk)); password = Buffer.concat(chunks).toString().trimEnd(); }
try {
  if (await db.user.findUnique({ where: { username } })) throw new Error('User already exists; refusing to replace credentials');
  await db.user.create({ data: { username, passwordHash: hashPassword(password), role: 'admin' } });
  console.log('Administrator created. No password was recorded in output.');
} finally { await db.$disconnect(); }
