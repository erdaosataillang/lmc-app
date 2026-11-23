"use strict";

const {renderRichMenuImage} = require("./rich-menu")._test;

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", async () => {
  try {
    const image = await renderRichMenuImage(JSON.parse(input));
    process.stdout.write(image);
  } catch (error) {
    process.stderr.write(String(error?.stack || error));
    process.exitCode = 1;
  }
});
