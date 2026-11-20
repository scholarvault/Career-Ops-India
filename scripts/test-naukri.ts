import { discoverNaukri } from "../server/connectors/naukri";

async function main() {
  const t0 = Date.now();
  const r = await discoverNaukri({
    role: "Business Analyst",
    city: "Chennai",
    profileDir: "data/browser-profile",
    limit: 20,
    headless: false,
  });

  console.log("ms", Date.now() - t0);
  console.log("needsHuman", r.needsHuman, "| message", r.message, "| total", r.total, "| jobs", r.jobs.length);
  for (const j of r.jobs.slice(0, 10)) {
    console.log(`- ${j.title} | ${j.company} | ${j.location} | ${j.datePosted ?? "no date"}`);
  }
}

main();

