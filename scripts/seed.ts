import { db } from '../src/server/db';
import { seedDemo } from '../src/server/seed';
seedDemo().then(result=>console.log(JSON.stringify(result))).finally(()=>db.$disconnect());
