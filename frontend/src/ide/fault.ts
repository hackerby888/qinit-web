// What a halted chain tells the developer: which entry failed, where in the source, and how to get going again.
import { assertLine, describeContractError, type EngineFaultInfo } from "@qinit/core";

// Where the fault happened, as far as the IDE can name it: the deployed contract at the faulted slot and its entry.
export interface FaultSite {
  contract?: string;
  entry?: string;
  file?: string;
}

export const HALT_RECOVERY = "Press ↺ reset or ▶ Compile & Run to restart it.";

export function faultLine(fault: EngineFaultInfo, site: FaultSite = {}): string {
  const contract = site.contract ?? (fault.slot === undefined ? undefined : `slot ${fault.slot}`);
  const who = contract ? `${contract}${site.entry ? `.${site.entry}` : ""} halted the chain` : "the chain halted";

  const code = describeContractError(fault.message);
  const line = assertLine(fault.message);
  const what = line === undefined ? code : `CC_ASSERT failed at ${site.file ?? contract ?? "line"}:${line} (${code})`;

  return `${who} at tick ${fault.failedTick}: ${what}. ${HALT_RECOVERY}`;
}

// One console line for a failed action. On a halted chain every action fails for the one reason the fault line already gave, so only point back at it.
export function failureLine(label: string, error: unknown, halted = false): string {
  if (halted) {
    return `${label} failed: the chain is halted. ${HALT_RECOVERY}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  return `${label} failed: ${describeContractError(message)}`;
}
