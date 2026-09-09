import { Sandbox } from '@vercel/sandbox';

async function main() {
  const sandbox = await Sandbox.create({
    persistent: false,
    region: 'cdg1',
    resources: { vcpus: 2 },
    timeout: 10 * 60 * 1000
  });

  try {
    const install = await sandbox.runCommand('bash', [
      '-lc',
      [
        'set -e',
        'if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then exit 0; fi',
        'if command -v apt-get >/dev/null 2>&1; then',
        '  sudo apt-get update -qq',
        '  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg',
        'elif command -v dnf >/dev/null 2>&1; then',
        '  sudo dnf install -y ffmpeg',
        'else',
        '  echo "Aucun gestionnaire de paquets compatible" >&2',
        '  exit 77',
        'fi'
      ].join('\n')
    ]);

    if (install.exitCode !== 0) {
      throw new Error(`FFmpeg install failed: ${await install.stderr()}`);
    }

    const check = await sandbox.runCommand('bash', ['-lc', 'ffmpeg -version >/dev/null && ffprobe -version >/dev/null']);
    if (check.exitCode !== 0) throw new Error(`FFmpeg check failed: ${await check.stderr()}`);

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
