import type { DemoDatabase } from "./medicine";
export async function load(): Promise<DemoDatabase> {
  const urls = [
    new URL("../fixtures/medicine-demo/catalogue.json", import.meta.url).href,
    new URL("../fixtures/medicine-demo/interactions.json", import.meta.url).href,
  ];
  const [catalogue, interactions] = await Promise.all(urls.map(async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Unable to load the test database. Retry when the local preview is available.");
    return response.json();
  }));
  if (catalogue.medicines?.length !== 162 || interactions.medicines?.length !== 162 || interactions.metadata?.approved_for_clinical_use !== false) {
    throw new Error("The test database format has changed. Import validation is required.");
  }
  return { catalogue, interactions };
}
