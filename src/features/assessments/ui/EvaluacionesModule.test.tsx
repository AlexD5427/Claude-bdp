import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EvaluacionesModule } from "./EvaluacionesModule";
import { __setProviderForTests, mockProvider } from "../../../infrastructure/providers";
import { resetMockData } from "../../../infrastructure/providers/mock";
import { assessmentListStore, emptyAssessmentFilters } from "./listState";
import { bootstrapPlugins } from "../question-types";

beforeEach(() => {
  bootstrapPlugins();
  __setProviderForTests(mockProvider);
  resetMockData();
  assessmentListStore.set({ search: "", filters: emptyAssessmentFilters(), view: "cards" });
});
afterEach(() => {
  cleanup();
  __setProviderForTests(null);
});

describe("AssessmentOS module (component)", () => {
  it("lists seeded assessments with the safety disclaimer", async () => {
    render(<EvaluacionesModule />);
    expect(await screen.findByText(/Preselección · Analista de Riesgo/)).toBeInTheDocument();
    // The non-clinical disclaimer must be visible.
    expect(screen.getByText(/no son pruebas clínicas ni psicométricas validadas/i)).toBeInTheDocument();
  });

  it("shows the search affordance in Spanish", async () => {
    render(<EvaluacionesModule />);
    await screen.findByText(/Preselección · Analista de Riesgo/);
    expect(screen.getByPlaceholderText(/Buscar por nombre/i)).toBeInTheDocument();
  });
});
