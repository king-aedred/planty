
import { ConvexHttpClient } from "convex/browser";

import { api } from "./convex/_generated/api.js";

import { readFileSync } from "fs";

const client = new ConvexHttpClient(process.env.CONVEX_URL);

const plants = JSON.parse(readFileSync("./docs/plants.json", "utf-8"));

const result = await client.mutation(api.plant_species.seedPlantSpecies, {

  species: plants

});

console.log("Result:", result);

