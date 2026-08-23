import worker from "../src/index.ts";

const planted = "leak-me";
const env = { MCPU_PACK: "mcpu", GIT_TOKEN: planted, ARTIFACTS_TOKEN: planted };
const home = await worker.fetch(new Request("https://mcpu.test/"), env);
const html = await home.text();
const type = home.headers.get("content-type") ?? "";
if (!type.includes("text/html") || !html.includes("<!doctype html")) {
  console.error("GET / is not html", type, html.slice(0, 120));
  process.exit(1);
}
if (/xterm|terminal/i.test(html)) {
  console.error("face contains a terminal");
  process.exit(1);
}
const ls = await worker.fetch(new Request("https://mcpu.test/ls"), env);
const listed = await ls.json();
if (!listed.files?.includes("README.md")) {
  console.error("repo.ls missing README.md", listed);
  process.exit(1);
}
const read = await worker.fetch(new Request("https://mcpu.test/read?path=README.md"), env);
const body = await read.json();
if (!body.contents?.includes("mcpu")) {
  console.error("repo.read failed", body);
  process.exit(1);
}
const blobs = [html, JSON.stringify(listed), JSON.stringify(body)];
if (blobs.some((blob) => blob.includes(planted))) {
  console.error("planted token leaked into / , /ls, or /read");
  process.exit(1);
}
console.log("FACE_PROOF_OK");
