import { spawn } from 'node:child_process';
import { cleanEnvironment } from './environment.mjs';
const binary = process.env.WRINGER_BINARY;
if (!binary) throw new Error('Set WRINGER_BINARY to the reviewed Wringer dist/wring executable.');
const child = spawn(binary, ['verify', '--repo', process.cwd(), '--serial', '--json'], { stdio: 'inherit', env: cleanEnvironment() });
child.on('exit', code => { process.exitCode = code ?? 1; });
