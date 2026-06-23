import { useState, type Dispatch, type SetStateAction } from "react";
import type { TestResult } from "./tests/runner";
import type { Scenario, ScenarioResult } from "./scenarios";

// Test + scenario run state: the active .ts test run, the saved scenarios with their last results, and which
// scenario is currently running. The run handlers (run tests / run scenario) stay in the shell and fill these via
// the setters. Extracted from the Ide component.
export interface TestRun {
  results: TestResult[];
  running: boolean;
  title: string;
}

export interface TestRunner {
  testRun: TestRun | null;
  setTestRun: Dispatch<SetStateAction<TestRun | null>>;
  scenarios: Scenario[];
  setScenarios: Dispatch<SetStateAction<Scenario[]>>;
  scenResults: Record<string, ScenarioResult>;
  setScenResults: Dispatch<SetStateAction<Record<string, ScenarioResult>>>;
  runningScen: string | null;
  setRunningScen: Dispatch<SetStateAction<string | null>>;
}

export function useTestRunner(): TestRunner {
  const [testRun, setTestRun] = useState<TestRun | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenResults, setScenResults] = useState<Record<string, ScenarioResult>>({});
  const [runningScen, setRunningScen] = useState<string | null>(null);

  return { testRun, setTestRun, scenarios, setScenarios, scenResults, setScenResults, runningScen, setRunningScen };
}
