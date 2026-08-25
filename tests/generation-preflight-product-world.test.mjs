import test from "node:test";
import assert from "node:assert/strict";
import { ensureGenerationPreflight } from "../scripts/generation-preflight.mjs";

test("generation preflight refreshes legacy fact passports", async () => {
  let state = {
    projects: [{
      id: "brand",
      references: [{ id: "design", status: "active", designAnalysis: { formatType: "single_thesis" } }]
    }],
    products: [{
      id: "shampoo",
      projectId: "brand",
      name: "Шампунь",
      aiPassport: { productName: "Шампунь", safeFacts: ["очищает волосы"] }
    }],
    audioLibrary: [{ id: "audio", fileData: "https://cdn.example.com/audio.mp3" }]
  };
  const passport = {
    version: "product-passport-v3",
    productName: "Шампунь",
    safeFacts: ["очищает волосы"],
    category: "уход за волосами",
    coreUseCases: ["очищение волос"]
  };
  const result = await ensureGenerationPreflight({
    selection: { projectId: "brand", productId: "shampoo", referenceId: "design" },
    origin: "http://127.0.0.1:4173",
    deps: {
      loadGenerationState: async () => state,
      updateGenerationState: async (updater) => ({ state: state = updater(state), updatedAt: "now" }),
      refreshProductPassport: async () => passport
    }
  });

  assert.equal(result.createdProductPassports, 1);
  assert.equal(state.products[0].aiPassport.category, passport.category);
});
