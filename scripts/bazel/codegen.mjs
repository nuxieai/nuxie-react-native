import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function generate(manifest) {
  const config = JSON.parse(readFileSync(manifest.package, 'utf8')).codegenConfig;
  if (config?.name !== 'NuxieSpec' || config.type !== 'modules' || config.android?.javaPackageName !== 'ai.nuxie.reactnative') {
    throw new Error('The native action must use the authored NuxieSpec modules configuration');
  }
  if (!['android', 'ios'].includes(manifest.platform)) throw new Error('Choose android or ios code generation');
  const inputRoot = dirname(resolve(manifest.dependencies));
  const tree = JSON.parse(readFileSync(manifest.dependencies, 'utf8'));
  const scratch = mkdtempSync(resolve(tmpdir(), 'nuxie-codegen-'));
  const inside = name => {
    const target = resolve(scratch, name);
    if (!name || isAbsolute(name) || relative(scratch, target).startsWith('..')) throw new Error('A codegen dependency path escapes its action');
    return target;
  };
  function run(args) {
    const result = spawnSync(process.execPath, ['--preserve-symlinks', '--preserve-symlinks-main', ...args], {
      cwd: scratch, stdio: 'inherit', env: { ...process.env, HOME: scratch },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`React Native codegen exited ${result.status ?? 1}`);
  }
  try {
    // Each physical package file is a declared Bazel input. Recreate directory
    // links separately so pnpm's dependency graph is retained without globbing
    // through symlink cycles or resolving packages from the host checkout.
    for (const file of tree.files) {
      const target = inside(file);
      mkdirSync(dirname(target), { recursive: true });
      symlinkSync(resolve(inputRoot, file), target);
    }
    for (const [name, link] of Object.entries(tree.links)) {
      const target = inside(name);
      const resolvedLink = resolve(dirname(target), link);
      if (!resolvedLink.startsWith(scratch + '/node_modules/')) throw new Error('A pnpm dependency link escapes its action');
      mkdirSync(dirname(target), { recursive: true });
      symlinkSync(link, target);
    }
    for (const name of [tree.reactNativePackage, tree.codegenPackage]) {
      if (JSON.parse(readFileSync(inside(name), 'utf8')).version !== '0.87.1') {
        throw new Error('The native codegen action requires pinned React Native/codegen 0.87.1');
      }
    }
    const sources = manifest.sources.map(source => {
      const destination = inside(`specs/${basename(source)}`);
      if (existsSync(destination)) throw new Error('Native spec input filenames must be unique');
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(resolve(source), destination);
      return destination;
    });
    const schema = resolve(manifest.schema);
    const output = resolve(manifest.output);
    mkdirSync(dirname(schema), { recursive: true });
    mkdirSync(output, { recursive: true });
    run([inside(tree.combineCli), '--platform', manifest.platform, '--libraryName', config.name, schema, ...sources]);
    run([inside(tree.generateCli), '--platform', manifest.platform, '--schemaPath', schema,
         '--outputDir', output, '--libraryName', config.name,
         '--javaPackageName', config.android.javaPackageName, '--libraryType', config.type]);
    if (manifest.platform === 'ios' && !existsSync(resolve(output, 'NuxieSpec/NuxieSpec.h'))) {
      throw new Error('Official codegen did not produce the NuxieSpec ObjC++ header');
    }
    if (manifest.java) {
      const generated = resolve(output, 'java/ai/nuxie/reactnative/NativeNuxieSpec.java');
      if (!existsSync(generated)) throw new Error('Official codegen did not produce NativeNuxieSpec.java');
      const destination = resolve(manifest.java);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(generated, destination);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]))) {
  generate(JSON.parse(readFileSync(process.argv[2], 'utf8')));
}
