/**
 * Advanced/simulation plugin CONTRACTS.
 *
 * These declare typed extension points for advanced assessment types. They are
 * NOT production-ready: each has `status: "contract"` and is only registered
 * when its feature flag is on. Registering a contract makes the type resolvable
 * (so authored blocks don't fall through to the "unsupported" fallback) while
 * clearly signaling, in the UI, that the interactive editor/renderer is pending.
 *
 * SECURITY: none of these execute untrusted candidate code. Any future runtime
 * must sandbox execution server-side; the browser never evaluates candidate
 * submissions.
 */

import { makeBlock } from "./helpers";
import { NO_OPTION_CAPABILITIES, type QuestionPlugin } from "./registry";
import { FLAGS } from "../../../shared/flags";

function contract(
  type: string,
  label: string,
  icon: string,
  category: QuestionPlugin["category"] = "simulation",
): QuestionPlugin {
  return {
    type,
    label,
    category,
    icon,
    isQuestion: true,
    status: "contract",
    // Los contratos avanzados no tienen criterio objetivo implementado: siempre
    // requieren revisión humana y su editor está pendiente.
    capabilities: { ...NO_OPTION_CAPABILITIES, grading: "manual", control: "pending" },
    createDefault: (id) => makeBlock(id, type, { label, config: { contract: true } }),
    // Contracts accept any value and never auto-score (manual review only).
    validate: () => ({ valid: true }),
    score: (block) => ({ raw: 0, max: block.score.points, needsReview: true }),
    a11y: { role: "group", needsGroup: true },
  };
}

/** All advanced contracts, keyed by the flag that enables them. */
export const advancedContracts: { plugin: QuestionPlugin; enabled: boolean }[] = [
  { plugin: contract("q_code", "Pregunta de código", "Code"), enabled: FLAGS.codeQuestions },
  { plugin: contract("q_sql", "Consulta SQL", "Database"), enabled: FLAGS.codeQuestions },
  { plugin: contract("q_spreadsheet_sim", "Simulación de hoja de cálculo", "Sheet"), enabled: FLAGS.spreadsheetSimulation },
  { plugin: contract("q_interactive_video", "Video interactivo", "Clapperboard"), enabled: FLAGS.interactiveVideo },
  { plugin: contract("q_credit_analysis", "Análisis de crédito", "CreditCard"), enabled: FLAGS.advancedSimulations },
  { plugin: contract("q_risk_analysis", "Análisis de riesgo", "ShieldAlert"), enabled: FLAGS.advancedSimulations },
  { plugin: contract("q_cashier_sim", "Simulación de caja", "Calculator"), enabled: FLAGS.advancedSimulations },
  { plugin: contract("q_reconciliation", "Conciliación", "GitCompare"), enabled: FLAGS.advancedSimulations },
  { plugin: contract("q_customer_service_sim", "Simulación de servicio al cliente", "Headphones"), enabled: FLAGS.advancedSimulations },
  { plugin: contract("q_operations_sim", "Simulación de operaciones", "Cog"), enabled: FLAGS.advancedSimulations },
  { plugin: contract("q_financial_statements", "Análisis de estados financieros", "FileSpreadsheet"), enabled: FLAGS.advancedSimulations },
];
