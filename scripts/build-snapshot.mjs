import { Sandbox } from '@vercel/sandbox';

async function main() {
  const sandbox = await Sandbox.create({ persistent: false });
  try {
    const install = await sandbox.runCommand('bash', [
      '-c',
      'curl -fsSL https://johnvansickle.com/ffmpeg/releases/ffmpeg-7.0.2-amd64-static.tar.xz | tar -xJ --strip-components=1'
    ]);

    if (install.exitCode !== 0) {
      throw new Error(`FFmpeg install failed: ${await install.stderr()}`);
    }

    const check = await sandbox.runCommand('./ffmpeg', ['-version']);
    if (check.exitCode !== 0) {
      throw new Error(`FFmpeg check failed: ${await check.stderr()}`);
    }

    const snapshot = await sandbox.snapshot();
    console.log(`SANDBOX_SNAPSHOT_ID=${snapshot.snapshotId}`);
  } catch (error) {
    await sandbox.stop().catch(() => {});
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
