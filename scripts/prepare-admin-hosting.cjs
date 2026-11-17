const {cp, mkdir, rm} = require("node:fs/promises");
const {dirname, join} = require("node:path");

const projectDirectory = dirname(__dirname);
const outputDirectory = join(projectDirectory, ".firebase-admin-public");

const directories = ["admin", "assets", "css"];
const files = [
  "image-cache-sw.js",
  "js/admin-common.js",
  "js/error-reporter.js",
  "js/line-firebase-auth.js",
  "js/lmc-loader-transition.js",
];

async function main() {
  await rm(outputDirectory, {recursive: true, force: true});
  await mkdir(outputDirectory, {recursive: true});

  for (const directory of directories) {
    await cp(join(projectDirectory, directory), join(outputDirectory, directory), {recursive: true});
  }

  for (const file of files) {
    const destination = join(outputDirectory, file);
    await mkdir(dirname(destination), {recursive: true});
    await cp(join(projectDirectory, file), destination);
  }

  console.log(`Prepared LMC Admin Hosting files in ${outputDirectory}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
